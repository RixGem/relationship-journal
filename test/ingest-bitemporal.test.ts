import { SELF, env } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import worker from '../src/index';
import { MemoryIngestStore, ingestEvent, type ParsedIngestPayload } from '../src/pipeline';

const PERSON_ID = '00000000-0000-4000-8000-000000000101';

function authHeaders(extra: Record<string, string> = {}): Record<string, string> {
  return {
    Authorization: `Bearer ${env.API_KEY}`,
    'Content-Type': 'application/json',
    ...extra,
  };
}

interface SignalRow {
  id?: string;
  value: string;
  valid_from: string;
  valid_to: string | null;
}

function intervalEnd(row: SignalRow): number {
  return row.valid_to === null ? Number.POSITIVE_INFINITY : Date.parse(row.valid_to);
}

function expectNoOverlap(rows: SignalRow[]): void {
  const live = rows.filter((r) => intervalEnd(r) > Date.parse(r.valid_from));
  for (let i = 0; i < live.length; i++) {
    for (let j = i + 1; j < live.length; j++) {
      const a = live[i];
      const b = live[j];
      const overlaps = Date.parse(a.valid_from) < intervalEnd(b) && Date.parse(b.valid_from) < intervalEnd(a);
      expect(overlaps, `${JSON.stringify(a)} overlaps ${JSON.stringify(b)}`).toBe(false);
    }
  }
  expect(rows.filter((r) => r.valid_to === null).length).toBeLessThanOrEqual(1);
}

function ingest(body: Record<string, unknown>): Promise<Response> {
  return SELF.fetch('https://example.com/ingest', {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ person_id: PERSON_ID, source: 'manual', confidence: 0.95, ...body }),
  });
}

async function signalHistory(topic: string): Promise<SignalRow[]> {
  const res = await env.DB.prepare(
    'SELECT id, value, valid_from, valid_to FROM signals WHERE person_id = ? AND topic = ? ORDER BY valid_from'
  )
    .bind(PERSON_ID, topic)
    .all<SignalRow>();
  return res.results ?? [];
}

async function valueAsOf(topic: string, at: string): Promise<string[]> {
  const res = await env.DB.prepare(
    'SELECT value FROM signals WHERE person_id = ?1 AND topic = ?2 AND julianday(valid_from) <= julianday(?3) AND (valid_to IS NULL OR julianday(valid_to) > julianday(?3))'
  )
    .bind(PERSON_ID, topic, at)
    .all<{ value: string }>();
  return (res.results ?? []).map((r) => r.value);
}

async function seedPerson(id = PERSON_ID, alias = '[TEST_DATA] Alex Chen'): Promise<void> {
  await env.DB.prepare(
    'INSERT OR IGNORE INTO people (id, alias, relationship_state, key_dates, created_at) VALUES (?, ?, ?, ?, ?)'
  )
    .bind(id, alias, 'active_test', '{"is_test":true}', '2026-10-01T00:00:00Z')
    .run();
}

