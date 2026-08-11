package v1

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/lithammer/shortuuid/v4"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
	"google.golang.org/protobuf/types/known/emptypb"
	"google.golang.org/protobuf/types/known/timestamppb"

	v1pb "github.com/usememos/memos/proto/gen/api/v1"
	"github.com/usememos/memos/store"
)

const maxPinnedActions = 6

func (s *APIV1Service) CreateAction(ctx context.Context, request *v1pb.CreateActionRequest) (*v1pb.Action, error) {
	user, err := s.requireActionUser(ctx)
	if err != nil {
		return nil, err
	}
	if request.Action == nil {
		return nil, status.Error(codes.InvalidArgument, "action is required")
	}
	actionMessage := request.Action
	title := strings.TrimSpace(actionMessage.Title)
	if title == "" {
		return nil, status.Error(codes.InvalidArgument, "title is required")
	}
	actionType, err := convertActionTypeToStore(actionMessage.Type)
	if err != nil {
		return nil, err
	}
	if actionMessage.Pinned {
		return nil, status.Error(codes.InvalidArgument, "pin an action after it is created")
	}
	var parentID *int32
	var parentAction *store.Action
	if actionMessage.Parent != nil && strings.TrimSpace(actionMessage.GetParent()) != "" {
		parent, err := s.getOwnedAction(ctx, user.ID, actionMessage.GetParent())
		if err != nil {
			return nil, err
		}
		parentAction = parent
		parentID = &parent.ID
	}
	if actionType == store.ActionTypeHabit && parentID != nil {
		return nil, status.Error(codes.InvalidArgument, "Habit actions cannot have a parent")
	}
	if parentAction != nil && parentAction.Type == store.ActionTypeHabit {
		return nil, status.Error(codes.InvalidArgument, "Habit actions cannot have children")
	}
	planDate, err := validatePlanDate(actionMessage.PlanDate)
	if err != nil {
		return nil, err
	}
	deadlineTs, err := timestampToUnix(actionMessage.Deadline, "deadline")
	if err != nil {
		return nil, err
	}

	create := &store.Action{
		UID:         shortuuid.New(),
		CreatorID:   user.ID,
		ParentID:    parentID,
		Type:        actionType,
		Status:      store.ActionStatusTodo,
		Title:       title,
		Description: strings.TrimSpace(actionMessage.Description),
		PlanDate:    planDate,
		DeadlineTs:  deadlineTs,
		SortOrder:   actionMessage.SortOrder,
		RowStatus:   store.Normal,
	}
	if actionType == store.ActionTypeGoal {
		if actionMessage.Goal == nil || actionMessage.Goal.Target <= 0 {
			return nil, status.Error(codes.InvalidArgument, "goal target must be greater than 0")
		}
		unit := strings.TrimSpace(actionMessage.Goal.Unit)
		if unit == "" {
			return nil, status.Error(codes.InvalidArgument, "goal unit is required")
		}
		current := 0.0
		target := actionMessage.Goal.Target
		create.GoalCurrent = &current
		create.GoalTarget = &target
		create.GoalUnit = &unit
	} else if actionMessage.Goal != nil {
		return nil, status.Error(codes.InvalidArgument, "goal payload is only valid for Goal actions")
	}
	if actionType == store.ActionTypeHabit {
		if actionMessage.Habit == nil {
			return nil, status.Error(codes.InvalidArgument, "habit payload is required")
		}
		startDate, err := validateRequiredDate(actionMessage.Habit.StartDate, "habit.start_date")
		if err != nil {
			return nil, err
		}
		scheduleType, intervalDays, weekdays, err := validateHabitSchedule(actionMessage.Habit)
		if err != nil {
			return nil, err
		}
		create.HabitStartDate = &startDate
		create.HabitScheduleType = &scheduleType
		create.HabitIntervalDays = intervalDays
		create.HabitWeekdays = weekdays
	} else if actionMessage.Habit != nil {
		return nil, status.Error(codes.InvalidArgument, "habit payload is only valid for Habit actions")
	}

	created, err := s.Store.CreateAction(ctx, create)
	if err != nil {
		return nil, actionStoreError("create action", err)
	}
	if err := s.recalculateProjectAncestors(ctx, user.ID, created.ParentID); err != nil {
		return nil, err
	}
	return s.getActionMessage(ctx, user.ID, created.UID)
}

func (s *APIV1Service) ListActions(ctx context.Context, request *v1pb.ListActionsRequest) (*v1pb.ListActionsResponse, error) {
	user, err := s.requireActionUser(ctx)
	if err != nil {
		return nil, err
	}
	ordered, byID, err := s.loadActionMessages(ctx, user.ID)
	if err != nil {
		return nil, err
	}

	filtered := []*v1pb.Action{}
	for _, action := range ordered {
		bundle := byID[actionInternalID(action, byID)]
		if bundle == nil {
			continue
		}
		storeAction := bundle.storeAction
		if !request.PinnedOnly && storeAction.ParentID != nil {
			continue
		}
		if request.PinnedOnly && storeAction.PinnedTs == nil {
			continue
		}
		if request.Type != nil && action.Type != request.GetType() {
			continue
		}
		if len(request.Statuses) > 0 && !containsActionStatus(request.Statuses, action.Status) {
			continue
		}
		if request.PlanDate != "" && action.PlanDate != request.PlanDate {
			continue
		}
		filtered = append(filtered, action)
	}

	limit, offset, err := parseActionPage(request.PageSize, request.PageToken)
	if err != nil {
		return nil, err
	}
	end := offset + limit
	nextPageToken := ""
	if end < len(filtered) {
		nextPageToken, err = getPageToken(limit, end)
		if err != nil {
			return nil, status.Errorf(codes.Internal, "failed to create page token: %v", err)
		}
	} else {
		end = len(filtered)
	}
	if offset > len(filtered) {
		offset = len(filtered)
	}
	return &v1pb.ListActionsResponse{Actions: filtered[offset:end], NextPageToken: nextPageToken}, nil
}

func (s *APIV1Service) GetAction(ctx context.Context, request *v1pb.GetActionRequest) (*v1pb.Action, error) {
	user, err := s.requireActionUser(ctx)
	if err != nil {
		return nil, err
	}
	uid, err := ExtractActionUIDFromName(request.Name)
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid action name: %v", err)
	}
	return s.getActionMessage(ctx, user.ID, uid)
}

