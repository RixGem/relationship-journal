-- Non-destructive, idempotent synthetic test seed for relationship-journal D1.
-- Assumes migrations/0001_initial_schema.sql has already been applied.

-- 1. people (all rows explicitly labeled as [TEST_DATA] / is_test: true)
INSERT OR IGNORE INTO people (id, alias, relationship_state, key_dates, created_at) VALUES
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

-- 2. timeline_events (all rows explicitly labeled as [TEST_DATA] / [TEST_QUOTE])
INSERT OR IGNORE INTO timeline_events (
  id, person_id, source, summary, raw_quote, redacted_entities, sentiment_score, idempotency_key, occurred_at, recorded_at
) VALUES
  (
    '00000000-0000-4000-8000-000000000201',
    '00000000-0000-4000-8000-000000000101',
    'voice_note',
    '[TEST_DATA] Coffee catch-up discussing iced matcha preference',
    '[TEST_QUOTE] Met [HANDLE_1] for coffee; mentioned loving iced matcha earlier this fall.',
    '["HANDLE"]',
    0.88,
    'seed_test_event_0201',
    '2026-10-01T18:00:00Z',
    '2026-10-01T18:00:05Z'
  ),
  (
    '00000000-0000-4000-8000-000000000202',
    '00000000-0000-4000-8000-000000000101',
    'chat_log',
    '[TEST_DATA] Chat update confirming switch to decaf rooibos only',
    '[TEST_QUOTE] Update: totally quit caffeine this month, switching to decaf rooibos only.',
    '[]',
    0.79,
    'seed_test_event_0202',
    '2026-11-15T20:30:00Z',
    '2026-11-15T20:30:05Z'
  ),
  (
    '00000000-0000-4000-8000-000000000203',
    '00000000-0000-4000-8000-000000000102',
    'manual',
    '[TEST_DATA] Evening walk talking about vintage jazz vinyl collecting',
    '[TEST_QUOTE] Looking for a 1960s Miles Davis pressing for the living room turntable.',
    '[]',
    0.93,
    'seed_test_event_0203',
    '2026-11-10T19:45:00Z',
    '2026-11-10T19:45:05Z'
  ),
  (
    '00000000-0000-4000-8000-000000000204',
    '00000000-0000-4000-8000-000000000103',
    'chat_log',
    '[TEST_DATA] Quick check-in after move; requested weekend offline time',
    '[TEST_QUOTE] Trying to keep weekends completely offline after the move.',
    '[]',
    0.72,
    'seed_test_event_0204',
    '2026-11-18T11:20:00Z',
    '2026-11-18T11:20:05Z'
  );

-- 3. signals (bitemporal test records explicitly labeled as [TEST_DATA])
INSERT OR IGNORE INTO signals (
  id, person_id, category, topic, value, content, valid_from, valid_to, recorded_at, superseded_at, superseded_by
) VALUES
  (
    '00000000-0000-4000-8000-000000000301',
    '00000000-0000-4000-8000-000000000101',
    'preference',
    'beverage_preference',
    'loves_iced_matcha',
    '[TEST_DATA] [SUPERSEDED] Beverage preference: loves iced matcha',
    '2026-10-01T18:00:00Z',
    '2026-11-15T20:30:00Z',
    '2026-10-01T18:00:05Z',
    '2026-11-15T20:30:05Z',
    '00000000-0000-4000-8000-000000000302'
  ),
  (
    '00000000-0000-4000-8000-000000000302',
    '00000000-0000-4000-8000-000000000101',
    'preference',
    'beverage_preference',
    'no_caffeine_rooibos_only',
    '[TEST_DATA] [ACTIVE] Beverage preference: caffeine-free decaf rooibos only',
    '2026-11-15T20:30:00Z',
    NULL,
    '2026-11-15T20:30:05Z',
    NULL,
    NULL
  ),
  (
    '00000000-0000-4000-8000-000000000303',
    '00000000-0000-4000-8000-000000000102',
    'gift_idea',
    'vinyl_wishlist',
    '1960s_miles_davis_pressing',
    '[TEST_DATA] [ACTIVE] Gift idea: 1960s Miles Davis jazz vinyl record',
    '2026-11-10T19:45:00Z',
    NULL,
    '2026-11-10T19:45:05Z',
    NULL,
    NULL
  ),
  (
    '00000000-0000-4000-8000-000000000304',
    '00000000-0000-4000-8000-000000000103',
    'boundary',
    'weekend_availability',
    'no_work_or_tech_messages_on_weekends',
    '[TEST_DATA] [ACTIVE] Communication boundary: prefers zero work/tech messages on weekends',
    '2026-11-18T11:20:00Z',
    NULL,
    '2026-11-18T11:20:05Z',
    NULL,
    NULL
  );
