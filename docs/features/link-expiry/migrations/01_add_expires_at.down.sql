-- Rollback: SQLite lacks DROP COLUMN before 3.35, so rebuild the table without expires_at.
CREATE TABLE links_new (
  code       TEXT PRIMARY KEY,
  url        TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  clicks     INTEGER NOT NULL DEFAULT 0
);
INSERT INTO links_new (code, url, created_at, clicks)
  SELECT code, url, created_at, clicks FROM links;
DROP TABLE links;
ALTER TABLE links_new RENAME TO links;
