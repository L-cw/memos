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

	record, updated, err = ts.CreateActionGoalRecord(ctx, &store.ActionGoalRecord{
		UID: "goal-record-2", ActionID: goal.ID, CreatorID: user.ID, Delta: -2, RecordedTs: time.Now().Add(-time.Hour).Unix(),
	})
	require.NoError(t, err)
	require.Equal(t, 4.0, record.ValueAfter)
	require.Equal(t, store.ActionStatusInProgress, updated.Status)

	_, _, err = ts.CreateActionGoalRecord(ctx, &store.ActionGoalRecord{
		UID: "goal-record-rejected", ActionID: goal.ID, CreatorID: user.ID, Delta: -5, RecordedTs: time.Now().Unix(),
	})
	require.ErrorIs(t, err, store.ErrGoalProgressNegative)

	record, updated, err = ts.CreateActionGoalRecord(ctx, &store.ActionGoalRecord{
		UID: "goal-record-3", ActionID: goal.ID, CreatorID: user.ID, Delta: 6, RecordedTs: time.Now().Unix(),
	})
	require.NoError(t, err)
	require.Equal(t, 10.0, record.ValueAfter)
	require.Equal(t, store.ActionStatusDone, updated.Status)
	require.NotNil(t, updated.CompletedTs)

	records, err := ts.ListActionGoalRecords(ctx, &store.FindActionGoalRecord{ActionID: &goal.ID, CreatorID: &user.ID})
	require.NoError(t, err)
	require.Len(t, records, 3)
	for _, item := range records {
		require.NotEqual(t, "goal-record-rejected", item.UID)
	}
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
