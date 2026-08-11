export type ActionType = "TASK" | "GOAL" | "PROJECT" | "HABIT";

export type ActionStatus = "TODO" | "IN_PROGRESS" | "DONE" | "TERMINATED";

export type ActionView = "today" | "upcoming" | "all" | "completed" | "projects" | "goals" | "habits";

export type HabitScheduleType = "DAILY" | "INTERVAL_DAYS" | "WEEKLY";

export type HabitRecordStatus = "UNCHECKED" | "CHECKED_IN" | "LEAVE";

export type GoalRecordOperation = "DELTA" | "OVERWRITE";

export interface ActionGoal {
  current: number;
  target: number;
  unit: string;
}

export interface ActionGoalRecord {
  uid: string;
  delta: number;
  valueAfter: number;
  operation: GoalRecordOperation;
  note: string;
  recordedAt: string;
}

export interface ActionHabit {
  startDate: string;
  scheduleType: HabitScheduleType;
  intervalDays?: number;
  weekdays: number[];
}

export interface ActionHabitRecord {
  uid?: string;
  actionUid: string;
  occurrenceDate: string;
  status: HabitRecordStatus;
  note: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface ActionStatusHistory {
  fromStatus: ActionStatus;
  toStatus: ActionStatus;
  reason: string;
  effectiveDate: string;
  createdAt?: string;
}

export interface ActionItem {
  uid: string;
  type: ActionType;
  status: ActionStatus;
  title: string;
  description: string;
  parentUid?: string;
  sortOrder: number;
  planDate?: string;
  deadline?: string;
  pinned: boolean;
  goal?: ActionGoal;
  goalRecords: ActionGoalRecord[];
  habit?: ActionHabit;
  children: ActionItem[];
  relatedMemoNames: string[];
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  terminationReason?: string;
  terminatedAt?: string;
  statusHistory: ActionStatusHistory[];
}

export interface ActionMemoReference {
  name: string;
  title: string;
  snippet: string;
  updatedAt: string;
}

export interface CreateActionInput {
  type: ActionType;
  title: string;
  description: string;
  parentUid?: string;
  planDate?: string;
  deadline?: string;
  goalTarget?: number;
  goalUnit?: string;
  habitStartDate?: string;
  habitScheduleType?: HabitScheduleType;
  habitIntervalDays?: number;
  habitWeekdays?: number[];
}

export interface UpdateActionInput {
  title: string;
  description: string;
  planDate?: string;
  deadline?: string;
}

export const ACTION_VIEWS: ActionView[] = ["today", "upcoming", "all", "completed", "projects", "goals", "habits"];

export const isActionView = (value?: string): value is ActionView => ACTION_VIEWS.includes(value as ActionView);
