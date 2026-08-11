ALTER TABLE action RENAME TO action_before_habit;

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

INSERT INTO action (
  id, uid, creator_id, parent_id, type, status, title, description, plan_date, deadline_ts,
  sort_order, goal_current, goal_target, goal_unit, pinned_ts, created_ts, updated_ts,
  completed_ts, termination_reason, terminated_ts, row_status
)
SELECT
  id, uid, creator_id, parent_id, type, status, title, description, plan_date, deadline_ts,
  sort_order, goal_current, goal_target, goal_unit, pinned_ts, created_ts, updated_ts,
  completed_ts, termination_reason, terminated_ts, row_status
FROM action_before_habit;

DROP TABLE action_before_habit;

CREATE INDEX idx_action_creator_id ON action (creator_id);
CREATE INDEX idx_action_parent_id ON action (parent_id);
CREATE INDEX idx_action_creator_plan_date ON action (creator_id, plan_date);
CREATE INDEX idx_action_creator_status ON action (creator_id, status);
CREATE INDEX idx_action_creator_type ON action (creator_id, type);
CREATE INDEX idx_action_creator_pinned_ts ON action (creator_id, pinned_ts);

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
