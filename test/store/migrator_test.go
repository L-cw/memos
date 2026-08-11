package teststore

import (
	"context"
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/usememos/memos/server/profile"
	"github.com/usememos/memos/store"
	"github.com/usememos/memos/store/db"
)

func TestGetCurrentSchemaVersion(t *testing.T) {
	ctx := context.Background()
	ts := NewTestingStore(ctx, t)

	currentSchemaVersion, err := ts.GetCurrentSchemaVersion()
	require.NoError(t, err)
	require.Equal(t, "0.24.6", currentSchemaVersion)
}

func TestMigrateExistingDevDatabase(t *testing.T) {
	ctx := context.Background()
	dsn := filepath.Join(t.TempDir(), "memos_dev.db")
	profile := &profile.Profile{
		Mode:   "dev",
		Driver: "sqlite",
		DSN:    dsn,
	}
	driver, err := db.NewDBDriver(profile)
	require.NoError(t, err)
	t.Cleanup(func() {
		require.NoError(t, driver.Close())
	})

	_, err = driver.GetDB().ExecContext(ctx, `
		CREATE TABLE migration_history (
			version TEXT NOT NULL PRIMARY KEY,
			created_ts BIGINT NOT NULL DEFAULT (strftime('%s', 'now'))
		);
		CREATE TABLE system_setting (
			name TEXT NOT NULL,
			value TEXT NOT NULL,
			description TEXT NOT NULL DEFAULT '',
			UNIQUE(name)
		);
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
			INSERT INTO action_goal_record (uid, action_id, creator_id, delta, value_after, recorded_ts)
			VALUES ('existing-goal-record', 1, 1, 2, 2, 1786363200);
			INSERT INTO action (uid, creator_id, type, title) VALUES ('existing-action', 1, 'TASK', 'Existing action');
		INSERT INTO action (uid, creator_id, type, status, title, termination_reason, terminated_ts)
		VALUES ('existing-terminated-action', 1, 'TASK', 'TERMINATED', 'Existing terminated action', 'Stopped before upgrade', 1786363200);
		INSERT INTO migration_history (version) VALUES ('0.24.3');
	`)
	require.NoError(t, err)

	s := store.New(driver, profile)
	require.NoError(t, s.Migrate(ctx))

	columns := map[string]bool{}
	rows, err := driver.GetDB().QueryContext(ctx, "PRAGMA table_info(action)")
	require.NoError(t, err)
	for rows.Next() {
		var cid int
		var name, columnType string
		var notNull, primaryKey int
		var defaultValue any
		require.NoError(t, rows.Scan(&cid, &name, &columnType, &notNull, &defaultValue, &primaryKey))
		columns[name] = true
	}
	require.NoError(t, rows.Err())
	require.NoError(t, rows.Close())
	require.True(t, columns["habit_start_date"])
	require.True(t, columns["habit_schedule_type"])
	require.True(t, columns["habit_interval_days"])
	require.True(t, columns["habit_weekdays"])

	var habitRecordTable string
	err = driver.GetDB().QueryRowContext(ctx, "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'action_habit_record'").Scan(&habitRecordTable)
	require.NoError(t, err)
	require.Equal(t, "action_habit_record", habitRecordTable)
	var statusHistoryTable string
	err = driver.GetDB().QueryRowContext(ctx, "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'action_status_history'").Scan(&statusHistoryTable)
	require.NoError(t, err)
	require.Equal(t, "action_status_history", statusHistoryTable)

	var migrationCount int
	err = driver.GetDB().QueryRowContext(ctx, "SELECT COUNT(*) FROM migration_history WHERE version = '0.24.6'").Scan(&migrationCount)
	require.NoError(t, err)
	require.Equal(t, 1, migrationCount)

	var goalRecordOperation string
	err = driver.GetDB().QueryRowContext(ctx, "SELECT operation FROM action_goal_record WHERE uid = 'existing-goal-record'").Scan(&goalRecordOperation)
	require.NoError(t, err)
	require.Equal(t, "DELTA", goalRecordOperation)

	var actionTitle string
	err = driver.GetDB().QueryRowContext(ctx, "SELECT title FROM action WHERE uid = 'existing-action'").Scan(&actionTitle)
	require.NoError(t, err)
	require.Equal(t, "Existing action", actionTitle)

	var fromStatus, toStatus, reason, effectiveDate string
	err = driver.GetDB().QueryRowContext(ctx, `
		SELECT from_status, to_status, reason, effective_date
		FROM action_status_history
		WHERE action_id = (SELECT id FROM action WHERE uid = 'existing-terminated-action')
	`).Scan(&fromStatus, &toStatus, &reason, &effectiveDate)
	require.NoError(t, err)
	require.Equal(t, "IN_PROGRESS", fromStatus)
	require.Equal(t, "TERMINATED", toStatus)
	require.Equal(t, "Stopped before upgrade", reason)
	require.Equal(t, "2026-08-10", effectiveDate)
}
