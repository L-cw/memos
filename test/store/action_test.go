package teststore

import (
	"context"
	"fmt"
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"github.com/usememos/memos/store"
)

func createTestingAction(t *testing.T, ctx context.Context, ts *store.Store, action *store.Action) *store.Action {
	t.Helper()
	action.Status = store.ActionStatusTodo
	action.RowStatus = store.Normal
	created, err := ts.CreateAction(ctx, action)
	require.NoError(t, err)
	return created
}

func TestActionPinnedLimit(t *testing.T) {
	ctx := context.Background()
	ts := NewTestingStore(ctx, t)
	t.Cleanup(func() { require.NoError(t, ts.Close()) })
	if ts.Profile.Driver != "sqlite" {
		t.Skip("Action MVP persistence is SQLite-only")
	}
	user, err := createTestingHostUser(ctx, ts)
	require.NoError(t, err)

	actions := make([]*store.Action, 0, 7)
	for i := 0; i < 7; i++ {
		actions = append(actions, createTestingAction(t, ctx, ts, &store.Action{
			UID: fmt.Sprintf("pinned-action-%d", i+1), CreatorID: user.ID,
			Type: store.ActionTypeTask, Title: fmt.Sprintf("Pinned action %d", i+1),
		}))
	}
	for _, action := range actions[:6] {
		require.NoError(t, ts.SetActionPinned(ctx, user.ID, action.ID, true, 6))
	}
	require.ErrorIs(t, ts.SetActionPinned(ctx, user.ID, actions[6].ID, true, 6), store.ErrPinnedActionLimit)

	pinned, err := ts.ListActions(ctx, &store.FindAction{CreatorID: &user.ID, PinnedOnly: true})
	require.NoError(t, err)
	require.Len(t, pinned, 6)
	seventh, err := ts.GetAction(ctx, &store.FindAction{ID: &actions[6].ID, CreatorID: &user.ID})
	require.NoError(t, err)
	require.Nil(t, seventh.PinnedTs)
}

