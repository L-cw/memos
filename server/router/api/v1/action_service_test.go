package v1

import (
	"testing"

	"github.com/stretchr/testify/require"

	v1pb "github.com/usememos/memos/proto/gen/api/v1"
	"github.com/usememos/memos/store"
)

func TestIsHabitDue(t *testing.T) {
	startDate := "2026-08-10"
	intervalSchedule := store.HabitScheduleIntervalDays
	intervalDays := int32(2)
	intervalHabit := &store.Action{
		Type: store.ActionTypeHabit, HabitStartDate: &startDate,
		HabitScheduleType: &intervalSchedule, HabitIntervalDays: &intervalDays,
	}
	require.True(t, isHabitDue(intervalHabit, "2026-08-10"))
	require.False(t, isHabitDue(intervalHabit, "2026-08-11"))
	require.True(t, isHabitDue(intervalHabit, "2026-08-12"))
	require.False(t, isHabitDue(intervalHabit, "2026-08-08"))

	weeklySchedule := store.HabitScheduleWeekly
	weeklyHabit := &store.Action{
		Type: store.ActionTypeHabit, HabitStartDate: &startDate,
		HabitScheduleType: &weeklySchedule, HabitWeekdays: []int32{1, 3, 5},
	}
	require.True(t, isHabitDue(weeklyHabit, "2026-08-10"))
	require.False(t, isHabitDue(weeklyHabit, "2026-08-11"))
	require.True(t, isHabitDue(weeklyHabit, "2026-08-12"))
}

func TestValidateHabitSchedule(t *testing.T) {
	schedule, interval, weekdays, err := validateHabitSchedule(&v1pb.HabitPayload{
		ScheduleType: v1pb.HabitScheduleType_INTERVAL_DAYS,
		IntervalDays: 2,
	})
	require.NoError(t, err)
	require.Equal(t, store.HabitScheduleIntervalDays, schedule)
	require.Equal(t, int32(2), *interval)
	require.Empty(t, weekdays)

	_, _, _, err = validateHabitSchedule(&v1pb.HabitPayload{
		ScheduleType: v1pb.HabitScheduleType_WEEKLY,
		Weekdays:     []int32{1, 1},
	})
	require.Error(t, err)
}

func TestValidateActionTermination(t *testing.T) {
	for _, actionType := range []store.ActionType{
		store.ActionTypeTask,
		store.ActionTypeProject,
		store.ActionTypeGoal,
		store.ActionTypeHabit,
	} {
		for _, actionStatus := range []store.ActionStatus{
			store.ActionStatusTodo,
			store.ActionStatusInProgress,
			store.ActionStatusDone,
		} {
			require.NoError(t, validateActionTermination(&store.Action{Type: actionType, Status: actionStatus}))
		}
	}
	require.Error(t, validateActionTermination(&store.Action{Type: store.ActionTypeHabit, Status: store.ActionStatusTerminated}))
}

func TestValidateActionCompletion(t *testing.T) {
	for _, actionType := range []store.ActionType{
		store.ActionTypeTask,
		store.ActionTypeProject,
		store.ActionTypeGoal,
		store.ActionTypeHabit,
	} {
		for _, actionStatus := range []store.ActionStatus{
			store.ActionStatusTodo,
			store.ActionStatusInProgress,
			store.ActionStatusDone,
		} {
			require.NoError(t, validateActionCompletion(&store.Action{Type: actionType, Status: actionStatus}))
		}
	}
	require.Error(t, validateActionCompletion(&store.Action{Type: store.ActionTypeHabit, Status: store.ActionStatusTerminated}))
}

func TestConvertGoalRecordOperationToStore(t *testing.T) {
	operation, err := convertGoalRecordOperationToStore(v1pb.GoalRecordOperation_GOAL_RECORD_OPERATION_UNSPECIFIED)
	require.NoError(t, err)
	require.Equal(t, store.GoalRecordOperationDelta, operation)

	operation, err = convertGoalRecordOperationToStore(v1pb.GoalRecordOperation_OVERWRITE)
	require.NoError(t, err)
	require.Equal(t, store.GoalRecordOperationOverwrite, operation)
}

func TestIsActionActiveOnDate(t *testing.T) {
	histories := []*store.ActionStatusHistory{
		{FromStatus: store.ActionStatusInProgress, ToStatus: store.ActionStatusTerminated, EffectiveDate: "2026-08-05"},
		{FromStatus: store.ActionStatusTerminated, ToStatus: store.ActionStatusInProgress, EffectiveDate: "2026-08-08"},
		{FromStatus: store.ActionStatusInProgress, ToStatus: store.ActionStatusDone, EffectiveDate: "2026-08-10"},
		{FromStatus: store.ActionStatusDone, ToStatus: store.ActionStatusInProgress, EffectiveDate: "2026-08-12"},
	}
	require.True(t, isActionActiveOnDate(histories, "2026-08-04"))
	require.False(t, isActionActiveOnDate(histories, "2026-08-05"))
	require.False(t, isActionActiveOnDate(histories, "2026-08-07"))
	require.True(t, isActionActiveOnDate(histories, "2026-08-08"))
	require.False(t, isActionActiveOnDate(histories, "2026-08-10"))
	require.True(t, isActionActiveOnDate(histories, "2026-08-12"))
}