func (s *APIV1Service) UpdateAction(ctx context.Context, request *v1pb.UpdateActionRequest) (*v1pb.Action, error) {
	user, err := s.requireActionUser(ctx)
	if err != nil {
		return nil, err
	}
	if request.Action == nil || request.UpdateMask == nil || len(request.UpdateMask.Paths) == 0 {
		return nil, status.Error(codes.InvalidArgument, "action and update mask are required")
	}
	action, err := s.getOwnedAction(ctx, user.ID, request.Action.Name)
	if err != nil {
		return nil, err
	}
	update := &store.UpdateAction{ID: action.ID, CreatorID: user.ID}
	updatePinned := false
	pinned := false
	for _, path := range request.UpdateMask.Paths {
		switch path {
		case "title":
			title := strings.TrimSpace(request.Action.Title)
			if title == "" {
				return nil, status.Error(codes.InvalidArgument, "title is required")
			}
			update.Title = &title
		case "description":
			description := strings.TrimSpace(request.Action.Description)
			update.Description = &description
		case "plan_date":
			planDate, err := validatePlanDate(request.Action.PlanDate)
			if err != nil {
				return nil, err
			}
			if planDate == nil {
				empty := ""
				planDate = &empty
			}
			update.PlanDate = planDate
		case "deadline":
			deadline, err := timestampToUnix(request.Action.Deadline, "deadline")
			if err != nil {
				return nil, err
			}
			if deadline == nil {
				zero := int64(0)
				deadline = &zero
			}
			update.DeadlineTs = deadline
		case "pinned":
			updatePinned = true
			pinned = request.Action.Pinned
		default:
			return nil, status.Errorf(codes.InvalidArgument, "field %q cannot be updated", path)
		}
	}
	if err := s.Store.UpdateAction(ctx, update); err != nil {
		return nil, actionStoreError("update action", err)
	}
	if updatePinned {
		if err := s.Store.SetActionPinned(ctx, user.ID, action.ID, pinned, maxPinnedActions); err != nil {
			return nil, actionStoreError("update pinned state", err)
		}
	}
	return s.getActionMessage(ctx, user.ID, action.UID)
}

func (s *APIV1Service) DeleteAction(ctx context.Context, request *v1pb.DeleteActionRequest) (*emptypb.Empty, error) {
	user, err := s.requireActionUser(ctx)
	if err != nil {
		return nil, err
	}
	action, err := s.getOwnedAction(ctx, user.ID, request.Name)
	if err != nil {
		return nil, err
	}
	if err := s.Store.ArchiveActionTree(ctx, user.ID, action.ID); err != nil {
		return nil, actionStoreError("delete action", err)
	}
	if err := s.recalculateProjectAncestors(ctx, user.ID, action.ParentID); err != nil {
		return nil, err
	}
	return &emptypb.Empty{}, nil
}

func (s *APIV1Service) CompleteAction(ctx context.Context, request *v1pb.CompleteActionRequest) (*v1pb.Action, error) {
	user, err := s.requireActionUser(ctx)
	if err != nil {
		return nil, err
	}
	action, err := s.getOwnedAction(ctx, user.ID, request.Name)
	if err != nil {
		return nil, err
	}
	if action.Type != store.ActionTypeTask {
		return nil, status.Error(codes.FailedPrecondition, "only Todo actions can be completed manually")
	}
	if action.Status == store.ActionStatusTerminated {
		return nil, status.Error(codes.FailedPrecondition, "terminated Action cannot be completed")
	}
	if action.Status != store.ActionStatusDone {
		now := time.Now().Unix()
		if _, err := s.Store.TransitionActionStatus(ctx, &store.TransitionActionStatus{
			ActionID: action.ID, CreatorID: user.ID,
			FromStatus: action.Status, ToStatus: store.ActionStatusDone,
			EffectiveDate: time.Unix(now, 0).Format("2006-01-02"), CreatedTs: now,
		}); err != nil {
			return nil, actionStoreError("complete action", err)
		}
		if err := s.recalculateProjectAncestors(ctx, user.ID, action.ParentID); err != nil {
			return nil, err
		}
	}
	return s.getActionMessage(ctx, user.ID, action.UID)
}

func (s *APIV1Service) ReopenAction(ctx context.Context, request *v1pb.ReopenActionRequest) (*v1pb.Action, error) {
	user, err := s.requireActionUser(ctx)
	if err != nil {
		return nil, err
	}
	action, err := s.getOwnedAction(ctx, user.ID, request.Name)
	if err != nil {
		return nil, err
	}
	effectiveDate, err := resolveActionEffectiveDate(request.EffectiveDate)
	if err != nil {
		return nil, err
	}
	if action.Type == store.ActionTypeProject && action.Status != store.ActionStatusTerminated {
		return nil, status.Error(codes.FailedPrecondition, "Project status is calculated from its descendants")
	}
	if action.Status != store.ActionStatusDone && action.Status != store.ActionStatusTerminated {
		return nil, status.Error(codes.FailedPrecondition, "only completed actions can be reopened")
	}
	nextStatus := store.ActionStatusInProgress
	if action.Status == store.ActionStatusTerminated {
		histories, err := s.Store.ListActionStatusHistories(ctx, &store.FindActionStatusHistory{ActionID: &action.ID, CreatorID: &user.ID})
		if err != nil {
			return nil, actionStoreError("list Action status history", err)
		}
		for index := len(histories) - 1; index >= 0; index-- {
			if histories[index].ToStatus == store.ActionStatusTerminated {
				if effectiveDate < histories[index].EffectiveDate {
					return nil, status.Error(codes.InvalidArgument, "effective_date cannot be before the termination date")
				}
				nextStatus = histories[index].FromStatus
				break
			}
		}
		if action.Type == store.ActionTypeProject {
			nextStatus, err = s.calculateProjectStatus(ctx, user.ID, action.ID)
			if err != nil {
				return nil, err
			}
		}
	}
	now := time.Now().Unix()
	if _, err := s.Store.TransitionActionStatus(ctx, &store.TransitionActionStatus{
		ActionID: action.ID, CreatorID: user.ID,
		FromStatus: action.Status, ToStatus: nextStatus,
		EffectiveDate: effectiveDate, CreatedTs: now,
	}); err != nil {
		return nil, actionStoreError("reopen action", err)
	}
	if err := s.recalculateProjectAncestors(ctx, user.ID, action.ParentID); err != nil {
		return nil, err
	}
	return s.getActionMessage(ctx, user.ID, action.UID)
}

func (s *APIV1Service) TerminateAction(ctx context.Context, request *v1pb.TerminateActionRequest) (*v1pb.Action, error) {
	user, err := s.requireActionUser(ctx)
	if err != nil {
		return nil, err
	}
	action, err := s.getOwnedAction(ctx, user.ID, request.Name)
	if err != nil {
		return nil, err
	}
	if err := validateActionTermination(action); err != nil {
		return nil, err
	}
	reason := strings.TrimSpace(request.Reason)
	if reason == "" {
		return nil, status.Error(codes.InvalidArgument, "termination reason is required")
	}
	effectiveDate, err := resolveActionEffectiveDate(request.EffectiveDate)
	if err != nil {
		return nil, err
	}
	now := time.Now().Unix()
	if _, err := s.Store.TransitionActionStatus(ctx, &store.TransitionActionStatus{
		ActionID: action.ID, CreatorID: user.ID,
		FromStatus: action.Status, ToStatus: store.ActionStatusTerminated,
		Reason: reason, EffectiveDate: effectiveDate, CreatedTs: now,
	}); err != nil {
		return nil, actionStoreError("terminate Action", err)
	}
	if err := s.recalculateProjectAncestors(ctx, user.ID, action.ParentID); err != nil {
		return nil, err
	}
	return s.getActionMessage(ctx, user.ID, action.UID)
}