func TestActionGoalProgress(t *testing.T) {
	ctx := context.Background()
	ts := NewTestingStore(ctx, t)
	t.Cleanup(func() { require.NoError(t, ts.Close()) })
	if ts.Profile.Driver != "sqlite" {
		t.Skip("Action MVP persistence is SQLite-only")
	}
	user, err := createTestingHostUser(ctx, ts)
	require.NoError(t, err)
	current, target, unit := 0.0, 10.0, "km"
	goal := createTestingAction(t, ctx, ts, &store.Action{
		UID: "goal-progress", CreatorID: user.ID, Type: store.ActionTypeGoal, Title: "Ride 10 km",
		GoalCurrent: &current, GoalTarget: &target, GoalUnit: &unit,
	})

	record, updated, err := ts.CreateActionGoalRecord(ctx, &store.ActionGoalRecord{
		UID: "goal-record-1", ActionID: goal.ID, CreatorID: user.ID, Delta: 6, RecordedTs: time.Now().Add(-2 * time.Hour).Unix(),
	})
	require.NoError(t, err)
	require.Equal(t, 6.0, record.ValueAfter)
	require.Equal(t, store.ActionStatusInProgress, updated.Status)
	require.Equal(t, 6.0, *updated.GoalCurrent)
	require.Equal(t, store.GoalRecordOperationDelta, record.Operation)

	record, updated, err = ts.CreateActionGoalRecord(ctx, &store.ActionGoalRecord{
		UID: "goal-record-2", ActionID: goal.ID, CreatorID: user.ID, Delta: -2, RecordedTs: time.Now().Add(-time.Hour).Unix(),
	})
	require.NoError(t, err)
	require.Equal(t, 4.0, record.ValueAfter)
	require.Equal(t, store.ActionStatusInProgress, updated.Status)

	overwriteValue := 7.0
	record, updated, err = ts.CreateActionGoalRecord(ctx, &store.ActionGoalRecord{
		UID: "goal-record-overwrite", ActionID: goal.ID, CreatorID: user.ID,
		Operation: store.GoalRecordOperationOverwrite, OverwriteValue: &overwriteValue, RecordedTs: time.Now().Unix(),
	})
	require.NoError(t, err)
	require.Equal(t, 3.0, record.Delta)
	require.Equal(t, 7.0, record.ValueAfter)
	require.Equal(t, store.GoalRecordOperationOverwrite, record.Operation)
	require.Equal(t, 7.0, *updated.GoalCurrent)

	negativeOverwriteValue := -1.0
	_, _, err = ts.CreateActionGoalRecord(ctx, &store.ActionGoalRecord{
		UID: "goal-record-negative-overwrite", ActionID: goal.ID, CreatorID: user.ID,
		Operation: store.GoalRecordOperationOverwrite, OverwriteValue: &negativeOverwriteValue, RecordedTs: time.Now().Unix(),
	})
	require.ErrorIs(t, err, store.ErrGoalProgressNegative)

	_, _, err = ts.CreateActionGoalRecord(ctx, &store.ActionGoalRecord{
		UID: "goal-record-rejected", ActionID: goal.ID, CreatorID: user.ID, Delta: -8, RecordedTs: time.Now().Unix(),
	})
	require.ErrorIs(t, err, store.ErrGoalProgressNegative)

	record, updated, err = ts.CreateActionGoalRecord(ctx, &store.ActionGoalRecord{
		UID: "goal-record-3", ActionID: goal.ID, CreatorID: user.ID, Delta: 3, RecordedTs: time.Now().Unix(),
	})
	require.NoError(t, err)
	require.Equal(t, 10.0, record.ValueAfter)
	require.Equal(t, store.ActionStatusDone, updated.Status)
	require.NotNil(t, updated.CompletedTs)

	records, err := ts.ListActionGoalRecords(ctx, &store.FindActionGoalRecord{ActionID: &goal.ID, CreatorID: &user.ID})
	require.NoError(t, err)
	require.Len(t, records, 4)
	for _, item := range records {
		require.NotEqual(t, "goal-record-rejected", item.UID)
		require.NotEqual(t, "goal-record-negative-overwrite", item.UID)
	}
}

