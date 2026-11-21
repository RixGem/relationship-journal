import { and, desc, eq, isNull } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import { requireBearerAuth } from './auth';
import {
  D1IngestStore,
  IngestPayloadSchema,
  MemoryIngestStore,
  SYNTHETIC_FIXTURES,
  ingestEvent,
} from './pipeline';
import * as schema from './schema';

export type RuntimeEnv = Omit<Env, 'API_KEY' | 'ENVIRONMENT'> & {
  API_KEY?: string;
  /** Diagnostic endpoints (/db/demo, /fixtures/verify) are only served when this is 'development'. */
  ENVIRONMENT?: string;
};

const DEV_ONLY_PATHS = new Set(['/db/demo', '/fixtures/verify']);

const JSON_HEADERS = { 'Content-Type': 'application/json' };

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: JSON_HEADERS,
  });
}

function parseJsonSafe<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export default {
  async fetch(request: Request, env: RuntimeEnv): Promise<Response> {
    try {
      const url = new URL(request.url);

      // Public minimal health endpoint
      if ((url.pathname === '/health' || url.pathname === '/') && request.method === 'GET') {
        return jsonResponse({
          status: 'ok',
          service: 'relationship-journal-api',
        });
      }

      // All data, ingestion, and diagnostic endpoints require Bearer authentication
      const auth = await requireBearerAuth(request, env);
      if (!auth.ok) {
        return auth.response;
      }

      if (DEV_ONLY_PATHS.has(url.pathname) && env.ENVIRONMENT !== 'development') {
        return jsonResponse({ error: 'Not Found' }, 404);
      }

      if (url.pathname === '/ingest' && request.method === 'POST') {
        const body = await request.json().catch(() => null);
        const parsed = IngestPayloadSchema.safeParse(body);
        if (!parsed.success) {
          return jsonResponse({ error: parsed.error.flatten() }, 400);
        }

        const outcome = await ingestEvent(parsed.data, new D1IngestStore(env.DB));
        return jsonResponse(outcome, outcome.http_status);
      }

      const timelineMatch = url.pathname.match(/^\/people\/([^/]+)\/timeline$/);
      if (timelineMatch && request.method === 'GET') {
        const personId = decodeURIComponent(timelineMatch[1]);
        const db = drizzle(env.DB, { schema });

        const [person] = await db
          .select({ id: schema.people.id, alias: schema.people.alias })
          .from(schema.people)
          .where(eq(schema.people.id, personId))
          .limit(1);

        if (!person) {
          return jsonResponse({ error: 'Person not found' }, 404);
        }

        const events = await db
          .select()
          .from(schema.timelineEvents)
          .where(eq(schema.timelineEvents.personId, personId))
          .orderBy(desc(schema.timelineEvents.occurredAt));

        return jsonResponse({
          person_id: personId,
          alias: person.alias,
          count: events.length,
          events,
        });
      }

      const signalsMatch = url.pathname.match(/^\/people\/([^/]+)\/signals$/);
      if (signalsMatch && request.method === 'GET') {
        const personId = decodeURIComponent(signalsMatch[1]);
        const includeHistory = url.searchParams.get('include_history') === 'true';
        const db = drizzle(env.DB, { schema });

        const [person] = await db
          .select({ id: schema.people.id, alias: schema.people.alias })
          .from(schema.people)
          .where(eq(schema.people.id, personId))
          .limit(1);

        if (!person) {
          return jsonResponse({ error: 'Person not found' }, 404);
        }

        const condition = includeHistory
          ? eq(schema.signals.personId, personId)
          : and(eq(schema.signals.personId, personId), isNull(schema.signals.validTo));

        const signalRows = await db
          .select()
          .from(schema.signals)
          .where(condition)
          .orderBy(desc(schema.signals.validFrom));

        return jsonResponse({
          person_id: personId,
          alias: person.alias,
          include_history: includeHistory,
          count: signalRows.length,
          signals: signalRows,
        });
      }

      if (url.pathname === '/db/demo' && request.method === 'GET') {
        const [peopleRes, eventsRes, signalsRes, queueRes, idempotencyRes] = await Promise.all([
          env.DB.prepare(
            'SELECT id, alias, relationship_state, key_dates, created_at FROM people ORDER BY id ASC'
          ).all<{
            id: string;
            alias: string;
            relationship_state: string;
            key_dates: string;
            created_at: string;
          }>(),
          env.DB.prepare(
            'SELECT id, person_id, source, summary, raw_quote, redacted_entities, sentiment_score, idempotency_key, occurred_at, recorded_at FROM timeline_events ORDER BY occurred_at DESC'
          ).all<{
            id: string;
            person_id: string;
            source: string;
            summary: string;
            raw_quote: string | null;
            redacted_entities: string;
            sentiment_score: number | null;
            idempotency_key: string | null;
            occurred_at: string;
            recorded_at: string;
          }>(),
          env.DB.prepare(
            'SELECT id, person_id, category, topic, value, content, valid_from, valid_to, recorded_at, superseded_at, superseded_by FROM signals ORDER BY valid_from ASC'
          ).all(),
          env.DB.prepare(
            'SELECT id, idempotency_key, source, sanitized_content, redacted_entities, confidence, signal_topic, signal_value, signal_category, occurred_at, status, created_at FROM disambiguation_queue ORDER BY created_at DESC'
          ).all(),
          env.DB.prepare('SELECT COUNT(*) as total FROM idempotency_keys').first<{ total: number }>(),
        ]);

        const peopleRows = (peopleRes.results ?? []).map((row) => ({
          ...row,
          key_dates: parseJsonSafe<Record<string, unknown>>(row.key_dates, {}),
        }));
        const eventRows = (eventsRes.results ?? []).map((row) => ({
          ...row,
          redacted_entities: parseJsonSafe<string[]>(row.redacted_entities, []),
        }));
        const signalRows = signalsRes.results ?? [];
        const queueRows = queueRes.results ?? [];

        return jsonResponse({
          data_classification: 'SYNTHETIC_TEST_ONLY',
          is_test_data: true,
          counts: {
            people: peopleRows.length,
            timeline_events: eventRows.length,
            signals: signalRows.length,
            disambiguation_queue: queueRows.length,
            idempotency_keys: idempotencyRes?.total ?? 0,
          },
          tables: {
            people: peopleRows,
            timeline_events: eventRows,
            signals: signalRows,
            disambiguation_queue: queueRows,
          },
        });
      }

      if (url.pathname === '/fixtures/verify' && request.method === 'GET') {
        const sandboxStore = new MemoryIngestStore(['person_synth_001']);
        const results = [];

        for (const fixture of SYNTHETIC_FIXTURES) {
          const outcome = await ingestEvent(fixture.payload, sandboxStore, '2026-11-21T00:00:00Z');
          results.push({ test_case: fixture.case, outcome });
        }

        return jsonResponse({
          suite: 'synthetic_edge_case_verification',
          isolated_sandbox: true,
          passed: results.length,
          results,
          final_bitemporal_signal_state: sandboxStore.signals,
          disambiguation_queue: sandboxStore.disambiguationQueue,
        });
      }

      if (url.pathname === '/mcp/tools' && request.method === 'GET') {
        return jsonResponse({
          tools: [
            {
              name: 'ingest_relationship_event',
              method: 'POST',
              endpoint: '/ingest',
              description:
                'Sanitize PII, deduplicate by SHA-256 idempotency key, route low-confidence items to disambiguation_queue, and persist bitemporal signals to D1',
            },
            {
              name: 'query_timeline_events',
              method: 'GET',
              endpoint: '/people/:id/timeline',
              description: 'Query anonymized relationship timeline events from D1 by person_id',
            },
            {
              name: 'get_active_signals',
              method: 'GET',
              endpoint: '/people/:id/signals',
              description:
                'Retrieve non-superseded (valid_to IS NULL) signals or full bitemporal history (?include_history=true) from D1',
            },
          ],
        });
      }

      return jsonResponse({ error: 'Not Found' }, 404);
    } catch (err) {
      console.error(
        JSON.stringify({
          level: 'error',
          message: err instanceof Error ? err.message : 'Unhandled error',
          path: new URL(request.url).pathname,
        })
      );
      return jsonResponse({ error: 'Internal Server Error' }, 500);
    }
  },
} satisfies ExportedHandler<RuntimeEnv>;
