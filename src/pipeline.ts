import { z } from 'zod';
import { createPiiRedactor, type PiiEntityType } from './pii';

export const IngestPayloadSchema = z
  .object({
    person_id: z.string().min(1).nullable().default(null),
    source: z.enum(['voice_note', 'chat_log', 'manual']).default('manual'),
    content: z.string().min(1).max(10000),
    confidence: z.number().min(0).max(1),
    sentiment_score: z.number().min(-1).max(1).optional(),
    signal_topic: z.string().min(1).max(128).optional(),
    signal_value: z.string().min(1).max(512).optional(),
    signal_category: z.enum(['gift_idea', 'preference', 'boundary']).default('preference'),
    occurred_at: z.string().datetime({ offset: true }).optional(),
  })
  .superRefine((data, ctx) => {
    const hasTopic = data.signal_topic !== undefined;
    const hasValue = data.signal_value !== undefined;
    if (hasTopic !== hasValue) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'signal_topic and signal_value must either both be provided or both be omitted',
        path: hasTopic ? ['signal_value'] : ['signal_topic'],
      });
    }
  });

export type ParsedIngestPayload = z.infer<typeof IngestPayloadSchema>;

export interface SignalRecord {
  id: string;
  person_id: string;
  category: string;
  topic: string;
  value: string;
  content: string;
  valid_from: string;
  valid_to: string | null;
  recorded_at: string;
  superseded_at: string | null;
  superseded_by: string | null;
}

export interface TimelineEventInsert {
  id: string;
  person_id: string;
  source: string;
  summary: string;
  raw_quote: string;
  redacted_entities: PiiEntityType[];
  sentiment_score: number | null;
  idempotency_key: string;
  occurred_at: string;
  recorded_at: string;
}

export interface DisambiguationInsert {
  id: string;
  idempotency_key: string;
  source: string;
  sanitized_content: string;
  redacted_entities: PiiEntityType[];
  confidence: number;
  signal_topic: string | null;
  signal_value: string | null;
  signal_category: string | null;
  occurred_at: string;
  created_at: string;
}

export type BitemporalUpdate =
  | {
      action: 'created_signal';
      new_signal_id: string;
      value: string;
      valid_from: string;
    }
  | {
      action: 'unchanged_existing_signal';
      active_signal_id: string;
      value: string;
    }
  | {
      action: 'unchanged_historical_signal';
      historical_signal_id: string;
      value: string;
      valid_from: string;
      valid_to: string;
    }
  | {
      action: 'superseded_conflicting_signal';
      deprecated_signal_id: string;
      old_value: string;
      new_signal_id: string;
      new_value: string;
      valid_from: string;
    }
  | {
      action: 'recorded_historical_signal';
      historical_signal_id: string;
      value: string;
      valid_from: string;
      valid_to: string;
      next_signal_id: string | null;
      truncated_signal_id: string | null;
      active_signal_id: string | null;
      active_value: string | null;
    };

export type IngestOutcome =
  | {
      status: 'deduplicated';
      http_status: 200;
      idempotency_key: string;
      reason: string;
      original_outcome: Record<string, unknown>;
    }
  | {
      status: 'routed_to_disambiguation_queue';
      http_status: 201;
      queue_id: string;
      idempotency_key: string;
      sanitized_content: string;
      redacted_entities: PiiEntityType[];
      confidence: number;
      reason: string;
    }
  | {
      status: 'rejected';
      http_status: 422;
      error: string;
      person_id: string;
    }
  | {
      status: 'conflict';
      http_status: 409;
      idempotency_key: string;
      error: string;
    }
  | {
      status: 'persisted';
      http_status: 201;
      event_id: string;
      idempotency_key: string;
      sanitized_content: string;
      redacted_entities: PiiEntityType[];
      bitemporal_update: BitemporalUpdate | null;
    };

export interface IdempotencyRecord {
  key: string;
  status: string;
  response_json: string;
}

