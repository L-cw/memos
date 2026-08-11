package sqlite

import (
	"context"
	"database/sql"
	"fmt"
	"strconv"
	"strings"
	"time"

	"github.com/usememos/memos/store"
)

const actionSelectFields = "`id`, `uid`, `creator_id`, `parent_id`, `type`, `status`, `title`, `description`, `plan_date`, `deadline_ts`, `sort_order`, `goal_current`, `goal_target`, `goal_unit`, `habit_start_date`, `habit_schedule_type`, `habit_interval_days`, `habit_weekdays`, `pinned_ts`, `created_ts`, `updated_ts`, `completed_ts`, `termination_reason`, `terminated_ts`, `row_status`"

type actionRowScanner interface {
	Scan(dest ...any) error
}

func scanAction(scanner actionRowScanner) (*store.Action, error) {
	action := &store.Action{}
	var parentID sql.NullInt64
	var planDate, goalUnit, habitStartDate, habitScheduleType, habitWeekdays sql.NullString
	var deadlineTs, habitIntervalDays, pinnedTs, completedTs, terminatedTs sql.NullInt64
	var goalCurrent, goalTarget sql.NullFloat64
	if err := scanner.Scan(
		&action.ID,
		&action.UID,
		&action.CreatorID,
		&parentID,
		&action.Type,
		&action.Status,
		&action.Title,
		&action.Description,
		&planDate,
		&deadlineTs,
		&action.SortOrder,
		&goalCurrent,
		&goalTarget,
		&goalUnit,
		&habitStartDate,
		&habitScheduleType,
		&habitIntervalDays,
		&habitWeekdays,
		&pinnedTs,
		&action.CreatedTs,
		&action.UpdatedTs,
		&completedTs,
		&action.TerminationReason,
		&terminatedTs,
		&action.RowStatus,
	); err != nil {
		return nil, err
	}
	if parentID.Valid {
		value := int32(parentID.Int64)
		action.ParentID = &value
	}
	if planDate.Valid {
		action.PlanDate = &planDate.String
	}
	if deadlineTs.Valid {
		action.DeadlineTs = &deadlineTs.Int64
	}
	if goalCurrent.Valid {
		action.GoalCurrent = &goalCurrent.Float64
	}
	if goalTarget.Valid {
		action.GoalTarget = &goalTarget.Float64
	}
	if goalUnit.Valid {
		action.GoalUnit = &goalUnit.String
	}
	if habitStartDate.Valid {
		action.HabitStartDate = &habitStartDate.String
	}
	if habitScheduleType.Valid {
		value := store.HabitScheduleType(habitScheduleType.String)
		action.HabitScheduleType = &value
	}
	if habitIntervalDays.Valid {
		value := int32(habitIntervalDays.Int64)
		action.HabitIntervalDays = &value
	}
	if habitWeekdays.Valid && habitWeekdays.String != "" {
		for _, item := range strings.Split(habitWeekdays.String, ",") {
			value, err := strconv.ParseInt(item, 10, 32)
			if err != nil {
				return nil, fmt.Errorf("invalid habit weekday %q: %w", item, err)
			}
			action.HabitWeekdays = append(action.HabitWeekdays, int32(value))
		}
	}
	if pinnedTs.Valid {
		action.PinnedTs = &pinnedTs.Int64
	}
	if completedTs.Valid {
		action.CompletedTs = &completedTs.Int64
	}
	if terminatedTs.Valid {
		action.TerminatedTs = &terminatedTs.Int64
	}
	return action, nil
}

func nullableString(value *string) any {
	if value == nil || *value == "" {
		return nil
	}
	return *value
}

func nullableInt64(value *int64) any {
	if value == nil || *value == 0 {
		return nil
	}
	return *value
}

func nullableInt32(value *int32) any {
	if value == nil {
		return nil
	}
	return *value
}

func nullableFloat64(value *float64) any {
	if value == nil {
		return nil
	}
	return *value
}

func nullableHabitSchedule(value *store.HabitScheduleType) any {
	if value == nil {
		return nil
	}
	return *value
}

