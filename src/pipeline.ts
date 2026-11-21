import { z } from 'zod';
import { stripPII, type PiiEntityType } from './pii';

export const IngestPayloadSchema = z
  .object({
    person_id: z.string().min(1).nullable().default(null),
    source: z.enum(['voice_note', 'chat_log', 'manual']).default('manual'),
    content: z.string().min(1).max(10000),
    confidence: z.number().min(0).max(1).default(0.95),
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
      active_signal_id: string;
      active_value: string;
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

export type SignalMutation =
  | { kind: 'none' }
  | { kind: 'insert'; signal: SignalRecord }
  | {
      kind: 'supersede';
      deprecatedId: string;
      validTo: string;
      supersededAt: string;
      newSignal: SignalRecord;
    };

export interface IngestStore {
  getIdempotency(key: string): Promise<IdempotencyRecord | null>;
  personExists(personId: string): Promise<boolean>;
  getActiveSignal(personId: string, topic: string): Promise<SignalRecord | null>;
  commitDisambiguation(
    entry: DisambiguationInsert,
    idempotency: IdempotencyRecord,
    createdAt: string
  ): Promise<{ deduplicated: boolean; existing?: IdempotencyRecord | null }>;
  commitIngestion(params: {
    event: TimelineEventInsert;
    signalMutation: SignalMutation;
    idempotency: IdempotencyRecord;
    createdAt: string;
  }): Promise<{ deduplicated: boolean; existing?: IdempotencyRecord | null }>;
}

function isUniqueConstraintError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /UNIQUE constraint failed|SQLITE_CONSTRAINT/i.test(msg);
}

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

  async getActiveSignal(personId: string, topic: string): Promise<SignalRecord | null> {
    const row = await this.db
      .prepare(
        'SELECT id, person_id, category, topic, value, content, valid_from, valid_to, recorded_at, superseded_at, superseded_by FROM signals WHERE person_id = ? AND topic = ? AND valid_to IS NULL LIMIT 1'
      )
      .bind(personId, topic)
      .first<SignalRecord>();
    return row ?? null;
  }

  async commitDisambiguation(
    entry: DisambiguationInsert,
    idempotency: IdempotencyRecord,
    createdAt: string
  ): Promise<{ deduplicated: boolean; existing?: IdempotencyRecord | null }> {
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
  }): Promise<{ deduplicated: boolean; existing?: IdempotencyRecord | null }> {
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

    if (signalMutation.kind === 'supersede') {
      statements.push(
        this.db
          .prepare(
            'UPDATE signals SET valid_to = ?, superseded_at = ?, superseded_by = ? WHERE id = ? AND valid_to IS NULL'
          )
          .bind(
            signalMutation.validTo,
            signalMutation.supersededAt,
            signalMutation.newSignal.id,
            signalMutation.deprecatedId
          )
      );
      statements.push(
        this.db
          .prepare(
            'INSERT INTO signals (id, person_id, category, topic, value, content, valid_from, valid_to, recorded_at, superseded_at, superseded_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
          )
          .bind(
            signalMutation.newSignal.id,
            signalMutation.newSignal.person_id,
            signalMutation.newSignal.category,
            signalMutation.newSignal.topic,
            signalMutation.newSignal.value,
            signalMutation.newSignal.content,
            signalMutation.newSignal.valid_from,
            signalMutation.newSignal.valid_to,
            signalMutation.newSignal.recorded_at,
            signalMutation.newSignal.superseded_at,
            signalMutation.newSignal.superseded_by
          )
      );
    } else if (signalMutation.kind === 'insert') {
      statements.push(
        this.db
          .prepare(
            'INSERT INTO signals (id, person_id, category, topic, value, content, valid_from, valid_to, recorded_at, superseded_at, superseded_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
          )
          .bind(
            signalMutation.signal.id,
            signalMutation.signal.person_id,
            signalMutation.signal.category,
            signalMutation.signal.topic,
            signalMutation.signal.value,
            signalMutation.signal.content,
            signalMutation.signal.valid_from,
            signalMutation.signal.valid_to,
            signalMutation.signal.recorded_at,
            signalMutation.signal.superseded_at,
            signalMutation.signal.superseded_by
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
      if (isUniqueConstraintError(err)) {
        const existing = await this.getIdempotency(idempotency.key);
        if (existing) {
          return { deduplicated: true, existing };
        }
      }
      throw err;
    }
  }
}

/**
 * Isolated, per-request in-memory store used exclusively by `/fixtures/verify`
 * so synthetic test verification never mutates production D1 tables.
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

  async getActiveSignal(personId: string, topic: string): Promise<SignalRecord | null> {
    return (
      this.signals.find((s) => s.person_id === personId && s.topic === topic && s.valid_to === null) ??
      null
    );
  }

  async commitDisambiguation(
    entry: DisambiguationInsert,
    idempotency: IdempotencyRecord
  ): Promise<{ deduplicated: boolean; existing?: IdempotencyRecord | null }> {
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
  }): Promise<{ deduplicated: boolean; existing?: IdempotencyRecord | null }> {
    const existing = this.idempotencyMap.get(params.idempotency.key);
    if (existing) {
      return { deduplicated: true, existing };
    }

    this.events.push(params.event);
    if (params.signalMutation.kind === 'supersede') {
      const mutation = params.signalMutation;
      const target = this.signals.find(
        (s) => s.id === mutation.deprecatedId && s.valid_to === null
      );
      if (target) {
        target.valid_to = mutation.validTo;
        target.superseded_at = mutation.supersededAt;
        target.superseded_by = mutation.newSignal.id;
      }
      this.signals.push(mutation.newSignal);
    } else if (params.signalMutation.kind === 'insert') {
      this.signals.push(params.signalMutation.signal);
    }

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
  const { sanitized, redacted_entities } = stripPII(payload.content);

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
        signal_topic: payload.signal_topic ?? null,
        signal_value: payload.signal_value ?? null,
        signal_category: payload.signal_topic ? payload.signal_category : null,
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

  const eventId = `evt_${crypto.randomUUID()}`;
  let bitemporalUpdate: BitemporalUpdate | null = null;
  let signalMutation: SignalMutation = { kind: 'none' };

  if (payload.signal_topic && payload.signal_value) {
    const active = await store.getActiveSignal(payload.person_id, payload.signal_topic);
    const newSignalId = `sig_${crypto.randomUUID()}`;
    const signalContent = `${payload.signal_topic}: ${payload.signal_value}`;

    if (!active) {
      bitemporalUpdate = {
        action: 'created_signal',
        new_signal_id: newSignalId,
        value: payload.signal_value,
        valid_from: occurredAt,
      };
      signalMutation = {
        kind: 'insert',
        signal: {
          id: newSignalId,
          person_id: payload.person_id,
          category: payload.signal_category,
          topic: payload.signal_topic,
          value: payload.signal_value,
          content: signalContent,
          valid_from: occurredAt,
          valid_to: null,
          recorded_at: recordedAt,
          superseded_at: null,
          superseded_by: null,
        },
      };
    } else if (active.value === payload.signal_value) {
      // Idempotent / same-value re-assertion: preserve existing active signal without duplicating
      bitemporalUpdate = {
        action: 'unchanged_existing_signal',
        active_signal_id: active.id,
        value: active.value,
      };
    } else if (Date.parse(occurredAt) < Date.parse(active.valid_from)) {
      // Out-of-order late-arriving historical event: record closed past interval without clobbering newer active value
      bitemporalUpdate = {
        action: 'recorded_historical_signal',
        historical_signal_id: newSignalId,
        value: payload.signal_value,
        valid_from: occurredAt,
        valid_to: active.valid_from,
        active_signal_id: active.id,
        active_value: active.value,
      };
      signalMutation = {
        kind: 'insert',
        signal: {
          id: newSignalId,
          person_id: payload.person_id,
          category: payload.signal_category,
          topic: payload.signal_topic,
          value: payload.signal_value,
          content: signalContent,
          valid_from: occurredAt,
          valid_to: active.valid_from,
          recorded_at: recordedAt,
          superseded_at: recordedAt,
          superseded_by: active.id,
        },
      };
    } else {
      // Conflicting newer or concurrent observation: close prior active signal and insert replacement
      bitemporalUpdate = {
        action: 'superseded_conflicting_signal',
        deprecated_signal_id: active.id,
        old_value: active.value,
        new_signal_id: newSignalId,
        new_value: payload.signal_value,
        valid_from: occurredAt,
      };
      signalMutation = {
        kind: 'supersede',
        deprecatedId: active.id,
        validTo: occurredAt,
        supersededAt: recordedAt,
        newSignal: {
          id: newSignalId,
          person_id: payload.person_id,
          category: payload.signal_category,
          topic: payload.signal_topic,
          value: payload.signal_value,
          content: signalContent,
          valid_from: occurredAt,
          valid_to: null,
          recorded_at: recordedAt,
          superseded_at: null,
          superseded_by: null,
        },
      };
    }
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

  return outcome;
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
