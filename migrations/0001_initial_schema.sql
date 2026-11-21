CREATE TABLE IF NOT EXISTS people (
  id TEXT PRIMARY KEY,
  alias TEXT NOT NULL,
  relationship_state TEXT NOT NULL DEFAULT 'active',
  key_dates TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS timeline_events (
  id TEXT PRIMARY KEY,
  person_id TEXT NOT NULL REFERENCES people(id),
  source TEXT NOT NULL DEFAULT 'manual',
  summary TEXT NOT NULL,
  raw_quote TEXT,
  redacted_entities TEXT NOT NULL DEFAULT '[]',
  sentiment_score REAL,
  idempotency_key TEXT UNIQUE,
  occurred_at TEXT NOT NULL,
  recorded_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_timeline_events_person_occurred
  ON timeline_events(person_id, occurred_at);

CREATE TABLE IF NOT EXISTS signals (
  id TEXT PRIMARY KEY,
  person_id TEXT NOT NULL REFERENCES people(id),
  category TEXT NOT NULL DEFAULT 'preference',
  topic TEXT NOT NULL,
  value TEXT NOT NULL,
  content TEXT NOT NULL,
  valid_from TEXT NOT NULL,
  valid_to TEXT,
  recorded_at TEXT NOT NULL,
  superseded_at TEXT,
  superseded_by TEXT
);

CREATE INDEX IF NOT EXISTS idx_signals_person_topic
  ON signals(person_id, topic, valid_from);

CREATE UNIQUE INDEX IF NOT EXISTS idx_signals_one_active_per_topic
  ON signals(person_id, topic)
  WHERE valid_to IS NULL;

CREATE TABLE IF NOT EXISTS idempotency_keys (
  key TEXT PRIMARY KEY,
  status TEXT NOT NULL,
  response_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS disambiguation_queue (
  id TEXT PRIMARY KEY,
  idempotency_key TEXT NOT NULL UNIQUE,
  source TEXT NOT NULL,
  sanitized_content TEXT NOT NULL,
  redacted_entities TEXT NOT NULL DEFAULT '[]',
  confidence REAL NOT NULL,
  signal_topic TEXT,
  signal_value TEXT,
  signal_category TEXT,
  occurred_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL
);