func TestActionHabitRecordBatch(t *testing.T) {
	ctx := context.Background()
	ts := NewTestingStore(ctx, t)
	t.Cleanup(func() { require.NoError(t, ts.Close()) })
	if ts.Profile.Driver != "sqlite" {
		t.Skip("Action MVP persistence is SQLite-only")
	}
	user, err := createTestingHostUser(ctx, ts)
	require.NoError(t, err)
	startDate := "2026-08-10"
	scheduleType := store.HabitScheduleIntervalDays
	intervalDays := int32(2)
	habit := createTestingAction(t, ctx, ts, &store.Action{
		UID: "habit-record", CreatorID: user.ID, Type: store.ActionTypeHabit, Title: "Exercise",
		HabitStartDate: &startDate, HabitScheduleType: &scheduleType, HabitIntervalDays: &intervalDays,
	})

	_, err = ts.BatchUpdateActionHabitRecords(ctx, []*store.ActionHabitRecord{{
		UID: "habit-record-1", ActionID: habit.ID, CreatorID: user.ID, OccurrenceDate: startDate,
		Status: store.HabitRecordStatusCheckedIn, Note: "First session",
	}})
	require.NoError(t, err)
	records, err := ts.ListActionHabitRecords(ctx, &store.FindActionHabitRecord{
		ActionID: &habit.ID, CreatorID: &user.ID, OccurrenceDate: &startDate,
	})
	require.NoError(t, err)
	require.Len(t, records, 1)
	require.Equal(t, store.HabitRecordStatusCheckedIn, records[0].Status)
	require.Equal(t, "First session", records[0].Note)

	_, err = ts.BatchUpdateActionHabitRecords(ctx, []*store.ActionHabitRecord{{
		UID: "habit-record-2", ActionID: habit.ID, CreatorID: user.ID, OccurrenceDate: startDate,
		Status: store.HabitRecordStatusLeave, Note: "Rest day",
	}})
	require.NoError(t, err)
	records, err = ts.ListActionHabitRecords(ctx, &store.FindActionHabitRecord{ActionID: &habit.ID, CreatorID: &user.ID})
	require.NoError(t, err)
	require.Len(t, records, 1)
	require.Equal(t, store.HabitRecordStatusLeave, records[0].Status)
	require.Equal(t, "Rest day", records[0].Note)

	_, err = ts.BatchUpdateActionHabitRecords(ctx, []*store.ActionHabitRecord{{
		UID: "ignored-on-delete", ActionID: habit.ID, CreatorID: user.ID, OccurrenceDate: startDate,
		Status: store.HabitRecordStatusUnchecked,
	}})
	require.NoError(t, err)
	records, err = ts.ListActionHabitRecords(ctx, &store.FindActionHabitRecord{ActionID: &habit.ID, CreatorID: &user.ID})
	require.NoError(t, err)
	require.Empty(t, records)

	task := createTestingAction(t, ctx, ts, &store.Action{
		UID: "habit-batch-task", CreatorID: user.ID, Type: store.ActionTypeTask, Title: "Not a habit",
	})
	_, err = ts.BatchUpdateActionHabitRecords(ctx, []*store.ActionHabitRecord{
		{
			UID: "habit-record-atomic", ActionID: habit.ID, CreatorID: user.ID, OccurrenceDate: startDate,
			Status: store.HabitRecordStatusCheckedIn,
		},
		{
			UID: "habit-record-invalid", ActionID: task.ID, CreatorID: user.ID, OccurrenceDate: startDate,
			Status: store.HabitRecordStatusCheckedIn,
		},
	})
	require.ErrorIs(t, err, store.ErrHabitRecordUnavailable)
	records, err = ts.ListActionHabitRecords(ctx, &store.FindActionHabitRecord{ActionID: &habit.ID, CreatorID: &user.ID})
	require.NoError(t, err)
	require.Empty(t, records)
}

