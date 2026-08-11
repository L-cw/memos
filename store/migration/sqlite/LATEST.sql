-- migration_history
CREATE TABLE migration_history (
  version TEXT NOT NULL PRIMARY KEY,
  created_ts BIGINT NOT NULL DEFAULT (strftime('%s', 'now'))
);

-- system_setting
CREATE TABLE system_setting (
  name TEXT NOT NULL,
  value TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  UNIQUE(name)
);

-- user
CREATE TABLE user (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_ts BIGINT NOT NULL DEFAULT (strftime('%s', 'now')),
  updated_ts BIGINT NOT NULL DEFAULT (strftime('%s', 'now')),
  row_status TEXT NOT NULL CHECK (row_status IN ('NORMAL', 'ARCHIVED')) DEFAULT 'NORMAL',
  username TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL CHECK (role IN ('HOST', 'ADMIN', 'USER')) DEFAULT 'USER',
  email TEXT NOT NULL DEFAULT '',
  nickname TEXT NOT NULL DEFAULT '',
  password_hash TEXT NOT NULL,
  avatar_url TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT ''
);

CREATE INDEX idx_user_username ON user (username);

-- user_setting
CREATE TABLE user_setting (
  user_id INTEGER NOT NULL,
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  UNIQUE(user_id, key)
);

-- memo
CREATE TABLE memo (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  uid TEXT NOT NULL UNIQUE,
  creator_id INTEGER NOT NULL,
  created_ts BIGINT NOT NULL DEFAULT (strftime('%s', 'now')),
  updated_ts BIGINT NOT NULL DEFAULT (strftime('%s', 'now')),
  row_status TEXT NOT NULL CHECK (row_status IN ('NORMAL', 'ARCHIVED')) DEFAULT 'NORMAL',
  content TEXT NOT NULL DEFAULT '',
  visibility TEXT NOT NULL CHECK (visibility IN ('PUBLIC', 'PROTECTED', 'PRIVATE')) DEFAULT 'PRIVATE',
  pinned INTEGER NOT NULL CHECK (pinned IN (0, 1)) DEFAULT 0,
  payload TEXT NOT NULL DEFAULT '{}'
);

CREATE INDEX idx_memo_creator_id ON memo (creator_id);

-- memo_organizer
CREATE TABLE memo_organizer (
  memo_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  pinned INTEGER NOT NULL CHECK (pinned IN (0, 1)) DEFAULT 0,
  UNIQUE(memo_id, user_id)
);

-- memo_relation
CREATE TABLE memo_relation (
  memo_id INTEGER NOT NULL,
  related_memo_id INTEGER NOT NULL,
  type TEXT NOT NULL,
  UNIQUE(memo_id, related_memo_id, type)
);

-- resource
CREATE TABLE resource (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  uid TEXT NOT NULL UNIQUE,
  creator_id INTEGER NOT NULL,
  created_ts BIGINT NOT NULL DEFAULT (strftime('%s', 'now')),
  updated_ts BIGINT NOT NULL DEFAULT (strftime('%s', 'now')),
  filename TEXT NOT NULL DEFAULT '',
  blob BLOB DEFAULT NULL,
  type TEXT NOT NULL DEFAULT '',
  size INTEGER NOT NULL DEFAULT 0,
  memo_id INTEGER,
  storage_type TEXT NOT NULL DEFAULT '',
  reference TEXT NOT NULL DEFAULT '',
  payload TEXT NOT NULL DEFAULT '{}'
);

CREATE INDEX idx_resource_creator_id ON resource (creator_id);

CREATE INDEX idx_resource_memo_id ON resource (memo_id);

-- activity
CREATE TABLE activity (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  creator_id INTEGER NOT NULL,
  created_ts BIGINT NOT NULL DEFAULT (strftime('%s', 'now')),
  type TEXT NOT NULL DEFAULT '',
  level TEXT NOT NULL CHECK (level IN ('INFO', 'WARN', 'ERROR')) DEFAULT 'INFO',
  payload TEXT NOT NULL DEFAULT '{}'
);

