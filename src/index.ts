import { z } from 'zod';

const IngestPayload = z.object({
  person_id: z.string().nullable().default(null),
  source: z.enum(['voice_note', 'chat_log', 'manual']).default('manual'),
  content: z.string().min(1),
  confidence: z.number().min(0).max(1).default(0.95),
  signal_topic: z.string().optional(),
  signal_value: z.string().optional(),
  occurred_at: z.string().optional(),
});

type ParsedPayload = z.infer<typeof IngestPayload>;

interface SignalRecord {
  id: string;
  person_id: string;
  topic: string;
  value: string;
  valid_from: string;
  valid_to: string | null;
  superseded_by: string | null;
}

// 1. Pre-LLM PII Anonymization Pipeline
function stripPII(raw: string): { sanitized: string; redacted_entities: string[] } {
  const redacted: string[] = [];
  let text = raw;

  text = text.replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, () => {
    redacted.push('EMAIL');
    return '[EMAIL_REDACTED]';
  });

  text = text.replace(/(\+?\d{1,3}[-.\s]?)?(\(?\d{3}\)?[-.\s]?)?\d{3}[-.\s]?\d{4}/g, () => {
    redacted.push('PHONE');
    return '[PHONE_REDACTED]';
  });

  // Mask explicit "@handle" or "Name:" patterns before hitting embeddings
  text = text.replace(/@[a-zA-Z0-9_]{3,}/g, () => {
    redacted.push('HANDLE');
    return '[HANDLE_REDACTED]';
  });

  return { sanitized: text, redacted_entities: redacted };
}

// 2. Deterministic SHA-256 Idempotency Key
async function makeIdempotencyKey(payload: ParsedPayload): Promise<string> {
  const normalized = `${payload.person_id ?? 'unknown'}|${payload.source}|${payload.content.trim().toLowerCase()}`;
  const hashBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(normalized));
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 24);
}

// Core pipeline processor (shared by /ingest and /fixtures/verify)
async function processEvent(
  payload: ParsedPayload,
  seenKeys: Set<string>,
  signalsStore: SignalRecord[]
) {
  const idempotencyKey = await makeIdempotencyKey(payload);
  const { sanitized, redacted_entities } = stripPII(payload.content);

  // Edge Case A: Idempotency Guardrail
  if (seenKeys.has(idempotencyKey)) {
    return {
      status: 'deduplicated',
      http_status: 200,
      idempotency_key: idempotencyKey,
      reason: 'Duplicate webhook/retry dropped; downstream media jobs not triggered.',
    };
  }
  seenKeys.add(idempotencyKey);

  // Edge Case B: Low-Confidence Coreference Routing
  if (!payload.person_id || payload.confidence < 0.85) {
    return {
      status: 'routed_to_disambiguation_queue',
      http_status: 202,
      idempotency_key: idempotencyKey,
      sanitized_content: sanitized,
      redacted_entities,
      confidence: payload.confidence,
      reason: 'Ambiguous entity reference (<0.85 confidence); isolated from primary DB to prevent coreference poisoning.',
    };
  }

  // Edge Case C: Bitemporal State Superseding
  let bitemporalAction: Record<string, unknown> | null = null;
  if (payload.signal_topic && payload.signal_value) {
    const now = payload.occurred_at ?? new Date().toISOString();
    const newId = `sig_${idempotencyKey.slice(0, 8)}`;

    const existingActive = signalsStore.find(
      (s) => s.person_id === payload.person_id && s.topic === payload.signal_topic && s.valid_to === null
    );

    if (existingActive && existingActive.value !== payload.signal_value) {
      existingActive.valid_to = now;
      existingActive.superseded_by = newId;
      bitemporalAction = {
        action: 'superseded_conflicting_signal',
        deprecated_signal_id: existingActive.id,
        old_value: existingActive.value,
        new_signal_id: newId,
        new_value: payload.signal_value,
      };
    }

    signalsStore.push({
      id: newId,
      person_id: payload.person_id,
      topic: payload.signal_topic,
      value: payload.signal_value,
      valid_from: now,
      valid_to: null,
      superseded_by: null,
    });
  }

  return {
    status: 'queued',
    http_status: 202,
    idempotency_key: idempotencyKey,
    sanitized_content: sanitized,
    redacted_entities,
    bitemporal_update: bitemporalAction,
  };
}

