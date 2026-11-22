import { and, asc, desc, eq, isNull, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import { z } from 'zod';
import { D1IngestStore, IngestPayloadSchema, ingestEvent } from './pipeline';
import * as schema from './schema';

export interface McpRuntimeEnv {
  DB: D1Database;
  ENVIRONMENT?: string;
  PII_TOKEN_KEY?: string;
}

export interface McpToolDefinition {
  name:
    | 'create_person'
    | 'query_relationship_records'
    | 'insert_relationship_event'
    | 'analyze_relationship';
  description: string;
  inputSchema: Record<string, unknown>;
}

export const MCP_TOOLS: McpToolDefinition[] = [
  {
    name: 'create_person',
    description:
      'Create a new person profile in D1 so relationship events and bitemporal signals can be ingested and analyzed for them.',
    inputSchema: {
      type: 'object',
      required: ['alias'],
      properties: {
        id: {
          type: 'string',
          minLength: 1,
          maxLength: 128,
          description: 'Optional unique person ID. Defaults to a server-generated UUID.',
        },
        alias: {
          type: 'string',
          minLength: 1,
          maxLength: 200,
          description: 'Display alias or pseudonym for the person (avoid sensitive PII).',
        },
        relationship_state: {
          type: 'string',
          minLength: 1,
          maxLength: 64,
          default: 'active',
          description: 'Relationship status label (e.g., active, close, reconnect_needed, archived).',
        },
        key_dates: {
          type: 'object',
          additionalProperties: { type: ['string', 'boolean', 'number'] },
          description:
            'Optional key dates and metadata (e.g., {"birthday":"1995-06-15","met_at":"2026-11-20"}).',
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'query_relationship_records',
    description:
      'Query people profiles, anonymized timeline events, and bitemporal signals (active or full history) from D1. Omit person_id to list all people.',
    inputSchema: {
      type: 'object',
      properties: {
        person_id: {
          type: 'string',
          description: 'Target person ID. Omit to list all people profiles.',
        },
        include_history: {
          type: 'boolean',
          default: false,
          description: 'When true, include superseded and historical signals (valid_to IS NOT NULL).',
        },
        category: {
          type: 'string',
          enum: ['gift_idea', 'preference', 'boundary'],
          description: 'Optional signal category filter when querying a specific person.',
        },
        limit: {
          type: 'integer',
          minimum: 1,
          maximum: 100,
          default: 20,
          description: 'Maximum timeline events to return when querying a person.',
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'insert_relationship_event',
    description:
      'Sanitize PII, enforce SHA-256 idempotency, route low-confidence or unassigned notes to disambiguation_queue, and atomically persist timeline events and bitemporal signals into D1.',
    inputSchema: {
      type: 'object',
      required: ['content', 'confidence'],
      properties: {
        person_id: {
          type: ['string', 'null'],
          description: 'Known person ID, or null to route into disambiguation_queue.',
        },
        source: {
          type: 'string',
          enum: ['voice_note', 'chat_log', 'manual'],
          default: 'manual',
        },
        content: {
          type: 'string',
          minLength: 1,
          maxLength: 10000,
          description: 'Raw note or interaction text (PII redacted before storage).',
        },
        confidence: {
          type: 'number',
          minimum: 0,
          maximum: 1,
          description: 'Entity attribution confidence (< 0.85 routes to disambiguation_queue).',
        },
        sentiment_score: {
          type: 'number',
          minimum: -1,
          maximum: 1,
        },
        signal_topic: {
          type: 'string',
          minLength: 1,
          maxLength: 128,
          description: 'Structured signal topic (must be paired with signal_value).',
        },
        signal_value: {
          type: 'string',
          minLength: 1,
          maxLength: 512,
          description: 'Structured signal value (must be paired with signal_topic).',
        },
        signal_category: {
          type: 'string',
          enum: ['gift_idea', 'preference', 'boundary'],
          default: 'preference',
        },
        occurred_at: {
          type: 'string',
          format: 'date-time',
          description: 'ISO-8601 timestamp with timezone offset (defaults to server time).',
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'analyze_relationship',
    description:
      'Compute deterministic relationship analytics and quantitative health metrics from D1: decay/freshness score, composite health score, cadence drift Z-score, sentiment EMA & momentum slope, social depth/profile coverage, bitemporal signal volatility, key-date countdowns, and actionable follow-up hooks. Omit person_id for a portfolio overview with a priority attention queue.',
    inputSchema: {
      type: 'object',
      properties: {
        person_id: {
          type: 'string',
          description: 'Target person ID for detailed analysis. Omit for a global portfolio summary.',
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
});

const AnalyzeRelationshipArgsSchema = z.object({
  person_id: z.string().min(1).optional(),
});

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
  const { person_id, include_history, category, limit } = parsed.data;

  if (!person_id) {
    const peopleRows = await db.select().from(schema.people).orderBy(asc(schema.people.id));
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

  if (!person) {
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
  const { person_id } = parsed.data;

  if (!person_id) {
    const [allPeople, allEvents, allSignals, pendingQueueRow] = await Promise.all([
      db.select().from(schema.people).orderBy(asc(schema.people.id)),
      db.select().from(schema.timelineEvents).orderBy(asc(schema.timelineEvents.occurredAt)),
      db.select().from(schema.signals).orderBy(asc(schema.signals.validFrom)),
      db
        .select({ count: sql<number>`count(*)` })
        .from(schema.disambiguationQueue)
        .where(eq(schema.disambiguationQueue.status, 'pending')),
    ]);

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
        pending_disambiguation: Number(pendingQueueRow[0]?.count ?? 0),
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

  if (!person) {
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
          version: '1.0.0',
        },
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
        case 'query_relationship_records':
          return jsonRpcSuccess(id, await runQueryTool(args, env));
        case 'insert_relationship_event':
          return jsonRpcSuccess(id, await runInsertTool(args, env));
        case 'analyze_relationship':
          return jsonRpcSuccess(id, await runAnalyzeTool(args, env));
        default:
          return jsonRpcError(id, -32602, `Unknown tool: ${toolName}`);
      }
    }

    default:
      return jsonRpcError(id, -32601, `Method not found: ${rpc.method}`);
  }
}