func TestActionStatusHistory(t *testing.T) {
	ctx := context.Background()
	ts := NewTestingStore(ctx, t)
	t.Cleanup(func() { require.NoError(t, ts.Close()) })
	if ts.Profile.Driver != "sqlite" {
		t.Skip("Action MVP persistence is SQLite-only")
	}
	user, err := createTestingHostUser(ctx, ts)
	require.NoError(t, err)
	action := createTestingAction(t, ctx, ts, &store.Action{
		UID: "status-history", CreatorID: user.ID, Type: store.ActionTypeTask, Title: "Status history",
	})

	completedAt := time.Now().Add(-time.Hour).Unix()
	_, err = ts.TransitionActionStatus(ctx, &store.TransitionActionStatus{
		ActionID: action.ID, CreatorID: user.ID,
		FromStatus: store.ActionStatusTodo, ToStatus: store.ActionStatusDone,
		EffectiveDate: "2026-08-08", CreatedTs: completedAt,
	})
	require.NoError(t, err)
	terminatedAt := time.Now().Add(-30 * time.Minute).Unix()
	_, err = ts.TransitionActionStatus(ctx, &store.TransitionActionStatus{
		ActionID: action.ID, CreatorID: user.ID,
		FromStatus: store.ActionStatusDone, ToStatus: store.ActionStatusTerminated,
		Reason: "No longer needed", EffectiveDate: "2026-08-09", CreatedTs: terminatedAt,
	})
	require.NoError(t, err)

	terminated, err := ts.GetAction(ctx, &store.FindAction{ID: &action.ID, CreatorID: &user.ID})
	require.NoError(t, err)
	require.Equal(t, store.ActionStatusTerminated, terminated.Status)
	require.Equal(t, "No longer needed", terminated.TerminationReason)
	require.NotNil(t, terminated.CompletedTs)

	_, err = ts.TransitionActionStatus(ctx, &store.TransitionActionStatus{
		ActionID: action.ID, CreatorID: user.ID,
		FromStatus: store.ActionStatusTerminated, ToStatus: store.ActionStatusDone,
		EffectiveDate: "2026-08-10", CreatedTs: time.Now().Unix(),
	})
	require.NoError(t, err)
	reopened, err := ts.GetAction(ctx, &store.FindAction{ID: &action.ID, CreatorID: &user.ID})
	require.NoError(t, err)
	require.Equal(t, store.ActionStatusDone, reopened.Status)
	require.Empty(t, reopened.TerminationReason)
	require.Nil(t, reopened.TerminatedTs)
	require.Equal(t, completedAt, *reopened.CompletedTs)

	histories, err := ts.ListActionStatusHistories(ctx, &store.FindActionStatusHistory{ActionID: &action.ID, CreatorID: &user.ID})
	require.NoError(t, err)
	require.Len(t, histories, 3)
	require.Equal(t, store.ActionStatusDone, histories[1].FromStatus)
	require.Equal(t, store.ActionStatusTerminated, histories[1].ToStatus)
	require.Equal(t, "No longer needed", histories[1].Reason)
	require.Equal(t, "2026-08-09", histories[1].EffectiveDate)
	require.Equal(t, store.ActionStatusDone, histories[2].ToStatus)
}

func TestCompleteActionTree(t *testing.T) {
	ctx := context.Background()
	ts := NewTestingStore(ctx, t)
	t.Cleanup(func() { require.NoError(t, ts.Close()) })
	if ts.Profile.Driver != "sqlite" {
		t.Skip("Action MVP persistence is SQLite-only")
	}
	user, err := createTestingHostUser(ctx, ts)
	require.NoError(t, err)

	project := createTestingAction(t, ctx, ts, &store.Action{
		UID: "tree-project", CreatorID: user.ID, Type: store.ActionTypeProject, Title: "Project",
	})
	activeChild := createTestingAction(t, ctx, ts, &store.Action{
		UID: "tree-active", CreatorID: user.ID, ParentID: &project.ID, Type: store.ActionTypeTask, Title: "Active child",
	})
	doneChild := createTestingAction(t, ctx, ts, &store.Action{
		UID: "tree-done", CreatorID: user.ID, ParentID: &project.ID, Type: store.ActionTypeTask, Title: "Done child",
	})
	activeGrandchild := createTestingAction(t, ctx, ts, &store.Action{
		UID: "tree-grandchild", CreatorID: user.ID, ParentID: &doneChild.ID, Type: store.ActionTypeTask, Title: "Active grandchild",
	})
	abandonedChild := createTestingAction(t, ctx, ts, &store.Action{
		UID: "tree-abandoned", CreatorID: user.ID, ParentID: &project.ID, Type: store.ActionTypeTask, Title: "Abandoned child",
	})
	abandonedGrandchild := createTestingAction(t, ctx, ts, &store.Action{
		UID: "tree-abandoned-child", CreatorID: user.ID, ParentID: &abandonedChild.ID, Type: store.ActionTypeTask, Title: "Abandoned grandchild",
	})
	now := time.Now().Unix()
	_, err = ts.TransitionActionStatus(ctx, &store.TransitionActionStatus{
		ActionID: doneChild.ID, CreatorID: user.ID,
		FromStatus: store.ActionStatusTodo, ToStatus: store.ActionStatusDone,
		EffectiveDate: "2026-08-19", CreatedTs: now - 20,
	})
	require.NoError(t, err)
	_, err = ts.TransitionActionStatus(ctx, &store.TransitionActionStatus{
		ActionID: abandonedChild.ID, CreatorID: user.ID,
		FromStatus: store.ActionStatusTodo, ToStatus: store.ActionStatusTerminated,
		Reason: "No longer needed", EffectiveDate: "2026-08-19", CreatedTs: now - 10,
	})
	require.NoError(t, err)

	require.NoError(t, ts.CompleteActionTree(ctx, user.ID, project.ID, "2026-08-20", now))

	for _, item := range []*store.Action{project, activeChild, doneChild, activeGrandchild, abandonedChild, abandonedGrandchild} {
		updated, err := ts.GetAction(ctx, &store.FindAction{ID: &item.ID, CreatorID: &user.ID})
		require.NoError(t, err)
		switch item.ID {
		case abandonedChild.ID:
			require.Equal(t, store.ActionStatusTerminated, updated.Status)
		case abandonedGrandchild.ID:
			require.Equal(t, store.ActionStatusTodo, updated.Status)
		default:
			require.Equal(t, store.ActionStatusDone, updated.Status)
		}
	}

	histories, err := ts.ListActionStatusHistories(ctx, &store.FindActionStatusHistory{CreatorID: &user.ID})
	require.NoError(t, err)
	require.Len(t, histories, 5)
}