func validateActionTermination(action *store.Action) error {
	if action.Status == store.ActionStatusTerminated {
		return status.Error(codes.FailedPrecondition, "the current Action cannot be terminated")
	}
	return nil
}

func (s *APIV1Service) MoveAction(ctx context.Context, request *v1pb.MoveActionRequest) (*v1pb.Action, error) {
	user, err := s.requireActionUser(ctx)
	if err != nil {
		return nil, err
	}
	action, err := s.getOwnedAction(ctx, user.ID, request.Name)
	if err != nil {
		return nil, err
	}
	oldParentID := action.ParentID
	if action.Type == store.ActionTypeHabit && request.Parent != nil && strings.TrimSpace(request.GetParent()) != "" {
		return nil, status.Error(codes.InvalidArgument, "Habit actions cannot have a parent")
	}
	var parentID *int32
	if request.Parent != nil && strings.TrimSpace(request.GetParent()) != "" {
		parent, err := s.getOwnedAction(ctx, user.ID, request.GetParent())
		if err != nil {
			return nil, err
		}
		if parent.ID == action.ID {
			return nil, status.Error(codes.InvalidArgument, "an action cannot be its own parent")
		}
		if parent.Type == store.ActionTypeHabit {
			return nil, status.Error(codes.InvalidArgument, "Habit actions cannot have children")
		}
		if err := s.ensureMoveDoesNotCreateCycle(ctx, user.ID, action.ID, parent); err != nil {
			return nil, err
		}
		parentID = &parent.ID
	}
	if err := s.Store.MoveAction(ctx, &store.MoveAction{ID: action.ID, CreatorID: user.ID, ParentID: parentID, SortOrder: request.SortOrder}); err != nil {
		return nil, actionStoreError("move action", err)
	}
	if err := s.recalculateProjectAncestors(ctx, user.ID, oldParentID); err != nil {
		return nil, err
	}
	if err := s.recalculateProjectAncestors(ctx, user.ID, parentID); err != nil {
		return nil, err
	}
	return s.getActionMessage(ctx, user.ID, action.UID)
}

func (s *APIV1Service) CreateGoalRecord(ctx context.Context, request *v1pb.CreateGoalRecordRequest) (*v1pb.GoalRecord, error) {
	user, err := s.requireActionUser(ctx)
	if err != nil {
		return nil, err
	}
	action, err := s.getOwnedAction(ctx, user.ID, request.Parent)
	if err != nil {
		return nil, err
	}
	if request.GoalRecord == nil {
		return nil, status.Error(codes.InvalidArgument, "goal record is required")
	}
	operation, err := convertGoalRecordOperationToStore(request.GoalRecord.Operation)
	if err != nil {
		return nil, err
	}
	if operation == store.GoalRecordOperationDelta && request.GoalRecord.Delta == 0 {
		return nil, status.Error(codes.InvalidArgument, "goal progress delta cannot be 0")
	}
	if operation == store.GoalRecordOperationOverwrite && request.GoalRecord.OverwriteValue == nil {
		return nil, status.Error(codes.InvalidArgument, "goal overwrite value is required")
	}
	recordedTs, err := requiredTimestampToUnix(request.GoalRecord.RecordedTime, "recorded_time")
	if err != nil {
		return nil, err
	}
	record, updatedAction, err := s.Store.CreateActionGoalRecord(ctx, &store.ActionGoalRecord{
		UID: shortuuid.New(), ActionID: action.ID, CreatorID: user.ID, Delta: request.GoalRecord.Delta,
		Operation: operation, OverwriteValue: request.GoalRecord.OverwriteValue,
		Note: strings.TrimSpace(request.GoalRecord.Note), RecordedTs: recordedTs,
	})
	if err != nil {
		return nil, actionStoreError("create Goal record", err)
	}
	if updatedAction.Status == store.ActionStatusDone {
		if err := s.recalculateProjectAncestors(ctx, user.ID, updatedAction.ParentID); err != nil {
			return nil, err
		}
	}
	return convertGoalRecordFromStore(record, action.UID), nil
}

func (s *APIV1Service) ListGoalRecords(ctx context.Context, request *v1pb.ListGoalRecordsRequest) (*v1pb.ListGoalRecordsResponse, error) {
	user, err := s.requireActionUser(ctx)
	if err != nil {
		return nil, err
	}
	action, err := s.getOwnedAction(ctx, user.ID, request.Parent)
	if err != nil {
		return nil, err
	}
	records, err := s.Store.ListActionGoalRecords(ctx, &store.FindActionGoalRecord{ActionID: &action.ID, CreatorID: &user.ID})
	if err != nil {
		return nil, actionStoreError("list Goal records", err)
	}
	response := &v1pb.ListGoalRecordsResponse{GoalRecords: make([]*v1pb.GoalRecord, 0, len(records))}
	for _, record := range records {
		response.GoalRecords = append(response.GoalRecords, convertGoalRecordFromStore(record, action.UID))
	}
	return response, nil
}