/**
 * Narrows an existing signal's valid-time interval. `expectedValidTo` is an optimistic
 * concurrency guard: the update only applies if the row still has the interval we planned against.
 */
export interface SignalCloseOp {
  id: string;
  expectedValidTo: string | null;
  validTo: string;
  supersededAt: string;
  supersededBy: string;
}

export type SignalMutation =
  | { kind: 'none' }
  | { kind: 'write'; close: SignalCloseOp | null; insert: SignalRecord };

export interface CommitResult {
  deduplicated: boolean;
  existing?: IdempotencyRecord | null;
  /** True when a concurrent write to the same (person_id, topic) invalidated the plan. */
  conflict?: boolean;
}

export interface IngestStore {
  getIdempotency(key: string): Promise<IdempotencyRecord | null>;
  personExists(personId: string): Promise<boolean>;
  getSignalHistory(personId: string, topic: string): Promise<SignalRecord[]>;
  commitDisambiguation(
    entry: DisambiguationInsert,
    idempotency: IdempotencyRecord,
    createdAt: string
  ): Promise<CommitResult>;
  commitIngestion(params: {
    event: TimelineEventInsert;
    signalMutation: SignalMutation;
    idempotency: IdempotencyRecord;
    createdAt: string;
  }): Promise<CommitResult>;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function isUniqueConstraintError(err: unknown): boolean {
  return /UNIQUE constraint failed|SQLITE_CONSTRAINT/i.test(errorMessage(err));
}

/**
 * Signal write conflicts: the one-active-per-topic partial unique index, or the
 * valid-time overlap / interval triggers from migrations/0002_signal_valid_time_guards.sql.
 */
function isSignalConflictError(err: unknown): boolean {
  return /signal_valid_time_overlap|signal_invalid_interval|UNIQUE constraint failed: signals\./i.test(
    errorMessage(err)
  );
}

const SIGNAL_COLUMNS =
  'id, person_id, category, topic, value, content, valid_from, valid_to, recorded_at, superseded_at, superseded_by';

/**
 * Production Cloudflare D1 backing store using atomic `db.batch()` transactions.
 */
export class D1IngestStore implements IngestStore {
  constructor(private readonly db: D1Database) {}

  async getIdempotency(key: string): Promise<IdempotencyRecord | null> {
    const row = await this.db
      .prepare('SELECT key, status, response_json FROM idempotency_keys WHERE key = ? LIMIT 1')
      .bind(key)
      .first<IdempotencyRecord>();
    return row ?? null;
  }

  async personExists(personId: string): Promise<boolean> {
    const row = await this.db
      .prepare('SELECT id FROM people WHERE id = ? LIMIT 1')
      .bind(personId)
      .first<{ id: string }>();
    return row !== null;
  }

  async getSignalHistory(personId: string, topic: string): Promise<SignalRecord[]> {
    const res = await this.db
      .prepare(
        `SELECT ${SIGNAL_COLUMNS} FROM signals WHERE person_id = ? AND topic = ? ORDER BY julianday(valid_from) ASC`
      )
      .bind(personId, topic)
      .all<SignalRecord>();
    return res.results ?? [];
  }

  async commitDisambiguation(
    entry: DisambiguationInsert,
    idempotency: IdempotencyRecord,
    createdAt: string
  ): Promise<CommitResult> {
    const insertQueue = this.db
      .prepare(
        'INSERT INTO disambiguation_queue (id, idempotency_key, source, sanitized_content, redacted_entities, confidence, signal_topic, signal_value, signal_category, occurred_at, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
      )
      .bind(
        entry.id,
        entry.idempotency_key,
        entry.source,
        entry.sanitized_content,
        JSON.stringify(entry.redacted_entities),
        entry.confidence,
        entry.signal_topic,
        entry.signal_value,
        entry.signal_category,
        entry.occurred_at,
        'pending',
        entry.created_at
      );

    const insertKey = this.db
      .prepare('INSERT INTO idempotency_keys (key, status, response_json, created_at) VALUES (?, ?, ?, ?)')
      .bind(idempotency.key, idempotency.status, idempotency.response_json, createdAt);

    try {
      await this.db.batch([insertQueue, insertKey]);
      return { deduplicated: false };
    } catch (err) {
      if (isUniqueConstraintError(err)) {
        const existing = await this.getIdempotency(idempotency.key);
        if (existing) {
          return { deduplicated: true, existing };
        }
      }
      throw err;
    }
  }

