import { sql } from 'drizzle-orm';
import { index, real, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const people = sqliteTable('people', {
  id: text('id').primaryKey(),
  alias: text('alias').notNull(),
  relationshipState: text('relationship_state').notNull().default('active'),
  keyDates: text('key_dates', { mode: 'json' }).$type<Record<string, unknown>>().notNull().default({}),
  createdAt: text('created_at').notNull(),
});

export const timelineEvents = sqliteTable(
  'timeline_events',
  {
    id: text('id').primaryKey(),
    personId: text('person_id')
      .notNull()
      .references(() => people.id),
    source: text('source').notNull().default('manual'),
    summary: text('summary').notNull(),
    rawQuote: text('raw_quote'),
    redactedEntities: text('redacted_entities', { mode: 'json' }).$type<string[]>().notNull().default([]),
    sentimentScore: real('sentiment_score'),
    idempotencyKey: text('idempotency_key').unique(),
    occurredAt: text('occurred_at').notNull(),
    recordedAt: text('recorded_at').notNull(),
  },
  (table) => [index('idx_timeline_events_person_occurred').on(table.personId, table.occurredAt)]
);

export const signals = sqliteTable(
  'signals',
  {
    id: text('id').primaryKey(),
    personId: text('person_id')
      .notNull()
      .references(() => people.id),
    category: text('category').notNull().default('preference'),
    topic: text('topic').notNull(),
    value: text('value').notNull(),
    content: text('content').notNull(),
    validFrom: text('valid_from').notNull(),
    validTo: text('valid_to'),
    recordedAt: text('recorded_at').notNull(),
    supersededAt: text('superseded_at'),
    supersededBy: text('superseded_by'),
  },
  (table) => [
    index('idx_signals_person_topic').on(table.personId, table.topic, table.validFrom),
    uniqueIndex('idx_signals_one_active_per_topic')
      .on(table.personId, table.topic)
      .where(sql`${table.validTo} IS NULL`),
  ]
);

export const idempotencyKeys = sqliteTable('idempotency_keys', {
  key: text('key').primaryKey(),
  status: text('status').notNull(),
  responseJson: text('response_json').notNull(),
  createdAt: text('created_at').notNull(),
});

export const disambiguationQueue = sqliteTable('disambiguation_queue', {
  id: text('id').primaryKey(),
  idempotencyKey: text('idempotency_key').notNull().unique(),
  source: text('source').notNull(),
  sanitizedContent: text('sanitized_content').notNull(),
  redactedEntities: text('redacted_entities', { mode: 'json' }).$type<string[]>().notNull().default([]),
  confidence: real('confidence').notNull(),
  signalTopic: text('signal_topic'),
  signalValue: text('signal_value'),
  signalCategory: text('signal_category'),
  occurredAt: text('occurred_at').notNull(),
  status: text('status').notNull().default('pending'),
  createdAt: text('created_at').notNull(),
});