func TestMemoActionRelationReplacement(t *testing.T) {
	ctx := context.Background()
	ts := NewTestingStore(ctx, t)
	t.Cleanup(func() { require.NoError(t, ts.Close()) })
	if ts.Profile.Driver != "sqlite" {
		t.Skip("Action MVP persistence is SQLite-only")
	}
	user, err := createTestingHostUser(ctx, ts)
	require.NoError(t, err)
	actionOne := createTestingAction(t, ctx, ts, &store.Action{
		UID: "relation-action-1", CreatorID: user.ID, Type: store.ActionTypeTask, Title: "First action",
	})
	actionTwo := createTestingAction(t, ctx, ts, &store.Action{
		UID: "relation-action-2", CreatorID: user.ID, Type: store.ActionTypeTask, Title: "Second action",
	})
	memoOne, err := ts.CreateMemo(ctx, &store.Memo{UID: "relation-memo-1", CreatorID: user.ID, Content: "First memo", Visibility: store.Private})
	require.NoError(t, err)
	memoTwo, err := ts.CreateMemo(ctx, &store.Memo{UID: "relation-memo-2", CreatorID: user.ID, Content: "Second memo", Visibility: store.Private})
	require.NoError(t, err)

	require.NoError(t, ts.SetMemoActionRelations(ctx, &store.SetMemoActionRelations{
		CreatorID: user.ID, MemoID: &memoOne.ID, ActionIDs: []int32{actionOne.ID, actionTwo.ID},
	}))
	require.NoError(t, ts.SetMemoActionRelations(ctx, &store.SetMemoActionRelations{
		CreatorID: user.ID, MemoID: &memoOne.ID, ActionIDs: []int32{actionTwo.ID},
	}))
	relations, err := ts.ListMemoActionRelations(ctx, &store.FindMemoActionRelation{MemoID: &memoOne.ID, CreatorID: &user.ID})
	require.NoError(t, err)
	require.Len(t, relations, 1)
	require.Equal(t, actionTwo.ID, relations[0].ActionID)

	require.NoError(t, ts.SetMemoActionRelations(ctx, &store.SetMemoActionRelations{
		CreatorID: user.ID, ActionID: &actionTwo.ID, MemoIDs: []int32{memoTwo.ID},
	}))
	relations, err = ts.ListMemoActionRelations(ctx, &store.FindMemoActionRelation{ActionID: &actionTwo.ID, CreatorID: &user.ID})
	require.NoError(t, err)
	require.Len(t, relations, 1)
	require.Equal(t, memoTwo.ID, relations[0].MemoID)
}