  async commitIngestion(params: {
    event: TimelineEventInsert;
    signalMutation: SignalMutation;
    idempotency: IdempotencyRecord;
    createdAt: string;
  }): Promise<CommitResult> {
    const { event, signalMutation, idempotency, createdAt } = params;
    const statements: D1PreparedStatement[] = [
      this.db
        .prepare(
          'INSERT INTO timeline_events (id, person_id, source, summary, raw_quote, redacted_entities, sentiment_score, idempotency_key, occurred_at, recorded_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
        )
        .bind(
          event.id,
          event.person_id,
          event.source,
          event.summary,
          event.raw_quote,
          JSON.stringify(event.redacted_entities),
          event.sentiment_score,
          event.idempotency_key,
          event.occurred_at,
          event.recorded_at
        ),
    ];

    if (signalMutation.kind === 'write') {
      const { close, insert } = signalMutation;
      if (close) {
        statements.push(
          this.db
            .prepare(
              'UPDATE signals SET valid_to = ?, superseded_at = ?, superseded_by = ? WHERE id = ? AND valid_to IS ?'
            )
            .bind(close.validTo, close.supersededAt, close.supersededBy, close.id, close.expectedValidTo)
        );
      }
      statements.push(
        this.db
          .prepare(`INSERT INTO signals (${SIGNAL_COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
          .bind(
            insert.id,
            insert.person_id,
            insert.category,
            insert.topic,
            insert.value,
            insert.content,
            insert.valid_from,
            insert.valid_to,
            insert.recorded_at,
            insert.superseded_at,
            insert.superseded_by
          )
      );
    }

    statements.push(
      this.db
        .prepare('INSERT INTO idempotency_keys (key, status, response_json, created_at) VALUES (?, ?, ?, ?)')
        .bind(idempotency.key, idempotency.status, idempotency.response_json, createdAt)
    );

    try {
      await this.db.batch(statements);
      return { deduplicated: false };
    } catch (err) {
      if (isUniqueConstraintError(err) || isSignalConflictError(err)) {
        const existing = await this.getIdempotency(idempotency.key);
        if (existing) {
          return { deduplicated: true, existing };
        }
      }
      if (isSignalConflictError(err)) {
        return { deduplicated: false, conflict: true };
      }
      throw err;
    }
  }
}

function intervalEnd(s: { valid_to: string | null }): number {
  return s.valid_to === null ? Number.POSITIVE_INFINITY : Date.parse(s.valid_to);
}

function intervalsOverlap(
  a: { valid_from: string; valid_to: string | null },
  b: { valid_from: string; valid_to: string | null }
): boolean {
  const aStart = Date.parse(a.valid_from);
  const bStart = Date.parse(b.valid_from);
  const aEnd = intervalEnd(a);
  const bEnd = intervalEnd(b);
  // Half-open [from, to) intervals; zero-length intervals never overlap anything.
  if (aEnd <= aStart || bEnd <= bStart) return false;
  return aStart < bEnd && bStart < aEnd;
}

/**
 * Isolated, per-request in-memory store used exclusively by `/fixtures/verify`
 * so synthetic test verification never mutates production D1 tables.
 * Mirrors the D1 constraints (one active row per topic, no valid-time overlap).
 */
export class MemoryIngestStore implements IngestStore {
  readonly peopleIds: Set<string>;
  readonly idempotencyMap = new Map<string, IdempotencyRecord>();
  readonly events: TimelineEventInsert[] = [];
  readonly signals: SignalRecord[] = [];
  readonly disambiguationQueue: DisambiguationInsert[] = [];

  constructor(initialPeopleIds: string[] = []) {
    this.peopleIds = new Set(initialPeopleIds);
  }

  async getIdempotency(key: string): Promise<IdempotencyRecord | null> {
    return this.idempotencyMap.get(key) ?? null;
  }

  async personExists(personId: string): Promise<boolean> {
    return this.peopleIds.has(personId);
  }

  async getSignalHistory(personId: string, topic: string): Promise<SignalRecord[]> {
    return this.signals
      .filter((s) => s.person_id === personId && s.topic === topic)
      .sort((a, b) => Date.parse(a.valid_from) - Date.parse(b.valid_from))
      .map((s) => ({ ...s }));
  }

  async commitDisambiguation(
    entry: DisambiguationInsert,
    idempotency: IdempotencyRecord
  ): Promise<CommitResult> {
    const existing = this.idempotencyMap.get(idempotency.key);
    if (existing) {
      return { deduplicated: true, existing };
    }
    this.disambiguationQueue.push(entry);
    this.idempotencyMap.set(idempotency.key, idempotency);
    return { deduplicated: false };
  }

  async commitIngestion(params: {
    event: TimelineEventInsert;
    signalMutation: SignalMutation;
    idempotency: IdempotencyRecord;
  }): Promise<CommitResult> {
    const existing = this.idempotencyMap.get(params.idempotency.key);
    if (existing) {
      return { deduplicated: true, existing };
    }

    if (params.signalMutation.kind === 'write') {
      const { close, insert } = params.signalMutation;
      const target = close
        ? this.signals.find((s) => s.id === close.id && s.valid_to === close.expectedValidTo)
        : undefined;
      const closedTarget = target && close ? { ...target, valid_to: close.validTo } : undefined;
      const siblings = this.signals
        .filter((s) => s.person_id === insert.person_id && s.topic === insert.topic)
        .map((s) => (closedTarget && s.id === closedTarget.id ? closedTarget : s));

      const activeConflict =
        insert.valid_to === null && siblings.some((s) => s.valid_to === null);
      if (activeConflict || siblings.some((s) => intervalsOverlap(s, insert))) {
        return { deduplicated: false, conflict: true };
      }

      if (target && close) {
        target.valid_to = close.validTo;
        target.superseded_at = close.supersededAt;
        target.superseded_by = close.supersededBy;
      }
      this.signals.push(insert);
    }

    this.events.push(params.event);
    this.idempotencyMap.set(params.idempotency.key, params.idempotency);
    return { deduplicated: false };
  }
}

export async function makeIdempotencyKey(payload: ParsedIngestPayload): Promise<string> {
  const normalized = [
    payload.person_id ?? 'unknown',
    payload.source,
    payload.content.trim().toLowerCase(),
    payload.signal_topic ?? '',
    payload.signal_value ?? '',
    payload.occurred_at ?? '',
  ].join('|');
  const hashBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(normalized));
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 32);
}

function buildDeduplicatedOutcome(idempotencyKey: string, existing: IdempotencyRecord): IngestOutcome {
  let parsedOriginal: Record<string, unknown> = {};
  try {
    parsedOriginal = JSON.parse(existing.response_json) as Record<string, unknown>;
  } catch {
    // keep empty object if corrupted
  }
  return {
    status: 'deduplicated',
    http_status: 200,
    idempotency_key: idempotencyKey,
    reason: 'Duplicate request dropped; persisted state unchanged.',
    original_outcome: parsedOriginal,
  };
}

function summarizeSanitizedContent(sanitized: string): string {
  return sanitized.length > 140 ? `${sanitized.slice(0, 137)}...` : sanitized;
}

const MAX_COMMIT_ATTEMPTS = 4;

/**
 * Plans a valid-time write for one (person_id, topic) so that intervals never overlap.
 * Intervals are half-open [valid_from, valid_to); the result of ingesting a set of
 * observations is independent of the order in which they arrive.
 */
export function planSignalWrite(params: {
  history: SignalRecord[];
  personId: string;
  topic: string;
  value: string;
  category: string;
  content: string;
  occurredAt: string;
  recordedAt: string;
  newSignalId: string;
}): { update: BitemporalUpdate; mutation: SignalMutation } {
  const { personId, topic, value, category, content, occurredAt, recordedAt, newSignalId } = params;
  const t = Date.parse(occurredAt);
  const history = [...params.history].sort((a, b) => Date.parse(a.valid_from) - Date.parse(b.valid_from));
  const active = history.find((s) => s.valid_to === null) ?? null;
  const containing = history.find((s) => Date.parse(s.valid_from) <= t && t < intervalEnd(s)) ?? null;

  const newRecord = (validTo: string | null, supersededBy: string | null): SignalRecord => ({
    id: newSignalId,
    person_id: personId,
    category,
    topic,
    value,
    content,
    valid_from: occurredAt,
    valid_to: validTo,
    recorded_at: recordedAt,
    superseded_at: supersededBy ? recordedAt : null,
    superseded_by: supersededBy,
  });

  if (!containing) {
    // Earlier than every known interval (or in a gap): fill up to the next interval's start.
    const next = history.find((s) => Date.parse(s.valid_from) > t) ?? null;
    if (!next) {
      return {
        update: { action: 'created_signal', new_signal_id: newSignalId, value, valid_from: occurredAt },
        mutation: { kind: 'write', close: null, insert: newRecord(null, null) },
      };
    }
    return {
      update: {
        action: 'recorded_historical_signal',
        historical_signal_id: newSignalId,
        value,
        valid_from: occurredAt,
        valid_to: next.valid_from,
        next_signal_id: next.id,
        truncated_signal_id: null,
        active_signal_id: active?.id ?? null,
        active_value: active?.value ?? null,
      },
      mutation: { kind: 'write', close: null, insert: newRecord(next.valid_from, next.id) },
    };
  }

  if (containing.value === value) {
    if (containing.valid_to === null) {
      return {
        update: { action: 'unchanged_existing_signal', active_signal_id: containing.id, value },
        mutation: { kind: 'none' },
      };
    }
    return {
      update: {
        action: 'unchanged_historical_signal',
        historical_signal_id: containing.id,
        value,
        valid_from: containing.valid_from,
        valid_to: containing.valid_to,
      },
      mutation: { kind: 'none' },
    };
  }

  const close: SignalCloseOp = {
    id: containing.id,
    expectedValidTo: containing.valid_to,
    validTo: occurredAt,
    supersededAt: recordedAt,
    supersededBy: newSignalId,
  };

  if (containing.valid_to === null) {
    // Newer conflicting observation: close the active interval at t and open a new one.
    return {
      update: {
        action: 'superseded_conflicting_signal',
        deprecated_signal_id: containing.id,
        old_value: containing.value,
        new_signal_id: newSignalId,
        new_value: value,
        valid_from: occurredAt,
      },
      mutation: { kind: 'write', close, insert: newRecord(null, null) },
    };
  }

  // Late observation inside a closed interval: split it into [from, t) and [t, to).
  return {
    update: {
      action: 'recorded_historical_signal',
      historical_signal_id: newSignalId,
      value,
      valid_from: occurredAt,
      valid_to: containing.valid_to,
      next_signal_id: containing.superseded_by,
      truncated_signal_id: containing.id,
      active_signal_id: active?.id ?? null,
      active_value: active?.value ?? null,
    },
    mutation: { kind: 'write', close, insert: newRecord(containing.valid_to, containing.superseded_by) },
  };
}

export async function ingestEvent(
  payload: ParsedIngestPayload,
  store: IngestStore,
  nowIso?: string
): Promise<IngestOutcome> {
  const idempotencyKey = await makeIdempotencyKey(payload);

  const existing = await store.getIdempotency(idempotencyKey);
  if (existing) {
    return buildDeduplicatedOutcome(idempotencyKey, existing);
  }

  const recordedAt = nowIso ?? new Date().toISOString();
  const occurredAt = payload.occurred_at ? new Date(payload.occurred_at).toISOString() : recordedAt;

  // One redactor across all free-text fields so placeholder tokens stay consistent.
  const redactor = createPiiRedactor();
  const sanitized = redactor.redact(payload.content);
  const signalTopic = payload.signal_topic !== undefined ? redactor.redact(payload.signal_topic) : undefined;
  const signalValue = payload.signal_value !== undefined ? redactor.redact(payload.signal_value) : undefined;
  const { redacted_entities } = redactor.summary();

  // Ambiguous or low-confidence event -> isolate in disambiguation_queue
  if (!payload.person_id || payload.confidence < 0.85) {
    const queueId = `dq_${crypto.randomUUID()}`;
    const outcome: IngestOutcome = {
      status: 'routed_to_disambiguation_queue',
      http_status: 201,
      queue_id: queueId,
      idempotency_key: idempotencyKey,
      sanitized_content: sanitized,
      redacted_entities,
      confidence: payload.confidence,
      reason:
        'Ambiguous entity reference (<0.85 confidence or missing person_id); isolated in disambiguation_queue.',
    };

    const commitRes = await store.commitDisambiguation(
      {
        id: queueId,
        idempotency_key: idempotencyKey,
        source: payload.source,
        sanitized_content: sanitized,
        redacted_entities,
        confidence: payload.confidence,
        signal_topic: signalTopic ?? null,
        signal_value: signalValue ?? null,
        signal_category: signalTopic ? payload.signal_category : null,
        occurred_at: occurredAt,
        created_at: recordedAt,
      },
      {
        key: idempotencyKey,
        status: outcome.status,
        response_json: JSON.stringify(outcome),
      },
      recordedAt
    );

    if (commitRes.deduplicated && commitRes.existing) {
      return buildDeduplicatedOutcome(idempotencyKey, commitRes.existing);
    }

    return outcome;
  }

  // Verify person_id foreign key before committing timeline event or signals
  const exists = await store.personExists(payload.person_id);
  if (!exists) {
    return {
      status: 'rejected',
      http_status: 422,
      error: 'Unknown person_id; create the person record before ingesting events.',
      person_id: payload.person_id,
    };
  }

  for (let attempt = 1; attempt <= MAX_COMMIT_ATTEMPTS; attempt++) {
    const eventId = `evt_${crypto.randomUUID()}`;
    let bitemporalUpdate: BitemporalUpdate | null = null;
    let signalMutation: SignalMutation = { kind: 'none' };

    if (signalTopic && signalValue) {
      const plan = planSignalWrite({
        history: await store.getSignalHistory(payload.person_id, signalTopic),
        personId: payload.person_id,
        topic: signalTopic,
        value: signalValue,
        category: payload.signal_category,
        content: `${signalTopic}: ${signalValue}`,
        occurredAt,
        recordedAt,
        newSignalId: `sig_${crypto.randomUUID()}`,
      });
      bitemporalUpdate = plan.update;
      signalMutation = plan.mutation;
    }

    const outcome: IngestOutcome = {
      status: 'persisted',
      http_status: 201,
      event_id: eventId,
      idempotency_key: idempotencyKey,
      sanitized_content: sanitized,
      redacted_entities,
      bitemporal_update: bitemporalUpdate,
    };

    const commitRes = await store.commitIngestion({
      event: {
        id: eventId,
        person_id: payload.person_id,
        source: payload.source,
        summary: summarizeSanitizedContent(sanitized),
        raw_quote: sanitized,
        redacted_entities,
        sentiment_score: payload.sentiment_score ?? null,
        idempotency_key: idempotencyKey,
        occurred_at: occurredAt,
        recorded_at: recordedAt,
      },
      signalMutation,
      idempotency: {
        key: idempotencyKey,
        status: outcome.status,
        response_json: JSON.stringify(outcome),
      },
      createdAt: recordedAt,
    });

    if (commitRes.deduplicated && commitRes.existing) {
      return buildDeduplicatedOutcome(idempotencyKey, commitRes.existing);
    }
    if (!commitRes.conflict) {
      return outcome;
    }
    // A concurrent write changed this topic's history; re-read and re-plan.
  }

  return {
    status: 'conflict',
    http_status: 409,
    idempotency_key: idempotencyKey,
    error: 'Concurrent updates to the same signal topic; retry the request.',
  };
}

export const SYNTHETIC_FIXTURES: Array<{ case: string; payload: ParsedIngestPayload }> = [
  {
    case: '1_pii_redaction_and_initial_signal',
    payload: {
      person_id: 'person_synth_001',
      source: 'voice_note',
      content:
        'Met @alex_mock for coffee on 2026-10-01, email alex.demo@example.com, phone 415-555-0199. Mentioned loving iced matcha.',
      confidence: 0.96,
      signal_topic: 'beverage_preference',
      signal_value: 'loves_iced_matcha',
      signal_category: 'preference',
      occurred_at: '2026-10-01T18:00:00Z',
    },
  },
  {
    case: '2_idempotency_duplicate_retry',
    payload: {
      person_id: 'person_synth_001',
      source: 'voice_note',
      content:
        'Met @alex_mock for coffee on 2026-10-01, email alex.demo@example.com, phone 415-555-0199. Mentioned loving iced matcha.',
      confidence: 0.96,
      signal_topic: 'beverage_preference',
      signal_value: 'loves_iced_matcha',
      signal_category: 'preference',
      occurred_at: '2026-10-01T18:00:00Z',
    },
  },
  {
    case: '3_same_value_signal_reassertion',
    payload: {
      person_id: 'person_synth_001',
      source: 'manual',
      content: 'Confirmed again that iced matcha is still their favorite drink.',
      confidence: 0.95,
      signal_topic: 'beverage_preference',
      signal_value: 'loves_iced_matcha',
      signal_category: 'preference',
      occurred_at: '2026-10-15T12:00:00Z',
    },
  },
  {
    case: '4_bitemporal_preference_contradiction',
    payload: {
      person_id: 'person_synth_001',
      source: 'chat_log',
      content: 'Update: totally quit caffeine this month, switching to decaf rooibos only.',
      confidence: 0.94,
      signal_topic: 'beverage_preference',
      signal_value: 'no_caffeine_rooibos_only',
      signal_category: 'preference',
      occurred_at: '2026-11-15T20:30:00Z',
    },
  },
  {
    case: '5_out_of_order_historical_signal',
    payload: {
      person_id: 'person_synth_001',
      source: 'chat_log',
      content: 'Backfilled summer log: preferred espresso tonics in July.',
      confidence: 0.91,
      signal_topic: 'beverage_preference',
      signal_value: 'espresso_tonic',
      signal_category: 'preference',
      occurred_at: '2026-07-10T10:00:00Z',
    },
  },
  {
    case: '6_low_confidence_coreference_guard',
    payload: {
      person_id: null,
      source: 'voice_note',
      content: 'Quick note: she mentioned her birthday is next Thursday and wants a vinyl record.',
      confidence: 0.62,
      signal_category: 'preference',
      occurred_at: '2026-11-19T22:10:00Z',
    },
  },
];
