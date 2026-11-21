# Relationship Journal API

Cloudflare Workers REST API backed by **Cloudflare D1 (SQLite)** and **Drizzle ORM (`drizzle-orm/sqlite-core`)**.

## Architecture

- **Runtime**: Cloudflare Workers (`wrangler.jsonc`, `nodejs_compat`, structured JSON observability enabled)
- **Database**: Cloudflare D1 (`relationship-journal-db`) with versioned migrations in `migrations/`
- **Schema**: 5 D1 tables defined in [src/schema.ts](src/schema.ts) and [migrations/0001_initial_schema.sql](migrations/0001_initial_schema.sql):
  - `people`
  - `timeline_events`
  - `signals` (bitemporal `valid_from`, `valid_to`, `recorded_at`, `superseded_at`, `superseded_by`, with partial unique index enforcing at most one active signal per `(person_id, topic)`)
  - `idempotency_keys`
  - `disambiguation_queue`
- **Security**: All endpoints except minimal `GET /health` require `Authorization: Bearer <API_KEY>` verified via SHA-256 + `crypto.subtle.timingSafeEqual` (fail-closed if `API_KEY` is unconfigured).
- **Pre-LLM PII Filtering**: Layer-1 deterministic regex + Luhn pre-filter in [src/pii.ts](src/pii.ts) redacts emails, payment cards, SSNs, phone numbers (E.164, NANP, CN mobile), `@handles`, and explicit name labels before storage. Unstructured free-text names without markers require downstream NER.

## Endpoints

| Method & Path | Auth | Description |
| --- | --- | --- |
| `GET /health` (or `/`) | Public | Minimal service liveness check |
| `POST /ingest` | Bearer | Validates payload with Zod, runs Layer-1 PII redaction, enforces SHA-256 idempotency, routes `< 0.85` confidence / missing `person_id` to `disambiguation_queue`, rejects unknown `person_id` (`422`), and atomically persists events + bitemporal signals via `db.batch()` (`201` created, `200` deduplicated) |
| `GET /people/:id/timeline` | Bearer | Lists persisted timeline events for a person ordered by `occurred_at DESC` |
| `GET /people/:id/signals` | Bearer | Lists active signals (`valid_to IS NULL`), or full bitemporal history with `?include_history=true` |
| `GET /db/demo` | Bearer | Inspects seeded synthetic test rows across D1 tables |
| `GET /fixtures/verify` | Bearer | Executes synthetic edge-case suite inside an isolated per-request `MemoryIngestStore` sandbox |
| `GET /mcp/tools` | Bearer | Returns tool manifest aligned with implemented API routes |

## Local Development & Verification

```bash
# 1. Configure local Bearer API key (gitignored)
echo "API_KEY=$(openssl rand -hex 32)" > .dev.vars

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
npm run deploy
```
