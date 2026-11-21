import type { InferInsertModel } from 'drizzle-orm';
import { people, timelineEvents, signals } from './schema';

export type NewPerson = InferInsertModel<typeof people>;
export type NewTimelineEvent = InferInsertModel<typeof timelineEvents>;
export type NewSignal = InferInsertModel<typeof signals>;

/**
 * Synthetic test dataset matching src/schema.ts and sql/seed_test_demo.sql.
 * All rows are explicitly marked as synthetic test data ([TEST_DATA]).
 */
export const DEMO_PEOPLE: NewPerson[] = [
  {
    id: '00000000-0000-4000-8000-000000000101',
    alias: '[TEST_DATA] Alex Chen (Synthetic Demo)',
    relationshipState: 'active_test',
    keyDates: {
      is_test: true,
      env: 'synthetic_demo',
      birthday: '2026-11-28',
      met_at: '2026-09-15',
    },
    createdAt: '2026-10-01T18:00:00Z',
  },
  {
    id: '00000000-0000-4000-8000-000000000102',
    alias: '[TEST_DATA] Jordan Lee (Synthetic Demo)',
    relationshipState: 'active_test',
    keyDates: {
      is_test: true,
      env: 'synthetic_demo',
      anniversary: '2026-12-10',
      last_catchup: '2026-11-10',
    },
    createdAt: '2026-10-12T14:30:00Z',
  },
  {
    id: '00000000-0000-4000-8000-000000000103',
    alias: '[TEST_DATA] Sam Rivera (Synthetic Demo)',
    relationshipState: 'reconnect_needed_test',
    keyDates: {
      is_test: true,
      env: 'synthetic_demo',
      birthday: '2026-04-22',
      moved_city: '2026-10-01',
    },
    createdAt: '2026-10-20T09:15:00Z',
  },
];

export const DEMO_TIMELINE_EVENTS: NewTimelineEvent[] = [
  {
    id: '00000000-0000-4000-8000-000000000201',
    personId: '00000000-0000-4000-8000-000000000101',
    source: 'voice_note',
    summary: '[TEST_DATA] Coffee catch-up discussing iced matcha preference',
    rawQuote: '[TEST_QUOTE] Met [HANDLE_1] for coffee; mentioned loving iced matcha earlier this fall.',
    redactedEntities: ['HANDLE'],
    sentimentScore: 0.88,
    idempotencyKey: 'seed_test_event_0201',
    occurredAt: '2026-10-01T18:00:00Z',
    recordedAt: '2026-10-01T18:00:05Z',
  },
  {
    id: '00000000-0000-4000-8000-000000000202',
    personId: '00000000-0000-4000-8000-000000000101',
    source: 'chat_log',
    summary: '[TEST_DATA] Chat update confirming switch to decaf rooibos only',
    rawQuote: '[TEST_QUOTE] Update: totally quit caffeine this month, switching to decaf rooibos only.',
    redactedEntities: [],
    sentimentScore: 0.79,
    idempotencyKey: 'seed_test_event_0202',
    occurredAt: '2026-11-15T20:30:00Z',
    recordedAt: '2026-11-15T20:30:05Z',
  },
  {
    id: '00000000-0000-4000-8000-000000000203',
    personId: '00000000-0000-4000-8000-000000000102',
    source: 'manual',
    summary: '[TEST_DATA] Evening walk talking about vintage jazz vinyl collecting',
    rawQuote: '[TEST_QUOTE] Looking for a 1960s Miles Davis pressing for the living room turntable.',
    redactedEntities: [],
    sentimentScore: 0.93,
    idempotencyKey: 'seed_test_event_0203',
    occurredAt: '2026-11-10T19:45:00Z',
    recordedAt: '2026-11-10T19:45:05Z',
  },
  {
    id: '00000000-0000-4000-8000-000000000204',
    personId: '00000000-0000-4000-8000-000000000103',
    source: 'chat_log',
    summary: '[TEST_DATA] Quick check-in after move; requested weekend offline time',
    rawQuote: '[TEST_QUOTE] Trying to keep weekends completely offline after the move.',
    redactedEntities: [],
    sentimentScore: 0.72,
    idempotencyKey: 'seed_test_event_0204',
    occurredAt: '2026-11-18T11:20:00Z',
    recordedAt: '2026-11-18T11:20:05Z',
  },
];

export const DEMO_SIGNALS: NewSignal[] = [
  {
    id: '00000000-0000-4000-8000-000000000301',
    personId: '00000000-0000-4000-8000-000000000101',
    category: 'preference',
    topic: 'beverage_preference',
    value: 'loves_iced_matcha',
    content: '[TEST_DATA] [SUPERSEDED] Beverage preference: loves iced matcha',
    validFrom: '2026-10-01T18:00:00Z',
    validTo: '2026-11-15T20:30:00Z',
    recordedAt: '2026-10-01T18:00:05Z',
    supersededAt: '2026-11-15T20:30:05Z',
    supersededBy: '00000000-0000-4000-8000-000000000302',
  },
  {
    id: '00000000-0000-4000-8000-000000000302',
    personId: '00000000-0000-4000-8000-000000000101',
    category: 'preference',
    topic: 'beverage_preference',
    value: 'no_caffeine_rooibos_only',
    content: '[TEST_DATA] [ACTIVE] Beverage preference: caffeine-free decaf rooibos only',
    validFrom: '2026-11-15T20:30:00Z',
    validTo: null,
    recordedAt: '2026-11-15T20:30:05Z',
    supersededAt: null,
    supersededBy: null,
  },
  {
    id: '00000000-0000-4000-8000-000000000303',
    personId: '00000000-0000-4000-8000-000000000102',
    category: 'gift_idea',
    topic: 'vinyl_wishlist',
    value: '1960s_miles_davis_pressing',
    content: '[TEST_DATA] [ACTIVE] Gift idea: 1960s Miles Davis jazz vinyl record',
    validFrom: '2026-11-10T19:45:00Z',
    validTo: null,
    recordedAt: '2026-11-10T19:45:05Z',
    supersededAt: null,
    supersededBy: null,
  },
  {
    id: '00000000-0000-4000-8000-000000000304',
    personId: '00000000-0000-4000-8000-000000000103',
    category: 'boundary',
    topic: 'weekend_availability',
    value: 'no_work_or_tech_messages_on_weekends',
    content: '[TEST_DATA] [ACTIVE] Communication boundary: prefers zero work/tech messages on weekends',
    validFrom: '2026-11-18T11:20:00Z',
    validTo: null,
    recordedAt: '2026-11-18T11:20:05Z',
    supersededAt: null,
    supersededBy: null,
  },
];