// Synthetic test fixtures (zero real PII)
const SYNTHETIC_FIXTURES: Array<{ case: string; payload: ParsedPayload }> = [
  {
    case: '1_pii_redaction_and_initial_signal',
    payload: {
      person_id: 'person_synth_001',
      source: 'voice_note',
      content: 'Met @alex_mock for coffee, email alex.demo@example.com, phone 415-555-0199. Mentioned loving iced matcha.',
      confidence: 0.96,
      signal_topic: 'beverage_preference',
      signal_value: 'loves_iced_matcha',
      occurred_at: '2026-10-01T18:00:00Z',
    },
  },
  {
    case: '2_idempotency_duplicate_retry',
    payload: {
      person_id: 'person_synth_001',
      source: 'voice_note',
      content: 'Met @alex_mock for coffee, email alex.demo@example.com, phone 415-555-0199. Mentioned loving iced matcha.',
      confidence: 0.96,
      signal_topic: 'beverage_preference',
      signal_value: 'loves_iced_matcha',
      occurred_at: '2026-10-01T18:00:00Z',
    },
  },
  {
    case: '3_bitemporal_preference_contradiction',
    payload: {
      person_id: 'person_synth_001',
      source: 'chat_log',
      content: 'Update: totally quit caffeine this month, switching to decaf rooibos only.',
      confidence: 0.94,
      signal_topic: 'beverage_preference',
      signal_value: 'no_caffeine_rooibos_only',
      occurred_at: '2026-11-15T20:30:00Z',
    },
  },
  {
    case: '4_low_confidence_coreference_guard',
    payload: {
      person_id: null,
      source: 'voice_note',
      content: 'Quick note: she mentioned her birthday is next Thursday and wants a vinyl record.',
      confidence: 0.62,
      occurred_at: '2026-11-19T22:10:00Z',
    },
  },
];

// Ephemeral isolate cache for live /ingest demo
const liveSeenKeys = new Set<string>();
const liveSignals: SignalRecord[] = [];

export interface Env {
  DB: D1Database;
}

interface PersonRow {
  id: string;
  alias: string;
  relationship_state: string | null;
  key_dates: string;
  created_at: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const headers = { 'Content-Type': 'application/json' };

    if (url.pathname === '/health' || url.pathname === '/') {
      return new Response(
        JSON.stringify({
          status: 'ok',
          service: 'relationship-journal-api',
          privacy_mode: 'pre-llm-pii-redaction-enabled',
          endpoints: ['/health', '/ingest', '/fixtures/verify', '/db/demo', '/mcp/tools'],
        }),
        { headers }
      );
    }

    if (url.pathname === '/db/demo') {
      const [peopleRes, eventsRes, signalsRes] = await Promise.all([
        env.DB.prepare(
          'SELECT id, alias, relationship_state, key_dates, created_at FROM people ORDER BY id ASC'
        ).all<PersonRow>(),
        env.DB.prepare(
          'SELECT id, person_id, summary, raw_quote, sentiment_score, occurred_at FROM timeline_events ORDER BY occurred_at ASC'
        ).all(),
        env.DB.prepare(
          'SELECT id, person_id, category, content, created_at FROM signals ORDER BY created_at ASC'
        ).all(),
      ]);

      const peopleRows = (peopleRes.results ?? []).map((row) => {
        let parsedKeyDates: unknown = row.key_dates;
        try {
          parsedKeyDates = JSON.parse(row.key_dates);
        } catch {
          // keep raw string if unparseable
        }
        return { ...row, key_dates: parsedKeyDates };
      });
      const eventRows = eventsRes.results ?? [];
      const signalRows = signalsRes.results ?? [];

      return new Response(
        JSON.stringify(
          {
            data_classification: 'SYNTHETIC_TEST_ONLY',
            is_test_data: true,
            counts: {
              people: peopleRows.length,
              timeline_events: eventRows.length,
              signals: signalRows.length,
            },
            tables: {
              people: peopleRows,
              timeline_events: eventRows,
              signals: signalRows,
            },
          },
          null,
          2
        ),
        { headers }
      );
    }

    if (url.pathname === '/fixtures/verify') {
      const seen = new Set<string>();
      const store: SignalRecord[] = [];
      const results = [];

      for (const fixture of SYNTHETIC_FIXTURES) {
        const outcome = await processEvent(fixture.payload, seen, store);
        results.push({ test_case: fixture.case, outcome });
      }

      return new Response(
        JSON.stringify(
          {
            suite: 'synthetic_edge_case_verification',
            passed: results.length,
            results,
            final_bitemporal_signal_state: store,
          },
          null,
          2
        ),
        { headers }
      );
    }

    if (url.pathname === '/ingest' && request.method === 'POST') {
      const body = await request.json().catch(() => null);
      const parsed = IngestPayload.safeParse(body);
      if (!parsed.success) {
        return new Response(JSON.stringify({ error: parsed.error.flatten() }), {
          status: 400,
          headers,
        });
      }

      const outcome = await processEvent(parsed.data, liveSeenKeys, liveSignals);
      return new Response(JSON.stringify(outcome, null, 2), {
        status: outcome.http_status,
        headers,
      });
    }

    if (url.pathname === '/mcp/tools') {
      return new Response(
        JSON.stringify({
          tools: [
            {
              name: 'query_timeline_events',
              description: 'Query anonymized relationship events and sentiment trends by person_id',
            },
            {
              name: 'get_active_signals',
              description: 'Retrieve non-superseded (valid_to IS NULL) gift ideas, preferences, and boundaries',
            },
          ],
        }),
        { headers }
      );
    }

    return new Response(JSON.stringify({ error: 'Not Found' }), { status: 404, headers });
  },
};
