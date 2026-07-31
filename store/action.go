package store

import (
	"context"
	"errors"

	"github.com/usememos/memos/internal/util"
)

var (
	ErrActionUnsupported       = errors.New("action is not supported by the current database driver")
	ErrActionNotFound          = errors.New("action not found")
	ErrPinnedActionLimit       = errors.New("pinned action limit reached")
	ErrGoalProgressNegative    = errors.New("goal progress cannot be negative")
	ErrGoalProgressUnavailable = errors.New("goal progress is not available in the current state")
)

type ActionType string

const (
	ActionTypeTask    ActionType = "TASK"
	ActionTypeGoal    ActionType = "GOAL"
	ActionTypeProject ActionType = "PROJECT"
)

type ActionStatus string

const (
	ActionStatusTodo       ActionStatus = "TODO"
	ActionStatusInProgress ActionStatus = "IN_PROGRESS"
	ActionStatusDone       ActionStatus = "DONE"
	ActionStatusTerminated ActionStatus = "TERMINATED"
)

type Action struct {
	ID                int32
	UID               string
	CreatorID         int32
	ParentID          *int32
	Type              ActionType
	Status            ActionStatus
	Title             string
	Description       string
	PlanDate          *string
	DeadlineTs        *int64
	SortOrder         int64
	GoalCurrent       *float64
	GoalTarget        *float64
	GoalUnit          *string
	PinnedTs          *int64
	CreatedTs         int64
	UpdatedTs         int64
	CompletedTs       *int64
	TerminationReason string
	TerminatedTs      *int64
	RowStatus         RowStatus
}

type FindAction struct {
	ID         *int32
	UID        *string
	CreatorID  *int32
	RowStatus  *RowStatus
	Type       *ActionType
	Statuses   []ActionStatus
	PlanDate   *string
	PinnedOnly bool
	Limit      *int
	Offset     *int
}

type UpdateAction struct {
	ID                int32
	CreatorID         int32
	Title             *string
	Description       *string
	PlanDate          *string
	DeadlineTs        *int64
	SortOrder         *int64
	GoalCurrent       *float64
	Status            *ActionStatus
	CompletedTs       *int64
	ClearCompletedTs  bool
	TerminationReason *string
	TerminatedTs      *int64
}

type MoveAction struct {
	ID        int32
	CreatorID int32
	ParentID  *int32
	SortOrder int64
}

type ActionGoalRecord struct {
	ID         int32
	UID        string
	ActionID   int32
	CreatorID  int32
	Delta      float64
	ValueAfter float64
	Note       string
	RecordedTs int64
	CreatedTs  int64
}

type FindActionGoalRecord struct {
	ActionID  *int32
	CreatorID *int32
}

type MemoActionRelation struct {
	MemoID    int32
	ActionID  int32
	CreatorID int32
	CreatedTs int64
}

type FindMemoActionRelation struct {
	MemoID    *int32
	ActionID  *int32
	CreatorID *int32
}

type SetMemoActionRelations struct {
	CreatorID int32
	MemoID    *int32
	ActionID  *int32
	MemoIDs   []int32
	ActionIDs []int32
}

type ActionDriver interface {
	CreateAction(ctx context.Context, create *Action) (*Action, error)
	ListActions(ctx context.Context, find *FindAction) ([]*Action, error)
	UpdateAction(ctx context.Context, update *UpdateAction) error
	MoveAction(ctx context.Context, move *MoveAction) error
	ArchiveActionTree(ctx context.Context, creatorID int32, actionID int32) error
	SetActionPinned(ctx context.Context, creatorID int32, actionID int32, pinned bool, limit int) error
	CreateActionGoalRecord(ctx context.Context, create *ActionGoalRecord) (*ActionGoalRecord, *Action, error)
	ListActionGoalRecords(ctx context.Context, find *FindActionGoalRecord) ([]*ActionGoalRecord, error)
	SetMemoActionRelations(ctx context.Context, set *SetMemoActionRelations) error
	ListMemoActionRelations(ctx context.Context, find *FindMemoActionRelation) ([]*MemoActionRelation, error)
}

func (s *Store) actionDriver() (ActionDriver, error) {
	driver, ok := s.driver.(ActionDriver)
	if !ok {
		return nil, ErrActionUnsupported
	}
	return driver, nil
}

func (s *Store) CreateAction(ctx context.Context, create *Action) (*Action, error) {
	if !util.UIDMatcher.MatchString(create.UID) {
		return nil, errors.New("invalid uid")
	}
	driver, err := s.actionDriver()
	if err != nil {
		return nil, err
	}
	return driver.CreateAction(ctx, create)
}

func (s *Store) ListActions(ctx context.Context, find *FindAction) ([]*Action, error) {
	driver, err := s.actionDriver()
	if err != nil {
		return nil, err
	}
	return driver.ListActions(ctx, find)
}

func (s *Store) GetAction(ctx context.Context, find *FindAction) (*Action, error) {
	actions, err := s.ListActions(ctx, find)
	if err != nil {
		return nil, err
	}
	if len(actions) == 0 {
		return nil, nil
	}
	return actions[0], nil
}

func (s *Store) UpdateAction(ctx context.Context, update *UpdateAction) error {
	driver, err := s.actionDriver()
	if err != nil {
		return err
	}
	return driver.UpdateAction(ctx, update)
}

func (s *Store) MoveAction(ctx context.Context, move *MoveAction) error {
	driver, err := s.actionDriver()
	if err != nil {
		return err
	}
	return driver.MoveAction(ctx, move)
}

func (s *Store) ArchiveActionTree(ctx context.Context, creatorID int32, actionID int32) error {
	driver, err := s.actionDriver()
	if err != nil {
		return err
	}
	return driver.ArchiveActionTree(ctx, creatorID, actionID)
}

func (s *Store) SetActionPinned(ctx context.Context, creatorID int32, actionID int32, pinned bool, limit int) error {
	driver, err := s.actionDriver()
	if err != nil {
		return err
	}
	return driver.SetActionPinned(ctx, creatorID, actionID, pinned, limit)
}

func (s *Store) CreateActionGoalRecord(ctx context.Context, create *ActionGoalRecord) (*ActionGoalRecord, *Action, error) {
	driver, err := s.actionDriver()
	if err != nil {
		return nil, nil, err
	}
	return driver.CreateActionGoalRecord(ctx, create)
}

func (s *Store) ListActionGoalRecords(ctx context.Context, find *FindActionGoalRecord) ([]*ActionGoalRecord, error) {
	driver, err := s.actionDriver()
	if err != nil {
		return nil, err
	}
	return driver.ListActionGoalRecords(ctx, find)
}

func (s *Store) SetMemoActionRelations(ctx context.Context, set *SetMemoActionRelations) error {
	driver, err := s.actionDriver()
	if err != nil {
		return err
	}
	return driver.SetMemoActionRelations(ctx, set)
}

func (s *Store) ListMemoActionRelations(ctx context.Context, find *FindMemoActionRelation) ([]*MemoActionRelation, error) {
	driver, err := s.actionDriver()
	if err != nil {
		return nil, err
	}
	return driver.ListMemoActionRelations(ctx, find)
}
