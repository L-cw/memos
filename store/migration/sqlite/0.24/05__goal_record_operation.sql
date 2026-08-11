ALTER TABLE action_goal_record
ADD COLUMN operation TEXT NOT NULL DEFAULT 'DELTA' CHECK (operation IN ('DELTA', 'OVERWRITE'));