describe('D1 /ingest persistence, idempotency, disambiguation, and bitemporal signals', () => {
  beforeEach(async () => {
    await env.DB.batch([
      env.DB.prepare('DELETE FROM disambiguation_queue'),
      env.DB.prepare('DELETE FROM idempotency_keys'),
      env.DB.prepare('DELETE FROM signals'),
      env.DB.prepare('DELETE FROM timeline_events'),
      env.DB.prepare('DELETE FROM people'),
    ]);
    await seedPerson();
  });

  it('persists sanitized timeline_event and bitemporal signal into D1 on POST /ingest (201)', async () => {
    const res = await SELF.fetch('https://example.com/ingest', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        person_id: PERSON_ID,
        source: 'voice_note',
        content: 'Met @alex_mock on 2026-10-01, email alex@example.com, phone 415-555-0199. Loves iced matcha.',
        confidence: 0.96,
        sentiment_score: 0.9,
        signal_topic: 'beverage_preference',
        signal_value: 'loves_iced_matcha',
        signal_category: 'preference',
        occurred_at: '2026-10-01T18:00:00Z',
      }),
    });

    expect(res.status).toBe(201);
    const body = (await res.json()) as {
      status: string;
      event_id: string;
      sanitized_content: string;
      redacted_entities: string[];
      bitemporal_update: { action: string; new_signal_id: string };
    };

    expect(body.status).toBe('persisted');
    expect(body.redacted_entities).toEqual(['EMAIL', 'PHONE', 'HANDLE']);
    expect(body.sanitized_content).not.toContain('alex@example.com');
    expect(body.sanitized_content).not.toContain('415-555-0199');
    expect(body.sanitized_content).toContain('2026-10-01');
    expect(body.bitemporal_update.action).toBe('created_signal');

    const storedEvent = await env.DB.prepare(
      'SELECT id, person_id, raw_quote, sentiment_score FROM timeline_events WHERE id = ?'
    )
      .bind(body.event_id)
      .first<{ id: string; person_id: string; raw_quote: string; sentiment_score: number }>();

    expect(storedEvent).not.toBeNull();
    expect(storedEvent?.person_id).toBe(PERSON_ID);
    expect(storedEvent?.raw_quote).toBe(body.sanitized_content);
    expect(storedEvent?.sentiment_score).toBe(0.9);
  });

  it('deduplicates repeated POST /ingest via D1 idempotency_keys without creating duplicate rows', async () => {
    const payload = {
      person_id: PERSON_ID,
      source: 'chat_log',
      content: 'Mentioned liking Pour-over coffee.',
      confidence: 0.95,
      signal_topic: 'coffee_style',
      signal_value: 'pour_over',
      occurred_at: '2026-10-05T10:00:00Z',
    };

    const first = await SELF.fetch('https://example.com/ingest', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(payload),
    });
    expect(first.status).toBe(201);

    const second = await SELF.fetch('https://example.com/ingest', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(payload),
    });
    expect(second.status).toBe(200);
    const secondBody = (await second.json()) as { status: string };
    expect(secondBody.status).toBe('deduplicated');

    const countRow = await env.DB.prepare('SELECT COUNT(*) as cnt FROM timeline_events WHERE person_id = ?')
      .bind(PERSON_ID)
      .first<{ cnt: number }>();
    expect(countRow?.cnt).toBe(1);
  });

  it('handles same-value reassertion, bitemporal superseding, and out-of-order late events accurately', async () => {
    // 1. Initial preference on Oct 1
    const r1 = await SELF.fetch('https://example.com/ingest', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        person_id: PERSON_ID,
        source: 'voice_note',
        content: 'Loves iced matcha.',
        confidence: 0.95,
        signal_topic: 'beverage_preference',
        signal_value: 'loves_iced_matcha',
        occurred_at: '2026-10-01T18:00:00Z',
      }),
    });
    expect(r1.status).toBe(201);
    const b1 = (await r1.json()) as { bitemporal_update: { new_signal_id: string } };

    // 2. Same value re-asserted on Oct 15 -> must NOT duplicate active row
    const r2 = await SELF.fetch('https://example.com/ingest', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        person_id: PERSON_ID,
        source: 'manual',
        content: 'Still loves iced matcha.',
        confidence: 0.95,
        signal_topic: 'beverage_preference',
        signal_value: 'loves_iced_matcha',
        occurred_at: '2026-10-15T12:00:00Z',
      }),
    });
    expect(r2.status).toBe(201);
    const b2 = (await r2.json()) as { bitemporal_update: { action: string; active_signal_id: string } };
    expect(b2.bitemporal_update.action).toBe('unchanged_existing_signal');
    expect(b2.bitemporal_update.active_signal_id).toBe(b1.bitemporal_update.new_signal_id);

    // 3. Contradicting preference on Nov 15 -> supersedes Oct 1 row
    const r3 = await SELF.fetch('https://example.com/ingest', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        person_id: PERSON_ID,
        source: 'chat_log',
        content: 'Quit caffeine, only drinks decaf rooibos now.',
        confidence: 0.95,
        signal_topic: 'beverage_preference',
        signal_value: 'no_caffeine_rooibos_only',
        occurred_at: '2026-11-15T20:30:00Z',
      }),
    });
    expect(r3.status).toBe(201);
    const b3 = (await r3.json()) as {
      bitemporal_update: { action: string; deprecated_signal_id: string; new_signal_id: string };
    };
    expect(b3.bitemporal_update.action).toBe('superseded_conflicting_signal');
    expect(b3.bitemporal_update.deprecated_signal_id).toBe(b1.bitemporal_update.new_signal_id);

    // 4. Out-of-order historical event from July 10 -> fills [Jul 10, Oct 1) without overlapping later intervals
    const r4 = await SELF.fetch('https://example.com/ingest', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        person_id: PERSON_ID,
        source: 'chat_log',
        content: 'Backfill: drank espresso tonics in July.',
        confidence: 0.95,
        signal_topic: 'beverage_preference',
        signal_value: 'espresso_tonic',
        occurred_at: '2026-07-10T10:00:00Z',
      }),
    });
    expect(r4.status).toBe(201);
    const b4 = (await r4.json()) as {
      bitemporal_update: { action: string; valid_from: string; valid_to: string; active_value: string };
    };
    expect(b4.bitemporal_update.action).toBe('recorded_historical_signal');
    expect(b4.bitemporal_update.valid_from).toBe('2026-07-10T10:00:00.000Z');
    expect(b4.bitemporal_update.valid_to).toBe('2026-10-01T18:00:00.000Z');
    expect(b4.bitemporal_update.active_value).toBe('no_caffeine_rooibos_only');

    // Verify GET /people/:id/signals returns only 1 active signal by default, and 3 total with history
    const activeRes = await SELF.fetch(`https://example.com/people/${PERSON_ID}/signals`, {
      headers: authHeaders(),
    });
    expect(activeRes.status).toBe(200);
    const activeJson = (await activeRes.json()) as {
      count: number;
      signals: Array<{ value: string; valid_to: string | null }>;
    };
    expect(activeJson.count).toBe(1);
    expect(activeJson.signals[0].value).toBe('no_caffeine_rooibos_only');

    const histRes = await SELF.fetch(
      `https://example.com/people/${PERSON_ID}/signals?include_history=true`,
      { headers: authHeaders() }
    );
    expect(histRes.status).toBe(200);
    const histJson = (await histRes.json()) as { count: number; signals: SignalRow[] };
    expect(histJson.count).toBe(3);
    expectNoOverlap(histJson.signals);

    // Verify GET /people/:id/timeline returns all 4 events ordered descending
    const timelineRes = await SELF.fetch(`https://example.com/people/${PERSON_ID}/timeline`, {
      headers: authHeaders(),
    });
    expect(timelineRes.status).toBe(200);
    const timelineJson = (await timelineRes.json()) as { count: number };
    expect(timelineJson.count).toBe(4);
  });

  it('persists low-confidence or missing person_id payloads into D1 disambiguation_queue', async () => {
    const res = await SELF.fetch('https://example.com/ingest', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        person_id: null,
        source: 'voice_note',
        content: 'She mentioned her birthday is next week; call 415-555-0199.',
        confidence: 0.61,
      }),
    });

    expect(res.status).toBe(201);
    const body = (await res.json()) as { status: string; queue_id: string };
    expect(body.status).toBe('routed_to_disambiguation_queue');

    const row = await env.DB.prepare(
      'SELECT id, sanitized_content, confidence, status FROM disambiguation_queue WHERE id = ?'
    )
      .bind(body.queue_id)
      .first<{ id: string; sanitized_content: string; confidence: number; status: string }>();

    expect(row).not.toBeNull();
    expect(row?.sanitized_content).not.toContain('415-555-0199');
    expect(row?.confidence).toBe(0.61);
    expect(row?.status).toBe('pending');
  });

  it('rejects unknown person_id with 422 and invalid signal_topic/value pairing with 400', async () => {
    const unknownRes = await SELF.fetch('https://example.com/ingest', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        person_id: 'nonexistent-person',
        source: 'manual',
        content: 'Should fail person lookup.',
        confidence: 0.95,
      }),
    });
    expect(unknownRes.status).toBe(422);

    const invalidPairRes = await SELF.fetch('https://example.com/ingest', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        person_id: PERSON_ID,
        source: 'manual',
        content: 'Missing signal_value.',
        confidence: 0.95,
        signal_topic: 'beverage_preference',
      }),
    });
    expect(invalidPairRes.status).toBe(400);
  });

  it('runs authenticated /fixtures/verify inside an isolated sandbox without touching D1', async () => {
    const res = await SELF.fetch('https://example.com/fixtures/verify', {
      headers: authHeaders(),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      isolated_sandbox: boolean;
      passed: number;
      final_bitemporal_signal_state: Array<{ value: string; valid_to: string | null }>;
    };
    expect(body.isolated_sandbox).toBe(true);
    expect(body.passed).toBe(6);
    expect(body.final_bitemporal_signal_state).toHaveLength(3);

    // Ensure D1 timeline_events remained untouched by /fixtures/verify
    const countRow = await env.DB.prepare('SELECT COUNT(*) as cnt FROM timeline_events')
      .first<{ cnt: number }>();
    expect(countRow?.cnt).toBe(0);
  });

  it('serves authenticated GET /db/demo inspecting actual D1 tables', async () => {
    const res = await SELF.fetch('https://example.com/db/demo', {
      headers: authHeaders(),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      data_classification: string;
      is_test_data: boolean;
      counts: { people: number };
    };
    expect(body.data_classification).toBe('SYNTHETIC_TEST_ONLY');
    expect(body.is_test_data).toBe(true);
    expect(body.counts.people).toBe(1);
  });

  it('splits a closed interval when a late observation falls inside it', async () => {
    const topic = 'beverage_preference';
    expect((await ingest({ content: 'a', signal_topic: topic, signal_value: 'A', occurred_at: '2026-10-01T00:00:00Z' })).status).toBe(201);
    expect((await ingest({ content: 'b', signal_topic: topic, signal_value: 'B', occurred_at: '2026-11-15T00:00:00Z' })).status).toBe(201);

    const res = await ingest({ content: 'c', signal_topic: topic, signal_value: 'C', occurred_at: '2026-10-20T00:00:00Z' });
    expect(res.status).toBe(201);
    const body = (await res.json()) as {
      bitemporal_update: { action: string; valid_from: string; valid_to: string; truncated_signal_id: string };
    };
    expect(body.bitemporal_update.action).toBe('recorded_historical_signal');
    expect(body.bitemporal_update.valid_to).toBe('2026-11-15T00:00:00.000Z');

    const history = await signalHistory(topic);
    expectNoOverlap(history);
    expect(history.map((r) => [r.value, r.valid_from, r.valid_to])).toEqual([
      ['A', '2026-10-01T00:00:00.000Z', '2026-10-20T00:00:00.000Z'],
      ['C', '2026-10-20T00:00:00.000Z', '2026-11-15T00:00:00.000Z'],
      ['B', '2026-11-15T00:00:00.000Z', null],
    ]);
    expect(await valueAsOf(topic, '2026-10-10T00:00:00.000Z')).toEqual(['A']);
    expect(await valueAsOf(topic, '2026-10-25T00:00:00.000Z')).toEqual(['C']);
    expect(await valueAsOf(topic, '2026-12-01T00:00:00.000Z')).toEqual(['B']);

    // Same value re-asserted inside a closed interval is a no-op
    const same = await ingest({ content: 'c again', signal_topic: topic, signal_value: 'C', occurred_at: '2026-11-01T00:00:00Z' });
    const sameBody = (await same.json()) as { bitemporal_update: { action: string } };
    expect(sameBody.bitemporal_update.action).toBe('unchanged_historical_signal');
    expect(await signalHistory(topic)).toHaveLength(3);
  });

  it('produces the same non-overlapping timeline regardless of arrival order', async () => {
    const observations = [
      { value: 'V1', at: '2026-01-01T00:00:00Z' },
      { value: 'V2', at: '2026-02-01T00:00:00Z' },
      { value: 'V3', at: '2026-03-01T00:00:00Z' },
      { value: 'V4', at: '2026-04-01T00:00:00Z' },
      { value: 'V5', at: '2026-05-01T00:00:00Z' },
    ];
    const orders = [
      [0, 1, 2, 3, 4],
      [4, 3, 2, 1, 0],
      [2, 0, 4, 1, 3],
      [1, 4, 0, 3, 2],
    ];
    const expected = observations.map((o, i) => [
      o.value,
      new Date(o.at).toISOString(),
      i + 1 < observations.length ? new Date(observations[i + 1].at).toISOString() : null,
    ]);

    for (const order of orders) {
      const store = new MemoryIngestStore(['p1']);
      for (const idx of order) {
        const payload: ParsedIngestPayload = {
          person_id: 'p1',
          source: 'manual',
          content: `obs ${idx}`,
          confidence: 0.95,
          signal_topic: 'topic',
          signal_value: observations[idx].value,
          signal_category: 'preference',
          occurred_at: observations[idx].at,
        };
        const outcome = await ingestEvent(payload, store, '2026-11-21T00:00:00Z');
        expect(outcome.status).toBe('persisted');
      }
      const rows = [...store.signals].sort((a, b) => Date.parse(a.valid_from) - Date.parse(b.valid_from));
      expectNoOverlap(rows);
      expect(rows.map((r) => [r.value, r.valid_from, r.valid_to]), `order ${order.join(',')}`).toEqual(expected);
    }
  });

  it('rejects overlapping signal rows at the database level', async () => {
    await ingest({ content: 'a', signal_topic: 't', signal_value: 'A', occurred_at: '2026-10-01T00:00:00Z' });
    await ingest({ content: 'b', signal_topic: 't', signal_value: 'B', occurred_at: '2026-11-15T00:00:00Z' });
    await expect(
      env.DB.prepare(
        "INSERT INTO signals (id, person_id, category, topic, value, content, valid_from, valid_to, recorded_at) VALUES ('sig_manual', ?, 'preference', 't', 'X', 't: X', '2026-07-01T00:00:00.000Z', '2026-11-15T00:00:00.000Z', '2026-11-21T00:00:00.000Z')"
      )
        .bind(PERSON_ID)
        .run()
    ).rejects.toThrow(/signal_valid_time_overlap/);
  });

  it('redacts PII in signal_topic and signal_value before storing signals', async () => {
    const res = await ingest({
      content: 'Shared contact details.',
      signal_topic: 'contact for bob@example.com',
      signal_value: 'call 415-555-0199 or email bob@example.com',
      occurred_at: '2026-10-01T00:00:00Z',
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { redacted_entities: string[] };
    expect(body.redacted_entities).toEqual(['EMAIL', 'PHONE']);

    const row = await env.DB.prepare('SELECT topic, value, content FROM signals WHERE person_id = ?')
      .bind(PERSON_ID)
      .first<{ topic: string; value: string; content: string }>();
    const topicMatch = row?.topic.match(/^contact for (\[EMAIL_[0-9a-f]{12}\])$/);
    expect(topicMatch).not.toBeNull();
    const emailToken = topicMatch![1];
    expect(row?.value).toMatch(/^call \[PHONE_[0-9a-f]{12}\] or email \[EMAIL_[0-9a-f]{12}\]$/);
    expect(row?.value.endsWith(emailToken)).toBe(true);
    for (const field of [row?.topic, row?.value, row?.content]) {
      expect(field).not.toContain('bob@example.com');
      expect(field).not.toContain('415-555-0199');
    }
  });

  it('redacts PII in signal_topic and signal_value before storing in disambiguation_queue', async () => {
    const res = await ingest({
      person_id: null,
      content: 'Not sure who this was.',
      confidence: 0.5,
      signal_topic: 'phone 415-555-0199',
      signal_value: 'Name: Alice Smith, alice@example.com',
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { queue_id: string };
    const row = await env.DB.prepare('SELECT signal_topic, signal_value, redacted_entities FROM disambiguation_queue WHERE id = ?')
      .bind(body.queue_id)
      .first<{ signal_topic: string; signal_value: string; redacted_entities: string }>();
    expect(row?.signal_topic).toMatch(/^phone \[PHONE_[0-9a-f]{12}\]$/);
    expect(row?.signal_value).toMatch(/^Name: \[PERSON_[0-9a-f]{12}\], \[EMAIL_[0-9a-f]{12}\]$/);
    expect(JSON.parse(row?.redacted_entities ?? '[]')).toEqual(['PHONE', 'EMAIL', 'PERSON']);
  });

  it('requires an explicit confidence value', async () => {
    const res = await SELF.fetch('https://example.com/ingest', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ person_id: PERSON_ID, source: 'manual', content: 'maybe her?' }),
    });
    expect(res.status).toBe(400);
    const count = await env.DB.prepare('SELECT COUNT(*) as cnt FROM timeline_events').first<{ cnt: number }>();
    expect(count?.cnt).toBe(0);
  });

  it('handles concurrent updates to the same topic without 500s or overlapping intervals', async () => {
    const topic = 'concurrent_topic';
    expect((await ingest({ content: 'base', signal_topic: topic, signal_value: 'BASE', occurred_at: '2026-10-01T00:00:00Z' })).status).toBe(201);

    const responses = await Promise.all(
      [1, 2, 3, 4, 5, 6].map((i) =>
        ingest({ content: `c${i}`, signal_topic: topic, signal_value: `V${i}`, occurred_at: `2026-11-0${i}T00:00:00Z` })
      )
    );
    const statuses = responses.map((r) => r.status);
    for (const status of statuses) {
      expect([201, 409]).toContain(status);
    }

    const history = await signalHistory(topic);
    expectNoOverlap(history);
    expect(history.filter((r) => r.valid_to === null)).toHaveLength(1);
    expect(history).toHaveLength(1 + statuses.filter((s) => s === 201).length);
  });

  it('hides /db/demo and /fixtures/verify outside development', async () => {
    for (const environment of [undefined, 'production']) {
      for (const path of ['/db/demo', '/fixtures/verify']) {
        const req = new Request(`https://example.com${path}`, { headers: { Authorization: `Bearer ${env.API_KEY}` } });
        const res = await worker.fetch(req, { DB: env.DB, API_KEY: env.API_KEY, ENVIRONMENT: environment });
        expect(res.status, `${path} with ENVIRONMENT=${environment}`).toBe(404);
      }
    }
  });

  it('keeps redacted signal values and topics comparable across requests', async () => {
    const topic = 'preferred_contact';
    expect((await ingest({ content: 'a', signal_topic: topic, signal_value: 'alice@example.com', occurred_at: '2026-10-01T00:00:00Z' })).status).toBe(201);

    // Different email -> must supersede, not be treated as unchanged
    const changed = await ingest({ content: 'b', signal_topic: topic, signal_value: 'bob@example.com', occurred_at: '2026-10-02T00:00:00Z' });
    const changedBody = (await changed.json()) as { bitemporal_update: { action: string } };
    expect(changedBody.bitemporal_update.action).toBe('superseded_conflicting_signal');

    // Same email (different case, different surrounding content) -> unchanged
    const same = await ingest({
      content: 'mentions carol@example.com first',
      signal_topic: topic,
      signal_value: 'BOB@example.com',
      occurred_at: '2026-10-03T00:00:00Z',
    });
    const sameBody = (await same.json()) as { bitemporal_update: { action: string } };
    expect(sameBody.bitemporal_update.action).toBe('unchanged_existing_signal');

    // Topics redacted from different emails stay distinct histories
    await ingest({ content: 'c', signal_topic: 'notes about alice@example.com', signal_value: 'X', occurred_at: '2026-10-01T00:00:00Z' });
    await ingest({ content: 'd', signal_topic: 'notes about bob@example.com', signal_value: 'Y', occurred_at: '2026-10-01T00:00:00Z' });
    const topics = await env.DB.prepare("SELECT DISTINCT topic FROM signals WHERE topic LIKE 'notes about %' AND valid_to IS NULL")
      .all<{ topic: string }>();
    expect(topics.results).toHaveLength(2);
  });

  it('refuses /ingest outside development when PII_TOKEN_KEY is unset', async () => {
    const makeReq = () =>
      new Request('https://example.com/ingest', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ person_id: PERSON_ID, source: 'manual', content: 'x', confidence: 0.95 }),
      });
    const refused = await worker.fetch(makeReq(), { DB: env.DB, API_KEY: env.API_KEY, ENVIRONMENT: 'production' });
    expect(refused.status).toBe(503);
    const accepted = await worker.fetch(makeReq(), {
      DB: env.DB,
      API_KEY: env.API_KEY,
      ENVIRONMENT: 'production',
      PII_TOKEN_KEY: 'prod-secret',
    });
    expect(accepted.status).toBe(201);
  });
});