func (s *APIV1Service) BatchUpdateHabitRecords(ctx context.Context, request *v1pb.BatchUpdateHabitRecordsRequest) (*v1pb.BatchUpdateHabitRecordsResponse, error) {
	user, err := s.requireActionUser(ctx)
	if err != nil {
		return nil, err
	}
	if len(request.HabitRecords) == 0 || len(request.HabitRecords) > 100 {
		return nil, status.Error(codes.InvalidArgument, "habit_records must contain between 1 and 100 items")
	}
	actionsByName := map[string]*store.Action{}
	statusHistoryByName := map[string][]*store.ActionStatusHistory{}
	actionUIDByID := map[int32]string{}
	seen := map[string]bool{}
	records := make([]*store.ActionHabitRecord, 0, len(request.HabitRecords))
	requested := map[string]bool{}
	for _, message := range request.HabitRecords {
		if message == nil {
			return nil, status.Error(codes.InvalidArgument, "habit record is required")
		}
		action := actionsByName[message.Action]
		if action == nil {
			action, err = s.getOwnedAction(ctx, user.ID, message.Action)
			if err != nil {
				return nil, err
			}
			if action.Type != store.ActionTypeHabit {
				return nil, status.Error(codes.InvalidArgument, "habit records require a Habit action")
			}
			if action.Status != store.ActionStatusTodo && action.Status != store.ActionStatusInProgress {
				return nil, status.Error(codes.FailedPrecondition, "the current Habit cannot be checked in")
			}
			actionsByName[message.Action] = action
			actionUIDByID[action.ID] = action.UID
			histories, err := s.Store.ListActionStatusHistories(ctx, &store.FindActionStatusHistory{ActionID: &action.ID, CreatorID: &user.ID})
			if err != nil {
				return nil, actionStoreError("list Habit status history", err)
			}
			statusHistoryByName[message.Action] = histories
		}
		occurrenceDate, err := validateRequiredDate(message.OccurrenceDate, "occurrence_date")
		if err != nil {
			return nil, err
		}
		if !isHabitDue(action, occurrenceDate) {
			return nil, status.Errorf(codes.FailedPrecondition, "%s is not scheduled on %s", message.Action, occurrenceDate)
		}
		if !isActionActiveOnDate(statusHistoryByName[message.Action], occurrenceDate) {
			return nil, status.Errorf(codes.FailedPrecondition, "%s was inactive on %s", message.Action, occurrenceDate)
		}
		key := fmt.Sprintf("%d/%s", action.ID, occurrenceDate)
		if seen[key] {
			return nil, status.Error(codes.InvalidArgument, "habit_records contains a duplicate action and date")
		}
		seen[key] = true
		requested[key] = true
		recordStatus, err := convertHabitRecordStatusToStore(message.Status)
		if err != nil {
			return nil, err
		}
		note := strings.TrimSpace(message.Note)
		if len([]rune(note)) > 500 {
			return nil, status.Error(codes.InvalidArgument, "habit record note cannot exceed 500 characters")
		}
		records = append(records, &store.ActionHabitRecord{
			UID: shortuuid.New(), ActionID: action.ID, CreatorID: user.ID, OccurrenceDate: occurrenceDate, Status: recordStatus, Note: note,
		})
	}
	stored, err := s.Store.BatchUpdateActionHabitRecords(ctx, records)
	if err != nil {
		return nil, actionStoreError("batch update Habit records", err)
	}
	response := &v1pb.BatchUpdateHabitRecordsResponse{HabitRecords: []*v1pb.HabitRecord{}}
	for _, record := range stored {
		key := fmt.Sprintf("%d/%s", record.ActionID, record.OccurrenceDate)
		if requested[key] {
			response.HabitRecords = append(response.HabitRecords, convertHabitRecordFromStore(record, actionUIDByID[record.ActionID]))
		}
	}
	return response, nil
}

func (s *APIV1Service) ListHabitRecords(ctx context.Context, request *v1pb.ListHabitRecordsRequest) (*v1pb.ListHabitRecordsResponse, error) {
	user, err := s.requireActionUser(ctx)
	if err != nil {
		return nil, err
	}
	find := &store.FindActionHabitRecord{CreatorID: &user.ID}
	if strings.TrimSpace(request.OccurrenceDate) != "" {
		occurrenceDate, err := validateRequiredDate(request.OccurrenceDate, "occurrence_date")
		if err != nil {
			return nil, err
		}
		find.OccurrenceDate = &occurrenceDate
	}
	uidByID := map[int32]string{}
	if strings.TrimSpace(request.Action) != "" {
		action, err := s.getOwnedAction(ctx, user.ID, request.Action)
		if err != nil {
			return nil, err
		}
		if action.Type != store.ActionTypeHabit {
			return nil, status.Error(codes.InvalidArgument, "action must be a Habit")
		}
		find.ActionID = &action.ID
		uidByID[action.ID] = action.UID
	} else {
		normal := store.Normal
		actions, err := s.Store.ListActions(ctx, &store.FindAction{CreatorID: &user.ID, RowStatus: &normal})
		if err != nil {
			return nil, actionStoreError("list actions for Habit records", err)
		}
		for _, action := range actions {
			uidByID[action.ID] = action.UID
		}
	}
	records, err := s.Store.ListActionHabitRecords(ctx, find)
	if err != nil {
		return nil, actionStoreError("list Habit records", err)
	}
	response := &v1pb.ListHabitRecordsResponse{HabitRecords: make([]*v1pb.HabitRecord, 0, len(records))}
	for _, record := range records {
		actionUID := uidByID[record.ActionID]
		if actionUID == "" {
			continue
		}
		response.HabitRecords = append(response.HabitRecords, convertHabitRecordFromStore(record, actionUID))
	}
	return response, nil
}

func (s *APIV1Service) SetActionMemoRelations(ctx context.Context, request *v1pb.SetActionMemoRelationsRequest) (*emptypb.Empty, error) {
	user, err := s.requireActionUser(ctx)
	if err != nil {
		return nil, err
	}
	action, err := s.getOwnedAction(ctx, user.ID, request.Name)
	if err != nil {
		return nil, err
	}
	memoIDs := []int32{}
	seen := map[int32]bool{}
	for _, memoName := range request.MemoNames {
		memo, err := s.getAccessibleMemo(ctx, user, memoName)
		if err != nil {
			return nil, err
		}
		if !seen[memo.ID] {
			seen[memo.ID] = true
			memoIDs = append(memoIDs, memo.ID)
		}
	}
	if err := s.Store.SetMemoActionRelations(ctx, &store.SetMemoActionRelations{CreatorID: user.ID, ActionID: &action.ID, MemoIDs: memoIDs}); err != nil {
		return nil, actionStoreError("set Action Memo relations", err)
	}
	return &emptypb.Empty{}, nil
}

func (s *APIV1Service) ListActionMemoRelations(ctx context.Context, request *v1pb.ListActionMemoRelationsRequest) (*v1pb.ListActionMemoRelationsResponse, error) {
	user, err := s.requireActionUser(ctx)
	if err != nil {
		return nil, err
	}
	action, err := s.getOwnedAction(ctx, user.ID, request.Name)
	if err != nil {
		return nil, err
	}
	relations, err := s.Store.ListMemoActionRelations(ctx, &store.FindMemoActionRelation{ActionID: &action.ID, CreatorID: &user.ID})
	if err != nil {
		return nil, actionStoreError("list Action Memo relations", err)
	}
	response := &v1pb.ListActionMemoRelationsResponse{Memos: []*v1pb.MemoReference{}}
	for _, relation := range relations {
		memo, err := s.Store.GetMemo(ctx, &store.FindMemo{ID: &relation.MemoID})
		if err != nil {
			return nil, status.Errorf(codes.Internal, "failed to load related Memo: %v", err)
		}
		if memo == nil || !canAccessMemo(user, memo) {
			continue
		}
		response.Memos = append(response.Memos, convertMemoReferenceFromStore(memo))
	}
	return response, nil
}

