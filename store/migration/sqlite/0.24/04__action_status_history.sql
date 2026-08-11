CREATE TABLE action_status_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  action_id INTEGER NOT NULL,
  creator_id INTEGER NOT NULL,
  from_status TEXT NOT NULL CHECK (from_status IN ('TODO', 'IN_PROGRESS', 'DONE', 'TERMINATED')),
  to_status TEXT NOT NULL CHECK (to_status IN ('TODO', 'IN_PROGRESS', 'DONE', 'TERMINATED')),
  reason TEXT NOT NULL DEFAULT '',
  effective_date TEXT NOT NULL,
  created_ts BIGINT NOT NULL DEFAULT (strftime('%s', 'now'))
);

CREATE INDEX idx_action_status_history_action_created ON action_status_history (action_id, created_ts);
CREATE INDEX idx_action_status_history_creator_created ON action_status_history (creator_id, created_ts);

INSERT INTO action_status_history (
  action_id, creator_id, from_status, to_status, reason, effective_date, created_ts
)
SELECT
  id,
  creator_id,
  'IN_PROGRESS',
  'TERMINATED',
  termination_reason,
  COALESCE(strftime('%Y-%m-%d', terminated_ts, 'unixepoch', 'localtime'), strftime('%Y-%m-%d', 'now', 'localtime')),
  COALESCE(terminated_ts, updated_ts)
FROM action
WHERE status = 'TERMINATED';
