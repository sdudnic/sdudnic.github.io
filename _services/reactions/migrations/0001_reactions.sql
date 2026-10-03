CREATE TABLE reactions (
  article TEXT NOT NULL,
  reader TEXT NOT NULL,
  reaction TEXT NOT NULL CHECK (reaction IN ('like', 'heart', 'thoughtful', 'sad', 'angry')),
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (article, reader)
) WITHOUT ROWID;
CREATE INDEX reactions_totals ON reactions (article, reaction);
CREATE TABLE write_limits (
  reader TEXT PRIMARY KEY,
  window INTEGER NOT NULL,
  attempts INTEGER NOT NULL
) WITHOUT ROWID;