func (s *APIV1Service) SetMemoActionRelations(ctx context.Context, request *v1pb.SetMemoActionRelationsRequest) (*emptypb.Empty, error) {
	user, err := s.requireActionUser(ctx)
	if err != nil {
		return nil, err
	}
	memo, err := s.getAccessibleMemo(ctx, user, request.Name)
	if err != nil {
		return nil, err
	}
	actionIDs := []int32{}
	seen := map[int32]bool{}
	for _, actionName := range request.ActionNames {
		action, err := s.getOwnedAction(ctx, user.ID, actionName)
		if err != nil {
			return nil, err
		}
		if !seen[action.ID] {
			seen[action.ID] = true
			actionIDs = append(actionIDs, action.ID)
		}
	}
	if err := s.Store.SetMemoActionRelations(ctx, &store.SetMemoActionRelations{CreatorID: user.ID, MemoID: &memo.ID, ActionIDs: actionIDs}); err != nil {
		return nil, actionStoreError("set Memo Action relations", err)
	}
	return &emptypb.Empty{}, nil
}

func (s *APIV1Service) ListMemoActionRelations(ctx context.Context, request *v1pb.ListMemoActionRelationsRequest) (*v1pb.ListMemoActionRelationsResponse, error) {
	user, err := s.requireActionUser(ctx)
	if err != nil {
		return nil, err
	}
	memo, err := s.getAccessibleMemo(ctx, user, request.Name)
	if err != nil {
		return nil, err
	}
	relations, err := s.Store.ListMemoActionRelations(ctx, &store.FindMemoActionRelation{MemoID: &memo.ID, CreatorID: &user.ID})
	if err != nil {
		return nil, actionStoreError("list Memo Action relations", err)
	}
	_, messagesByID, err := s.loadActionMessages(ctx, user.ID)
	if err != nil {
		return nil, err
	}
	response := &v1pb.ListMemoActionRelationsResponse{Actions: []*v1pb.Action{}}
	for _, relation := range relations {
		if bundle := messagesByID[relation.ActionID]; bundle != nil {
			response.Actions = append(response.Actions, bundle.message)
		}
	}
	return response, nil
}

type actionMessageBundle struct {
	storeAction *store.Action
	message     *v1pb.Action
}

func (s *APIV1Service) loadActionMessages(ctx context.Context, creatorID int32) ([]*v1pb.Action, map[int32]*actionMessageBundle, error) {
	normal := store.Normal
	actions, err := s.Store.ListActions(ctx, &store.FindAction{CreatorID: &creatorID, RowStatus: &normal})
	if err != nil {
		return nil, nil, actionStoreError("list actions", err)
	}
	records, err := s.Store.ListActionGoalRecords(ctx, &store.FindActionGoalRecord{CreatorID: &creatorID})
	if err != nil {
		return nil, nil, actionStoreError("list Goal records", err)
	}
	statusHistories, err := s.Store.ListActionStatusHistories(ctx, &store.FindActionStatusHistory{CreatorID: &creatorID})
	if err != nil {
		return nil, nil, actionStoreError("list Action status history", err)
	}
	relations, err := s.Store.ListMemoActionRelations(ctx, &store.FindMemoActionRelation{CreatorID: &creatorID})
	if err != nil {
		return nil, nil, actionStoreError("list Memo Action relations", err)
	}

	recordsByAction := map[int32][]*store.ActionGoalRecord{}
	for _, record := range records {
		recordsByAction[record.ActionID] = append(recordsByAction[record.ActionID], record)
	}
	statusHistoryByAction := map[int32][]*store.ActionStatusHistory{}
	for _, history := range statusHistories {
		statusHistoryByAction[history.ActionID] = append(statusHistoryByAction[history.ActionID], history)
	}
	memoNamesByAction := map[int32][]string{}
	memoNameCache := map[int32]string{}
	for _, relation := range relations {
		memoName, ok := memoNameCache[relation.MemoID]
		if !ok {
			memo, err := s.Store.GetMemo(ctx, &store.FindMemo{ID: &relation.MemoID})
			if err != nil {
				return nil, nil, status.Errorf(codes.Internal, "failed to load related Memo: %v", err)
			}
			if memo == nil {
				continue
			}
			memoName = MemoNamePrefix + memo.UID
			memoNameCache[relation.MemoID] = memoName
		}
		memoNamesByAction[relation.ActionID] = append(memoNamesByAction[relation.ActionID], memoName)
	}

	bundles := make(map[int32]*actionMessageBundle, len(actions))
	uidByID := make(map[int32]string, len(actions))
	for _, action := range actions {
		uidByID[action.ID] = action.UID
	}
	ordered := make([]*v1pb.Action, 0, len(actions))
	for _, action := range actions {
		message := convertActionFromStore(action, uidByID, recordsByAction[action.ID], statusHistoryByAction[action.ID], memoNamesByAction[action.ID])
		bundles[action.ID] = &actionMessageBundle{storeAction: action, message: message}
		ordered = append(ordered, message)
	}
	for _, action := range actions {
		if action.ParentID != nil {
			if parent := bundles[*action.ParentID]; parent != nil {
				parent.message.Children = append(parent.message.Children, bundles[action.ID].message)
			}
		}
	}
	return ordered, bundles, nil
}

func (s *APIV1Service) getActionMessage(ctx context.Context, creatorID int32, uid string) (*v1pb.Action, error) {
	_, byID, err := s.loadActionMessages(ctx, creatorID)
	if err != nil {
		return nil, err
	}
	for _, bundle := range byID {
		if bundle.storeAction.UID == uid {
			return bundle.message, nil
		}
	}
	return nil, status.Error(codes.NotFound, "action not found")
}

func actionInternalID(action *v1pb.Action, bundles map[int32]*actionMessageBundle) int32 {
	uid := strings.TrimPrefix(action.Name, ActionNamePrefix)
	for id, bundle := range bundles {
		if bundle.storeAction.UID == uid {
			return id
		}
	}
	return 0
}

