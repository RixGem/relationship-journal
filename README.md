# Relationship Journal API

Cloudflare Workers REST & MCP API backed by **Cloudflare D1 (SQLite)** and **Drizzle ORM (`drizzle-orm/sqlite-core`)**.

## Architecture

- **Runtime**: Cloudflare Workers (`wrangler.jsonc`, `nodejs_compat`, structured JSON observability enabled)
- **Database**: Cloudflare D1 (`relationship-journal-db`) with versioned migrations in `migrations/`
- **Schema**: 5 D1 tables defined in [src/schema.ts](src/schema.ts), [migrations/0001_initial_schema.sql](migrations/0001_initial_schema.sql), and [migrations/0002_signal_valid_time_guards.sql](migrations/0002_signal_valid_time_guards.sql):
  - `people`
  - `timeline_events`
  - `signals` (bitemporal `valid_from`, `valid_to`, `recorded_at`, `superseded_at`, `superseded_by`, with partial unique index enforcing at most one active signal per `(person_id, topic)` and triggers enforcing non-overlapping half-open `[valid_from, valid_to)` intervals)
  - `idempotency_keys`
  - `disambiguation_queue`
- **Security**: All ingestion, query, and MCP endpoints require `Authorization: Bearer <API_KEY>` verified via SHA-256 + `crypto.subtle.timingSafeEqual` (fail-closed if `API_KEY` is unconfigured). Only `/health`, `/fixtures/verify` (isolated in-memory sandbox), and `/db/demo` (strictly filtered to `[TEST_DATA]` synthetic rows) are public.
- **Pre-LLM PII Filtering**: Layer-1 deterministic regex + Luhn pre-filter in [src/pii.ts](src/pii.ts) redacts emails, payment cards, SSNs, phone numbers (E.164, NANP, CN mobile), `@handles`, and explicit name labels before storage. Unstructured free-text names without markers require downstream NER.

## Endpoints

| Method & Path | Auth | Description |
| --- | --- | --- |
| `GET /health` (or `/`) | Public | Minimal service liveness check |
| `GET /db/demo` | Public | Inspects seeded `[TEST_DATA]` synthetic test rows in D1 (excludes non-test records) |
| `GET /fixtures/verify` | Public | Executes synthetic edge-case suite inside an isolated per-request `MemoryIngestStore` sandbox |
| `POST /ingest` | Bearer | Validates payload with Zod, runs Layer-1 PII redaction, enforces SHA-256 idempotency, requires explicit `confidence`, redacts `content`/`signal_topic`/`signal_value`, routes `< 0.85` confidence / missing `person_id` to `disambiguation_queue`, rejects unknown `person_id` (`422`), and atomically persists events + bitemporal signals via `db.batch()` (`201` created, `200` deduplicated, `409` on exhausted concurrency retry) |
| `GET /people/:id/timeline` | Bearer | Lists persisted timeline events for a person ordered by `occurred_at DESC` |
| `GET /people/:id/signals` | Bearer | Lists active signals (`valid_to IS NULL`), or full bitemporal history with `?include_history=true` |
| `POST /mcp` | Bearer | MCP Streamable HTTP JSON-RPC 2.0 endpoint (`initialize`, `notifications/initialized`, `ping`, `tools/list`, `tools/call`) |
| `GET /mcp/tools` | Bearer | Lists the 4 MCP tool schemas exposed by `POST /mcp` |

## MCP Tools (`POST /mcp`)

1. **`create_person`** — Create a new person profile in D1 with alias, relationship state, and optional key dates.
2. **`query_relationship_records`** — Query people profiles, anonymized timeline events, and active or historical bitemporal signals from D1.
3. **`insert_relationship_event`** — Run the full ingestion pipeline (PII redaction, SHA-256 idempotency, disambiguation routing, atomic D1 persistence).
4. **`analyze_relationship`** — Compute interaction cadence, sentiment average and trend, active signals by category, bitemporal preference evolution (`preference_changes`), upcoming key dates, and follow-up hooks (or portfolio overview when `person_id` is omitted).

```bash
# Example: List MCP tools
curl -sS -X POST https://relationship-journal-api.magn.workers.dev/mcp \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'

# Example: Analyze a person via MCP
curl -sS -X POST https://relationship-journal-api.magn.workers.dev/mcp \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"analyze_relationship","arguments":{"person_id":"00000000-0000-4000-8000-000000000101"}}}'
```

PII in `content`, `signal_topic` and `signal_value` is replaced with stable HMAC tokens (e.g. `[EMAIL_3f9a1c2e4b5d]`) so redacted signals stay comparable across requests. Outside development, `/ingest` and `insert_relationship_event` return `503`/error until the `PII_TOKEN_KEY` secret is set (`npx wrangler secret put PII_TOKEN_KEY`, e.g. `openssl rand -hex 32`). Rotating it changes all future tokens, so redacted topics no longer match their earlier history.

## Local Development & Verification

```bash
# 1. Configure local Bearer API key (gitignored)
printf 'API_KEY=%s\nPII_TOKEN_KEY=%s\nENVIRONMENT=development\n' "$(openssl rand -hex 32)" "$(openssl rand -hex 32)" > .dev.vars

# 2. Apply versioned D1 migrations & non-destructive synthetic test seed locally
npm run db:migrate:local
npm run db:seed:local

# 3. Generate Wrangler types, typecheck, and run Vitest integration suite against Miniflare D1
npm run typegen
npm run typecheck
npm test

# 4. Run local dev server
npm run dev
```

## Production Deployment

```bash
npm run db:migrate:remote
npx wrangler secret put API_KEY
npx wrangler secret put PII_TOKEN_KEY
npm run deploy
```
