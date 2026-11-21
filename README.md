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
| `POST /ingest` | Bearer | Validates payload with Zod, runs Layer-1 PII redaction, enforces SHA-256 idempotency, requires explicit `confidence`, redacts `content`/`signal_topic`/`signal_value`, routes `< 0.85` confidence / missing `person_id` to `disambiguation_queue`, rejects unknown `person_id` (`422`), and atomically persists events + bitemporal signals via `db.batch()` with non-overlapping half-open valid-time intervals (`201` created, `200` deduplicated, `409` if concurrent updates to the same topic keep conflicting after retries) |
| `GET /people/:id/timeline` | Bearer | Lists persisted timeline events for a person ordered by `occurred_at DESC` |
| `GET /people/:id/signals` | Bearer | Lists active signals (`valid_to IS NULL`), or full bitemporal history with `?include_history=true` |
| `GET /db/demo` | Bearer, dev only | Inspects seeded synthetic test rows across D1 tables |
| `GET /fixtures/verify` | Bearer, dev only | Executes synthetic edge-case suite inside an isolated per-request `MemoryIngestStore` sandbox |
| `GET /mcp/tools` | Bearer | Returns tool manifest aligned with implemented API routes |

PII in `content`, `signal_topic` and `signal_value` is replaced with stable HMAC tokens (e.g. `[EMAIL_3f9a1c2e4b5d]`) so redacted signals stay comparable across requests. Outside development, `/ingest` returns `503` until the `PII_TOKEN_KEY` secret is set (`npx wrangler secret put PII_TOKEN_KEY`, e.g. `openssl rand -hex 32`). Rotating it changes all future tokens, so redacted topics no longer match their earlier history.

`/db/demo` and `/fixtures/verify` return `404` unless `ENVIRONMENT=development` is set (e.g. in `.dev.vars`). Do not set it in production.

## Local Development & Verification

```bash
# 1. Configure local Bearer API key (gitignored)
printf 'API_KEY=%s\nENVIRONMENT=development\n' "$(openssl rand -hex 32)" > .dev.vars

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