func convertActionFromStore(
	action *store.Action,
	uidByID map[int32]string,
	records []*store.ActionGoalRecord,
	statusHistories []*store.ActionStatusHistory,
	memoNames []string,
) *v1pb.Action {
	message := &v1pb.Action{
		Name: ActionNamePrefix + action.UID, Creator: fmt.Sprintf("%s%d", UserNamePrefix, action.CreatorID),
		Type: convertActionTypeFromStore(action.Type), Status: convertActionStatusFromStore(action.Status),
		Title: action.Title, Description: action.Description, SortOrder: action.SortOrder,
		RelatedMemos: memoNames, CreateTime: timestamppb.New(time.Unix(action.CreatedTs, 0)),
		UpdateTime: timestamppb.New(time.Unix(action.UpdatedTs, 0)), Pinned: action.PinnedTs != nil,
		TerminationReason: action.TerminationReason, Children: []*v1pb.Action{}, GoalRecords: []*v1pb.GoalRecord{},
		StatusHistory: []*v1pb.ActionStatusHistory{},
	}
	if action.ParentID != nil {
		if uid := uidByID[*action.ParentID]; uid != "" {
			name := ActionNamePrefix + uid
			message.Parent = &name
		}
	}
	if action.PlanDate != nil {
		message.PlanDate = *action.PlanDate
	}
	if action.DeadlineTs != nil {
		message.Deadline = timestamppb.New(time.Unix(*action.DeadlineTs, 0))
	}
	if action.GoalCurrent != nil && action.GoalTarget != nil && action.GoalUnit != nil {
		message.Goal = &v1pb.GoalPayload{Current: *action.GoalCurrent, Target: *action.GoalTarget, Unit: *action.GoalUnit}
	}
	if action.HabitStartDate != nil && action.HabitScheduleType != nil {
		message.Habit = &v1pb.HabitPayload{
			StartDate: *action.HabitStartDate, ScheduleType: convertHabitScheduleTypeFromStore(*action.HabitScheduleType),
			Weekdays: append([]int32(nil), action.HabitWeekdays...),
		}
		if action.HabitIntervalDays != nil {
			message.Habit.IntervalDays = *action.HabitIntervalDays
		}
	}
	if action.CompletedTs != nil {
		message.CompleteTime = timestamppb.New(time.Unix(*action.CompletedTs, 0))
	}
	if action.TerminatedTs != nil {
		message.TerminateTime = timestamppb.New(time.Unix(*action.TerminatedTs, 0))
	}
	for _, record := range records {
		message.GoalRecords = append(message.GoalRecords, convertGoalRecordFromStore(record, action.UID))
	}
	for _, history := range statusHistories {
		message.StatusHistory = append(message.StatusHistory, &v1pb.ActionStatusHistory{
			FromStatus: convertActionStatusFromStore(history.FromStatus),
			ToStatus:   convertActionStatusFromStore(history.ToStatus),
			Reason:     history.Reason, EffectiveDate: history.EffectiveDate,
			CreateTime: timestamppb.New(time.Unix(history.CreatedTs, 0)),
		})
	}
	return message
}

func convertGoalRecordFromStore(record *store.ActionGoalRecord, actionUID string) *v1pb.GoalRecord {
	return &v1pb.GoalRecord{
		Name:   fmt.Sprintf("%s%s/%s%s", ActionNamePrefix, actionUID, GoalRecordNamePrefix, record.UID),
		Action: ActionNamePrefix + actionUID, Delta: record.Delta, ValueAfter: record.ValueAfter, Note: record.Note,
		Operation:    convertGoalRecordOperationFromStore(record.Operation),
		RecordedTime: timestamppb.New(time.Unix(record.RecordedTs, 0)), CreateTime: timestamppb.New(time.Unix(record.CreatedTs, 0)),
	}
}

func convertHabitRecordFromStore(record *store.ActionHabitRecord, actionUID string) *v1pb.HabitRecord {
	return &v1pb.HabitRecord{
		Name: fmt.Sprintf("actions/%s/habitRecords/%s", actionUID, record.UID), Action: ActionNamePrefix + actionUID,
		OccurrenceDate: record.OccurrenceDate, Status: convertHabitRecordStatusFromStore(record.Status), Note: record.Note,
		CreateTime: timestamppb.New(time.Unix(record.CreatedTs, 0)), UpdateTime: timestamppb.New(time.Unix(record.UpdatedTs, 0)),
	}
}

func (s *APIV1Service) requireActionUser(ctx context.Context) (*store.User, error) {
	user, err := s.GetCurrentUser(ctx)
	if err != nil {
		return nil, status.Errorf(codes.Internal, "failed to get current user: %v", err)
	}
	if user == nil {
		return nil, status.Error(codes.Unauthenticated, "authentication required")
	}
	return user, nil
}

func (s *APIV1Service) getOwnedAction(ctx context.Context, creatorID int32, name string) (*store.Action, error) {
	uid, err := ExtractActionUIDFromName(name)
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid action name: %v", err)
	}
	normal := store.Normal
	action, err := s.Store.GetAction(ctx, &store.FindAction{UID: &uid, CreatorID: &creatorID, RowStatus: &normal})
	if err != nil {
		return nil, actionStoreError("get action", err)
	}
	if action == nil {
		return nil, status.Error(codes.NotFound, "action not found")
	}
	return action, nil
}

func (s *APIV1Service) getAccessibleMemo(ctx context.Context, user *store.User, name string) (*store.Memo, error) {
	uid, err := ExtractMemoUIDFromName(name)
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid Memo name: %v", err)
	}
	memo, err := s.Store.GetMemo(ctx, &store.FindMemo{UID: &uid})
	if err != nil {
		return nil, status.Errorf(codes.Internal, "failed to get Memo: %v", err)
	}
	if memo == nil {
		return nil, status.Error(codes.NotFound, "Memo not found")
	}
	if !canAccessMemo(user, memo) {
		return nil, status.Error(codes.PermissionDenied, "permission denied")
	}
	return memo, nil
}

func canAccessMemo(user *store.User, memo *store.Memo) bool {
	return memo.Visibility == store.Public || memo.CreatorID == user.ID || (memo.Visibility == store.Protected && user != nil)
}

func convertMemoReferenceFromStore(memo *store.Memo) *v1pb.MemoReference {
	title := "Memo " + memo.UID
	for _, line := range strings.Split(memo.Content, "\n") {
		if trimmed := strings.TrimSpace(line); trimmed != "" {
			title = trimmed
			if len(title) > 60 {
				title = title[:60]
			}
			break
		}
	}
	snippet := strings.Join(strings.Fields(memo.Content), " ")
	if len(snippet) > 120 {
		snippet = snippet[:120]
	}
	return &v1pb.MemoReference{Name: MemoNamePrefix + memo.UID, Title: title, Snippet: snippet, UpdateTime: timestamppb.New(time.Unix(memo.UpdatedTs, 0))}
}

func (s *APIV1Service) recalculateProjectAncestors(ctx context.Context, creatorID int32, parentID *int32) error {
	if parentID == nil {
		return nil
	}
	normal := store.Normal
	actions, err := s.Store.ListActions(ctx, &store.FindAction{CreatorID: &creatorID, RowStatus: &normal})
	if err != nil {
		return actionStoreError("recalculate Project", err)
	}
	byID := map[int32]*store.Action{}
	children := map[int32][]*store.Action{}
	for _, action := range actions {
		byID[action.ID] = action
		if action.ParentID != nil {
			children[*action.ParentID] = append(children[*action.ParentID], action)
		}
	}
	visited := map[int32]bool{}
	currentID := parentID
	for currentID != nil && !visited[*currentID] {
		visited[*currentID] = true
		current := byID[*currentID]
		if current == nil {
			break
		}
		if current.Type == store.ActionTypeProject && current.Status != store.ActionStatusTerminated {
			nextStatus := calculateProjectStatusFromChildren(current.ID, children)
			if current.Status != nextStatus {
				now := time.Now().Unix()
				if _, err := s.Store.TransitionActionStatus(ctx, &store.TransitionActionStatus{
					ActionID: current.ID, CreatorID: creatorID,
					FromStatus: current.Status, ToStatus: nextStatus,
					EffectiveDate: time.Unix(now, 0).Format("2006-01-02"), CreatedTs: now,
				}); err != nil {
					return actionStoreError("recalculate Project", err)
				}
				current.Status = nextStatus
			}
		}
		currentID = current.ParentID
	}
	return nil
}

