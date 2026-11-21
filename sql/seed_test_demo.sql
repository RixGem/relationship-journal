-- [TEST_DATA] Schema & Synthetic Demo Seed Data for relationship-journal
DROP TABLE IF EXISTS signals;
DROP TABLE IF EXISTS timeline_events;
DROP TABLE IF EXISTS people;

CREATE TABLE people (
  id TEXT PRIMARY KEY,
  alias TEXT NOT NULL,
  relationship_state TEXT DEFAULT 'active_test',
  key_dates TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE timeline_events (
  id TEXT PRIMARY KEY,
  person_id TEXT NOT NULL REFERENCES people(id),
  summary TEXT NOT NULL,
  raw_quote TEXT,
  sentiment_score REAL,
  occurred_at TEXT NOT NULL
);

CREATE TABLE signals (
  id TEXT PRIMARY KEY,
  person_id TEXT NOT NULL REFERENCES people(id),
  category TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TEXT NOT NULL
);

-- 1. people (All rows explicitly tagged as [TEST_DATA] / is_test: true)
INSERT INTO people (id, alias, relationship_state, key_dates, created_at) VALUES
  (
    '00000000-0000-4000-8000-000000000101',
    '[TEST_DATA] Alex Chen (Synthetic Demo)',
    'active_test',
    '{"is_test":true,"env":"synthetic_demo","birthday":"2026-11-28","met_at":"2026-09-15"}',
    '2026-10-01T18:00:00Z'
  ),
  (
    '00000000-0000-4000-8000-000000000102',
    '[TEST_DATA] Jordan Lee (Synthetic Demo)',
    'active_test',
    '{"is_test":true,"env":"synthetic_demo","anniversary":"2026-12-10","last_catchup":"2026-11-10"}',
    '2026-10-12T14:30:00Z'
  ),
  (
    '00000000-0000-4000-8000-000000000103',
    '[TEST_DATA] Sam Rivera (Synthetic Demo)',
    'reconnect_needed_test',
    '{"is_test":true,"env":"synthetic_demo","birthday":"2026-04-22","moved_city":"2026-10-01"}',
    '2026-10-20T09:15:00Z'
  );

-- 2. timeline_events (All rows explicitly tagged as [TEST_DATA] / [TEST_QUOTE])
INSERT INTO timeline_events (id, person_id, summary, raw_quote, sentiment_score, occurred_at) VALUES
  (
    '00000000-0000-4000-8000-000000000201',
    '00000000-0000-4000-8000-000000000101',
    '[TEST_DATA] Coffee catch-up discussing iced matcha preference',
    '[TEST_QUOTE] Met [HANDLE_REDACTED] for coffee; mentioned loving iced matcha earlier this fall.',
    0.88,
    '2026-10-01T18:00:00Z'
  ),
  (
    '00000000-0000-4000-8000-000000000202',
    '00000000-0000-4000-8000-000000000101',
    '[TEST_DATA] Chat update confirming switch to decaf rooibos only',
    '[TEST_QUOTE] Update: totally quit caffeine this month, switching to decaf rooibos only.',
    0.79,
    '2026-11-15T20:30:00Z'
  ),
  (
    '00000000-0000-4000-8000-000000000203',
    '00000000-0000-4000-8000-000000000102',
    '[TEST_DATA] Evening walk talking about vintage jazz vinyl collecting',
    '[TEST_QUOTE] Looking for a 1960s Miles Davis pressing for the living room turntable.',
    0.93,
    '2026-11-10T19:45:00Z'
  ),
  (
    '00000000-0000-4000-8000-000000000204',
    '00000000-0000-4000-8000-000000000103',
    '[TEST_DATA] Quick check-in after move; requested weekend offline time',
    '[TEST_QUOTE] Trying to keep weekends completely offline after the move.',
    0.72,
    '2026-11-18T11:20:00Z'
  );

-- 3. signals (All rows explicitly tagged as [TEST_DATA])
INSERT INTO signals (id, person_id, category, content, created_at) VALUES
  (
    '00000000-0000-4000-8000-000000000301',
    '00000000-0000-4000-8000-000000000101',
    'preference',
    '[TEST_DATA] [SUPERSEDED] Beverage preference: loves iced matcha (valid_to: 2026-11-15)',
    '2026-10-01T18:00:00Z'
  ),
  (
    '00000000-0000-4000-8000-000000000302',
    '00000000-0000-4000-8000-000000000101',
    'preference',
    '[TEST_DATA] [ACTIVE] Beverage preference: caffeine-free decaf rooibos only',
    '2026-11-15T20:30:00Z'
  ),
  (
    '00000000-0000-4000-8000-000000000303',
    '00000000-0000-4000-8000-000000000102',
    'gift_idea',
    '[TEST_DATA] [ACTIVE] Gift idea: 1960s Miles Davis jazz vinyl record',
    '2026-11-10T19:45:00Z'
  ),
  (
    '00000000-0000-4000-8000-000000000304',
    '00000000-0000-4000-8000-000000000103',
    'boundary',
    '[TEST_DATA] [ACTIVE] Communication boundary: prefers zero work/tech messages on weekends',
    '2026-11-18T11:20:00Z'
  );
