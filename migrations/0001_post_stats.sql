-- Per-post view/like counters, keyed by content slug.
CREATE TABLE post_stats (
  slug  TEXT PRIMARY KEY,
  views INTEGER NOT NULL DEFAULT 0,
  likes INTEGER NOT NULL DEFAULT 0
);