func (s *APIV1Service) calculateProjectStatus(ctx context.Context, creatorID int32, actionID int32) (store.ActionStatus, error) {
	normal := store.Normal
	actions, err := s.Store.ListActions(ctx, &store.FindAction{CreatorID: &creatorID, RowStatus: &normal})
	if err != nil {
		return "", actionStoreError("calculate Project status", err)
	}
	children := map[int32][]*store.Action{}
	for _, action := range actions {
		if action.ParentID != nil {
			children[*action.ParentID] = append(children[*action.ParentID], action)
		}
	}
	return calculateProjectStatusFromChildren(actionID, children), nil
}

func calculateProjectStatusFromChildren(actionID int32, children map[int32][]*store.Action) store.ActionStatus {
	descendants := collectActiveActionDescendants(actionID, children)
	if len(descendants) == 0 {
		return store.ActionStatusInProgress
	}
	for _, descendant := range descendants {
		if descendant.Status != store.ActionStatusDone {
			return store.ActionStatusInProgress
		}
	}
	return store.ActionStatusDone
}

func collectActiveActionDescendants(parentID int32, children map[int32][]*store.Action) []*store.Action {
	result := []*store.Action{}
	for _, child := range children[parentID] {
		if child.Status == store.ActionStatusTerminated {
			continue
		}
		result = append(result, child)
		result = append(result, collectActiveActionDescendants(child.ID, children)...)
	}
	return result
}

func (s *APIV1Service) ensureMoveDoesNotCreateCycle(ctx context.Context, creatorID int32, actionID int32, parent *store.Action) error {
	normal := store.Normal
	actions, err := s.Store.ListActions(ctx, &store.FindAction{CreatorID: &creatorID, RowStatus: &normal})
	if err != nil {
		return actionStoreError("validate Action move", err)
	}
	byID := map[int32]*store.Action{}
	for _, action := range actions {
		byID[action.ID] = action
	}
	visited := map[int32]bool{}
	current := parent
	for current != nil && !visited[current.ID] {
		if current.ID == actionID {
			return status.Error(codes.InvalidArgument, "moving the action would create a cycle")
		}
		visited[current.ID] = true
		if current.ParentID == nil {
			break
		}
		current = byID[*current.ParentID]
	}
	return nil
}

func parseActionPage(pageSize int32, pageToken string) (int, int, error) {
	limit := int(pageSize)
	offset := 0
	if pageToken != "" {
		var token v1pb.PageToken
		if err := unmarshalPageToken(pageToken, &token); err != nil {
			return 0, 0, status.Errorf(codes.InvalidArgument, "invalid page token: %v", err)
		}
		limit = int(token.Limit)
		offset = int(token.Offset)
	}
	if limit <= 0 {
		limit = 100
	}
	if limit > 500 {
		limit = 500
	}
	return limit, offset, nil
}

func validatePlanDate(value string) (*string, error) {
	value = strings.TrimSpace(value)
	if value == "" {
		return nil, nil
	}
	if _, err := time.Parse("2006-01-02", value); err != nil {
		return nil, status.Error(codes.InvalidArgument, "plan_date must use YYYY-MM-DD")
	}
	return &value, nil
}

func validateRequiredDate(value string, field string) (string, error) {
	value = strings.TrimSpace(value)
	if value == "" {
		return "", status.Errorf(codes.InvalidArgument, "%s is required", field)
	}
	if _, err := time.Parse("2006-01-02", value); err != nil {
		return "", status.Errorf(codes.InvalidArgument, "%s must use YYYY-MM-DD", field)
	}
	return value, nil
}

func resolveActionEffectiveDate(value string) (string, error) {
	if strings.TrimSpace(value) == "" {
		return time.Now().Format("2006-01-02"), nil
	}
	return validateRequiredDate(value, "effective_date")
}

func isActionActiveOnDate(histories []*store.ActionStatusHistory, date string) bool {
	active := true
	for _, history := range histories {
		if history.EffectiveDate > date {
			break
		}
		if history.ToStatus == store.ActionStatusTerminated {
			active = false
		} else if history.FromStatus == store.ActionStatusTerminated {
			active = true
		}
	}
	return active
}

func validateHabitSchedule(payload *v1pb.HabitPayload) (store.HabitScheduleType, *int32, []int32, error) {
	switch payload.ScheduleType {
	case v1pb.HabitScheduleType_DAILY:
		return store.HabitScheduleDaily, nil, nil, nil
	case v1pb.HabitScheduleType_INTERVAL_DAYS:
		if payload.IntervalDays < 2 || payload.IntervalDays > 365 {
			return "", nil, nil, status.Error(codes.InvalidArgument, "habit.interval_days must be between 2 and 365")
		}
		value := payload.IntervalDays
		return store.HabitScheduleIntervalDays, &value, nil, nil
	case v1pb.HabitScheduleType_WEEKLY:
		if len(payload.Weekdays) == 0 {
			return "", nil, nil, status.Error(codes.InvalidArgument, "habit.weekdays is required for a weekly schedule")
		}
		seen := map[int32]bool{}
		weekdays := make([]int32, 0, len(payload.Weekdays))
		for _, weekday := range payload.Weekdays {
			if weekday < 1 || weekday > 7 || seen[weekday] {
				return "", nil, nil, status.Error(codes.InvalidArgument, "habit.weekdays must contain unique values from 1 to 7")
			}
			seen[weekday] = true
			weekdays = append(weekdays, weekday)
		}
		return store.HabitScheduleWeekly, nil, weekdays, nil
	default:
		return "", nil, nil, status.Error(codes.InvalidArgument, "habit.schedule_type is required")
	}
}

