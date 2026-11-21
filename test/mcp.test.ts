import { SELF, env } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import worker from '../src/index';

const ALEX_ID = '00000000-0000-4000-8000-000000000101';
const JORDAN_ID = '00000000-0000-4000-8000-000000000102';

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
        '[TEST_DATA] Alex Chen',
        'active_test',
        JSON.stringify({ is_test: true, birthday: '2026-11-28', met_at: '2026-09-15' }),
        '2026-10-01T18:00:00Z'
      ),
      env.DB.prepare(
        'INSERT INTO people (id, alias, relationship_state, key_dates, created_at) VALUES (?, ?, ?, ?, ?)'
      ).bind(
        JORDAN_ID,
        '[TEST_DATA] Jordan Lee',
        'reconnect_needed_test',
        JSON.stringify({ is_test: true, anniversary: '2026-12-10' }),
        '2026-10-12T14:30:00Z'
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
      result: { protocolVersion: string; serverInfo: { name: string }; capabilities: { tools: object } };
    };
    expect(initJson.jsonrpc).toBe('2.0');
    expect(initJson.id).toBe(1);
    expect(initJson.result.protocolVersion).toBe('2025-03-26');
    expect(initJson.result.serverInfo.name).toBe('relationship-journal-mcp');

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
      'query_relationship_records',
      'insert_relationship_event',
      'analyze_relationship',
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
          cadence: { total_events: number; by_source: { voice_note: number; chat_log: number; manual: number } };
          sentiment: { scored_events: number; average: number; trend: string };
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
    expect(analysis.cadence.by_source).toEqual({ voice_note: 1, chat_log: 1, manual: 1, other: 0 });
    expect(analysis.sentiment.scored_events).toBe(3);
    expect(analysis.sentiment.average).toBe(0.85);
    expect(analysis.sentiment.trend).toBe('improving');
    expect(analysis.signals.active_count).toBe(2);
    expect(analysis.signals.superseded_count).toBe(1);
    expect(analysis.signals.preference_changes).toHaveLength(1);
    expect(analysis.signals.preference_changes[0]).toMatchObject({
      old_value: 'loves_iced_matcha',
      new_value: 'no_caffeine_rooibos_only',
    });
    expect(analysis.follow_up_hooks.some((h) => h.includes('handmade_tea_bowl'))).toBe(true);

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
});
