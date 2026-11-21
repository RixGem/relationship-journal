import { pgTable, uuid, text, timestamp, real, jsonb } from 'drizzle-orm/pg-core';

export const people = pgTable('people', {
  id: uuid('id').defaultRandom().primaryKey(),
  alias: text('alias').notNull(),
  relationshipState: text('relationship_state').default('active'),
  keyDates: jsonb('key_dates').$type<Record<string, string>>(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const timelineEvents = pgTable('timeline_events', {
  id: uuid('id').defaultRandom().primaryKey(),
  personId: uuid('person_id').references(() => people.id).notNull(),
  summary: text('summary').notNull(),
  rawQuote: text('raw_quote'),
  sentimentScore: real('sentiment_score'),
  occurredAt: timestamp('occurred_at').defaultNow().notNull(),
});

export const signals = pgTable('signals', {
  id: uuid('id').defaultRandom().primaryKey(),
  personId: uuid('person_id').references(() => people.id).notNull(),
  category: text('category').notNull(), // 'gift_idea' | 'preference' | 'boundary'
  content: text('content').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});
