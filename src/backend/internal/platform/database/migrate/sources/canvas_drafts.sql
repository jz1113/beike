CREATE TABLE IF NOT EXISTS canvas_drafts (
  workspace TEXT NOT NULL,
  id TEXT NOT NULL,
  revision INTEGER NOT NULL,
  graph TEXT NOT NULL,
  prompt_changes TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (workspace, id)
);
