CREATE TABLE action (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  uid TEXT NOT NULL UNIQUE,
  creator_id INTEGER NOT NULL,
  parent_id INTEGER,
  type TEXT NOT NULL CHECK (type IN ('TASK', 'GOAL', 'PROJECT')),
  status TEXT NOT NULL CHECK (status IN ('TODO', 'IN_PROGRESS', 'DONE', 'TERMINATED')) DEFAULT 'TODO',
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  plan_date TEXT,
  deadline_ts BIGINT,
  sort_order BIGINT NOT NULL DEFAULT 0,
  goal_current REAL,
  goal_target REAL,
  goal_unit TEXT,
  pinned_ts BIGINT,
  created_ts BIGINT NOT NULL DEFAULT (strftime('%s', 'now')),
  updated_ts BIGINT NOT NULL DEFAULT (strftime('%s', 'now')),
  completed_ts BIGINT,
  termination_reason TEXT NOT NULL DEFAULT '',
  terminated_ts BIGINT,
  row_status TEXT NOT NULL CHECK (row_status IN ('NORMAL', 'ARCHIVED')) DEFAULT 'NORMAL'
);

CREATE INDEX idx_action_creator_id ON action (creator_id);
CREATE INDEX idx_action_parent_id ON action (parent_id);
CREATE INDEX idx_action_creator_plan_date ON action (creator_id, plan_date);
CREATE INDEX idx_action_creator_status ON action (creator_id, status);
CREATE INDEX idx_action_creator_type ON action (creator_id, type);
CREATE INDEX idx_action_creator_pinned_ts ON action (creator_id, pinned_ts);

CREATE TABLE action_goal_record (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  uid TEXT NOT NULL UNIQUE,
  action_id INTEGER NOT NULL,
  creator_id INTEGER NOT NULL,
  delta REAL NOT NULL,
  value_after REAL NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  recorded_ts BIGINT NOT NULL,
  created_ts BIGINT NOT NULL DEFAULT (strftime('%s', 'now'))
);

CREATE INDEX idx_action_goal_record_action_id ON action_goal_record (action_id);
CREATE INDEX idx_action_goal_record_creator_id ON action_goal_record (creator_id);

CREATE TABLE memo_action_relation (
  memo_id INTEGER NOT NULL,
  action_id INTEGER NOT NULL,
  creator_id INTEGER NOT NULL,
  type TEXT NOT NULL DEFAULT 'REFERENCE',
  created_ts BIGINT NOT NULL DEFAULT (strftime('%s', 'now')),
  PRIMARY KEY (memo_id, action_id, type)
);

CREATE INDEX idx_memo_action_relation_memo_id ON memo_action_relation (memo_id);
CREATE INDEX idx_memo_action_relation_action_id ON memo_action_relation (action_id);
CREATE INDEX idx_memo_action_relation_creator_id ON memo_action_relation (creator_id);
