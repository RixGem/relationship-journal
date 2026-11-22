import { and, asc, desc, eq, isNull, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import { z } from 'zod';
import { createStablePiiRedactor } from './pii';
import { D1IngestStore, IngestPayloadSchema, ingestEvent, planSignalWrite } from './pipeline';
import * as schema from './schema';

export interface McpRuntimeEnv {
  DB: D1Database;
  ENVIRONMENT?: string;
  PII_TOKEN_KEY?: string;
}

export interface McpToolDefinition {
  name:
    | 'create_person'
    | 'update_person'
    | 'query_relationship_records'
    | 'insert_relationship_event'
    | 'manage_signals'
    | 'ingest_voice_memo'
    | 'analyze_relationship'
    | 'synthesize_narrative'
    | 'manage_disambiguation_item';
  description: string;
  inputSchema: Record<string, unknown>;
}

export const MCP_SERVER_INSTRUCTIONS = [
  'Relationship Journal MCP — AI Usage Playbook:',
  '1. ENTITY RESOLUTION & PROFILE LIFECYCLE: Before logging an event or creating a person, call `query_relationship_records` (with no `person_id`) to check existing contacts. Call `create_person` only for a new contact, and use `update_person` (`manage_profile`) whenever a contact changes `relationship_state` (e.g., `lover` -> `discernment`, `active` -> `close`), alias, or `key_dates`/tags.',
  '2. TURN LOGS & VOICE MEMOS INTO BITEMPORAL SIGNALS: For raw Whisper voice transcripts or chat logs, call `ingest_voice_memo` (`commit: false` first to preview PII redaction, contact attribution, and extracted candidate signals, then `commit: true` or `insert_relationship_event` after confirmation). For direct preference/boundary management without logging an event, use `manage_signals` (`query`, `override`/`upsert`, or `supersede`/`retire`).',
  '3. ANTI-POISONING CONFIDENCE & DISAMBIGUATION WORKFLOW: `confidence` (0.0-1.0) measures Entity Attribution / Coreference certainty. Use `>= 0.85` only when person attribution is unambiguous. When pronouns or nicknames are ambiguous, submit `< 0.85` (or `person_id: null`) so the note is isolated in `disambiguation_queue`, then use `manage_disambiguation_item` (`list`, `resolve`/`link`, `dismiss`).',
  '4. QUANTITATIVE DECISION MAKING & STORYBOOK SYNTHESIS: Use `analyze_relationship` to inspect `freshness_score`, `drift_z_score`, `sentiment.ema`, and `priority_attention_queue`. Use `synthesize_narrative` (`monthly_recap`) with `person_id` and `month` (YYYY-MM) to generate a bitemporal monthly story summary with ready-to-run Flux illustration prompts and ElevenLabs narration scripts.',
].join('\n');

export const MCP_TOOLS: McpToolDefinition[] = [
  {
    name: 'create_person',
    description:
      'Create a new person profile in D1. BEST PRACTICE: First call `query_relationship_records` (omitting `person_id`) to verify the person does not already exist. Choose `relationship_state` carefully because it drives the quantitative target contact cadence tau (`close`/`partner`/`family`/`vip`/`reconnect_needed` -> 14d half-life; `active` -> 30d; `casual`/`acquaintance` -> 60d; `archived`/`dormant` -> 180d). Populate `key_dates` (e.g. `birthday`, `anniversary` in YYYY-MM-DD) to enable automatic 90-day countdown alerts and raise profile coverage score.',
    inputSchema: {
      type: 'object',
      required: ['alias'],
      properties: {
        id: {
          type: 'string',
          minLength: 1,
          maxLength: 128,
          description: 'Optional unique person ID. Omit to auto-generate a UUID.',
        },
        alias: {
          type: 'string',
          minLength: 1,
          maxLength: 200,
          description:
            'Display alias or pseudonym for the person (prefer privacy-safe aliases over raw government IDs or full legal PII).',
        },
        relationship_state: {
          type: 'string',
          minLength: 1,
          maxLength: 64,
          default: 'active',
          description:
            'Relationship tier/status controlling decay half-life tau: use `close`, `partner`, `family`, `vip`, or `reconnect_needed` (14d target cadence); `active` (30d); `casual` or `acquaintance` (60d); `archived` or `dormant` (180d).',
        },
        key_dates: {
          type: 'object',
          additionalProperties: { type: ['string', 'boolean', 'number'] },
          description:
            'Key dates in YYYY-MM-DD format (e.g., {"birthday":"1995-06-15","anniversary":"2023-09-10","met_at":"2022-04-01"}). Recurring keys `birthday` and `anniversary` trigger automatic upcoming countdown hooks.',
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'update_person',
    description:
      'Update an existing person profile (`manage_profile`) in D1: transition `relationship_state` (e.g. from `lover` to `discernment`, `active` to `close`, or `reconnect_needed`), rename `alias`, or merge/replace `key_dates` and tags. When `merge_key_dates: true` (default), existing keys are preserved and setting a key to `null` or `""` deletes it.',
    inputSchema: {
      type: 'object',
      required: ['person_id'],
      properties: {
        person_id: {
          type: 'string',
          minLength: 1,
          description: 'Target person ID to update.',
        },
        alias: {
          type: 'string',
          minLength: 1,
          maxLength: 200,
          description: 'Optional updated display alias.',
        },
        relationship_state: {
          type: 'string',
          minLength: 1,
          maxLength: 64,
          description:
            'Optional new relationship state (e.g., `lover`, `discernment`, `close`, `active`, `reconnect_needed`, `casual`, `archived`).',
        },
        key_dates: {
          type: 'object',
          additionalProperties: { type: ['string', 'boolean', 'number', 'null'] },
          description:
            'Key dates, tags, or metadata to merge or replace (e.g., {"birthday":"1996-05-20","tag":"art_circle","old_tag":null}).',
        },
        merge_key_dates: {
          type: 'boolean',
          default: true,
          description:
            'When true (default), merges `key_dates` into existing `key_dates` (keys set to null or empty string are removed). Set false to overwrite `key_dates` completely.',
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'query_relationship_records',
    description:
      'Query contact profiles, PII-sanitized timeline events, and bitemporal signals from D1. WORKFLOW: (1) Call with `{}` (no `person_id`) to list all people and resolve a contact name/alias to `person_id` before inserting or analyzing. (2) Call with `person_id` to retrieve raw interaction history and active signals (`include_history: false`) or full bitemporal evolution including superseded values (`include_history: true`).',
    inputSchema: {
      type: 'object',
      properties: {
        person_id: {
          type: 'string',
          description:
            'Target person ID. Omit to list the full contact directory (`mode: "list_people"`).',
        },
        include_history: {
          type: 'boolean',
          default: false,
          description:
            'False (default) returns only currently valid signals (`valid_to IS NULL`). Set true to inspect historical/superseded preferences and when they changed.',
        },
        category: {
          type: 'string',
          enum: ['gift_idea', 'preference', 'boundary'],
          description:
            'Optional filter for signal category (`preference` for likes/habits, `gift_idea` for wishlists, `boundary` for allergies/taboos/triggers).',
        },
        limit: {
          type: 'integer',
          minimum: 1,
          maximum: 100,
          default: 20,
          description: 'Maximum recent timeline events to return when querying a specific person (1-100).',
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'insert_relationship_event',
    description:
      'Ingest a relationship interaction or note with automatic Layer-1 PII redaction, SHA-256 idempotency deduplication, coreference confidence gating, and bitemporal signal persistence. AI EXTRACTION GUIDE: Do not just dump raw text—always score `sentiment_score` (-1.0 to 1.0) and extract any durable fact into `signal_topic` + `signal_value` + `signal_category` (`preference`, `gift_idea`, or `boundary`). Use consistent snake_case for `signal_topic` (e.g., `beverage_preference`, `food_allergy`, `communication_style`) so that if a preference changes later, the engine automatically closes the prior bitemporal record (`valid_to`) and links `superseded_by`. If one note contains multiple distinct signals, call this tool once per signal.',
    inputSchema: {
      type: 'object',
      required: ['content', 'confidence'],
      properties: {
        person_id: {
          type: ['string', 'null'],
          description:
            'Resolved person ID from `query_relationship_records`. Pass `null` if you cannot determine which person the note refers to (routes safely to `disambiguation_queue`).',
        },
        source: {
          type: 'string',
          enum: ['voice_note', 'chat_log', 'manual'],
          default: 'manual',
          description: 'Origin channel of the interaction (`voice_note`, `chat_log`, or `manual`).',
        },
        content: {
          type: 'string',
          minLength: 1,
          maxLength: 10000,
          description:
            'Interaction summary or raw note text. Emails, phone numbers, SSNs, and credit cards are automatically redacted into stable HMAC tokens before D1 storage.',
        },
        confidence: {
          type: 'number',
          minimum: 0,
          maximum: 1,
          description:
            'Entity attribution / coreference confidence (0.0 to 1.0): how certain you are that this note belongs to `person_id`. Must be >= 0.85 to write to the person profile; < 0.85 quarantines the note in `disambiguation_queue` to prevent coreference poisoning.',
        },
        sentiment_score: {
          type: 'number',
          minimum: -1,
          maximum: 1,
          description:
            'Emotional valence of the interaction from -1.0 (draining/conflict/negative) through 0.0 (neutral) to +1.0 (warm/nourishing/positive). Powers `sentiment.ema`, `momentum_slope`, and `energy_state`.',
        },
        signal_topic: {
          type: 'string',
          minLength: 1,
          maxLength: 128,
          description:
            'Normalized snake_case topic key for a durable fact (e.g., `beverage_preference`, `dietary_restriction`, `book_wishlist`, `late_night_text_boundary`). Must be paired with `signal_value`. Reusing an existing topic for the same person with a new value triggers bitemporal superseding.',
        },
        signal_value: {
          type: 'string',
          minLength: 1,
          maxLength: 512,
          description:
            'Concrete value for `signal_topic` (e.g., `no_caffeine_rooibos_only`, `allergic_to_peanuts`, `first_edition_dune`). Must be paired with `signal_topic`.',
        },
        signal_category: {
          type: 'string',
          enum: ['gift_idea', 'preference', 'boundary'],
          default: 'preference',
          description:
            'Categorize the signal: `preference` (tastes, habits, favorites), `gift_idea` (explicit wishes or gift clues), or `boundary` (allergies, dealbreakers, sensitive topics, personal limits). Filling all 3 categories maximizes `profile_coverage_score`.',
        },
        occurred_at: {
          type: 'string',
          format: 'date-time',
          description:
            'When the interaction actually happened in ISO-8601 format with timezone (e.g. `2026-11-22T18:30:00Z`). Supports historical backfills (automatically splits or closes bitemporal signal intervals). Defaults to current server time.',
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'manage_signals',
    description:
      'Explicitly query, override/upsert, or supersede/retire bitemporal boundaries, preferences, and gift ideas without needing to insert a timeline event. ACTIONS: (1) `action: "query"` fetches active signals, full bitemporal history (`include_history: true`), or point-in-time valid signals at `as_of` (ISO-8601). (2) `action: "override"` or `"upsert"` directly writes or updates a `(person_id, topic, value, category)` signal using bitemporal interval planning and Layer-1 PII redaction. (3) `action: "supersede"` or `"retire"` explicitly closes an active signal (`valid_to` set to `effective_at`), optionally replacing it if `new_value` is provided.',
    inputSchema: {
      type: 'object',
      required: ['person_id'],
      properties: {
        action: {
          type: 'string',
          enum: ['query', 'override', 'upsert', 'supersede', 'retire'],
          default: 'query',
          description:
            '`query` to inspect signals (including point-in-time `as_of`), `override`/`upsert` to directly set a preference or boundary, or `supersede`/`retire` to close an obsolete signal.',
        },
        person_id: {
          type: 'string',
          minLength: 1,
          description: 'Target person ID.',
        },
        category: {
          type: 'string',
          enum: ['gift_idea', 'preference', 'boundary'],
          description: 'Signal category (`preference`, `gift_idea`, or `boundary`).',
        },
        topic: {
          type: 'string',
          minLength: 1,
          maxLength: 128,
          description: 'Normalized snake_case signal topic (e.g. `beverage_preference`, `late_night_boundary`).',
        },
        value: {
          type: 'string',
          minLength: 1,
          maxLength: 512,
          description: 'Signal value when `action` is `override` or `upsert`.',
        },
        new_value: {
          type: 'string',
          minLength: 1,
          maxLength: 512,
          description: 'Optional replacement value when `action` is `supersede`. Omit to retire the signal without a replacement.',
        },
        content: {
          type: 'string',
          minLength: 1,
          maxLength: 2000,
          description: 'Optional context note for the signal (PII redacted before storage).',
        },
        signal_id: {
          type: 'string',
          description: 'Optional specific signal ID to close when `action` is `supersede` or `retire`.',
        },
        include_history: {
          type: 'boolean',
          default: false,
          description: 'When `action: "query"`, include superseded historical signals (`valid_to IS NOT NULL`).',
        },
        as_of: {
          type: 'string',
          format: 'date-time',
          description: 'Optional ISO-8601 timestamp for point-in-time bitemporal query (`valid_from <= as_of < valid_to`).',
        },
        effective_at: {
          type: 'string',
          format: 'date-time',
          description: 'Optional ISO-8601 valid-time timestamp for `override`, `upsert`, `supersede`, or `retire` (defaults to current server time).',
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'ingest_voice_memo',
    description:
      'Ingest a raw Whisper voice memo transcript or multi-line chat log (`raw_log`): automatically runs Layer-1 PII redaction, matches contact aliases in D1 to estimate coreference `confidence`, scores emotional sentiment, and extracts candidate bitemporal signals (`preference`, `gift_idea`, `boundary`). By default (`commit: false`), returns a structured extraction `draft` with ready-to-submit `draft_ingest_payloads` for confirmation; set `commit: true` to persist immediately.',
    inputSchema: {
      type: 'object',
      required: ['raw_text'],
      properties: {
        raw_text: {
          type: 'string',
          minLength: 1,
          maxLength: 20000,
          description: 'Raw Whisper voice transcript or chat log text.',
        },
        person_id: {
          type: ['string', 'null'],
          description:
            'Optional known person ID. If omitted, the worker scans `raw_text` against contact aliases in D1 and computes attribution confidence.',
        },
        source: {
          type: 'string',
          enum: ['voice_note', 'chat_log', 'manual'],
          default: 'voice_note',
          description: 'Origin channel (`voice_note` default for Whisper transcripts, or `chat_log`).',
        },
        occurred_at: {
          type: 'string',
          format: 'date-time',
          description: 'Optional ISO-8601 timestamp when the voice memo or conversation took place.',
        },
        commit: {
          type: 'boolean',
          default: false,
          description:
            'False (default) returns the PII-sanitized draft and extracted signals for user review without writing to D1. Set true to immediately persist the extracted event and signals.',
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'analyze_relationship',
    description:
      'Run quantitative relationship intelligence and diagnostic models. TWO MODES: (1) Omit `person_id` (`mode: "portfolio_overview"`) when the user asks "Who should I contact?", "How are my relationships doing?", or during weekly reviews—returns `priority_attention_queue` sorted by lowest `composite_health_score` to highlight contacts with high decay (`overdue_ratio`) or `at_risk` status. (2) Pass `person_id` (`mode: "person_analysis"`) before a meeting, catch-up, or gift decision—returns `health` (`freshness_score` 0-100, `composite_health_score` 0-100, `overdue_ratio`, `risk_level`), `cadence` (`mean_interval_days`, `drift_z_score`, `cadence_anomaly` when silence Z-score > 2.0), `sentiment` (`ema`, `momentum_slope`, `energy_state`: `nourishing` | `neutral` | `cooling_warning` | `draining`), `depth_and_volatility` (`signal_yield_rate`, `profile_coverage_score`, `missing_dimensions`, `volatility_90d`, `churn_rate`), `signals.preference_changes` (bitemporal old->new shifts), `upcoming_key_dates`, and actionable `follow_up_hooks`.',
    inputSchema: {
      type: 'object',
      properties: {
        person_id: {
          type: 'string',
          description:
            'Target person ID for deep quantitative diagnosis (`mode: "person_analysis"`). Omit for a global portfolio dashboard and `priority_attention_queue` (`mode: "portfolio_overview"`).',
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'synthesize_narrative',
    description:
      'Generate a periodic or monthly relationship narrative recap (`monthly_recap`) for a person by pulling their valid bitemporal timeline and signal evolution for `month` (YYYY-MM). Returns an emotional arc analysis, narrative summary, chapter-by-chapter storybook scenes, ready-to-use Flux illustration prompts (`flux_image_prompt`), and ElevenLabs expressive TTS scripts (`elevenlabs_tts`).',
    inputSchema: {
      type: 'object',
      required: ['person_id'],
      properties: {
        person_id: {
          type: 'string',
          minLength: 1,
          description: 'Target person ID.',
        },
        month: {
          type: 'string',
          pattern: '^\\d{4}-(0[1-9]|1[0-2])$',
          description:
            'Target month in YYYY-MM format (e.g. `2026-11`). Omit to auto-select the month of the latest interaction.',
        },
        style: {
          type: 'string',
          enum: ['storybook', 'cinematic', 'warm_journal', 'minimalist'],
          default: 'storybook',
          description: 'Visual and narrative style for Flux prompts and storybook chapters.',
        },
        language: {
          type: 'string',
          enum: ['zh', 'en'],
          default: 'zh',
          description: 'Language for narrative summary and ElevenLabs voice scripts (`zh` or `en`).',
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'manage_disambiguation_item',
    description:
      'Inspect and process quarantined items in `disambiguation_queue` (notes that had `confidence < 0.85` or `person_id: null`). ACTIONS: (1) `action: "list"` lists queued items filtered by `status` (`pending` default, `resolved`, `dismissed`, or `all`). (2) `action: "resolve"` or `action: "link"` attributes a pending `queue_id` to a confirmed `person_id`, atomically ingests its timeline event and bitemporal signal into D1 (with optional overrides for `sentiment_score`, `signal_topic`, `signal_value`, `signal_category`), and marks the queue item `resolved`. (3) `action: "dismiss"` marks a pending `queue_id` as `dismissed` without writing to any person profile.',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['list', 'resolve', 'link', 'dismiss'],
          default: 'list',
          description:
            'Operation to perform: `list` queue items, `resolve`/`link` a pending item to a `person_id`, or `dismiss` an irrelevant item.',
        },
        queue_id: {
          type: 'string',
          description:
            'Target disambiguation queue item ID (e.g., `dq_...`). Required when `action` is `resolve`, `link`, or `dismiss`.',
        },
        person_id: {
          type: 'string',
          description:
            'Confirmed target person ID to link the event/signal to. Required when `action` is `resolve` or `link`.',
        },
        status: {
          type: 'string',
          enum: ['pending', 'resolved', 'dismissed', 'all'],
          default: 'pending',
          description: 'Status filter when `action` is `list`. Defaults to `pending`.',
        },
        limit: {
          type: 'integer',
          minimum: 1,
          maximum: 100,
          default: 20,
          description: 'Maximum items to return when `action` is `list`.',
        },
        sentiment_score: {
          type: 'number',
          minimum: -1,
          maximum: 1,
          description: 'Optional sentiment score (-1.0 to 1.0) to attach when resolving/linking the item.',
        },
        signal_topic: {
          type: 'string',
          minLength: 1,
          maxLength: 128,
          description: 'Optional override or newly extracted snake_case signal_topic when resolving/linking.',
        },
        signal_value: {
          type: 'string',
          minLength: 1,
          maxLength: 512,
          description: 'Optional override or newly extracted signal_value when resolving/linking.',
        },
        signal_category: {
          type: 'string',
          enum: ['gift_idea', 'preference', 'boundary'],
          description: 'Optional override for signal_category when resolving/linking.',
        },
      },
      additionalProperties: false,
    },
  },
];

const QueryRecordsArgsSchema = z.object({
  person_id: z.string().min(1).optional(),
  include_history: z.boolean().default(false),
  category: z.enum(['gift_idea', 'preference', 'boundary']).optional(),
  limit: z.number().int().min(1).max(100).default(20),
  include_test_data: z.boolean().default(false),
});

const AnalyzeRelationshipArgsSchema = z.object({
  person_id: z.string().min(1).optional(),
  include_test_data: z.boolean().default(false),
});

function isSyntheticTestPerson(person: {
  alias: string;
  keyDates?: Record<string, unknown> | null;
}): boolean {
  return (
    person.alias.startsWith('[TEST_DATA]') ||
    Boolean(person.keyDates && person.keyDates.is_test === true)
  );
}

const HISTORICAL_DATE_KEYS = new Set(['met_at', 'last_catchup', 'moved_city', 'created_at']);
const DAY_MS = 24 * 60 * 60 * 1000;
const JSON_HEADERS = { 'Content-Type': 'application/json' };

type JsonRpcId = string | number | null;

function jsonRpcSuccess(id: JsonRpcId, result: unknown, status = 200): Response {
  return new Response(JSON.stringify({ jsonrpc: '2.0', id, result }, null, 2), {
    status,
    headers: JSON_HEADERS,
  });
}

function jsonRpcError(
  id: JsonRpcId,
  code: number,
  message: string,
  data?: unknown,
  status = 200
): Response {
  const errorBody: Record<string, unknown> = { code, message };
  if (data !== undefined) {
    errorBody.data = data;
  }
  return new Response(JSON.stringify({ jsonrpc: '2.0', id, error: errorBody }, null, 2), {
    status,
    headers: JSON_HEADERS,
  });
}

function toolResult(payload: unknown, isError = false) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(payload, null, 2) }],
    structuredContent: payload,
    isError,
  };
}

function roundScore(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function inferTargetCadenceDays(relationshipState: string): number {
  const s = relationshipState.toLowerCase();
  if (
    s.includes('close') ||
    s.includes('partner') ||
    s.includes('family') ||
    s.includes('vip') ||
    s.includes('inner') ||
    s.includes('reconnect')
  ) {
    return 14;
  }
  if (s.includes('casual') || s.includes('acquaintance') || s.includes('low')) {
    return 60;
  }
  if (s.includes('archive') || s.includes('dormant') || s.includes('inactive')) {
    return 180;
  }
  return 30;
}

function computeCadenceMetrics(
  occurredAtList: string[],
  daysSinceLastInteraction: number | null,
  targetCadenceDays: number
) {
  const gapDays: number[] = [];
  for (let i = 1; i < occurredAtList.length; i++) {
    const prevMs = Date.parse(occurredAtList[i - 1]);
    const currMs = Date.parse(occurredAtList[i]);
    if (Number.isFinite(prevMs) && Number.isFinite(currMs) && currMs >= prevMs) {
      gapDays.push((currMs - prevMs) / DAY_MS);
    }
  }

  let meanIntervalDays: number | null = null;
  let stddevIntervalDays: number | null = null;
  let driftZScore: number | null = null;

  if (gapDays.length > 0) {
    const mean = gapDays.reduce((acc, n) => acc + n, 0) / gapDays.length;
    meanIntervalDays = roundScore(mean);
    const variance =
      gapDays.reduce((acc, n) => acc + (n - mean) * (n - mean), 0) / gapDays.length;
    const stddev = Math.sqrt(variance);
    stddevIntervalDays = roundScore(stddev);

    if (daysSinceLastInteraction !== null) {
      const effectiveStddev = Math.max(stddev, 1);
      driftZScore = roundScore((daysSinceLastInteraction - mean) / effectiveStddev);
    }
  }

  const overdueRatio =
    daysSinceLastInteraction !== null
      ? roundScore(daysSinceLastInteraction / targetCadenceDays)
      : null;

  const cadenceAnomaly =
    (driftZScore !== null && driftZScore > 2.0) ||
    (overdueRatio !== null && overdueRatio > 1.5);

  return {
    mean_interval_days: meanIntervalDays,
    stddev_interval_days: stddevIntervalDays,
    drift_z_score: driftZScore,
    target_cadence_days: targetCadenceDays,
    overdue_ratio: overdueRatio,
    cadence_anomaly: cadenceAnomaly,
  };
}

function computeSentimentStats(scores: number[]) {
  if (scores.length === 0) {
    return {
      scored_events: 0,
      average: null as number | null,
      ema: null as number | null,
      recent_average: null as number | null,
      momentum_slope: null as number | null,
      latest: null as number | null,
      min: null as number | null,
      max: null as number | null,
      trend: 'insufficient_data' as const,
      energy_state: 'insufficient_data' as const,
    };
  }

  const sum = scores.reduce((acc, n) => acc + n, 0);
  const average = roundScore(sum / scores.length);
  const latest = scores[scores.length - 1];
  const min = Math.min(...scores);
  const max = Math.max(...scores);

  const alpha = 0.5;
  let emaRaw = scores[0];
  for (let i = 1; i < scores.length; i++) {
    emaRaw = alpha * scores[i] + (1 - alpha) * emaRaw;
  }
  const ema = roundScore(emaRaw);

  const recentWindow = scores.slice(-Math.min(3, scores.length));
  const recentAverage = roundScore(
    recentWindow.reduce((acc, n) => acc + n, 0) / recentWindow.length
  );
  const momentumSlope = scores.length >= 2 ? roundScore(ema - average) : null;

  let trend: 'improving' | 'declining' | 'stable' | 'insufficient_data' = 'insufficient_data';
  if (scores.length >= 2) {
    const mid = Math.floor(scores.length / 2);
    const earlier = scores.slice(0, mid);
    const recent = scores.slice(mid);
    const earlierMean = earlier.reduce((acc, n) => acc + n, 0) / earlier.length;
    const recentMean = recent.reduce((acc, n) => acc + n, 0) / recent.length;
    const delta = recentMean - earlierMean;
    if (delta > 0.05) {
      trend = 'improving';
    } else if (delta < -0.05) {
      trend = 'declining';
    } else {
      trend = 'stable';
    }
  }

  let energyState: 'nourishing' | 'neutral' | 'draining' | 'cooling_warning' = 'neutral';
  if (momentumSlope !== null && momentumSlope <= -0.15) {
    energyState = 'cooling_warning';
  } else if (ema >= 0.3) {
    energyState = 'nourishing';
  } else if (ema <= -0.2) {
    energyState = 'draining';
  }

  return {
    scored_events: scores.length,
    average,
    ema,
    recent_average: recentAverage,
    momentum_slope: momentumSlope,
    latest,
    min,
    max,
    trend,
    energy_state: energyState,
  };
}

function computeProfileCoverage(
  activeByCategory: {
    preference: unknown[];
    gift_idea: unknown[];
    boundary: unknown[];
  },
  keyDates: Record<string, unknown>
) {
  const hasRealKeyDate = Object.entries(keyDates).some(
    ([k, v]) => k !== 'is_test' && typeof v === 'string' && v.trim().length > 0
  );
  const dimensions: Array<{ name: 'preference' | 'gift_idea' | 'boundary' | 'key_dates'; present: boolean }> = [
    { name: 'preference', present: activeByCategory.preference.length > 0 },
    { name: 'gift_idea', present: activeByCategory.gift_idea.length > 0 },
    { name: 'boundary', present: activeByCategory.boundary.length > 0 },
    { name: 'key_dates', present: hasRealKeyDate },
  ];

  const coveredCount = dimensions.filter((d) => d.present).length;
  const profileCoverageScore = roundScore((coveredCount / dimensions.length) * 100);
  const missingDimensions = dimensions.filter((d) => !d.present).map((d) => d.name);

  return {
    profile_coverage_score: profileCoverageScore,
    missing_dimensions: missingDimensions,
  };
}

function computeHealthMetrics(params: {
  eventCount: number;
  daysSinceLastInteraction: number | null;
  targetCadenceDays: number;
  overdueRatio: number | null;
  cadenceAnomaly: boolean;
  sentimentEma: number | null;
  momentumSlope: number | null;
  profileCoverageScore: number;
  relationshipState: string;
}) {
  const {
    eventCount,
    daysSinceLastInteraction,
    targetCadenceDays,
    overdueRatio,
    cadenceAnomaly,
    sentimentEma,
    momentumSlope,
    profileCoverageScore,
    relationshipState,
  } = params;

  const freshnessScore =
    eventCount > 0 && daysSinceLastInteraction !== null
      ? roundScore(100 * Math.exp(-daysSinceLastInteraction / targetCadenceDays))
      : 0;

  // Map sentiment EMA [-1, 1] -> [0, 100], defaulting to 50 when unscored
  const sentimentNorm = sentimentEma !== null ? ((sentimentEma + 1) / 2) * 100 : 50;

  const compositeHealthScore =
    eventCount > 0
      ? roundScore(0.5 * freshnessScore + 0.25 * sentimentNorm + 0.25 * profileCoverageScore)
      : roundScore(0.25 * profileCoverageScore);

  const stateLower = relationshipState.toLowerCase();
  let riskLevel: 'healthy' | 'attention_needed' | 'at_risk' | 'dormant' = 'healthy';
  if (stateLower.includes('archive') || stateLower.includes('dormant')) {
    riskLevel = 'dormant';
  } else if (
    eventCount === 0 ||
    freshnessScore < 25 ||
    (overdueRatio !== null && overdueRatio > 1.5) ||
    stateLower.includes('reconnect')
  ) {
    riskLevel = 'at_risk';
  } else if (
    freshnessScore < 50 ||
    (overdueRatio !== null && overdueRatio >= 1.0) ||
    cadenceAnomaly ||
    (momentumSlope !== null && momentumSlope <= -0.15) ||
    (sentimentEma !== null && sentimentEma <= -0.2)
  ) {
    riskLevel = 'attention_needed';
  }

  return {
    freshness_score: freshnessScore,
    composite_health_score: compositeHealthScore,
    target_cadence_days: targetCadenceDays,
    overdue_ratio: overdueRatio,
    risk_level: riskLevel,
  };
}

function computeUpcomingKeyDates(
  keyDates: Record<string, unknown>,
  nowMs: number
): Array<{ label: string; date: string; days_until: number }> {
  const todayUtc = new Date(nowMs);
  const todayStartMs = Date.UTC(
    todayUtc.getUTCFullYear(),
    todayUtc.getUTCMonth(),
    todayUtc.getUTCDate()
  );

  const upcoming: Array<{ label: string; date: string; days_until: number }> = [];
  for (const [label, rawVal] of Object.entries(keyDates)) {
    if (HISTORICAL_DATE_KEYS.has(label) || typeof rawVal !== 'string') {
      continue;
    }
    const match = rawVal.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) {
      continue;
    }
    const year = Number(match[1]);
    const month = Number(match[2]) - 1;
    const day = Number(match[3]);
    let targetMs = Date.UTC(year, month, day);

    if (label === 'birthday' || label === 'anniversary') {
      let nextYear = todayUtc.getUTCFullYear();
      targetMs = Date.UTC(nextYear, month, day);
      if (targetMs < todayStartMs) {
        nextYear += 1;
        targetMs = Date.UTC(nextYear, month, day);
      }
    } else if (targetMs < todayStartMs) {
      continue;
    }

    const daysUntil = Math.round((targetMs - todayStartMs) / DAY_MS);
    if (daysUntil >= 0 && daysUntil <= 90) {
      upcoming.push({ label, date: rawVal, days_until: daysUntil });
    }
  }

  return upcoming.sort((a, b) => a.days_until - b.days_until);
}

async function runQueryTool(rawArgs: unknown, env: McpRuntimeEnv) {
  const parsed = QueryRecordsArgsSchema.safeParse(rawArgs);
  if (!parsed.success) {
    return toolResult({ error: 'Invalid arguments', details: parsed.error.flatten() }, true);
  }

  const db = drizzle(env.DB, { schema });
  const { person_id, include_history, category, limit, include_test_data } = parsed.data;

  if (!person_id) {
    const allPeopleRows = await db.select().from(schema.people).orderBy(asc(schema.people.id));
    const peopleRows = include_test_data
      ? allPeopleRows
      : allPeopleRows.filter((p) => !isSyntheticTestPerson(p));
    return toolResult({
      mode: 'list_people',
      count: peopleRows.length,
      people: peopleRows,
    });
  }

  const [person] = await db
    .select()
    .from(schema.people)
    .where(eq(schema.people.id, person_id))
    .limit(1);

  if (!person || (!include_test_data && isSyntheticTestPerson(person))) {
    return toolResult({ error: 'Person not found', person_id }, true);
  }

  const signalConditions = [eq(schema.signals.personId, person_id)];
  if (!include_history) {
    signalConditions.push(isNull(schema.signals.validTo));
  }
  if (category) {
    signalConditions.push(eq(schema.signals.category, category));
  }

  const [events, signalRows] = await Promise.all([
    db
      .select()
      .from(schema.timelineEvents)
      .where(eq(schema.timelineEvents.personId, person_id))
      .orderBy(desc(schema.timelineEvents.occurredAt))
      .limit(limit),
    db
      .select()
      .from(schema.signals)
      .where(and(...signalConditions))
      .orderBy(desc(schema.signals.validFrom)),
  ]);

  return toolResult({
    mode: 'person_detail',
    person,
    include_history,
    category_filter: category ?? null,
    counts: {
      timeline_events: events.length,
      signals: signalRows.length,
    },
    timeline_events: events,
    signals: signalRows,
  });
}

async function runInsertTool(rawArgs: unknown, env: McpRuntimeEnv) {
  if (!env.PII_TOKEN_KEY && env.ENVIRONMENT !== 'development') {
    return toolResult(
      {
        error: 'Service misconfigured: PII_TOKEN_KEY secret is not set; refusing to store PII tokens.',
      },
      true
    );
  }

  const parsed = IngestPayloadSchema.safeParse(rawArgs);
  if (!parsed.success) {
    return toolResult({ error: 'Invalid arguments', details: parsed.error.flatten() }, true);
  }

  const outcome = await ingestEvent(parsed.data, new D1IngestStore(env.DB), undefined, {
    piiTokenKey: env.PII_TOKEN_KEY,
  });
  const isError = outcome.status === 'rejected' || outcome.status === 'conflict';
  return toolResult(outcome, isError);
}

async function runAnalyzeTool(rawArgs: unknown, env: McpRuntimeEnv, nowMs = Date.now()) {
  const parsed = AnalyzeRelationshipArgsSchema.safeParse(rawArgs);
  if (!parsed.success) {
    return toolResult({ error: 'Invalid arguments', details: parsed.error.flatten() }, true);
  }

  const db = drizzle(env.DB, { schema });
  const { person_id, include_test_data } = parsed.data;

  if (!person_id) {
    const [rawPeople, rawEvents, rawSignals, pendingQueueRows] = await Promise.all([
      db.select().from(schema.people).orderBy(asc(schema.people.id)),
      db.select().from(schema.timelineEvents).orderBy(asc(schema.timelineEvents.occurredAt)),
      db.select().from(schema.signals).orderBy(asc(schema.signals.validFrom)),
      db
        .select()
        .from(schema.disambiguationQueue)
        .where(eq(schema.disambiguationQueue.status, 'pending')),
    ]);

    const allPeople = include_test_data
      ? rawPeople
      : rawPeople.filter((p) => !isSyntheticTestPerson(p));
    const allowedPersonIds = new Set(allPeople.map((p) => p.id));
    const allEvents = include_test_data
      ? rawEvents
      : rawEvents.filter((e) => allowedPersonIds.has(e.personId));
    const allSignals = include_test_data
      ? rawSignals
      : rawSignals.filter((s) => allowedPersonIds.has(s.personId));
    const filteredPendingQueue = include_test_data
      ? pendingQueueRows
      : pendingQueueRows.filter((q) => !q.sanitizedContent.startsWith('[TEST_DATA]'));

    const eventsByPerson = new Map<string, typeof allEvents>();
    for (const event of allEvents) {
      const list = eventsByPerson.get(event.personId) ?? [];
      list.push(event);
      eventsByPerson.set(event.personId, list);
    }

    const activeSignalsByPerson = new Map<string, typeof allSignals>();
    let activeSignalTotal = 0;
    let supersededSignalTotal = 0;
    for (const signal of allSignals) {
      if (signal.validTo === null) {
        activeSignalTotal += 1;
        const list = activeSignalsByPerson.get(signal.personId) ?? [];
        list.push(signal);
        activeSignalsByPerson.set(signal.personId, list);
      } else {
        supersededSignalTotal += 1;
      }
    }

    const summaries = allPeople.map((person) => {
      const personEvents = eventsByPerson.get(person.id) ?? [];
      const personActiveSignals = activeSignalsByPerson.get(person.id) ?? [];
      const scores = personEvents
        .map((e) => e.sentimentScore)
        .filter((s): s is number => typeof s === 'number');
      const sentimentStats = computeSentimentStats(scores);
      const lastInteractionAt =
        personEvents.length > 0 ? personEvents[personEvents.length - 1].occurredAt : null;
      const daysSinceLastInteraction =
        lastInteractionAt !== null
          ? Math.max(0, Math.floor((nowMs - Date.parse(lastInteractionAt)) / DAY_MS))
          : null;

      const targetCadenceDays = inferTargetCadenceDays(person.relationshipState);
      const cadenceMetrics = computeCadenceMetrics(
        personEvents.map((e) => e.occurredAt),
        daysSinceLastInteraction,
        targetCadenceDays
      );

      const activeBuckets = {
        preference: personActiveSignals.filter((s) => s.category === 'preference'),
        gift_idea: personActiveSignals.filter((s) => s.category === 'gift_idea'),
        boundary: personActiveSignals.filter((s) => s.category === 'boundary'),
      };
      const coverage = computeProfileCoverage(activeBuckets, person.keyDates ?? {});
      const health = computeHealthMetrics({
        eventCount: personEvents.length,
        daysSinceLastInteraction,
        targetCadenceDays,
        overdueRatio: cadenceMetrics.overdue_ratio,
        cadenceAnomaly: cadenceMetrics.cadence_anomaly,
        sentimentEma: sentimentStats.ema,
        momentumSlope: sentimentStats.momentum_slope,
        profileCoverageScore: coverage.profile_coverage_score,
        relationshipState: person.relationshipState,
      });

      return {
        person_id: person.id,
        alias: person.alias,
        relationship_state: person.relationshipState,
        event_count: personEvents.length,
        average_sentiment: sentimentStats.average,
        sentiment_ema: sentimentStats.ema,
        energy_state: sentimentStats.energy_state,
        active_signal_count: personActiveSignals.length,
        last_interaction_at: lastInteractionAt,
        days_since_last_interaction: daysSinceLastInteraction,
        freshness_score: health.freshness_score,
        composite_health_score: health.composite_health_score,
        overdue_ratio: health.overdue_ratio,
        cadence_anomaly: cadenceMetrics.cadence_anomaly,
        profile_coverage_score: coverage.profile_coverage_score,
        risk_level: health.risk_level,
      };
    });

    const priorityAttentionQueue = summaries
      .filter((s) => s.risk_level === 'at_risk' || s.risk_level === 'attention_needed')
      .sort((a, b) => a.composite_health_score - b.composite_health_score)
      .map((s) => ({
        person_id: s.person_id,
        alias: s.alias,
        risk_level: s.risk_level,
        composite_health_score: s.composite_health_score,
        freshness_score: s.freshness_score,
        days_since_last_interaction: s.days_since_last_interaction,
        overdue_ratio: s.overdue_ratio,
      }));

    return toolResult({
      mode: 'portfolio_overview',
      totals: {
        people: allPeople.length,
        timeline_events: allEvents.length,
        active_signals: activeSignalTotal,
        superseded_signals: supersededSignalTotal,
        pending_disambiguation: filteredPendingQueue.length,
      },
      priority_attention_queue: priorityAttentionQueue,
      people_summary: summaries,
    });
  }

  const [person] = await db
    .select()
    .from(schema.people)
    .where(eq(schema.people.id, person_id))
    .limit(1);

  if (!person || (!include_test_data && isSyntheticTestPerson(person))) {
    return toolResult({ error: 'Person not found', person_id }, true);
  }

  const [events, allSignals] = await Promise.all([
    db
      .select()
      .from(schema.timelineEvents)
      .where(eq(schema.timelineEvents.personId, person_id))
      .orderBy(asc(schema.timelineEvents.occurredAt)),
    db
      .select()
      .from(schema.signals)
      .where(eq(schema.signals.personId, person_id))
      .orderBy(asc(schema.signals.validFrom)),
  ]);

  const bySource = { voice_note: 0, chat_log: 0, manual: 0, other: 0 };
  for (const event of events) {
    if (event.source === 'voice_note' || event.source === 'chat_log' || event.source === 'manual') {
      bySource[event.source] += 1;
    } else {
      bySource.other += 1;
    }
  }

  const firstInteractionAt = events.length > 0 ? events[0].occurredAt : null;
  const lastInteractionAt = events.length > 0 ? events[events.length - 1].occurredAt : null;
  const daysSinceLastInteraction =
    lastInteractionAt !== null
      ? Math.max(0, Math.floor((nowMs - Date.parse(lastInteractionAt)) / DAY_MS))
      : null;

  const targetCadenceDays = inferTargetCadenceDays(person.relationshipState);
  const cadenceMetrics = computeCadenceMetrics(
    events.map((e) => e.occurredAt),
    daysSinceLastInteraction,
    targetCadenceDays
  );

  const scores = events
    .map((e) => e.sentimentScore)
    .filter((s): s is number => typeof s === 'number');
  const sentiment = computeSentimentStats(scores);

  const signalById = new Map(allSignals.map((s) => [s.id, s]));
  const activeByCategory: Record<'preference' | 'gift_idea' | 'boundary', Array<{ id: string; topic: string; value: string; valid_from: string }>> = {
    preference: [],
    gift_idea: [],
    boundary: [],
  };
  const preferenceChanges: Array<{
    topic: string;
    category: string;
    old_value: string;
    new_value: string | null;
    changed_at: string | null;
    deprecated_signal_id: string;
    new_signal_id: string;
  }> = [];

  let activeCount = 0;
  let supersededCount = 0;
  let volatility90d = 0;
  const ninetyDaysAgoMs = nowMs - 90 * DAY_MS;

  for (const signal of allSignals) {
    if (signal.validTo === null) {
      activeCount += 1;
      const bucket =
        signal.category === 'gift_idea' || signal.category === 'boundary'
          ? signal.category
          : 'preference';
      activeByCategory[bucket].push({
        id: signal.id,
        topic: signal.topic,
        value: signal.value,
        valid_from: signal.validFrom,
      });
    } else {
      supersededCount += 1;
      const changedAtStr = signal.validTo ?? signal.supersededAt;
      if (changedAtStr) {
        const changedMs = Date.parse(changedAtStr);
        if (Number.isFinite(changedMs) && changedMs >= ninetyDaysAgoMs && changedMs <= nowMs) {
          volatility90d += 1;
        }
      }
      if (signal.supersededBy) {
        const replacement = signalById.get(signal.supersededBy);
        preferenceChanges.push({
          topic: signal.topic,
          category: signal.category,
          old_value: signal.value,
          new_value: replacement?.value ?? null,
          changed_at: changedAtStr,
          deprecated_signal_id: signal.id,
          new_signal_id: signal.supersededBy,
        });
      }
    }
  }

  const totalSignals = activeCount + supersededCount;
  const signalYieldRate =
    events.length > 0 ? roundScore(totalSignals / events.length) : totalSignals > 0 ? totalSignals : 0;
  const churnRate = totalSignals > 0 ? roundScore(supersededCount / totalSignals) : 0;
  const coverage = computeProfileCoverage(activeByCategory, person.keyDates ?? {});
  const health = computeHealthMetrics({
    eventCount: events.length,
    daysSinceLastInteraction,
    targetCadenceDays,
    overdueRatio: cadenceMetrics.overdue_ratio,
    cadenceAnomaly: cadenceMetrics.cadence_anomaly,
    sentimentEma: sentiment.ema,
    momentumSlope: sentiment.momentum_slope,
    profileCoverageScore: coverage.profile_coverage_score,
    relationshipState: person.relationshipState,
  });

  const upcomingKeyDates = computeUpcomingKeyDates(person.keyDates ?? {}, nowMs);

  const followUpHooks: string[] = [];
  for (const gift of activeByCategory.gift_idea) {
    followUpHooks.push(`Gift idea (${gift.topic}): ${gift.value}`);
  }
  for (const boundary of activeByCategory.boundary) {
    followUpHooks.push(`Respect boundary (${boundary.topic}): ${boundary.value}`);
  }
  for (const keyDate of upcomingKeyDates) {
    if (keyDate.days_until <= 30) {
      followUpHooks.push(`Upcoming ${keyDate.label} on ${keyDate.date} (${keyDate.days_until}d)`);
    }
  }
  if (
    person.relationshipState.includes('reconnect') ||
    (daysSinceLastInteraction !== null && daysSinceLastInteraction > 14)
  ) {
    followUpHooks.push('Schedule reconnect check-in');
  }
  if (cadenceMetrics.cadence_anomaly && cadenceMetrics.drift_z_score !== null) {
    followUpHooks.push(
      `Cadence anomaly detected (Z=${cadenceMetrics.drift_z_score}): silence of ${daysSinceLastInteraction}d exceeds typical ${cadenceMetrics.mean_interval_days}d interval`
    );
  }
  if (sentiment.energy_state === 'cooling_warning') {
    followUpHooks.push(
      `Sentiment cooling alert: EMA (${sentiment.ema}) dropped below historical average (${sentiment.average})`
    );
  }
  if (events.length >= 3 && coverage.missing_dimensions.includes('boundary')) {
    followUpHooks.push(
      `Profile depth gap: ${events.length} interactions recorded but 0 boundary signals captured`
    );
  }

  return toolResult({
    mode: 'person_analysis',
    person: {
      id: person.id,
      alias: person.alias,
      relationship_state: person.relationshipState,
    },
    health,
    cadence: {
      total_events: events.length,
      first_interaction_at: firstInteractionAt,
      last_interaction_at: lastInteractionAt,
      days_since_last_interaction: daysSinceLastInteraction,
      mean_interval_days: cadenceMetrics.mean_interval_days,
      stddev_interval_days: cadenceMetrics.stddev_interval_days,
      drift_z_score: cadenceMetrics.drift_z_score,
      target_cadence_days: cadenceMetrics.target_cadence_days,
      overdue_ratio: cadenceMetrics.overdue_ratio,
      cadence_anomaly: cadenceMetrics.cadence_anomaly,
      by_source: bySource,
    },
    sentiment,
    depth_and_volatility: {
      signal_yield_rate: signalYieldRate,
      profile_coverage_score: coverage.profile_coverage_score,
      missing_dimensions: coverage.missing_dimensions,
      volatility_90d: volatility90d,
      churn_rate: churnRate,
    },
    signals: {
      active_count: activeCount,
      superseded_count: supersededCount,
      active_by_category: activeByCategory,
      preference_changes: preferenceChanges,
    },
    upcoming_key_dates: upcomingKeyDates,
    follow_up_hooks: followUpHooks,
  });
}

const CreatePersonArgsSchema = z.object({
  id: z.string().trim().min(1).max(128).optional(),
  alias: z.string().trim().min(1).max(200),
  relationship_state: z.string().trim().min(1).max(64).default('active'),
  key_dates: z.record(z.string(), z.union([z.string(), z.boolean(), z.number()])).default({}),
});

function isUniqueConstraintError(err: unknown): boolean {
  const parts: string[] = [];
  let current: unknown = err;
  for (let i = 0; i < 4 && current; i++) {
    if (current instanceof Error) {
      parts.push(current.message);
      current = (current as Error & { cause?: unknown }).cause;
    } else {
      parts.push(String(current));
      break;
    }
  }
  return /UNIQUE constraint failed|SQLITE_CONSTRAINT/i.test(parts.join(' '));
}

async function runCreatePersonTool(rawArgs: unknown, env: McpRuntimeEnv) {
  const parsed = CreatePersonArgsSchema.safeParse(rawArgs);
  if (!parsed.success) {
    return toolResult({ error: 'Invalid arguments', details: parsed.error.flatten() }, true);
  }

  const db = drizzle(env.DB, { schema });
  const id = parsed.data.id ?? crypto.randomUUID();
  const createdAt = new Date().toISOString();

  try {
    await db.insert(schema.people).values({
      id,
      alias: parsed.data.alias,
      relationshipState: parsed.data.relationship_state,
      keyDates: parsed.data.key_dates,
      createdAt,
    });
  } catch (err) {
    if (isUniqueConstraintError(err)) {
      return toolResult(
        {
          status: 'conflict',
          error: 'Person with this id already exists',
          person_id: id,
        },
        true
      );
    }
    throw err;
  }

  return toolResult({
    status: 'created',
    person: {
      id,
      alias: parsed.data.alias,
      relationship_state: parsed.data.relationship_state,
      key_dates: parsed.data.key_dates,
      created_at: createdAt,
    },
  });
}

const ManageDisambiguationArgsSchema = z.object({
  action: z.enum(['list', 'resolve', 'link', 'dismiss']).default('list'),
  queue_id: z.string().trim().min(1).optional(),
  person_id: z.string().trim().min(1).optional(),
  status: z.enum(['pending', 'resolved', 'dismissed', 'all']).default('pending'),
  limit: z.number().int().min(1).max(100).default(20),
  sentiment_score: z.number().min(-1).max(1).optional(),
  signal_topic: z.string().trim().min(1).max(128).optional(),
  signal_value: z.string().trim().min(1).max(512).optional(),
  signal_category: z.enum(['gift_idea', 'preference', 'boundary']).optional(),
});

async function runManageDisambiguationTool(rawArgs: unknown, env: McpRuntimeEnv) {
  const parsed = ManageDisambiguationArgsSchema.safeParse(rawArgs);
  if (!parsed.success) {
    return toolResult({ error: 'Invalid arguments', details: parsed.error.flatten() }, true);
  }

  const db = drizzle(env.DB, { schema });
  const data = parsed.data;

  if (data.action === 'list') {
    const query =
      data.status === 'all'
        ? db
            .select()
            .from(schema.disambiguationQueue)
            .orderBy(desc(schema.disambiguationQueue.createdAt))
            .limit(data.limit)
        : db
            .select()
            .from(schema.disambiguationQueue)
            .where(eq(schema.disambiguationQueue.status, data.status))
            .orderBy(desc(schema.disambiguationQueue.createdAt))
            .limit(data.limit);

    const rawRows = await query;
    const rows = rawRows.filter((r) => !r.sanitizedContent.startsWith('[TEST_DATA]'));
    return toolResult({
      mode: 'list_disambiguation_queue',
      status_filter: data.status,
      count: rows.length,
      items: rows,
    });
  }

  if (!data.queue_id) {
    return toolResult(
      { error: `queue_id is required when action is '${data.action}'` },
      true
    );
  }

  const [item] = await db
    .select()
    .from(schema.disambiguationQueue)
    .where(eq(schema.disambiguationQueue.id, data.queue_id))
    .limit(1);

  if (!item) {
    return toolResult(
      { status: 'not_found', error: 'Disambiguation queue item not found', queue_id: data.queue_id },
      true
    );
  }

  if (item.status !== 'pending') {
    return toolResult(
      {
        status: 'already_processed',
        error: `Disambiguation item is already '${item.status}'`,
        queue_id: item.id,
        current_status: item.status,
      },
      true
    );
  }

  if (data.action === 'dismiss') {
    await db
      .update(schema.disambiguationQueue)
      .set({ status: 'dismissed' })
      .where(eq(schema.disambiguationQueue.id, item.id));

    return toolResult({
      status: 'dismissed',
      queue_id: item.id,
      item: {
        ...item,
        status: 'dismissed',
      },
    });
  }

  // action === 'resolve' or 'link'
  if (!data.person_id) {
    return toolResult(
      { error: `person_id is required when action is '${data.action}'`, queue_id: item.id },
      true
    );
  }

  if (!env.PII_TOKEN_KEY && env.ENVIRONMENT !== 'development') {
    return toolResult(
      {
        error: 'Service misconfigured: PII_TOKEN_KEY secret is not set; refusing to store PII tokens.',
      },
      true
    );
  }

  const [targetPerson] = await db
    .select({ id: schema.people.id, alias: schema.people.alias })
    .from(schema.people)
    .where(eq(schema.people.id, data.person_id))
    .limit(1);

  if (!targetPerson) {
    return toolResult(
      {
        status: 'rejected',
        error: 'Target person_id does not exist in people table',
        queue_id: item.id,
        person_id: data.person_id,
      },
      true
    );
  }

  const resolvedTopic = data.signal_topic ?? item.signalTopic ?? undefined;
  const resolvedValue = data.signal_value ?? item.signalValue ?? undefined;
  if ((resolvedTopic && !resolvedValue) || (!resolvedTopic && resolvedValue)) {
    return toolResult(
      {
        error: 'signal_topic and signal_value must both be present or both be omitted when resolving',
        queue_id: item.id,
      },
      true
    );
  }

  const resolvedCategory = (data.signal_category ??
    (item.signalCategory === 'gift_idea' ||
    item.signalCategory === 'preference' ||
    item.signalCategory === 'boundary'
      ? item.signalCategory
      : 'preference')) as 'gift_idea' | 'preference' | 'boundary';

  const resolvedSource = (
    item.source === 'voice_note' || item.source === 'chat_log' || item.source === 'manual'
      ? item.source
      : 'manual'
  ) as 'voice_note' | 'chat_log' | 'manual';

  // Release the original disambiguation-only idempotency key so resolving an item that originally had
  // the same person_id (but <0.85 confidence) is not short-circuited as a duplicate of the queued record.
  await env.DB.prepare(
    "DELETE FROM idempotency_keys WHERE key = ? AND status = 'routed_to_disambiguation_queue'"
  )
    .bind(item.idempotencyKey)
    .run();

  const ingestPayload = IngestPayloadSchema.parse({
    person_id: data.person_id,
    source: resolvedSource,
    content: item.sanitizedContent,
    confidence: 1.0,
    sentiment_score: data.sentiment_score,
    signal_topic: resolvedTopic,
    signal_value: resolvedValue,
    signal_category: resolvedCategory,
    occurred_at: item.occurredAt,
  });

  const outcome = await ingestEvent(ingestPayload, new D1IngestStore(env.DB), undefined, {
    piiTokenKey: env.PII_TOKEN_KEY,
  });

  if (outcome.status === 'rejected' || outcome.status === 'conflict') {
    return toolResult(
      {
        status: outcome.status,
        queue_id: item.id,
        person_id: data.person_id,
        ingest_outcome: outcome,
      },
      true
    );
  }

  await db
    .update(schema.disambiguationQueue)
    .set({ status: 'resolved' })
    .where(eq(schema.disambiguationQueue.id, item.id));

  return toolResult({
    status: 'resolved',
    action: data.action,
    queue_id: item.id,
    person: targetPerson,
    ingest_outcome: outcome,
  });
}

const UpdatePersonArgsSchema = z.object({
  person_id: z.string().trim().min(1).max(128),
  alias: z.string().trim().min(1).max(200).optional(),
  relationship_state: z.string().trim().min(1).max(64).optional(),
  key_dates: z
    .record(z.string(), z.union([z.string(), z.boolean(), z.number(), z.null()]))
    .optional(),
  merge_key_dates: z.boolean().default(true),
});

async function runUpdatePersonTool(rawArgs: unknown, env: McpRuntimeEnv) {
  const parsed = UpdatePersonArgsSchema.safeParse(rawArgs);
  if (!parsed.success) {
    return toolResult({ error: 'Invalid arguments', details: parsed.error.flatten() }, true);
  }

  const data = parsed.data;
  if (
    data.alias === undefined &&
    data.relationship_state === undefined &&
    data.key_dates === undefined
  ) {
    return toolResult(
      {
        error:
          'At least one field (alias, relationship_state, or key_dates) must be provided to update_person',
      },
      true
    );
  }

  const db = drizzle(env.DB, { schema });
  const [person] = await db
    .select()
    .from(schema.people)
    .where(eq(schema.people.id, data.person_id))
    .limit(1);

  if (!person || isSyntheticTestPerson(person)) {
    return toolResult({ status: 'not_found', error: 'Person not found', person_id: data.person_id }, true);
  }

  const nextAlias = data.alias ?? person.alias;
  const nextState = data.relationship_state ?? person.relationshipState;
  let nextKeyDates: Record<string, unknown> = { ...(person.keyDates ?? {}) };

  if (data.key_dates !== undefined) {
    if (data.merge_key_dates) {
      for (const [k, v] of Object.entries(data.key_dates)) {
        if (v === null || v === '') {
          delete nextKeyDates[k];
        } else {
          nextKeyDates[k] = v;
        }
      }
    } else {
      nextKeyDates = {};
      for (const [k, v] of Object.entries(data.key_dates)) {
        if (v !== null && v !== '') {
          nextKeyDates[k] = v;
        }
      }
    }
  }

  await db
    .update(schema.people)
    .set({
      alias: nextAlias,
      relationshipState: nextState,
      keyDates: nextKeyDates,
    })
    .where(eq(schema.people.id, person.id));

  return toolResult({
    status: 'updated',
    previous: {
      alias: person.alias,
      relationship_state: person.relationshipState,
      key_dates: person.keyDates ?? {},
    },
    person: {
      id: person.id,
      alias: nextAlias,
      relationship_state: nextState,
      key_dates: nextKeyDates,
      created_at: person.createdAt,
    },
  });
}

const ManageSignalsArgsSchema = z.object({
  action: z.enum(['query', 'override', 'upsert', 'supersede', 'retire']).default('query'),
  person_id: z.string().trim().min(1),
  category: z.enum(['gift_idea', 'preference', 'boundary']).optional(),
  topic: z.string().trim().min(1).max(128).optional(),
  value: z.string().trim().min(1).max(512).optional(),
  new_value: z.string().trim().min(1).max(512).optional(),
  content: z.string().trim().min(1).max(2000).optional(),
  signal_id: z.string().trim().min(1).optional(),
  include_history: z.boolean().default(false),
  as_of: z.string().datetime({ offset: true }).optional(),
  effective_at: z.string().datetime({ offset: true }).optional(),
});

async function runManageSignalsTool(rawArgs: unknown, env: McpRuntimeEnv, nowMs = Date.now()) {
  const parsed = ManageSignalsArgsSchema.safeParse(rawArgs);
  if (!parsed.success) {
    return toolResult({ error: 'Invalid arguments', details: parsed.error.flatten() }, true);
  }

  const data = parsed.data;
  const db = drizzle(env.DB, { schema });
  const [person] = await db
    .select()
    .from(schema.people)
    .where(eq(schema.people.id, data.person_id))
    .limit(1);

  if (!person || isSyntheticTestPerson(person)) {
    return toolResult({ status: 'not_found', error: 'Person not found', person_id: data.person_id }, true);
  }

  const nowIso = new Date(nowMs).toISOString();

  if (data.action === 'query') {
    const conditions = [eq(schema.signals.personId, data.person_id)];
    if (data.category) {
      conditions.push(eq(schema.signals.category, data.category));
    }
    if (data.topic) {
      conditions.push(eq(schema.signals.topic, data.topic));
    }

    const allRows = await db
      .select()
      .from(schema.signals)
      .where(and(...conditions))
      .orderBy(desc(schema.signals.validFrom));

    let filtered = allRows;
    if (data.as_of) {
      const asOfMs = Date.parse(data.as_of);
      filtered = allRows.filter((s) => {
        const fromMs = Date.parse(s.validFrom);
        const toMs = s.validTo === null ? Number.POSITIVE_INFINITY : Date.parse(s.validTo);
        return fromMs <= asOfMs && asOfMs < toMs;
      });
    } else if (!data.include_history) {
      filtered = allRows.filter((s) => s.validTo === null);
    }

    return toolResult({
      mode: 'query_signals',
      person_id: person.id,
      alias: person.alias,
      as_of: data.as_of ?? null,
      include_history: data.include_history,
      category_filter: data.category ?? null,
      topic_filter: data.topic ?? null,
      count: filtered.length,
      signals: filtered,
    });
  }

  if (!env.PII_TOKEN_KEY && env.ENVIRONMENT !== 'development') {
    return toolResult(
      {
        error: 'Service misconfigured: PII_TOKEN_KEY secret is not set; refusing to store PII tokens.',
      },
      true
    );
  }

  const writeOverrideSignal = async (
    topicInput: string,
    valueInput: string,
    categoryInput: 'gift_idea' | 'preference' | 'boundary',
    contentInput: string | undefined,
    effectiveAt: string
  ) => {
    const rawContent =
      contentInput ?? `Explicit ${categoryInput} signal (${topicInput}): ${valueInput}`;
    const redactor = await createStablePiiRedactor(
      [topicInput, valueInput, rawContent],
      env.PII_TOKEN_KEY
    );
    const cleanTopic = redactor.redact(topicInput);
    const cleanValue = redactor.redact(valueInput);
    const cleanContent = redactor.redact(rawContent);
    const { redacted_entities } = redactor.summary();

    const store = new D1IngestStore(env.DB);
    const history = await store.getSignalHistory(person.id, cleanTopic);
    const newSignalId = `sig_${crypto.randomUUID()}`;
    const plan = planSignalWrite({
      history,
      personId: person.id,
      topic: cleanTopic,
      value: cleanValue,
      category: categoryInput,
      content: cleanContent,
      occurredAt: effectiveAt,
      recordedAt: nowIso,
      newSignalId,
    });

    if (plan.mutation.kind === 'none') {
      return toolResult({
        status: 'unchanged',
        action: data.action,
        person_id: person.id,
        topic: cleanTopic,
        value: cleanValue,
        bitemporal_update: plan.update,
        redacted_entities,
      });
    }

    const statements: D1PreparedStatement[] = [];
    if (plan.mutation.close) {
      const c = plan.mutation.close;
      const closeSql =
        c.expectedValidTo === null
          ? 'UPDATE signals SET valid_to = ?, superseded_at = ?, superseded_by = ? WHERE id = ? AND valid_to IS NULL'
          : 'UPDATE signals SET valid_to = ?, superseded_at = ?, superseded_by = ? WHERE id = ? AND valid_to = ?';
      const closeStmt =
        c.expectedValidTo === null
          ? env.DB.prepare(closeSql).bind(c.validTo, c.supersededAt, c.supersededBy, c.id)
          : env.DB.prepare(closeSql).bind(
              c.validTo,
              c.supersededAt,
              c.supersededBy,
              c.id,
              c.expectedValidTo
            );
      statements.push(closeStmt);
    }

    const ins = plan.mutation.insert;
    statements.push(
      env.DB.prepare(
        'INSERT INTO signals (id, person_id, category, topic, value, content, valid_from, valid_to, recorded_at, superseded_at, superseded_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
      ).bind(
        ins.id,
        ins.person_id,
        ins.category,
        ins.topic,
        ins.value,
        ins.content,
        ins.valid_from,
        ins.valid_to,
        ins.recorded_at,
        ins.superseded_at,
        ins.superseded_by
      )
    );

    await env.DB.batch(statements);

    return toolResult({
      status: 'updated',
      action: data.action,
      person_id: person.id,
      bitemporal_update: plan.update,
      signal: ins,
      redacted_entities,
    });
  };

  if (data.action === 'override' || data.action === 'upsert') {
    const rawValue = data.value ?? data.new_value;
    if (!data.topic || !rawValue) {
      return toolResult(
        { error: 'Both topic and value are required when action is override or upsert' },
        true
      );
    }
    return writeOverrideSignal(
      data.topic,
      rawValue,
      data.category ?? 'preference',
      data.content,
      data.effective_at ?? nowIso
    );
  }

  // action === 'supersede' || 'retire'
  let targetSignal: typeof schema.signals.$inferSelect | undefined;
  if (data.signal_id) {
    const [row] = await db
      .select()
      .from(schema.signals)
      .where(and(eq(schema.signals.id, data.signal_id), eq(schema.signals.personId, person.id)))
      .limit(1);
    targetSignal = row;
  } else if (data.topic) {
    const [row] = await db
      .select()
      .from(schema.signals)
      .where(
        and(
          eq(schema.signals.personId, person.id),
          eq(schema.signals.topic, data.topic),
          isNull(schema.signals.validTo)
        )
      )
      .limit(1);
    targetSignal = row;
  } else {
    return toolResult(
      { error: 'Either signal_id or topic is required when action is supersede or retire' },
      true
    );
  }

  if (!targetSignal) {
    return toolResult(
      {
        status: 'not_found',
        error: 'Target active signal not found',
        person_id: person.id,
        signal_id: data.signal_id ?? null,
        topic: data.topic ?? null,
      },
      true
    );
  }

  if (targetSignal.validTo !== null) {
    return toolResult(
      {
        status: 'already_superseded',
        error: 'Signal is already closed/superseded',
        signal_id: targetSignal.id,
        valid_to: targetSignal.validTo,
      },
      true
    );
  }

  const replacementValue = data.new_value ?? data.value;
  const effectiveAt = data.effective_at ?? nowIso;

  if (replacementValue) {
    const cat = (
      data.category ??
      (targetSignal.category === 'gift_idea' ||
      targetSignal.category === 'preference' ||
      targetSignal.category === 'boundary'
        ? targetSignal.category
        : 'preference')
    ) as 'gift_idea' | 'preference' | 'boundary';
    return writeOverrideSignal(targetSignal.topic, replacementValue, cat, data.content, effectiveAt);
  }

  // Pure retirement without replacement value
  const fromMs = Date.parse(targetSignal.validFrom);
  const requestedEndMs = Date.parse(effectiveAt);
  const safeValidTo =
    requestedEndMs > fromMs ? effectiveAt : new Date(fromMs + 1000).toISOString();

  await env.DB.prepare(
    'UPDATE signals SET valid_to = ?, superseded_at = ? WHERE id = ? AND valid_to IS NULL'
  )
    .bind(safeValidTo, nowIso, targetSignal.id)
    .run();

  return toolResult({
    status: 'retired',
    action: data.action,
    person_id: person.id,
    retired_signal_id: targetSignal.id,
    topic: targetSignal.topic,
    category: targetSignal.category,
    old_value: targetSignal.value,
    valid_from: targetSignal.validFrom,
    valid_to: safeValidTo,
  });
}

const IngestVoiceMemoArgsSchema = z.object({
  raw_text: z.string().trim().min(1).max(20000),
  person_id: z.string().trim().min(1).nullable().optional(),
  source: z.enum(['voice_note', 'chat_log', 'manual']).default('voice_note'),
  occurred_at: z.string().datetime({ offset: true }).optional(),
  commit: z.boolean().default(false),
});

interface ExtractedCandidateSignal {
  category: 'preference' | 'gift_idea' | 'boundary';
  topic: string;
  value: string;
  matched_phrase: string;
}

function normalizeSignalValueSlug(raw: string): string {
  return raw
    .trim()
    .replace(/^[":：,，.。;；!！?？\s]+|[":：,，.。;；!！?？\s]+$/g, '')
    .slice(0, 180);
}

function extractVoiceMemoSignalsAndSentiment(sanitizedText: string): {
  sentiment_score: number;
  extracted_signals: ExtractedCandidateSignal[];
} {
  const positiveMatches =
    sanitizedText.match(
      /开心|愉快|喜欢|感谢|温暖|放松|贴心|期待|投缘|感动|惊喜|舒服|治愈|loves|great|happy|wonderful|excited|grateful|enjoyed|warm|sweet|delighted/gi
    ) ?? [];
  const negativeMatches =
    sanitizedText.match(
      /累|内耗|吵架|生气|不舒服|焦虑|冷淡|讨厌|冲突|尴尬|疲惫|敷衍|难过|委屈|tired|drained|argued|upset|frustrated|annoyed|stressful|cold|awkward|conflict/gi
    ) ?? [];

  let sentimentScore = 0.25;
  if (positiveMatches.length > 0 || negativeMatches.length > 0) {
    const rawDelta = (positiveMatches.length - negativeMatches.length) * 0.3;
    sentimentScore = roundScore(Math.max(-0.95, Math.min(0.95, 0.2 + rawDelta)));
  }

  const signals: ExtractedCandidateSignal[] = [];
  const seenTopics = new Set<string>();

  const pushUnique = (
    category: 'preference' | 'gift_idea' | 'boundary',
    topic: string,
    rawVal: string,
    phrase: string
  ) => {
    const val = normalizeSignalValueSlug(rawVal);
    if (!val || seenTopics.has(`${topic}:${val}`)) return;
    seenTopics.add(`${topic}:${val}`);
    signals.push({ category, topic, value: val, matched_phrase: phrase.trim() });
  };

  // 1. Boundary / Allergy / Taboo rules
  const allergyRegex =
    /(?:对\s*([^,，.。;；!！\s]{1,24})\s*过敏|(?:allergic to|allergy to)\s+([^,，.。;；!！\n]{2,36}))/gi;
  for (const m of sanitizedText.matchAll(allergyRegex)) {
    const item = m[1] ?? m[2];
    if (item) {
      pushUnique('boundary', 'dietary_allergy', `allergic_to_${item}`, m[0]);
    }
  }

  const boundaryRegex =
    /(?:(?:忌口|不能吃|不吃|戒了|雷区是|底线是|边界是|讨厌聊|不喜欢被)\s*([^,，.。;；!！\n]{2,40})|(?:quit|stopped drinking|doesn't eat|never eats|hates discussing|boundary around)\s+([^,，.。;；!！\n]{2,40}))/gi;
  for (const m of sanitizedText.matchAll(boundaryRegex)) {
    const item = m[1] ?? m[2];
    if (item) {
      const isDietary = /吃|喝|酒|咖啡|辣|香菜|海鲜|花生|奶|caffeine|alcohol|meat|dairy|gluten|sugar/i.test(
        m[0]
      );
      pushUnique(
        'boundary',
        isDietary ? 'dietary_restriction' : 'personal_boundary',
        item,
        m[0]
      );
    }
  }

  // 2. Gift ideas / Wishlist rules
  const giftRegex =
    /(?:(?:想要|想买|一直看中|心愿是|礼物想收|种草了)\s*([^,，.。;；!！\n]{2,48})|(?:mentioned wanting|wants a|wishes for|looking to buy|dream gift is|hoping to get)\s+([^,，.。;；!！\n]{2,48}))/gi;
  for (const m of sanitizedText.matchAll(giftRegex)) {
    const item = m[1] ?? m[2];
    if (item) {
      pushUnique('gift_idea', 'gift_wishlist', item, m[0]);
    }
  }

  // 3. Preference rules (beverage, food, activity)
  const bevRegex =
    /(?:(?:爱喝|喜欢喝|改喝|只喝|最爱喝|平时喝)\s*([^,，.。;；!！\n]{2,40})|(?:switched to drinking|loves drinking|prefers drinking|favorite drink is|switched to)\s+([^,，.。;；!！\n]{2,40}))/gi;
  for (const m of sanitizedText.matchAll(bevRegex)) {
    const item = m[1] ?? m[2];
    if (item) {
      pushUnique('preference', 'beverage_preference', item, m[0]);
    }
  }

  const prefRegex =
    /(?:(?:最喜欢|特别喜欢|偏爱|迷上了|爱吃|喜欢吃)\s*([^,，.。;；!！\n]{2,44})|(?:really loves|is obsessed with|prefers|favorite food is|loves eating)\s+([^,，.。;；!！\n]{2,44}))/gi;
  for (const m of sanitizedText.matchAll(prefRegex)) {
    const item = m[1] ?? m[2];
    if (item) {
      const isFood = /吃|菜|火锅|日料|甜品|面|food|cuisine|ramen|sushi|pasta|dessert/i.test(m[0]);
      pushUnique(
        'preference',
        isFood ? 'food_preference' : 'general_preference',
        item,
        m[0]
      );
    }
  }

  return {
    sentiment_score: sentimentScore,
    extracted_signals: signals,
  };
}

async function runIngestVoiceMemoTool(rawArgs: unknown, env: McpRuntimeEnv, nowMs = Date.now()) {
  const parsed = IngestVoiceMemoArgsSchema.safeParse(rawArgs);
  if (!parsed.success) {
    return toolResult({ error: 'Invalid arguments', details: parsed.error.flatten() }, true);
  }

  const data = parsed.data;
  if (!env.PII_TOKEN_KEY && env.ENVIRONMENT !== 'development') {
    return toolResult(
      {
        error: 'Service misconfigured: PII_TOKEN_KEY secret is not set; refusing to store PII tokens.',
      },
      true
    );
  }

  const db = drizzle(env.DB, { schema });
  const allPeopleRows = await db.select().from(schema.people).orderBy(asc(schema.people.id));
  const privatePeople = allPeopleRows.filter((p) => !isSyntheticTestPerson(p));

  // Resolve contact attribution BEFORE redaction so contact aliases in raw_text can be matched
  let resolvedPerson: (typeof privatePeople)[number] | null = null;
  let confidence = 0.5;
  let attributionReason = 'No explicit contact alias matched in transcript';

  if (data.person_id) {
    const explicit = privatePeople.find((p) => p.id === data.person_id);
    if (!explicit) {
      return toolResult(
        { status: 'not_found', error: 'Provided person_id not found', person_id: data.person_id },
        true
      );
    }
    resolvedPerson = explicit;
    confidence = 0.96;
    attributionReason = 'Explicit person_id provided by caller';
  } else {
    const lowerRaw = data.raw_text.toLowerCase();
    const matchedPeople = privatePeople.filter((p) => {
      const fullAlias = p.alias.trim().toLowerCase();
      if (fullAlias.length >= 2 && lowerRaw.includes(fullAlias)) return true;
      const firstToken = fullAlias.split(/\s+/)[0];
      return firstToken && firstToken.length >= 2 && lowerRaw.includes(firstToken);
    });

    if (matchedPeople.length === 1) {
      resolvedPerson = matchedPeople[0];
      confidence = 0.91;
      attributionReason = `Matched contact alias '${matchedPeople[0].alias}' in transcript`;
    } else if (matchedPeople.length > 1) {
      resolvedPerson = matchedPeople[0];
      confidence = 0.65;
      attributionReason = `Ambiguous transcript: multiple contact aliases matched (${matchedPeople.map((p) => p.alias).join(', ')})`;
    }
  }

  const redactor = await createStablePiiRedactor([data.raw_text], env.PII_TOKEN_KEY);
  const sanitizedText = redactor.redact(data.raw_text);
  const { redacted_entities } = redactor.summary();

  const { sentiment_score, extracted_signals } = extractVoiceMemoSignalsAndSentiment(sanitizedText);
  const occurredAt = data.occurred_at ?? new Date(nowMs).toISOString();

  const draftPayloads =
    extracted_signals.length > 0
      ? extracted_signals.map((sig) => ({
          person_id: resolvedPerson?.id ?? null,
          source: data.source,
          content: sanitizedText,
          confidence,
          sentiment_score,
          signal_topic: sig.topic,
          signal_value: sig.value,
          signal_category: sig.category,
          occurred_at: occurredAt,
        }))
      : [
          {
            person_id: resolvedPerson?.id ?? null,
            source: data.source,
            content: sanitizedText,
            confidence,
            sentiment_score,
            occurred_at: occurredAt,
          },
        ];

  if (!data.commit) {
    return toolResult({
      mode: 'draft_preview',
      committed: false,
      attribution: {
        person_id: resolvedPerson?.id ?? null,
        alias: resolvedPerson?.alias ?? null,
        confidence,
        reason: attributionReason,
        will_route_to_disambiguation: !resolvedPerson || confidence < 0.85,
      },
      pii_redaction: {
        sanitized_text: sanitizedText,
        redacted_entities,
      },
      extracted_event: {
        source: data.source,
        summary: sanitizedText.length > 140 ? `${sanitizedText.slice(0, 137)}...` : sanitizedText,
        sentiment_score,
        occurred_at: occurredAt,
      },
      extracted_signals,
      draft_ingest_payloads: draftPayloads,
      next_step:
        'Present the extracted draft to the user for confirmation, then call ingest_voice_memo with commit:true (or insert_relationship_event) to persist.',
    });
  }

  const store = new D1IngestStore(env.DB);
  const outcomes = [];
  for (const payload of draftPayloads) {
    const parsedPayload = IngestPayloadSchema.parse(payload);
    const outcome = await ingestEvent(parsedPayload, store, undefined, {
      piiTokenKey: env.PII_TOKEN_KEY,
    });
    outcomes.push(outcome);
  }

  return toolResult({
    mode: 'committed',
    committed: true,
    attribution: {
      person_id: resolvedPerson?.id ?? null,
      alias: resolvedPerson?.alias ?? null,
      confidence,
      reason: attributionReason,
    },
    pii_redaction: {
      sanitized_text: sanitizedText,
      redacted_entities,
    },
    extracted_signals,
    ingest_outcomes: outcomes,
  });
}

const SynthesizeNarrativeArgsSchema = z.object({
  person_id: z.string().trim().min(1),
  month: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Expected YYYY-MM format')
    .optional(),
  style: z.enum(['storybook', 'cinematic', 'warm_journal', 'minimalist']).default('storybook'),
  language: z.enum(['zh', 'en']).default('zh'),
});

const STYLE_AESTHETIC_PROMPTS: Record<
  'storybook' | 'cinematic' | 'warm_journal' | 'minimalist',
  string
> = {
  storybook:
    'warm editorial storybook illustration, soft gouache and watercolor texture, gentle natural light, expressive character emotion, hand-painted picture book aesthetic',
  cinematic:
    '35mm cinematic film still, Kodak Portra 400 grain, shallow depth of field, golden hour rim lighting, intimate atmospheric composition',
  warm_journal:
    'cozy sketchbook journal spread, warm ink linework with soft pastel washes, tactile paper grain, intimate memory snapshot',
  minimalist:
    'clean modern Apple editorial vector illustration, refined geometric forms, soft ambient gradients, serene negative space',
};

async function runSynthesizeNarrativeTool(rawArgs: unknown, env: McpRuntimeEnv, nowMs = Date.now()) {
  const parsed = SynthesizeNarrativeArgsSchema.safeParse(rawArgs);
  if (!parsed.success) {
    return toolResult({ error: 'Invalid arguments', details: parsed.error.flatten() }, true);
  }

  const data = parsed.data;
  const db = drizzle(env.DB, { schema });
  const [person] = await db
    .select()
    .from(schema.people)
    .where(eq(schema.people.id, data.person_id))
    .limit(1);

  if (!person || isSyntheticTestPerson(person)) {
    return toolResult({ status: 'not_found', error: 'Person not found', person_id: data.person_id }, true);
  }

  const [allEvents, allSignals] = await Promise.all([
    db
      .select()
      .from(schema.timelineEvents)
      .where(eq(schema.timelineEvents.personId, person.id))
      .orderBy(asc(schema.timelineEvents.occurredAt)),
    db
      .select()
      .from(schema.signals)
      .where(eq(schema.signals.personId, person.id))
      .orderBy(asc(schema.signals.validFrom)),
  ]);

  const targetMonth =
    data.month ??
    (allEvents.length > 0
      ? allEvents[allEvents.length - 1].occurredAt.slice(0, 7)
      : new Date(nowMs).toISOString().slice(0, 7));

  const [yearStr, monthStr] = targetMonth.split('-');
  const yearNum = Number(yearStr);
  const monthIdx = Number(monthStr) - 1;
  const monthStartMs = Date.UTC(yearNum, monthIdx, 1, 0, 0, 0);
  const monthEndMs = Date.UTC(yearNum, monthIdx + 1, 1, 0, 0, 0);
  const monthStartIso = new Date(monthStartMs).toISOString();
  const monthEndIso = new Date(monthEndMs).toISOString();

  const monthEvents = allEvents.filter((e) => {
    const t = Date.parse(e.occurredAt);
    return t >= monthStartMs && t < monthEndMs;
  });

  // Bitemporal signals valid at any point during [monthStartMs, monthEndMs)
  const validSignalsInMonth = allSignals.filter((s) => {
    const fromMs = Date.parse(s.validFrom);
    const toMs = s.validTo === null ? Number.POSITIVE_INFINITY : Date.parse(s.validTo);
    return fromMs < monthEndMs && toMs > monthStartMs;
  });

  const signalById = new Map(allSignals.map((s) => [s.id, s]));
  const bitemporalShiftsInMonth = allSignals
    .filter((s) => {
      if (!s.validTo) return false;
      const toMs = Date.parse(s.validTo);
      return toMs >= monthStartMs && toMs < monthEndMs;
    })
    .map((s) => {
      const replacement = s.supersededBy ? signalById.get(s.supersededBy) : undefined;
      return {
        topic: s.topic,
        category: s.category,
        old_value: s.value,
        new_value: replacement?.value ?? null,
        changed_at: s.validTo,
      };
    });

  const scores = monthEvents
    .map((e) => e.sentimentScore)
    .filter((s): s is number => typeof s === 'number');
  const avgSentiment =
    scores.length > 0 ? roundScore(scores.reduce((a, b) => a + b, 0) / scores.length) : null;
  const openingSentiment = scores.length > 0 ? scores[0] : null;
  const closingSentiment = scores.length > 0 ? scores[scores.length - 1] : null;

  let dominantMood: 'warm_nourishing' | 'evolving_turning_point' | 'calm_steady' | 'reflective_quiet' =
    'reflective_quiet';
  if (bitemporalShiftsInMonth.length > 0) {
    dominantMood = 'evolving_turning_point';
  } else if (avgSentiment !== null && avgSentiment >= 0.4) {
    dominantMood = 'warm_nourishing';
  } else if (monthEvents.length > 0) {
    dominantMood = 'calm_steady';
  }

  const activePortrait = {
    preferences: validSignalsInMonth
      .filter((s) => s.category === 'preference')
      .map((s) => ({ topic: s.topic, value: s.value, valid_to: s.validTo })),
    gift_ideas: validSignalsInMonth
      .filter((s) => s.category === 'gift_idea')
      .map((s) => ({ topic: s.topic, value: s.value, valid_to: s.validTo })),
    boundaries: validSignalsInMonth
      .filter((s) => s.category === 'boundary')
      .map((s) => ({ topic: s.topic, value: s.value, valid_to: s.validTo })),
  };

  const aestheticTag = STYLE_AESTHETIC_PROMPTS[data.style];
  const isZh = data.language === 'zh';

  const chapters =
    monthEvents.length > 0
      ? monthEvents.map((ev, idx) => {
          const dateLabel = ev.occurredAt.slice(0, 10);
          const moodWord =
            (ev.sentimentScore ?? 0) >= 0.5
              ? 'warm, joyful atmosphere'
              : (ev.sentimentScore ?? 0) < 0
                ? 'contemplative, moody lighting'
                : 'calm everyday serenity';
          const narrationScript = isZh
            ? `第 ${idx + 1} 幕，${dateLabel}。在与 ${person.alias} 的这次相聚中：${ev.summary}`
            : `Chapter ${idx + 1}, ${dateLabel}. During this moment with ${person.alias}: ${ev.summary}`;

          return {
            chapter_number: idx + 1,
            occurred_at: ev.occurredAt,
            source: ev.source,
            headline: ev.summary,
            sentiment_score: ev.sentimentScore,
            flux_image_prompt: `Scene featuring character "${person.alias}": ${ev.summary}. ${moodWord}, ${aestheticTag}, no text or watermarks --ar 16:9`,
            elevenlabs_tts: {
              script: narrationScript,
              emotion_cue:
                (ev.sentimentScore ?? 0) >= 0.5
                  ? 'warm_and_smiling'
                  : (ev.sentimentScore ?? 0) < 0
                    ? 'gentle_and_reflective'
                    : 'calm_conversational',
              voice_settings: {
                stability: 0.62,
                similarity_boost: 0.8,
                style: (ev.sentimentScore ?? 0) >= 0.5 ? 0.45 : 0.25,
                use_speaker_boost: true,
              },
            },
          };
        })
      : [
          {
            chapter_number: 1,
            occurred_at: monthStartIso,
            source: 'monthly_reflection',
            headline: isZh
              ? `${targetMonth} 与 ${person.alias} 处于安静的留白期`
              : `A quiet, unhurried month with ${person.alias} in ${targetMonth}`,
            sentiment_score: null,
            flux_image_prompt: `Serene window view with two tea cups waiting on a wooden table for "${person.alias}", ${aestheticTag}, soft morning light --ar 16:9`,
            elevenlabs_tts: {
              script: isZh
                ? `${targetMonth}，与 ${person.alias} 的故事处于一段安静的留白期，等待下一次重逢。`
                : `In ${targetMonth}, the story with ${person.alias} rested in a quiet pause, waiting for the next catch-up.`,
              emotion_cue: 'gentle_and_reflective',
              voice_settings: {
                stability: 0.7,
                similarity_boost: 0.8,
                style: 0.2,
                use_speaker_boost: true,
              },
            },
          },
        ];

  const shiftSummaryZh =
    bitemporalShiftsInMonth.length > 0
      ? `本月捕捉到了 ${bitemporalShiftsInMonth.length} 处双时态偏好/状态的演进（${bitemporalShiftsInMonth
          .map((s) => `${s.topic} 从「${s.old_value}」更新为「${s.new_value ?? '已归档'}」`)
          .join('；')}）。`
      : '本月对方的核心喜好与边界保持稳定。';

  const shiftSummaryEn =
    bitemporalShiftsInMonth.length > 0
      ? `Captured ${bitemporalShiftsInMonth.length} bitemporal preference/boundary shift(s) this month (${bitemporalShiftsInMonth
          .map((s) => `${s.topic}: "${s.old_value}" -> "${s.new_value ?? 'retired'}"`)
          .join('; ')}).`
      : 'Core preferences and boundaries remained steady throughout the month.';

  const executiveSummary = isZh
    ? `在 ${targetMonth}，你与 ${person.alias}（当前关系阶段：${person.relationshipState}）共留下了 ${monthEvents.length} 次互动记录，有效双时态画像维度共 ${validSignalsInMonth.length} 项。${shiftSummaryZh}`
    : `During ${targetMonth}, you recorded ${monthEvents.length} interaction(s) with ${person.alias} (relationship stage: ${person.relationshipState}) alongside ${validSignalsInMonth.length} valid bitemporal signal(s). ${shiftSummaryEn}`;

  const fullNarrationScript = [
    isZh
      ? `${targetMonth} · 与 ${person.alias} 的月度关系绘本。${executiveSummary}`
      : `${targetMonth} · Monthly Relationship Storybook with ${person.alias}. ${executiveSummary}`,
    ...chapters.map((c) => c.elevenlabs_tts.script),
  ].join('\n\n');

  return toolResult({
    mode: 'monthly_narrative_recap',
    person: {
      id: person.id,
      alias: person.alias,
      relationship_state: person.relationshipState,
    },
    period: {
      month: targetMonth,
      start_at: monthStartIso,
      end_at: monthEndIso,
      event_count: monthEvents.length,
      valid_signal_count: validSignalsInMonth.length,
      transition_count: bitemporalShiftsInMonth.length,
    },
    emotional_arc: {
      opening_sentiment: openingSentiment,
      closing_sentiment: closingSentiment,
      average_sentiment: avgSentiment,
      dominant_mood: dominantMood,
    },
    narrative_recap: {
      title: isZh
        ? `${targetMonth} · 与 ${person.alias} 的关系手记`
        : `${targetMonth} · Relationship Journal with ${person.alias}`,
      executive_summary: executiveSummary,
      active_portrait: activePortrait,
      bitemporal_shifts: bitemporalShiftsInMonth,
    },
    chapters,
    media_generation_pack: {
      style: data.style,
      language: data.language,
      cover_flux_prompt: `Storybook cover illustration for "${person.alias}" (${targetMonth}), ${dominantMood.replace(/_/g, ' ')} mood, ${aestheticTag}, high detail --ar 3:4`,
      full_elevenlabs_script: fullNarrationScript,
    },
  });
}

export async function handleMcpRequest(request: Request, env: McpRuntimeEnv): Promise<Response> {
  if (request.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method Not Allowed; use POST /mcp with JSON-RPC 2.0' }),
      {
        status: 405,
        headers: {
          ...JSON_HEADERS,
          Allow: 'POST',
        },
      }
    );
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return jsonRpcError(null, -32700, 'Parse error: invalid JSON', undefined, 400);
  }

  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
    return jsonRpcError(null, -32600, 'Invalid Request: expected JSON-RPC object', undefined, 400);
  }

  const rpc = payload as Record<string, unknown>;
  const hasId = Object.prototype.hasOwnProperty.call(rpc, 'id');
  const rawId = rpc.id;
  const validId =
    rawId === undefined ||
    rawId === null ||
    typeof rawId === 'string' ||
    typeof rawId === 'number';
  const id: JsonRpcId = typeof rawId === 'string' || typeof rawId === 'number' ? rawId : null;

  if (rpc.jsonrpc !== '2.0' || typeof rpc.method !== 'string' || rpc.method.length === 0 || !validId) {
    return jsonRpcError(id, -32600, 'Invalid Request', undefined, 400);
  }

  if (!hasId || rawId === undefined) {
    if (rpc.method === 'notifications/initialized' || rpc.method.startsWith('notifications/')) {
      return new Response(null, { status: 202 });
    }
    return new Response(null, { status: 202 });
  }

  const params =
    typeof rpc.params === 'object' && rpc.params !== null && !Array.isArray(rpc.params)
      ? (rpc.params as Record<string, unknown>)
      : {};

  switch (rpc.method) {
    case 'initialize': {
      const requestedVersion = params.protocolVersion;
      const protocolVersion = requestedVersion === '2024-11-05' ? '2024-11-05' : '2025-03-26';
      return jsonRpcSuccess(id, {
        protocolVersion,
        capabilities: {
          tools: {},
        },
        serverInfo: {
          name: 'relationship-journal-mcp',
          version: '1.1.0',
        },
        instructions: MCP_SERVER_INSTRUCTIONS,
      });
    }

    case 'ping':
      return jsonRpcSuccess(id, {});

    case 'tools/list':
      return jsonRpcSuccess(id, { tools: MCP_TOOLS });

    case 'tools/call': {
      const toolName = params.name;
      if (typeof toolName !== 'string' || toolName.length === 0) {
        return jsonRpcError(id, -32602, 'Invalid params: tool name is required');
      }
      const args = params.arguments ?? {};

      switch (toolName) {
        case 'create_person':
          return jsonRpcSuccess(id, await runCreatePersonTool(args, env));
        case 'update_person':
          return jsonRpcSuccess(id, await runUpdatePersonTool(args, env));
        case 'query_relationship_records':
          return jsonRpcSuccess(id, await runQueryTool(args, env));
        case 'insert_relationship_event':
          return jsonRpcSuccess(id, await runInsertTool(args, env));
        case 'manage_signals':
          return jsonRpcSuccess(id, await runManageSignalsTool(args, env));
        case 'ingest_voice_memo':
          return jsonRpcSuccess(id, await runIngestVoiceMemoTool(args, env));
        case 'analyze_relationship':
          return jsonRpcSuccess(id, await runAnalyzeTool(args, env));
        case 'synthesize_narrative':
          return jsonRpcSuccess(id, await runSynthesizeNarrativeTool(args, env));
        case 'manage_disambiguation_item':
          return jsonRpcSuccess(id, await runManageDisambiguationTool(args, env));
        default:
          return jsonRpcError(id, -32602, `Unknown tool: ${toolName}`);
      }
    }

    default:
      return jsonRpcError(id, -32601, `Method not found: ${rpc.method}`);
  }
}