func isHabitDue(action *store.Action, occurrenceDate string) bool {
	if action.HabitStartDate == nil || action.HabitScheduleType == nil {
		return false
	}
	start, err := time.Parse("2006-01-02", *action.HabitStartDate)
	if err != nil {
		return false
	}
	date, err := time.Parse("2006-01-02", occurrenceDate)
	if err != nil || date.Before(start) {
		return false
	}
	switch *action.HabitScheduleType {
	case store.HabitScheduleDaily:
		return true
	case store.HabitScheduleIntervalDays:
		if action.HabitIntervalDays == nil || *action.HabitIntervalDays < 2 {
			return false
		}
		days := int(date.Sub(start).Hours() / 24)
		return days%int(*action.HabitIntervalDays) == 0
	case store.HabitScheduleWeekly:
		isoWeekday := int32((int(date.Weekday())+6)%7 + 1)
		for _, weekday := range action.HabitWeekdays {
			if weekday == isoWeekday {
				return true
			}
		}
	}
	return false
}

func timestampToUnix(value *timestamppb.Timestamp, field string) (*int64, error) {
	if value == nil {
		return nil, nil
	}
	if err := value.CheckValid(); err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "%s is invalid: %v", field, err)
	}
	unix := value.AsTime().Unix()
	return &unix, nil
}

func requiredTimestampToUnix(value *timestamppb.Timestamp, field string) (int64, error) {
	unix, err := timestampToUnix(value, field)
	if err != nil {
		return 0, err
	}
	if unix == nil {
		return 0, status.Errorf(codes.InvalidArgument, "%s is required", field)
	}
	return *unix, nil
}

func containsActionStatus(values []v1pb.ActionStatus, target v1pb.ActionStatus) bool {
	for _, value := range values {
		if value == target {
			return true
		}
	}
	return false
}

func convertActionTypeToStore(value v1pb.ActionType) (store.ActionType, error) {
	switch value {
	case v1pb.ActionType_TASK:
		return store.ActionTypeTask, nil
	case v1pb.ActionType_GOAL:
		return store.ActionTypeGoal, nil
	case v1pb.ActionType_PROJECT:
		return store.ActionTypeProject, nil
	case v1pb.ActionType_HABIT:
		return store.ActionTypeHabit, nil
	default:
		return "", status.Error(codes.InvalidArgument, "action type is required")
	}
}

func convertActionTypeFromStore(value store.ActionType) v1pb.ActionType {
	switch value {
	case store.ActionTypeTask:
		return v1pb.ActionType_TASK
	case store.ActionTypeGoal:
		return v1pb.ActionType_GOAL
	case store.ActionTypeProject:
		return v1pb.ActionType_PROJECT
	case store.ActionTypeHabit:
		return v1pb.ActionType_HABIT
	default:
		return v1pb.ActionType_ACTION_TYPE_UNSPECIFIED
	}
}

func convertHabitScheduleTypeFromStore(value store.HabitScheduleType) v1pb.HabitScheduleType {
	switch value {
	case store.HabitScheduleDaily:
		return v1pb.HabitScheduleType_DAILY
	case store.HabitScheduleIntervalDays:
		return v1pb.HabitScheduleType_INTERVAL_DAYS
	case store.HabitScheduleWeekly:
		return v1pb.HabitScheduleType_WEEKLY
	default:
		return v1pb.HabitScheduleType_HABIT_SCHEDULE_TYPE_UNSPECIFIED
	}
}

func convertHabitRecordStatusToStore(value v1pb.HabitRecordStatus) (store.HabitRecordStatus, error) {
	switch value {
	case v1pb.HabitRecordStatus_UNCHECKED:
		return store.HabitRecordStatusUnchecked, nil
	case v1pb.HabitRecordStatus_CHECKED_IN:
		return store.HabitRecordStatusCheckedIn, nil
	case v1pb.HabitRecordStatus_LEAVE:
		return store.HabitRecordStatusLeave, nil
	default:
		return "", status.Error(codes.InvalidArgument, "habit record status is required")
	}
}

func convertHabitRecordStatusFromStore(value store.HabitRecordStatus) v1pb.HabitRecordStatus {
	switch value {
	case store.HabitRecordStatusCheckedIn:
		return v1pb.HabitRecordStatus_CHECKED_IN
	case store.HabitRecordStatusLeave:
		return v1pb.HabitRecordStatus_LEAVE
	default:
		return v1pb.HabitRecordStatus_HABIT_RECORD_STATUS_UNSPECIFIED
	}
}

func convertGoalRecordOperationToStore(value v1pb.GoalRecordOperation) (store.GoalRecordOperation, error) {
	switch value {
	case v1pb.GoalRecordOperation_GOAL_RECORD_OPERATION_UNSPECIFIED, v1pb.GoalRecordOperation_DELTA:
		return store.GoalRecordOperationDelta, nil
	case v1pb.GoalRecordOperation_OVERWRITE:
		return store.GoalRecordOperationOverwrite, nil
	default:
		return "", status.Error(codes.InvalidArgument, "goal record operation is invalid")
	}
}

func convertGoalRecordOperationFromStore(value store.GoalRecordOperation) v1pb.GoalRecordOperation {
	if value == store.GoalRecordOperationOverwrite {
		return v1pb.GoalRecordOperation_OVERWRITE
	}
	return v1pb.GoalRecordOperation_DELTA
}

func convertActionStatusFromStore(value store.ActionStatus) v1pb.ActionStatus {
	switch value {
	case store.ActionStatusTodo:
		return v1pb.ActionStatus_TODO
	case store.ActionStatusInProgress:
		return v1pb.ActionStatus_IN_PROGRESS
	case store.ActionStatusDone:
		return v1pb.ActionStatus_DONE
	case store.ActionStatusTerminated:
		return v1pb.ActionStatus_TERMINATED
	default:
		return v1pb.ActionStatus_ACTION_STATUS_UNSPECIFIED
	}
}

func actionStoreError(operation string, err error) error {
	switch {
	case errors.Is(err, store.ErrActionUnsupported):
		return status.Errorf(codes.Unimplemented, "%s: %v", operation, err)
	case errors.Is(err, store.ErrActionNotFound):
		return status.Error(codes.NotFound, "action not found")
	case errors.Is(err, store.ErrPinnedActionLimit):
		return status.Errorf(codes.FailedPrecondition, "最多置顶 %d 个 Action", maxPinnedActions)
	case errors.Is(err, store.ErrGoalProgressNegative):
		return status.Error(codes.InvalidArgument, "Goal 当前进度不能小于 0")
	case errors.Is(err, store.ErrGoalProgressUnavailable):
		return status.Error(codes.FailedPrecondition, "当前 Goal 状态不能记录进度")
	case errors.Is(err, store.ErrGoalOverwriteValueMissing):
		return status.Error(codes.InvalidArgument, "Goal 覆盖值不能为空")
	case errors.Is(err, store.ErrHabitRecordUnavailable):
		return status.Error(codes.FailedPrecondition, "当前 Habit 不能记录打卡")
	case errors.Is(err, store.ErrActionStatusConflict):
		return status.Error(codes.Aborted, "Action 状态已变化，请刷新后重试")
	default:
		return status.Errorf(codes.Internal, "%s: %v", operation, err)
	}
}