func nullableWeekdays(values []int32) any {
	if len(values) == 0 {
		return nil
	}
	encoded := make([]string, 0, len(values))
	for _, value := range values {
		encoded = append(encoded, strconv.FormatInt(int64(value), 10))
	}
	return strings.Join(encoded, ",")
}

func (d *DB) CreateAction(ctx context.Context, create *store.Action) (*store.Action, error) {
	stmt := `
		INSERT INTO action (
			uid, creator_id, parent_id, type, status, title, description, plan_date, deadline_ts,
			sort_order, goal_current, goal_target, goal_unit, habit_start_date, habit_schedule_type,
			habit_interval_days, habit_weekdays, row_status
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		RETURNING ` + actionSelectFields
	return scanAction(d.db.QueryRowContext(ctx, stmt,
		create.UID,
		create.CreatorID,
		nullableInt32(create.ParentID),
		create.Type,
		create.Status,
		create.Title,
		create.Description,
		nullableString(create.PlanDate),
		nullableInt64(create.DeadlineTs),
		create.SortOrder,
		nullableFloat64(create.GoalCurrent),
		nullableFloat64(create.GoalTarget),
		nullableString(create.GoalUnit),
		nullableString(create.HabitStartDate),
		nullableHabitSchedule(create.HabitScheduleType),
		nullableInt32(create.HabitIntervalDays),
		nullableWeekdays(create.HabitWeekdays),
		create.RowStatus,
	))
}