-- idp
CREATE TABLE idp (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  identifier_filter TEXT NOT NULL DEFAULT '',
  config TEXT NOT NULL DEFAULT '{}'
);

-- inbox
CREATE TABLE inbox (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_ts BIGINT NOT NULL DEFAULT (strftime('%s', 'now')),
  sender_id INTEGER NOT NULL,
  receiver_id INTEGER NOT NULL,
  status TEXT NOT NULL,
  message TEXT NOT NULL DEFAULT '{}'
);

-- webhook
CREATE TABLE webhook (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_ts BIGINT NOT NULL DEFAULT (strftime('%s', 'now')),
  updated_ts BIGINT NOT NULL DEFAULT (strftime('%s', 'now')),
  row_status TEXT NOT NULL CHECK (row_status IN ('NORMAL', 'ARCHIVED')) DEFAULT 'NORMAL',
  creator_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  url TEXT NOT NULL
);

CREATE INDEX idx_webhook_creator_id ON webhook (creator_id);

-- reaction
CREATE TABLE reaction (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_ts BIGINT NOT NULL DEFAULT (strftime('%s', 'now')),
  creator_id INTEGER NOT NULL,
  content_id TEXT NOT NULL,
  reaction_type TEXT NOT NULL,
  UNIQUE(creator_id, content_id, reaction_type)
);

-- action
CREATE TABLE action (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  uid TEXT NOT NULL UNIQUE,
  creator_id INTEGER NOT NULL,
  parent_id INTEGER,
  type TEXT NOT NULL CHECK (type IN ('TASK', 'GOAL', 'PROJECT', 'HABIT')),
  status TEXT NOT NULL CHECK (status IN ('TODO', 'IN_PROGRESS', 'DONE', 'TERMINATED')) DEFAULT 'TODO',
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  plan_date TEXT,
  deadline_ts BIGINT,
  sort_order BIGINT NOT NULL DEFAULT 0,
  goal_current REAL,
  goal_target REAL,
  goal_unit TEXT,
  habit_start_date TEXT,
  habit_schedule_type TEXT CHECK (habit_schedule_type IN ('DAILY', 'INTERVAL_DAYS', 'WEEKLY')),
  habit_interval_days INTEGER,
  habit_weekdays TEXT,
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

-- action_goal_record
CREATE TABLE action_goal_record (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  uid TEXT NOT NULL UNIQUE,
  action_id INTEGER NOT NULL,
  creator_id INTEGER NOT NULL,
  delta REAL NOT NULL,
  value_after REAL NOT NULL,
  operation TEXT NOT NULL DEFAULT 'DELTA' CHECK (operation IN ('DELTA', 'OVERWRITE')),
  note TEXT NOT NULL DEFAULT '',
  recorded_ts BIGINT NOT NULL,
  created_ts BIGINT NOT NULL DEFAULT (strftime('%s', 'now'))
);

CREATE INDEX idx_action_goal_record_action_id ON action_goal_record (action_id);
CREATE INDEX idx_action_goal_record_creator_id ON action_goal_record (creator_id);

-- action_habit_record
CREATE TABLE action_habit_record (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  uid TEXT NOT NULL UNIQUE,
  action_id INTEGER NOT NULL,
  creator_id INTEGER NOT NULL,
  occurrence_date TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('CHECKED_IN', 'LEAVE')),
  note TEXT NOT NULL DEFAULT '',
  created_ts BIGINT NOT NULL DEFAULT (strftime('%s', 'now')),
  updated_ts BIGINT NOT NULL DEFAULT (strftime('%s', 'now')),
  UNIQUE (action_id, occurrence_date)
);

CREATE INDEX idx_action_habit_record_creator_date ON action_habit_record (creator_id, occurrence_date);
CREATE INDEX idx_action_habit_record_action_date ON action_habit_record (action_id, occurrence_date);

-- action_status_history
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

-- memo_action_relation
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
