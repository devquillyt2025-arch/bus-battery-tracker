-- The API also creates this table automatically on first request (see api/_lib.ts).
CREATE TABLE IF NOT EXISTS battery_records (
  id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  bus_number      TEXT NOT NULL,
  battery         TEXT,            -- legacy single-battery field
  battery1        TEXT,
  battery1_date   TEXT,
  battery2        TEXT,
  battery2_date   TEXT,
  starter         TEXT,
  starter_date    TEXT,
  alternator      TEXT,
  alternator_date TEXT,
  fan_belt        TEXT,
  fan_belt_date   TEXT,
  note            TEXT,
  history         JSONB  NOT NULL DEFAULT '[]'::jsonb,  -- RecordSnapshot[], newest first
  created_at      BIGINT NOT NULL,                       -- epoch ms
  last_updated    BIGINT NOT NULL                        -- epoch ms
);
