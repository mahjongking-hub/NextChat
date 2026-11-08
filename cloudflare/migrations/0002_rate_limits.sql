CREATE TABLE rate_limits (
  owner_id TEXT PRIMARY KEY,
  minute INTEGER NOT NULL,
  requests INTEGER NOT NULL CHECK (requests > 0)
);