func (d *DB) ListActions(ctx context.Context, find *store.FindAction) ([]*store.Action, error) {
	where, args := []string{"1 = 1"}, []any{}
	if find.ID != nil {
		where, args = append(where, "`id` = ?"), append(args, *find.ID)
	}
	if find.UID != nil {
		where, args = append(where, "`uid` = ?"), append(args, *find.UID)
	}
	if find.CreatorID != nil {
		where, args = append(where, "`creator_id` = ?"), append(args, *find.CreatorID)
	}
	if find.RowStatus != nil {
		where, args = append(where, "`row_status` = ?"), append(args, *find.RowStatus)
	}
	if find.Type != nil {
		where, args = append(where, "`type` = ?"), append(args, *find.Type)
	}
	if len(find.Statuses) > 0 {
		placeholders := make([]string, 0, len(find.Statuses))
		for _, actionStatus := range find.Statuses {
			placeholders = append(placeholders, "?")
			args = append(args, actionStatus)
		}
		where = append(where, "`status` IN ("+strings.Join(placeholders, ", ")+")")
	}
	if find.PlanDate != nil {
		where, args = append(where, "`plan_date` = ?"), append(args, *find.PlanDate)
	}
	if find.PinnedOnly {
		where = append(where, "`pinned_ts` IS NOT NULL")
	}

	query := "SELECT " + actionSelectFields + " FROM `action` WHERE " + strings.Join(where, " AND ") +
		" ORDER BY CASE WHEN `pinned_ts` IS NULL THEN 1 ELSE 0 END, `pinned_ts` DESC, `sort_order` ASC, `created_ts` DESC"
	if find.Limit != nil {
		query += " LIMIT ?"
		args = append(args, *find.Limit)
		if find.Offset != nil {
			query += " OFFSET ?"
			args = append(args, *find.Offset)
		}
	}

	rows, err := d.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	actions := []*store.Action{}
	for rows.Next() {
		action, err := scanAction(rows)
		if err != nil {
			return nil, err
		}
		actions = append(actions, action)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return actions, nil
}

func (d *DB) UpdateAction(ctx context.Context, update *store.UpdateAction) error {
	set, args := []string{}, []any{}
	if update.Title != nil {
		set, args = append(set, "`title` = ?"), append(args, *update.Title)
	}
	if update.Description != nil {
		set, args = append(set, "`description` = ?"), append(args, *update.Description)
	}
	if update.PlanDate != nil {
		set, args = append(set, "`plan_date` = ?"), append(args, nullableString(update.PlanDate))
	}
	if update.DeadlineTs != nil {
		set, args = append(set, "`deadline_ts` = ?"), append(args, nullableInt64(update.DeadlineTs))
	}
	if update.SortOrder != nil {
		set, args = append(set, "`sort_order` = ?"), append(args, *update.SortOrder)
	}
	if update.GoalCurrent != nil {
		set, args = append(set, "`goal_current` = ?"), append(args, *update.GoalCurrent)
	}
	if update.Status != nil {
		set, args = append(set, "`status` = ?"), append(args, *update.Status)
	}
	if update.CompletedTs != nil {
		set, args = append(set, "`completed_ts` = ?"), append(args, *update.CompletedTs)
	} else if update.ClearCompletedTs {
		set = append(set, "`completed_ts` = NULL")
	}
	if update.TerminationReason != nil {
		set, args = append(set, "`termination_reason` = ?"), append(args, *update.TerminationReason)
	}
	if update.TerminatedTs != nil {
		set, args = append(set, "`terminated_ts` = ?"), append(args, *update.TerminatedTs)
	}
	if len(set) == 0 {
		return nil
	}
	set = append(set, "`updated_ts` = ?")
	args = append(args, time.Now().Unix(), update.ID, update.CreatorID)
	result, err := d.db.ExecContext(ctx, "UPDATE `action` SET "+strings.Join(set, ", ")+" WHERE `id` = ? AND `creator_id` = ? AND `row_status` = 'NORMAL'", args...)
	if err != nil {
		return err
	}
	rows, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if rows == 0 {
		return store.ErrActionNotFound
	}
	return nil
}

func transitionActionStatusTx(ctx context.Context, tx *sql.Tx, transition *store.TransitionActionStatus) (*store.ActionStatusHistory, error) {
	var currentStatus store.ActionStatus
	if err := tx.QueryRowContext(ctx, "SELECT `status` FROM `action` WHERE `id` = ? AND `creator_id` = ? AND `row_status` = 'NORMAL'", transition.ActionID, transition.CreatorID).Scan(&currentStatus); err != nil {
		if err == sql.ErrNoRows {
			return nil, store.ErrActionNotFound
		}
		return nil, err
	}
	if currentStatus != transition.FromStatus {
		return nil, store.ErrActionStatusConflict
	}

	now := transition.CreatedTs
	if now == 0 {
		now = time.Now().Unix()
	}
	set := []string{"`status` = ?", "`updated_ts` = ?"}
	args := []any{transition.ToStatus, now}
	if transition.ToStatus == store.ActionStatusTerminated {
		set = append(set, "`termination_reason` = ?", "`terminated_ts` = ?")
		args = append(args, transition.Reason, now)
	} else if transition.FromStatus == store.ActionStatusTerminated {
		set = append(set, "`termination_reason` = ''", "`terminated_ts` = NULL")
	}
	if transition.ToStatus == store.ActionStatusDone && transition.FromStatus != store.ActionStatusTerminated {
		set = append(set, "`completed_ts` = ?")
		args = append(args, now)
	} else if transition.FromStatus == store.ActionStatusDone && transition.ToStatus != store.ActionStatusTerminated {
		set = append(set, "`completed_ts` = NULL")
	}
	args = append(args, transition.ActionID, transition.CreatorID)
	result, err := tx.ExecContext(ctx, "UPDATE `action` SET "+strings.Join(set, ", ")+" WHERE `id` = ? AND `creator_id` = ? AND `row_status` = 'NORMAL'", args...)
	if err != nil {
		return nil, err
	}
	rows, err := result.RowsAffected()
	if err != nil {
		return nil, err
	}
	if rows == 0 {
		return nil, store.ErrActionNotFound
	}

	history := &store.ActionStatusHistory{
		ActionID: transition.ActionID, CreatorID: transition.CreatorID,
		FromStatus: transition.FromStatus, ToStatus: transition.ToStatus,
		Reason: transition.Reason, EffectiveDate: transition.EffectiveDate,
	}
	if err := tx.QueryRowContext(ctx, `
		INSERT INTO action_status_history (action_id, creator_id, from_status, to_status, reason, effective_date, created_ts)
		VALUES (?, ?, ?, ?, ?, ?, ?)
		RETURNING id, created_ts`,
		history.ActionID, history.CreatorID, history.FromStatus, history.ToStatus, history.Reason, history.EffectiveDate, now,
	).Scan(&history.ID, &history.CreatedTs); err != nil {
		return nil, err
	}
	return history, nil
}

func (d *DB) TransitionActionStatus(ctx context.Context, transition *store.TransitionActionStatus) (*store.ActionStatusHistory, error) {
	tx, err := d.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()
	history, err := transitionActionStatusTx(ctx, tx, transition)
	if err != nil {
		return nil, err
	}
	if err := tx.Commit(); err != nil {
		return nil, err
	}
	return history, nil
}

func (d *DB) ListActionStatusHistories(ctx context.Context, find *store.FindActionStatusHistory) ([]*store.ActionStatusHistory, error) {
	where, args := []string{"1 = 1"}, []any{}
	if find.ActionID != nil {
		where, args = append(where, "`action_id` = ?"), append(args, *find.ActionID)
	}
	if find.CreatorID != nil {
		where, args = append(where, "`creator_id` = ?"), append(args, *find.CreatorID)
	}
	rows, err := d.db.QueryContext(ctx, `
		SELECT id, action_id, creator_id, from_status, to_status, reason, effective_date, created_ts
		FROM action_status_history
		WHERE `+strings.Join(where, " AND ")+`
		ORDER BY effective_date ASC, created_ts ASC, id ASC`, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	histories := []*store.ActionStatusHistory{}
	for rows.Next() {
		history := &store.ActionStatusHistory{}
		if err := rows.Scan(
			&history.ID, &history.ActionID, &history.CreatorID, &history.FromStatus, &history.ToStatus,
			&history.Reason, &history.EffectiveDate, &history.CreatedTs,
		); err != nil {
			return nil, err
		}
		histories = append(histories, history)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return histories, nil
}

func (d *DB) MoveAction(ctx context.Context, move *store.MoveAction) error {
	result, err := d.db.ExecContext(ctx, "UPDATE `action` SET `parent_id` = ?, `sort_order` = ?, `updated_ts` = ? WHERE `id` = ? AND `creator_id` = ? AND `row_status` = 'NORMAL'", nullableInt32(move.ParentID), move.SortOrder, time.Now().Unix(), move.ID, move.CreatorID)
	if err != nil {
		return err
	}
	rows, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if rows == 0 {
		return store.ErrActionNotFound
	}
	return nil
}

func (d *DB) ArchiveActionTree(ctx context.Context, creatorID int32, actionID int32) error {
	stmt := `
		WITH RECURSIVE descendants(id) AS (
			SELECT id FROM action WHERE id = ? AND creator_id = ? AND row_status = 'NORMAL'
			UNION ALL
			SELECT child.id FROM action child JOIN descendants parent ON child.parent_id = parent.id
			WHERE child.creator_id = ? AND child.row_status = 'NORMAL'
		)
		UPDATE action SET row_status = 'ARCHIVED', updated_ts = ? WHERE id IN (SELECT id FROM descendants)`
	result, err := d.db.ExecContext(ctx, stmt, actionID, creatorID, creatorID, time.Now().Unix())
	if err != nil {
		return err
	}
	rows, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if rows == 0 {
		return store.ErrActionNotFound
	}
	return nil
}

func (d *DB) SetActionPinned(ctx context.Context, creatorID int32, actionID int32, pinned bool, limit int) error {
	tx, err := d.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	var currentPinned sql.NullInt64
	if err := tx.QueryRowContext(ctx, "SELECT `pinned_ts` FROM `action` WHERE `id` = ? AND `creator_id` = ? AND `row_status` = 'NORMAL'", actionID, creatorID).Scan(&currentPinned); err != nil {
		if err == sql.ErrNoRows {
			return store.ErrActionNotFound
		}
		return err
	}
	if pinned == currentPinned.Valid {
		return tx.Commit()
	}
	if pinned {
		var count int
		if err := tx.QueryRowContext(ctx, "SELECT COUNT(*) FROM `action` WHERE `creator_id` = ? AND `row_status` = 'NORMAL' AND `pinned_ts` IS NOT NULL", creatorID).Scan(&count); err != nil {
			return err
		}
		if count >= limit {
			return store.ErrPinnedActionLimit
		}
	}
	var value any
	if pinned {
		value = time.Now().UnixMilli()
	}
	if _, err := tx.ExecContext(ctx, "UPDATE `action` SET `pinned_ts` = ?, `updated_ts` = ? WHERE `id` = ? AND `creator_id` = ?", value, time.Now().Unix(), actionID, creatorID); err != nil {
		return err
	}
	return tx.Commit()
}

func (d *DB) CreateActionGoalRecord(ctx context.Context, create *store.ActionGoalRecord) (*store.ActionGoalRecord, *store.Action, error) {
	tx, err := d.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, nil, err
	}
	defer tx.Rollback()
	var actionType store.ActionType
	var actionStatus store.ActionStatus
	var current, target float64
	if err := tx.QueryRowContext(ctx, "SELECT `type`, `status`, `goal_current`, `goal_target` FROM `action` WHERE `id` = ? AND `creator_id` = ? AND `row_status` = 'NORMAL'", create.ActionID, create.CreatorID).Scan(&actionType, &actionStatus, &current, &target); err != nil {
		if err == sql.ErrNoRows {
			return nil, nil, store.ErrActionNotFound
		}
		return nil, nil, err
	}
	if actionType != store.ActionTypeGoal || (actionStatus != store.ActionStatusTodo && actionStatus != store.ActionStatusInProgress) {
		return nil, nil, store.ErrGoalProgressUnavailable
	}
	if create.Operation == "" {
		create.Operation = store.GoalRecordOperationDelta
	}
	valueAfter := current + create.Delta
	if create.Operation == store.GoalRecordOperationOverwrite {
		if create.OverwriteValue == nil {
			return nil, nil, store.ErrGoalOverwriteValueMissing
		}
		valueAfter = *create.OverwriteValue
		create.Delta = valueAfter - current
	}
	if valueAfter < 0 {
		return nil, nil, store.ErrGoalProgressNegative
	}
	create.ValueAfter = valueAfter
	if err := tx.QueryRowContext(ctx, `INSERT INTO action_goal_record (uid, action_id, creator_id, delta, value_after, operation, note, recorded_ts) VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING id, created_ts`, create.UID, create.ActionID, create.CreatorID, create.Delta, create.ValueAfter, create.Operation, create.Note, create.RecordedTs).Scan(&create.ID, &create.CreatedTs); err != nil {
		return nil, nil, err
	}
	now := time.Now().Unix()
	nextStatus := store.ActionStatusInProgress
	if valueAfter >= target {
		nextStatus = store.ActionStatusDone
	}
	if _, err := tx.ExecContext(ctx, "UPDATE `action` SET `goal_current` = ?, `updated_ts` = ? WHERE `id` = ? AND `creator_id` = ?", valueAfter, now, create.ActionID, create.CreatorID); err != nil {
		return nil, nil, err
	}
	if nextStatus != actionStatus {
		if _, err := transitionActionStatusTx(ctx, tx, &store.TransitionActionStatus{
			ActionID: create.ActionID, CreatorID: create.CreatorID,
			FromStatus: actionStatus, ToStatus: nextStatus,
			EffectiveDate: time.Unix(now, 0).Format("2006-01-02"), CreatedTs: now,
		}); err != nil {
			return nil, nil, err
		}
	}
	action, err := scanAction(tx.QueryRowContext(ctx, "SELECT "+actionSelectFields+" FROM `action` WHERE `id` = ?", create.ActionID))
	if err != nil {
		return nil, nil, err
	}
	if err := tx.Commit(); err != nil {
		return nil, nil, err
	}
	return create, action, nil
}

func (d *DB) ListActionGoalRecords(ctx context.Context, find *store.FindActionGoalRecord) ([]*store.ActionGoalRecord, error) {
	where, args := []string{"1 = 1"}, []any{}
	if find.ActionID != nil {
		where, args = append(where, "`action_id` = ?"), append(args, *find.ActionID)
	}
	if find.CreatorID != nil {
		where, args = append(where, "`creator_id` = ?"), append(args, *find.CreatorID)
	}
	rows, err := d.db.QueryContext(ctx, "SELECT `id`, `uid`, `action_id`, `creator_id`, `delta`, `value_after`, `operation`, `note`, `recorded_ts`, `created_ts` FROM `action_goal_record` WHERE "+strings.Join(where, " AND ")+" ORDER BY `recorded_ts` DESC, `created_ts` DESC", args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	records := []*store.ActionGoalRecord{}
	for rows.Next() {
		record := &store.ActionGoalRecord{}
		if err := rows.Scan(&record.ID, &record.UID, &record.ActionID, &record.CreatorID, &record.Delta, &record.ValueAfter, &record.Operation, &record.Note, &record.RecordedTs, &record.CreatedTs); err != nil {
			return nil, err
		}
		records = append(records, record)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return records, nil
}

func (d *DB) BatchUpdateActionHabitRecords(ctx context.Context, records []*store.ActionHabitRecord) ([]*store.ActionHabitRecord, error) {
	if len(records) == 0 {
		return []*store.ActionHabitRecord{}, nil
	}
	tx, err := d.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()

	for _, record := range records {
		var actionType store.ActionType
		var actionStatus store.ActionStatus
		if err := tx.QueryRowContext(ctx, "SELECT `type`, `status` FROM `action` WHERE `id` = ? AND `creator_id` = ? AND `row_status` = 'NORMAL'", record.ActionID, record.CreatorID).Scan(&actionType, &actionStatus); err != nil {
			if err == sql.ErrNoRows {
				return nil, store.ErrActionNotFound
			}
			return nil, err
		}
		if actionType != store.ActionTypeHabit {
			return nil, store.ErrHabitRecordUnavailable
		}
		if record.Status == store.HabitRecordStatusUnchecked {
			if _, err := tx.ExecContext(ctx, "DELETE FROM `action_habit_record` WHERE `action_id` = ? AND `creator_id` = ? AND `occurrence_date` = ?", record.ActionID, record.CreatorID, record.OccurrenceDate); err != nil {
				return nil, err
			}
			continue
		}
		if record.Status != store.HabitRecordStatusCheckedIn && record.Status != store.HabitRecordStatusLeave {
			return nil, store.ErrHabitRecordUnavailable
		}
		now := time.Now().Unix()
		if _, err := tx.ExecContext(ctx, `
			INSERT INTO action_habit_record (uid, action_id, creator_id, occurrence_date, status, note, created_ts, updated_ts)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?)
			ON CONFLICT(action_id, occurrence_date) DO UPDATE SET status = excluded.status, note = excluded.note, updated_ts = excluded.updated_ts`,
			record.UID, record.ActionID, record.CreatorID, record.OccurrenceDate, record.Status, record.Note, now, now); err != nil {
			return nil, err
		}
		if actionStatus == store.ActionStatusTodo {
			if _, err := transitionActionStatusTx(ctx, tx, &store.TransitionActionStatus{
				ActionID: record.ActionID, CreatorID: record.CreatorID,
				FromStatus: actionStatus, ToStatus: store.ActionStatusInProgress,
				EffectiveDate: record.OccurrenceDate, CreatedTs: now,
			}); err != nil {
				return nil, err
			}
		} else if _, err := tx.ExecContext(ctx, "UPDATE `action` SET `updated_ts` = ? WHERE `id` = ? AND `creator_id` = ?", now, record.ActionID, record.CreatorID); err != nil {
			return nil, err
		}
	}
	if err := tx.Commit(); err != nil {
		return nil, err
	}
	creatorID := records[0].CreatorID
	return d.ListActionHabitRecords(ctx, &store.FindActionHabitRecord{CreatorID: &creatorID})
}

func (d *DB) ListActionHabitRecords(ctx context.Context, find *store.FindActionHabitRecord) ([]*store.ActionHabitRecord, error) {
	where, args := []string{"1 = 1"}, []any{}
	if find.ActionID != nil {
		where, args = append(where, "`action_id` = ?"), append(args, *find.ActionID)
	}
	if find.CreatorID != nil {
		where, args = append(where, "`creator_id` = ?"), append(args, *find.CreatorID)
	}
	if find.OccurrenceDate != nil {
		where, args = append(where, "`occurrence_date` = ?"), append(args, *find.OccurrenceDate)
	}
	rows, err := d.db.QueryContext(ctx, "SELECT `id`, `uid`, `action_id`, `creator_id`, `occurrence_date`, `status`, `note`, `created_ts`, `updated_ts` FROM `action_habit_record` WHERE "+strings.Join(where, " AND ")+" ORDER BY `occurrence_date` DESC, `created_ts` DESC", args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	records := []*store.ActionHabitRecord{}
	for rows.Next() {
		record := &store.ActionHabitRecord{}
		if err := rows.Scan(&record.ID, &record.UID, &record.ActionID, &record.CreatorID, &record.OccurrenceDate, &record.Status, &record.Note, &record.CreatedTs, &record.UpdatedTs); err != nil {
			return nil, err
		}
		records = append(records, record)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return records, nil
}

func (d *DB) SetMemoActionRelations(ctx context.Context, set *store.SetMemoActionRelations) error {
	if (set.ActionID == nil) == (set.MemoID == nil) {
		return fmt.Errorf("exactly one relation owner is required")
	}
	tx, err := d.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if set.ActionID != nil {
		if _, err := tx.ExecContext(ctx, "DELETE FROM `memo_action_relation` WHERE `action_id` = ? AND `creator_id` = ?", *set.ActionID, set.CreatorID); err != nil {
			return err
		}
		for _, memoID := range set.MemoIDs {
			if _, err := tx.ExecContext(ctx, "INSERT INTO `memo_action_relation` (`memo_id`, `action_id`, `creator_id`) VALUES (?, ?, ?)", memoID, *set.ActionID, set.CreatorID); err != nil {
				return err
			}
		}
	} else {
		if _, err := tx.ExecContext(ctx, "DELETE FROM `memo_action_relation` WHERE `memo_id` = ? AND `creator_id` = ?", *set.MemoID, set.CreatorID); err != nil {
			return err
		}
		for _, actionID := range set.ActionIDs {
			if _, err := tx.ExecContext(ctx, "INSERT INTO `memo_action_relation` (`memo_id`, `action_id`, `creator_id`) VALUES (?, ?, ?)", *set.MemoID, actionID, set.CreatorID); err != nil {
				return err
			}
		}
	}
	return tx.Commit()
}

func (d *DB) ListMemoActionRelations(ctx context.Context, find *store.FindMemoActionRelation) ([]*store.MemoActionRelation, error) {
	where, args := []string{"1 = 1"}, []any{}
	if find.MemoID != nil {
		where, args = append(where, "`memo_id` = ?"), append(args, *find.MemoID)
	}
	if find.ActionID != nil {
		where, args = append(where, "`action_id` = ?"), append(args, *find.ActionID)
	}
	if find.CreatorID != nil {
		where, args = append(where, "`creator_id` = ?"), append(args, *find.CreatorID)
	}
	rows, err := d.db.QueryContext(ctx, "SELECT `memo_id`, `action_id`, `creator_id`, `created_ts` FROM `memo_action_relation` WHERE "+strings.Join(where, " AND ")+" ORDER BY `created_ts` DESC", args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	relations := []*store.MemoActionRelation{}
	for rows.Next() {
		relation := &store.MemoActionRelation{}
		if err := rows.Scan(&relation.MemoID, &relation.ActionID, &relation.CreatorID, &relation.CreatedTs); err != nil {
			return nil, err
		}
		relations = append(relations, relation)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return relations, nil
}
