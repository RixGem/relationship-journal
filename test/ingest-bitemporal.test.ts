import { SELF, env } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';

const PERSON_ID = '00000000-0000-4000-8000-000000000101';

function authHeaders(extra: Record<string, string> = {}): Record<string, string> {
  return {
    Authorization: `Bearer ${env.API_KEY}`,
    'Content-Type': 'application/json',
    ...extra,
  };
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

    // 4. Out-of-order historical event from July 10 -> must NOT overwrite Nov 15 active signal
    const r4 = await SELF.fetch('https://example.com/ingest', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        person_id: PERSON_ID,
        source: 'chat_log',
        content: 'Backfill: drank espresso tonics in July.',
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
    expect(b4.bitemporal_update.valid_to).toBe('2026-11-15T20:30:00.000Z');
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
    const histJson = (await histRes.json()) as { count: number };
    expect(histJson.count).toBe(3);

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
});
