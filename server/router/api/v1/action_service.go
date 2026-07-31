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
	if actionMessage.Parent != nil && strings.TrimSpace(actionMessage.GetParent()) != "" {
		parent, err := s.getOwnedAction(ctx, user.ID, actionMessage.GetParent())
		if err != nil {
			return nil, err
		}
		parentID = &parent.ID
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
		return nil, status.Error(codes.FailedPrecondition, "terminated Goal cannot be completed")
	}
	if action.Status != store.ActionStatusDone {
		now := time.Now().Unix()
		done := store.ActionStatusDone
		if err := s.Store.UpdateAction(ctx, &store.UpdateAction{ID: action.ID, CreatorID: user.ID, Status: &done, CompletedTs: &now}); err != nil {
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
	if action.Status == store.ActionStatusTerminated {
		return nil, status.Error(codes.FailedPrecondition, "terminated Goal cannot be reopened")
	}
	if action.Type == store.ActionTypeProject {
		return nil, status.Error(codes.FailedPrecondition, "Project status is calculated from its descendants")
	}
	if action.Status != store.ActionStatusDone {
		return nil, status.Error(codes.FailedPrecondition, "only completed actions can be reopened")
	}
	inProgress := store.ActionStatusInProgress
	if err := s.Store.UpdateAction(ctx, &store.UpdateAction{ID: action.ID, CreatorID: user.ID, Status: &inProgress, ClearCompletedTs: true}); err != nil {
		return nil, actionStoreError("reopen action", err)
	}
	if err := s.recalculateProjectAncestors(ctx, user.ID, action.ParentID); err != nil {
		return nil, err
	}
	return s.getActionMessage(ctx, user.ID, action.UID)
}

func (s *APIV1Service) TerminateGoal(ctx context.Context, request *v1pb.TerminateGoalRequest) (*v1pb.Action, error) {
	user, err := s.requireActionUser(ctx)
	if err != nil {
		return nil, err
	}
	action, err := s.getOwnedAction(ctx, user.ID, request.Name)
	if err != nil {
		return nil, err
	}
	if action.Type != store.ActionTypeGoal {
		return nil, status.Error(codes.InvalidArgument, "only Goal actions can be terminated")
	}
	if action.Status != store.ActionStatusTodo && action.Status != store.ActionStatusInProgress {
		return nil, status.Error(codes.FailedPrecondition, "the current Goal cannot be terminated")
	}
	reason := strings.TrimSpace(request.Reason)
	if reason == "" {
		return nil, status.Error(codes.InvalidArgument, "termination reason is required")
	}
	now := time.Now().Unix()
	terminated := store.ActionStatusTerminated
	if err := s.Store.UpdateAction(ctx, &store.UpdateAction{
		ID: action.ID, CreatorID: user.ID, Status: &terminated, ClearCompletedTs: true,
		TerminationReason: &reason, TerminatedTs: &now,
	}); err != nil {
		return nil, actionStoreError("terminate Goal", err)
	}
	if err := s.recalculateProjectAncestors(ctx, user.ID, action.ParentID); err != nil {
		return nil, err
	}
	return s.getActionMessage(ctx, user.ID, action.UID)
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
	var parentID *int32
	if request.Parent != nil && strings.TrimSpace(request.GetParent()) != "" {
		parent, err := s.getOwnedAction(ctx, user.ID, request.GetParent())
		if err != nil {
			return nil, err
		}
		if parent.ID == action.ID {
			return nil, status.Error(codes.InvalidArgument, "an action cannot be its own parent")
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
	if request.GoalRecord.Delta == 0 {
		return nil, status.Error(codes.InvalidArgument, "goal progress delta cannot be 0")
	}
	recordedTs, err := requiredTimestampToUnix(request.GoalRecord.RecordedTime, "recorded_time")
	if err != nil {
		return nil, err
	}
	record, updatedAction, err := s.Store.CreateActionGoalRecord(ctx, &store.ActionGoalRecord{
		UID: shortuuid.New(), ActionID: action.ID, CreatorID: user.ID, Delta: request.GoalRecord.Delta,
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
	relations, err := s.Store.ListMemoActionRelations(ctx, &store.FindMemoActionRelation{CreatorID: &creatorID})
	if err != nil {
		return nil, nil, actionStoreError("list Memo Action relations", err)
	}

	recordsByAction := map[int32][]*store.ActionGoalRecord{}
	for _, record := range records {
		recordsByAction[record.ActionID] = append(recordsByAction[record.ActionID], record)
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
		message := convertActionFromStore(action, uidByID, recordsByAction[action.ID], memoNamesByAction[action.ID])
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

func convertActionFromStore(action *store.Action, uidByID map[int32]string, records []*store.ActionGoalRecord, memoNames []string) *v1pb.Action {
	message := &v1pb.Action{
		Name: ActionNamePrefix + action.UID, Creator: fmt.Sprintf("%s%d", UserNamePrefix, action.CreatorID),
		Type: convertActionTypeFromStore(action.Type), Status: convertActionStatusFromStore(action.Status),
		Title: action.Title, Description: action.Description, SortOrder: action.SortOrder,
		RelatedMemos: memoNames, CreateTime: timestamppb.New(time.Unix(action.CreatedTs, 0)),
		UpdateTime: timestamppb.New(time.Unix(action.UpdatedTs, 0)), Pinned: action.PinnedTs != nil,
		TerminationReason: action.TerminationReason, Children: []*v1pb.Action{}, GoalRecords: []*v1pb.GoalRecord{},
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
	if action.CompletedTs != nil {
		message.CompleteTime = timestamppb.New(time.Unix(*action.CompletedTs, 0))
	}
	if action.TerminatedTs != nil {
		message.TerminateTime = timestamppb.New(time.Unix(*action.TerminatedTs, 0))
	}
	for _, record := range records {
		message.GoalRecords = append(message.GoalRecords, convertGoalRecordFromStore(record, action.UID))
	}
	return message
}

func convertGoalRecordFromStore(record *store.ActionGoalRecord, actionUID string) *v1pb.GoalRecord {
	return &v1pb.GoalRecord{
		Name:   fmt.Sprintf("%s%s/%s%s", ActionNamePrefix, actionUID, GoalRecordNamePrefix, record.UID),
		Action: ActionNamePrefix + actionUID, Delta: record.Delta, ValueAfter: record.ValueAfter, Note: record.Note,
		RecordedTime: timestamppb.New(time.Unix(record.RecordedTs, 0)), CreateTime: timestamppb.New(time.Unix(record.CreatedTs, 0)),
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
		if current.Type == store.ActionTypeProject {
			descendants := collectActionDescendants(current.ID, children)
			allDone := len(descendants) > 0
			for _, descendant := range descendants {
				if descendant.Status != store.ActionStatusDone {
					allDone = false
					break
				}
			}
			nextStatus := store.ActionStatusInProgress
			if allDone {
				nextStatus = store.ActionStatusDone
			}
			if current.Status != nextStatus {
				update := &store.UpdateAction{ID: current.ID, CreatorID: creatorID, Status: &nextStatus}
				if nextStatus == store.ActionStatusDone {
					now := time.Now().Unix()
					update.CompletedTs = &now
				} else {
					update.ClearCompletedTs = true
				}
				if err := s.Store.UpdateAction(ctx, update); err != nil {
					return actionStoreError("recalculate Project", err)
				}
				current.Status = nextStatus
			}
		}
		currentID = current.ParentID
	}
	return nil
}

func collectActionDescendants(parentID int32, children map[int32][]*store.Action) []*store.Action {
	result := []*store.Action{}
	for _, child := range children[parentID] {
		result = append(result, child)
		result = append(result, collectActionDescendants(child.ID, children)...)
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
	default:
		return v1pb.ActionType_ACTION_TYPE_UNSPECIFIED
	}
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
	default:
		return status.Errorf(codes.Internal, "%s: %v", operation, err)
	}
}
