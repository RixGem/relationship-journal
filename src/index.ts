import { and, desc, eq, isNull } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import { requireBearerAuth } from './auth';
import { MCP_TOOLS, handleMcpRequest } from './mcp';
import { handlePasskeyRoute } from './passkey';
import {
  D1IngestStore,
  IngestPayloadSchema,
  MemoryIngestStore,
  SYNTHETIC_FIXTURES,
  ingestEvent,
} from './pipeline';
import * as schema from './schema';
import { renderFrontendHtml } from './ui';

export type RuntimeEnv = Omit<Env, 'API_KEY' | 'ENVIRONMENT' | 'PII_TOKEN_KEY'> & {
  API_KEY?: string;
  ENVIRONMENT?: string;
  /** Secret for stable PII placeholder tokens; set in production. */
  PII_TOKEN_KEY?: string;
};

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
      if (url.pathname === '/health' && request.method === 'GET') {
        return jsonResponse({
          status: 'ok',
          service: 'relationship-journal-api',
        });
      }

      // Frontend SPA at GET / and GET /app (returns JSON on GET / only if Accept explicitly asks for application/json without text/html)
      if ((url.pathname === '/' || url.pathname === '/app') && request.method === 'GET') {
        const accept = request.headers.get('Accept') ?? '';
        if (url.pathname === '/' && accept.includes('application/json') && !accept.includes('text/html')) {
          return jsonResponse({
            status: 'ok',
            service: 'relationship-journal-api',
          });
        }
        return new Response(renderFrontendHtml(), {
          status: 200,
          headers: {
            'Content-Type': 'text/html; charset=utf-8',
            'Cache-Control': 'no-store',
          },
        });
      }

      // Public Passkey (WebAuthn) enrollment & single-owner authentication routes
      if (url.pathname.startsWith('/auth/passkey/')) {
        const passkeyResponse = await handlePasskeyRoute(request, env);
        if (passkeyResponse) {
          return passkeyResponse;
        }
      }

      // Public synthetic demo dataset viewer (strictly scoped to [TEST_DATA] rows only)
      if (url.pathname === '/db/demo' && request.method === 'GET') {
        const [peopleRes, eventsRes, signalsRes] = await Promise.all([
          env.DB.prepare(
            "SELECT id, alias, relationship_state, key_dates, created_at FROM people WHERE alias LIKE '[TEST_DATA]%' ORDER BY id ASC"
          ).all<{
            id: string;
            alias: string;
            relationship_state: string;
            key_dates: string;
            created_at: string;
          }>(),
          env.DB.prepare(
            "SELECT e.id, e.person_id, e.source, e.summary, e.raw_quote, e.redacted_entities, e.sentiment_score, e.idempotency_key, e.occurred_at, e.recorded_at FROM timeline_events e INNER JOIN people p ON p.id = e.person_id WHERE p.alias LIKE '[TEST_DATA]%' ORDER BY e.occurred_at DESC"
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
            "SELECT s.id, s.person_id, s.category, s.topic, s.value, s.content, s.valid_from, s.valid_to, s.recorded_at, s.superseded_at, s.superseded_by FROM signals s INNER JOIN people p ON p.id = s.person_id WHERE p.alias LIKE '[TEST_DATA]%' ORDER BY s.valid_from ASC"
          ).all(),
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

        return jsonResponse({
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
        });
      }

      // Public isolated sandbox fixture suite (never touches production D1)
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

      // All data, ingestion, and MCP endpoints require Bearer authentication
      const auth = await requireBearerAuth(request, env);
      if (!auth.ok) {
        return auth.response;
      }

      if (url.pathname === '/mcp') {
        return handleMcpRequest(request, env);
      }

      if (url.pathname === '/mcp/tools' && request.method === 'GET') {
        return jsonResponse({
          protocol: 'mcp',
          endpoint: '/mcp',
          tools: MCP_TOOLS,
        });
      }

      if (url.pathname === '/ingest' && request.method === 'POST') {
        if (!env.PII_TOKEN_KEY && env.ENVIRONMENT !== 'development') {
          return jsonResponse(
            { error: 'Service misconfigured: PII_TOKEN_KEY secret is not set; refusing to store PII tokens.' },
            503
          );
        }
        const body = await request.json().catch(() => null);
        const parsed = IngestPayloadSchema.safeParse(body);
        if (!parsed.success) {
          return jsonResponse({ error: parsed.error.flatten() }, 400);
        }

        const outcome = await ingestEvent(parsed.data, new D1IngestStore(env.DB), undefined, {
          piiTokenKey: env.PII_TOKEN_KEY,
        });
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
