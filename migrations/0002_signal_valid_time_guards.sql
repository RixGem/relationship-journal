-- Enforce non-overlapping half-open [valid_from, valid_to) intervals per (person_id, topic).
-- julianday() normalizes ISO-8601 strings with or without fractional seconds / 'Z'.
-- Zero-length intervals (valid_from = valid_to) are ignored by the overlap check.

CREATE TRIGGER IF NOT EXISTS trg_signals_valid_interval_insert
BEFORE INSERT ON signals
WHEN NEW.valid_to IS NOT NULL AND julianday(NEW.valid_to) < julianday(NEW.valid_from)
BEGIN
  SELECT RAISE(ABORT, 'signal_invalid_interval');
END;

CREATE TRIGGER IF NOT EXISTS trg_signals_valid_interval_update
BEFORE UPDATE OF valid_from, valid_to ON signals
WHEN NEW.valid_to IS NOT NULL AND julianday(NEW.valid_to) < julianday(NEW.valid_from)
BEGIN
  SELECT RAISE(ABORT, 'signal_invalid_interval');
END;

CREATE TRIGGER IF NOT EXISTS trg_signals_no_overlap_insert
BEFORE INSERT ON signals
WHEN (NEW.valid_to IS NULL OR julianday(NEW.valid_to) > julianday(NEW.valid_from))
  AND EXISTS (
    SELECT 1 FROM signals s
    WHERE s.person_id = NEW.person_id
      AND s.topic = NEW.topic
      AND (s.valid_to IS NULL OR julianday(s.valid_to) > julianday(s.valid_from))
      AND julianday(s.valid_from) < COALESCE(julianday(NEW.valid_to), 1e12)
      AND COALESCE(julianday(s.valid_to), 1e12) > julianday(NEW.valid_from)
  )
BEGIN
  SELECT RAISE(ABORT, 'signal_valid_time_overlap');
END;

CREATE TRIGGER IF NOT EXISTS trg_signals_no_overlap_update
BEFORE UPDATE OF person_id, topic, valid_from, valid_to ON signals
WHEN (NEW.valid_to IS NULL OR julianday(NEW.valid_to) > julianday(NEW.valid_from))
  AND EXISTS (
    SELECT 1 FROM signals s
    WHERE s.id <> NEW.id
      AND s.person_id = NEW.person_id
      AND s.topic = NEW.topic
      AND (s.valid_to IS NULL OR julianday(s.valid_to) > julianday(s.valid_from))
      AND julianday(s.valid_from) < COALESCE(julianday(NEW.valid_to), 1e12)
      AND COALESCE(julianday(s.valid_to), 1e12) > julianday(NEW.valid_from)
  )
BEGIN
  SELECT RAISE(ABORT, 'signal_valid_time_overlap');
END;
