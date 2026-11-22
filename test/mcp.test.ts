import { SELF, env } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import worker from '../src/index';

const ALEX_ID = '00000000-0000-4000-8000-000000000101';
const JORDAN_ID = '00000000-0000-4000-8000-000000000102';
const SYNTH_DEMO_ID = '00000000-0000-4000-8000-000000000199';

function mcpHeaders(extra: Record<string, string> = {}): Record<string, string> {
  return {
    Authorization: `Bearer ${env.API_KEY}`,
    'Content-Type': 'application/json',
    ...extra,
  };
}

async function rpcCall(
  body: unknown,
  customEnv?: { DB: D1Database; API_KEY?: string; ENVIRONMENT?: string; PII_TOKEN_KEY?: string }
): Promise<Response> {
  const req = new Request('https://example.com/mcp', {
    method: 'POST',
    headers: mcpHeaders(),
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
  if (customEnv) {
    return worker.fetch(req, customEnv);
  }
  return SELF.fetch(req);
}

describe('MCP /mcp endpoint and query/insert/analyze tools', () => {
  beforeEach(async () => {
    await env.DB.batch([
      env.DB.prepare('DELETE FROM disambiguation_queue'),
      env.DB.prepare('DELETE FROM idempotency_keys'),
      env.DB.prepare('DELETE FROM signals'),
      env.DB.prepare('DELETE FROM timeline_events'),
      env.DB.prepare('DELETE FROM people'),
    ]);

    await env.DB.batch([
      env.DB.prepare(
        'INSERT INTO people (id, alias, relationship_state, key_dates, created_at) VALUES (?, ?, ?, ?, ?)'
      ).bind(
        ALEX_ID,
        'Alex Chen',
        'active',
        JSON.stringify({ birthday: '2026-11-28', met_at: '2026-09-15' }),
        '2026-10-01T18:00:00Z'
      ),
      env.DB.prepare(
        'INSERT INTO people (id, alias, relationship_state, key_dates, created_at) VALUES (?, ?, ?, ?, ?)'
      ).bind(
        JORDAN_ID,
        'Jordan Lee',
        'reconnect_needed',
        JSON.stringify({ anniversary: '2026-12-10' }),
        '2026-10-12T14:30:00Z'
      ),
      // Synthetic [TEST_DATA] row that belongs ONLY to /db/demo and must be isolated from private MCP/App queries
      env.DB.prepare(
        'INSERT INTO people (id, alias, relationship_state, key_dates, created_at) VALUES (?, ?, ?, ?, ?)'
      ).bind(
        SYNTH_DEMO_ID,
        '[TEST_DATA] Synthetic Demo Contact',
        'active_test',
        JSON.stringify({ is_test: true }),
        '2026-10-01T00:00:00Z'
      ),
    ]);
  });

  it('handles initialize, notifications/initialized, ping, tools/list, and GET /mcp 405', async () => {
    const getRes = await SELF.fetch('https://example.com/mcp', {
      method: 'GET',
      headers: { Authorization: `Bearer ${env.API_KEY}` },
    });
    expect(getRes.status).toBe(405);
    expect(getRes.headers.get('Allow')).toBe('POST');

    const initRes = await rpcCall({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: { protocolVersion: '2025-03-26', capabilities: {} },
    });
    expect(initRes.status).toBe(200);
    const initJson = (await initRes.json()) as {
      jsonrpc: string;
      id: number;
      result: {
        protocolVersion: string;
        serverInfo: { name: string; version: string };
        capabilities: { tools: object };
        instructions: string;
      };
    };
    expect(initJson.jsonrpc).toBe('2.0');
    expect(initJson.id).toBe(1);
    expect(initJson.result.protocolVersion).toBe('2025-03-26');
    expect(initJson.result.serverInfo.name).toBe('relationship-journal-mcp');
    expect(initJson.result.instructions).toContain('AI Usage Playbook');

    const notifRes = await rpcCall({
      jsonrpc: '2.0',
      method: 'notifications/initialized',
    });
    expect(notifRes.status).toBe(202);

    const pingRes = await rpcCall({ jsonrpc: '2.0', id: 2, method: 'ping', params: {} });
    expect(pingRes.status).toBe(200);
    expect(await pingRes.json()).toEqual({ jsonrpc: '2.0', id: 2, result: {} });

    const listRes = await rpcCall({ jsonrpc: '2.0', id: 3, method: 'tools/list', params: {} });
    expect(listRes.status).toBe(200);
    const listJson = (await listRes.json()) as {
      result: { tools: Array<{ name: string; inputSchema: Record<string, unknown> }> };
    };
    expect(listJson.result.tools.map((t) => t.name)).toEqual([
      'create_person',
      'update_person',
      'query_relationship_records',
      'insert_relationship_event',
      'manage_signals',
      'ingest_voice_memo',
      'analyze_relationship',
      'synthesize_narrative',
      'manage_disambiguation_item',
    ]);
    for (const tool of listJson.result.tools) {
      expect(tool.inputSchema.type).toBe('object');
    }
  });

  it('executes insert_relationship_event, query_relationship_records, and analyze_relationship end-to-end', async () => {
    // 1. Insert first event with initial preference & positive sentiment
    const ins1 = await rpcCall({
      jsonrpc: '2.0',
      id: 10,
      method: 'tools/call',
      params: {
        name: 'insert_relationship_event',
        arguments: {
          person_id: ALEX_ID,
          source: 'voice_note',
          content: 'Coffee with alex@example.com; loves iced matcha.',
          confidence: 0.96,
          sentiment_score: 0.7,
          signal_topic: 'beverage_preference',
          signal_value: 'loves_iced_matcha',
          signal_category: 'preference',
          occurred_at: '2026-10-01T18:00:00Z',
        },
      },
    });
    expect(ins1.status).toBe(200);
    const ins1Json = (await ins1.json()) as {
      result: { isError: boolean; structuredContent: { status: string; redacted_entities: string[] } };
    };
    expect(ins1Json.result.isError).toBe(false);
    expect(ins1Json.result.structuredContent.status).toBe('persisted');
    expect(ins1Json.result.structuredContent.redacted_entities).toEqual(['EMAIL']);

    // 2. Duplicate insert returns deduplicated
    const insDup = await rpcCall({
      jsonrpc: '2.0',
      id: 11,
      method: 'tools/call',
      params: {
        name: 'insert_relationship_event',
        arguments: {
          person_id: ALEX_ID,
          source: 'voice_note',
          content: 'Coffee with alex@example.com; loves iced matcha.',
          confidence: 0.96,
          sentiment_score: 0.7,
          signal_topic: 'beverage_preference',
          signal_value: 'loves_iced_matcha',
          signal_category: 'preference',
          occurred_at: '2026-10-01T18:00:00Z',
        },
      },
    });
    const insDupJson = (await insDup.json()) as {
      result: { isError: boolean; structuredContent: { status: string } };
    };
    expect(insDupJson.result.structuredContent.status).toBe('deduplicated');

    // 3. Conflicting preference + gift idea + higher sentiment
    await rpcCall({
      jsonrpc: '2.0',
      id: 12,
      method: 'tools/call',
      params: {
        name: 'insert_relationship_event',
        arguments: {
          person_id: ALEX_ID,
          source: 'chat_log',
          content: 'Quit caffeine; switched to decaf rooibos.',
          confidence: 0.94,
          sentiment_score: 0.9,
          signal_topic: 'beverage_preference',
          signal_value: 'no_caffeine_rooibos_only',
          signal_category: 'preference',
          occurred_at: '2026-11-15T20:30:00Z',
        },
      },
    });
    await rpcCall({
      jsonrpc: '2.0',
      id: 13,
      method: 'tools/call',
      params: {
        name: 'insert_relationship_event',
        arguments: {
          person_id: ALEX_ID,
          source: 'manual',
          content: 'Mentioned wanting a ceramic matcha whisk bowl.',
          confidence: 0.95,
          sentiment_score: 0.95,
          signal_topic: 'ceramic_gift',
          signal_value: 'handmade_tea_bowl',
          signal_category: 'gift_idea',
          occurred_at: '2026-11-18T12:00:00Z',
        },
      },
    });

    // 4. Ambiguous note routed to disambiguation_queue
    await rpcCall({
      jsonrpc: '2.0',
      id: 14,
      method: 'tools/call',
      params: {
        name: 'insert_relationship_event',
        arguments: {
          person_id: null,
          source: 'voice_note',
          content: 'She mentioned liking vinyls.',
          confidence: 0.55,
        },
      },
    });

    // 5. Query all people
    const qList = await rpcCall({
      jsonrpc: '2.0',
      id: 20,
      method: 'tools/call',
      params: { name: 'query_relationship_records', arguments: {} },
    });
    const qListJson = (await qList.json()) as {
      result: { structuredContent: { mode: string; count: number } };
    };
    expect(qListJson.result.structuredContent.mode).toBe('list_people');
    expect(qListJson.result.structuredContent.count).toBe(2);

    // 6. Query Alex active vs full history + category filter
    const qActive = await rpcCall({
      jsonrpc: '2.0',
      id: 21,
      method: 'tools/call',
      params: {
        name: 'query_relationship_records',
        arguments: { person_id: ALEX_ID, include_history: false },
      },
    });
    const qActiveJson = (await qActive.json()) as {
      result: {
        structuredContent: {
          counts: { timeline_events: number; signals: number };
          signals: Array<{ value: string }>;
        };
      };
    };
    expect(qActiveJson.result.structuredContent.counts.timeline_events).toBe(3);
    expect(qActiveJson.result.structuredContent.counts.signals).toBe(2);

    const qHistory = await rpcCall({
      jsonrpc: '2.0',
      id: 22,
      method: 'tools/call',
      params: {
        name: 'query_relationship_records',
        arguments: { person_id: ALEX_ID, include_history: true, category: 'preference' },
      },
    });
    const qHistoryJson = (await qHistory.json()) as {
      result: { structuredContent: { counts: { signals: number } } };
    };
    expect(qHistoryJson.result.structuredContent.counts.signals).toBe(2);

    // 7. Analyze Alex
    const analyzeAlex = await rpcCall({
      jsonrpc: '2.0',
      id: 30,
      method: 'tools/call',
      params: { name: 'analyze_relationship', arguments: { person_id: ALEX_ID } },
    });
    const analyzeAlexJson = (await analyzeAlex.json()) as {
      result: {
        isError: boolean;
        structuredContent: {
          mode: string;
          health: {
            freshness_score: number;
            composite_health_score: number;
            target_cadence_days: number;
            overdue_ratio: number | null;
            risk_level: string;
          };
          cadence: {
            total_events: number;
            mean_interval_days: number | null;
            stddev_interval_days: number | null;
            drift_z_score: number | null;
            target_cadence_days: number;
            cadence_anomaly: boolean;
            by_source: { voice_note: number; chat_log: number; manual: number; other: number };
          };
          sentiment: {
            scored_events: number;
            average: number;
            ema: number;
            recent_average: number;
            momentum_slope: number;
            trend: string;
            energy_state: string;
          };
          depth_and_volatility: {
            signal_yield_rate: number;
            profile_coverage_score: number;
            missing_dimensions: string[];
            volatility_90d: number;
            churn_rate: number;
          };
          signals: {
            active_count: number;
            superseded_count: number;
            preference_changes: Array<{ old_value: string; new_value: string }>;
          };
          follow_up_hooks: string[];
        };
      };
    };
    expect(analyzeAlexJson.result.isError).toBe(false);
    const analysis = analyzeAlexJson.result.structuredContent;
    expect(analysis.mode).toBe('person_analysis');
    expect(analysis.cadence.total_events).toBe(3);
    expect(analysis.cadence.mean_interval_days).toBeGreaterThan(20);
    expect(analysis.cadence.target_cadence_days).toBe(30);
    expect(analysis.cadence.by_source).toEqual({ voice_note: 1, chat_log: 1, manual: 1, other: 0 });
    expect(analysis.sentiment.scored_events).toBe(3);
    expect(analysis.sentiment.average).toBe(0.85);
    expect(analysis.sentiment.ema).toBe(0.875);
    expect(analysis.sentiment.momentum_slope).toBe(0.025);
    expect(analysis.sentiment.trend).toBe('improving');
    expect(analysis.sentiment.energy_state).toBe('nourishing');
    expect(analysis.depth_and_volatility.signal_yield_rate).toBe(1);
    expect(analysis.depth_and_volatility.profile_coverage_score).toBe(75);
    expect(analysis.depth_and_volatility.missing_dimensions).toEqual(['boundary']);
    expect(analysis.depth_and_volatility.churn_rate).toBe(0.333);
    expect(analysis.health.freshness_score).toBeGreaterThan(0);
    expect(analysis.health.composite_health_score).toBeGreaterThan(50);
    expect(analysis.signals.active_count).toBe(2);
    expect(analysis.signals.superseded_count).toBe(1);
    expect(analysis.signals.preference_changes).toHaveLength(1);
    expect(analysis.signals.preference_changes[0]).toMatchObject({
      old_value: 'loves_iced_matcha',
      new_value: 'no_caffeine_rooibos_only',
    });
    expect(analysis.follow_up_hooks.some((h) => h.includes('handmade_tea_bowl'))).toBe(true);
    expect(analysis.follow_up_hooks.some((h) => h.includes('Profile depth gap'))).toBe(true);

    // 8. Analyze portfolio overview (omit person_id)
    const analyzeAll = await rpcCall({
      jsonrpc: '2.0',
      id: 31,
      method: 'tools/call',
      params: { name: 'analyze_relationship', arguments: {} },
    });
    const analyzeAllJson = (await analyzeAll.json()) as {
      result: {
        structuredContent: {
          mode: string;
          totals: {
            people: number;
            timeline_events: number;
            active_signals: number;
            superseded_signals: number;
            pending_disambiguation: number;
          };
          priority_attention_queue: Array<{ person_id: string; risk_level: string }>;
        };
      };
    };
    expect(analyzeAllJson.result.structuredContent.mode).toBe('portfolio_overview');
    expect(analyzeAllJson.result.structuredContent.totals).toEqual({
      people: 2,
      timeline_events: 3,
      active_signals: 2,
      superseded_signals: 1,
      pending_disambiguation: 1,
    });
    expect(
      analyzeAllJson.result.structuredContent.priority_attention_queue.some(
        (p) => p.person_id === JORDAN_ID && p.risk_level === 'at_risk'
      )
    ).toBe(true);
  });

  it('enforces PII_TOKEN_KEY requirement outside development and returns standard JSON-RPC errors', async () => {
    const noKeyRes = await rpcCall(
      {
        jsonrpc: '2.0',
        id: 40,
        method: 'tools/call',
        params: {
          name: 'insert_relationship_event',
          arguments: { person_id: ALEX_ID, content: 'test', confidence: 0.9 },
        },
      },
      { DB: env.DB, API_KEY: env.API_KEY, ENVIRONMENT: 'production' }
    );
    const noKeyJson = (await noKeyRes.json()) as { result: { isError: boolean } };
    expect(noKeyJson.result.isError).toBe(true);

    const parseErr = await rpcCall('{bad json');
    expect(parseErr.status).toBe(400);
    expect(((await parseErr.json()) as { error: { code: number } }).error.code).toBe(-32700);

    const invalidReq = await rpcCall({ jsonrpc: '1.0', id: 41, method: 'ping' });
    expect(invalidReq.status).toBe(400);
    expect(((await invalidReq.json()) as { error: { code: number } }).error.code).toBe(-32600);

    const unknownMethod = await rpcCall({ jsonrpc: '2.0', id: 42, method: 'resources/list' });
    expect(((await unknownMethod.json()) as { error: { code: number } }).error.code).toBe(-32601);

    const unknownTool = await rpcCall({
      jsonrpc: '2.0',
      id: 43,
      method: 'tools/call',
      params: { name: 'nonexistent_tool', arguments: {} },
    });
    expect(((await unknownTool.json()) as { error: { code: number } }).error.code).toBe(-32602);
  });

  it('creates people via create_person, handles duplicate IDs and invalid aliases, and works with ingest/query/public demo isolation', async () => {
    // 1. Create a person with server-generated UUID
    const createRes = await rpcCall({
      jsonrpc: '2.0',
      id: 50,
      method: 'tools/call',
      params: {
        name: 'create_person',
        arguments: {
          alias: 'Morgan Taylor',
          relationship_state: 'close',
          key_dates: { birthday: '2026-12-05', met_at: '2026-01-10' },
        },
      },
    });
    expect(createRes.status).toBe(200);
    const createJson = (await createRes.json()) as {
      result: {
        isError: boolean;
        structuredContent: {
          status: string;
          person: { id: string; alias: string; relationship_state: string; key_dates: Record<string, unknown> };
        };
      };
    };
    expect(createJson.result.isError).toBe(false);
    expect(createJson.result.structuredContent.status).toBe('created');
    const newPersonId = createJson.result.structuredContent.person.id;
    expect(newPersonId).toMatch(/^[0-9a-f-]{36}$/i);
    expect(createJson.result.structuredContent.person.alias).toBe('Morgan Taylor');

    // 2. Insert event for newly created person and query back
    const insertRes = await rpcCall({
      jsonrpc: '2.0',
      id: 51,
      method: 'tools/call',
      params: {
        name: 'insert_relationship_event',
        arguments: {
          person_id: newPersonId,
          content: 'Prefers pour-over Ethiopian coffee.',
          confidence: 0.95,
          signal_topic: 'coffee_origin',
          signal_value: 'ethiopia_pour_over',
        },
      },
    });
    const insertJson = (await insertRes.json()) as {
      result: { isError: boolean; structuredContent: { status: string } };
    };
    expect(insertJson.result.isError).toBe(false);
    expect(insertJson.result.structuredContent.status).toBe('persisted');

    const queryRes = await rpcCall({
      jsonrpc: '2.0',
      id: 52,
      method: 'tools/call',
      params: {
        name: 'query_relationship_records',
        arguments: { person_id: newPersonId },
      },
    });
    const queryJson = (await queryRes.json()) as {
      result: {
        structuredContent: {
          counts: { timeline_events: number; signals: number };
          signals: Array<{ value: string }>;
        };
      };
    };
    expect(queryJson.result.structuredContent.counts).toEqual({ timeline_events: 1, signals: 1 });
    expect(queryJson.result.structuredContent.signals[0].value).toBe('ethiopia_pour_over');

    // 3. Ensure non-[TEST_DATA] created person is excluded from public /db/demo
    const demoRes = await SELF.fetch('https://example.com/db/demo');
    const demoJson = (await demoRes.json()) as {
      tables: { people: Array<{ id: string }> };
    };
    expect(demoJson.tables.people.some((p) => p.id === newPersonId)).toBe(false);

    // 4. Explicit ID + duplicate conflict check
    const explicitId = 'custom-person-001';
    const firstExplicit = await rpcCall({
      jsonrpc: '2.0',
      id: 53,
      method: 'tools/call',
      params: {
        name: 'create_person',
        arguments: { id: explicitId, alias: 'Casey Lin' },
      },
    });
    expect(((await firstExplicit.json()) as { result: { isError: boolean } }).result.isError).toBe(false);

    const dupExplicit = await rpcCall({
      jsonrpc: '2.0',
      id: 54,
      method: 'tools/call',
      params: {
        name: 'create_person',
        arguments: { id: explicitId, alias: 'Casey Lin Duplicate' },
      },
    });
    const dupJson = (await dupExplicit.json()) as {
      result: { isError: boolean; structuredContent: { status: string; person_id: string } };
    };
    expect(dupJson.result.isError).toBe(true);
    expect(dupJson.result.structuredContent.status).toBe('conflict');
    expect(dupJson.result.structuredContent.person_id).toBe(explicitId);

    // 5. Invalid empty alias rejected cleanly
    const badAlias = await rpcCall({
      jsonrpc: '2.0',
      id: 55,
      method: 'tools/call',
      params: {
        name: 'create_person',
        arguments: { alias: '   ' },
      },
    });
    expect(((await badAlias.json()) as { result: { isError: boolean } }).result.isError).toBe(true);
  });

  it('lists, links/resolves, and dismisses items in disambiguation_queue via manage_disambiguation_item', async () => {
    // 1. Insert two ambiguous notes into disambiguation_queue:
    //    - Item A: missing person_id, has signal_topic/signal_value
    //    - Item B: has person_id=JORDAN_ID but low confidence (0.50)
    const ambA = await rpcCall({
      jsonrpc: '2.0',
      id: 60,
      method: 'tools/call',
      params: {
        name: 'insert_relationship_event',
        arguments: {
          person_id: null,
          source: 'voice_note',
          content: 'They mentioned being severely allergic to shellfish.',
          confidence: 0.45,
          signal_topic: 'dietary_allergy',
          signal_value: 'allergic_to_shellfish',
          signal_category: 'boundary',
          occurred_at: '2026-11-19T10:00:00Z',
        },
      },
    });
    const ambAJson = (await ambA.json()) as {
      result: { structuredContent: { status: string; queue_id: string } };
    };
    expect(ambAJson.result.structuredContent.status).toBe('routed_to_disambiguation_queue');
    const queueIdA = ambAJson.result.structuredContent.queue_id;

    const ambB = await rpcCall({
      jsonrpc: '2.0',
      id: 61,
      method: 'tools/call',
      params: {
        name: 'insert_relationship_event',
        arguments: {
          person_id: JORDAN_ID,
          source: 'chat_log',
          content: 'Maybe Jordan or someone else talking about weekend plans.',
          confidence: 0.5,
          occurred_at: '2026-11-20T15:00:00Z',
        },
      },
    });
    const ambBJson = (await ambB.json()) as {
      result: { structuredContent: { status: string; queue_id: string } };
    };
    expect(ambBJson.result.structuredContent.status).toBe('routed_to_disambiguation_queue');
    const queueIdB = ambBJson.result.structuredContent.queue_id;

    // 2. List pending items
    const listRes = await rpcCall({
      jsonrpc: '2.0',
      id: 62,
      method: 'tools/call',
      params: {
        name: 'manage_disambiguation_item',
        arguments: { action: 'list', status: 'pending' },
      },
    });
    const listJson = (await listRes.json()) as {
      result: {
        isError: boolean;
        structuredContent: { mode: string; count: number; items: Array<{ id: string; status: string }> };
      };
    };
    expect(listJson.result.isError).toBe(false);
    expect(listJson.result.structuredContent.mode).toBe('list_disambiguation_queue');
    expect(listJson.result.structuredContent.count).toBe(2);

    // 3. Link/resolve Item A to ALEX_ID with a sentiment_score
    const linkRes = await rpcCall({
      jsonrpc: '2.0',
      id: 63,
      method: 'tools/call',
      params: {
        name: 'manage_disambiguation_item',
        arguments: {
          action: 'link',
          queue_id: queueIdA,
          person_id: ALEX_ID,
          sentiment_score: 0.4,
        },
      },
    });
    const linkJson = (await linkRes.json()) as {
      result: {
        isError: boolean;
        structuredContent: {
          status: string;
          action: string;
          queue_id: string;
          person: { id: string };
          ingest_outcome: { status: string; bitemporal_update: { action: string; value: string } };
        };
      };
    };
    expect(linkJson.result.isError).toBe(false);
    expect(linkJson.result.structuredContent.status).toBe('resolved');
    expect(linkJson.result.structuredContent.person.id).toBe(ALEX_ID);
    expect(linkJson.result.structuredContent.ingest_outcome.status).toBe('persisted');
    expect(linkJson.result.structuredContent.ingest_outcome.bitemporal_update.value).toBe(
      'allergic_to_shellfish'
    );

    // Verify Alex now has the resolved boundary signal
    const alexQuery = await rpcCall({
      jsonrpc: '2.0',
      id: 64,
      method: 'tools/call',
      params: {
        name: 'query_relationship_records',
        arguments: { person_id: ALEX_ID, category: 'boundary' },
      },
    });
    const alexQueryJson = (await alexQuery.json()) as {
      result: { structuredContent: { counts: { signals: number }; signals: Array<{ value: string }> } };
    };
    expect(alexQueryJson.result.structuredContent.counts.signals).toBe(1);
    expect(alexQueryJson.result.structuredContent.signals[0].value).toBe('allergic_to_shellfish');

    // 4. Re-resolving an already resolved item returns an error
    const dupResolve = await rpcCall({
      jsonrpc: '2.0',
      id: 65,
      method: 'tools/call',
      params: {
        name: 'manage_disambiguation_item',
        arguments: { action: 'resolve', queue_id: queueIdA, person_id: ALEX_ID },
      },
    });
    const dupResolveJson = (await dupResolve.json()) as {
      result: { isError: boolean; structuredContent: { status: string } };
    };
    expect(dupResolveJson.result.isError).toBe(true);
    expect(dupResolveJson.result.structuredContent.status).toBe('already_processed');

    // 5. Dismiss Item B
    const dismissRes = await rpcCall({
      jsonrpc: '2.0',
      id: 66,
      method: 'tools/call',
      params: {
        name: 'manage_disambiguation_item',
        arguments: { action: 'dismiss', queue_id: queueIdB },
      },
    });
    const dismissJson = (await dismissRes.json()) as {
      result: { isError: boolean; structuredContent: { status: string; queue_id: string } };
    };
    expect(dismissJson.result.isError).toBe(false);
    expect(dismissJson.result.structuredContent.status).toBe('dismissed');
    expect(dismissJson.result.structuredContent.queue_id).toBe(queueIdB);

    // 6. Pending queue is now empty, while status='all' shows 2 processed items
    const listPendingAfter = await rpcCall({
      jsonrpc: '2.0',
      id: 67,
      method: 'tools/call',
      params: {
        name: 'manage_disambiguation_item',
        arguments: { action: 'list', status: 'pending' },
      },
    });
    expect(
      ((await listPendingAfter.json()) as { result: { structuredContent: { count: number } } }).result
        .structuredContent.count
    ).toBe(0);

    const listAllAfter = await rpcCall({
      jsonrpc: '2.0',
      id: 68,
      method: 'tools/call',
      params: {
        name: 'manage_disambiguation_item',
        arguments: { action: 'list', status: 'all' },
      },
    });
    expect(
      ((await listAllAfter.json()) as { result: { structuredContent: { count: number } } }).result
        .structuredContent.count
    ).toBe(2);
  });

  it('supports update_person, manage_signals, ingest_voice_memo (draft & commit), and synthesize_narrative (Flux & ElevenLabs)', async () => {
    // 1. update_person: transition relationship_state from active -> discernment and merge key_dates
    const updRes = await rpcCall({
      jsonrpc: '2.0',
      id: 70,
      method: 'tools/call',
      params: {
        name: 'update_person',
        arguments: {
          person_id: ALEX_ID,
          relationship_state: 'discernment',
          key_dates: { tag: 'book_club', anniversary: '2026-12-01' },
        },
      },
    });
    const updJson = (await updRes.json()) as {
      result: {
        isError: boolean;
        structuredContent: {
          status: string;
          previous: { relationship_state: string };
          person: { relationship_state: string; key_dates: Record<string, unknown> };
        };
      };
    };
    expect(updJson.result.isError).toBe(false);
    expect(updJson.result.structuredContent.status).toBe('updated');
    expect(updJson.result.structuredContent.previous.relationship_state).toBe('active');
    expect(updJson.result.structuredContent.person.relationship_state).toBe('discernment');
    expect(updJson.result.structuredContent.person.key_dates).toMatchObject({
      birthday: '2026-11-28',
      met_at: '2026-09-15',
      tag: 'book_club',
      anniversary: '2026-12-01',
    });

    // 2. manage_signals: explicit override -> query as_of -> supersede with new_value -> retire
    const sigOverride = await rpcCall({
      jsonrpc: '2.0',
      id: 71,
      method: 'tools/call',
      params: {
        name: 'manage_signals',
        arguments: {
          action: 'override',
          person_id: ALEX_ID,
          category: 'boundary',
          topic: 'late_night_text_boundary',
          value: 'no_messages_after_11pm',
          effective_at: '2026-11-01T10:00:00Z',
        },
      },
    });
    const sigOverrideJson = (await sigOverride.json()) as {
      result: { isError: boolean; structuredContent: { status: string; signal: { id: string; value: string } } };
    };
    expect(sigOverrideJson.result.isError).toBe(false);
    expect(sigOverrideJson.result.structuredContent.status).toBe('updated');

    const sigSupersede = await rpcCall({
      jsonrpc: '2.0',
      id: 72,
      method: 'tools/call',
      params: {
        name: 'manage_signals',
        arguments: {
          action: 'supersede',
          person_id: ALEX_ID,
          topic: 'late_night_text_boundary',
          new_value: 'no_messages_after_10pm',
          effective_at: '2026-11-15T10:00:00Z',
        },
      },
    });
    const sigSupersedeJson = (await sigSupersede.json()) as {
      result: {
        isError: boolean;
        structuredContent: {
          status: string;
          bitemporal_update: { action: string; old_value: string; new_value: string };
        };
      };
    };
    expect(sigSupersedeJson.result.isError).toBe(false);
    expect(sigSupersedeJson.result.structuredContent.bitemporal_update).toMatchObject({
      action: 'superseded_conflicting_signal',
      old_value: 'no_messages_after_11pm',
      new_value: 'no_messages_after_10pm',
    });

    // Point-in-time query as_of 2026-11-10 returns old value 'no_messages_after_11pm'
    const sigQueryAsOf = await rpcCall({
      jsonrpc: '2.0',
      id: 73,
      method: 'tools/call',
      params: {
        name: 'manage_signals',
        arguments: {
          action: 'query',
          person_id: ALEX_ID,
          topic: 'late_night_text_boundary',
          as_of: '2026-11-10T00:00:00Z',
        },
      },
    });
    const sigQueryAsOfJson = (await sigQueryAsOf.json()) as {
      result: { structuredContent: { count: number; signals: Array<{ value: string }> } };
    };
    expect(sigQueryAsOfJson.result.structuredContent.count).toBe(1);
    expect(sigQueryAsOfJson.result.structuredContent.signals[0].value).toBe('no_messages_after_11pm');

    // 3. ingest_voice_memo: draft mode (commit: false) then commit mode (commit: true)
    const memoDraft = await rpcCall({
      jsonrpc: '2.0',
      id: 74,
      method: 'tools/call',
      params: {
        name: 'ingest_voice_memo',
        arguments: {
          raw_text:
            '今天和 Alex Chen 喝下午茶，他的邮箱是 alex.chen@example.com，非常开心！他说自己对花生过敏，最近改喝冰燕麦拿铁，而且一直想要徕卡复古相机背带。',
          source: 'voice_note',
          occurred_at: '2026-11-18T14:00:00Z',
          commit: false,
        },
      },
    });
    const memoDraftJson = (await memoDraft.json()) as {
      result: {
        isError: boolean;
        structuredContent: {
          mode: string;
          committed: boolean;
          attribution: { person_id: string; confidence: number; will_route_to_disambiguation: boolean };
          pii_redaction: { redacted_entities: string[] };
          extracted_signals: Array<{ category: string; topic: string; value: string }>;
          draft_ingest_payloads: Array<Record<string, unknown>>;
        };
      };
    };
    expect(memoDraftJson.result.isError).toBe(false);
    expect(memoDraftJson.result.structuredContent.mode).toBe('draft_preview');
    expect(memoDraftJson.result.structuredContent.committed).toBe(false);
    expect(memoDraftJson.result.structuredContent.attribution.person_id).toBe(ALEX_ID);
    expect(memoDraftJson.result.structuredContent.attribution.confidence).toBeGreaterThanOrEqual(0.85);
    expect(memoDraftJson.result.structuredContent.pii_redaction.redacted_entities).toEqual(['EMAIL']);
    expect(memoDraftJson.result.structuredContent.extracted_signals.length).toBeGreaterThanOrEqual(3);

    // Commit the voice memo
    const memoCommit = await rpcCall({
      jsonrpc: '2.0',
      id: 75,
      method: 'tools/call',
      params: {
        name: 'ingest_voice_memo',
        arguments: {
          raw_text:
            '今天和 Alex Chen 喝下午茶，他的邮箱是 alex.chen@example.com，非常开心！他说自己对花生过敏，最近改喝冰燕麦拿铁，而且一直想要徕卡复古相机背带。',
          source: 'voice_note',
          occurred_at: '2026-11-18T14:00:00Z',
          commit: true,
        },
      },
    });
    const memoCommitJson = (await memoCommit.json()) as {
      result: {
        isError: boolean;
        structuredContent: {
          mode: string;
          committed: boolean;
          ingest_outcomes: Array<{ status: string }>;
        };
      };
    };
    expect(memoCommitJson.result.isError).toBe(false);
    expect(memoCommitJson.result.structuredContent.mode).toBe('committed');
    expect(memoCommitJson.result.structuredContent.committed).toBe(true);
    expect(
      memoCommitJson.result.structuredContent.ingest_outcomes.every((o) => o.status === 'persisted')
    ).toBe(true);

    // 4. synthesize_narrative: generate monthly recap with Flux & ElevenLabs prompts for 2026-11
    const synthRes = await rpcCall({
      jsonrpc: '2.0',
      id: 76,
      method: 'tools/call',
      params: {
        name: 'synthesize_narrative',
        arguments: {
          person_id: ALEX_ID,
          month: '2026-11',
          style: 'storybook',
          language: 'zh',
        },
      },
    });
    const synthJson = (await synthRes.json()) as {
      result: {
        isError: boolean;
        structuredContent: {
          mode: string;
          period: { month: string; event_count: number; valid_signal_count: number; transition_count: number };
          narrative_recap: {
            title: string;
            executive_summary: string;
            bitemporal_shifts: Array<{ topic: string; old_value: string; new_value: string }>;
          };
          chapters: Array<{
            chapter_number: number;
            flux_image_prompt: string;
            elevenlabs_tts: { script: string; voice_settings: { stability: number } };
          }>;
          media_generation_pack: { cover_flux_prompt: string; full_elevenlabs_script: string };
        };
      };
    };
    expect(synthJson.result.isError).toBe(false);
    const recap = synthJson.result.structuredContent;
    expect(recap.mode).toBe('monthly_narrative_recap');
    expect(recap.period.month).toBe('2026-11');
    expect(recap.period.event_count).toBeGreaterThanOrEqual(1);
    expect(recap.period.transition_count).toBeGreaterThanOrEqual(1);
    expect(recap.narrative_recap.bitemporal_shifts[0]).toMatchObject({
      topic: 'late_night_text_boundary',
      old_value: 'no_messages_after_11pm',
      new_value: 'no_messages_after_10pm',
    });
    expect(recap.chapters[0].flux_image_prompt).toContain('--ar 16:9');
    expect(recap.chapters[0].elevenlabs_tts.script).toContain('Alex Chen');
    expect(recap.media_generation_pack.cover_flux_prompt).toContain('--ar 3:4');
  });
});
