-- PokerWiz database schema (SQLite). Runs on every start; IF NOT EXISTS keeps it idempotent.

-- One row per session. Live sessions have status 'live' and no cash_out yet.
CREATE TABLE IF NOT EXISTS sessions (
  id           TEXT PRIMARY KEY,
  date         TEXT NOT NULL,              -- YYYY-MM-DD
  game         TEXT NOT NULL,              -- NLH | PLO
  stakes       TEXT NOT NULL,              -- display label, e.g. "$1/$2"
  big_blind    REAL NOT NULL,
  venue        TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'finished',
  started_at   TEXT,                       -- ISO timestamp
  ended_at     TEXT,
  duration_min INTEGER NOT NULL DEFAULT 0,
  buy_in       REAL NOT NULL DEFAULT 0,    -- includes rebuys
  cash_out     REAL,
  hands        INTEGER NOT NULL DEFAULT 0,
  notes        TEXT NOT NULL DEFAULT '',
  rating       REAL,                       -- 0 to 5, one decimal
  tilt         INTEGER,                    -- 1 (zen) to 5 (full tilt)
  format       TEXT NOT NULL DEFAULT 'cash', -- cash | tournament (tournaments have big_blind 0)
  small_blind  REAL,
  ante         REAL,
  expenses     REAL NOT NULL DEFAULT 0,    -- tips, food, fees: counted against the result
  source       TEXT,                       -- where an imported session came from, e.g. "regroup"
  external_id  TEXT                        -- the import's own key for the session (unique, see migrations.js)
);

-- Timeline entries recorded during a live session.
CREATE TABLE IF NOT EXISTS session_events (
  id         TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  type       TEXT NOT NULL,                -- note | rebuy | hand
  text       TEXT NOT NULL DEFAULT '',
  amount     REAL,
  hand_id    TEXT,
  created_at TEXT NOT NULL
);

-- Hand histories. The full hand (cards, streets, actions) is stored as JSON in "data".
CREATE TABLE IF NOT EXISTS hands (
  id         TEXT PRIMARY KEY,
  session_id TEXT,
  date       TEXT NOT NULL,
  created_at TEXT NOT NULL,
  data       TEXT NOT NULL
);

-- Goals, stored as JSON; "position" keeps them in display order.
CREATE TABLE IF NOT EXISTS goals (
  id       TEXT PRIMARY KEY,
  position INTEGER NOT NULL,
  data     TEXT NOT NULL
);
