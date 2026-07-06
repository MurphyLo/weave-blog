-- Migration number: 0002 	 2026-07-06T00:00:00.000Z
CREATE TABLE IF NOT EXISTS poll_votes (
  poll_id TEXT NOT NULL,
  option_id TEXT NOT NULL,
  votes INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (poll_id, option_id)
);
