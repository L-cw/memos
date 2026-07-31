export type ActionType = "TASK" | "GOAL" | "PROJECT";

export type ActionStatus = "TODO" | "IN_PROGRESS" | "DONE" | "TERMINATED";

export type ActionView = "today" | "upcoming" | "all" | "completed" | "projects" | "goals";

export interface ActionGoal {
  current: number;
  target: number;
  unit: string;
}

export interface ActionGoalRecord {
  uid: string;
  delta: number;
  valueAfter: number;
  note: string;
  recordedAt: string;
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
  children: ActionItem[];
  relatedMemoNames: string[];
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  terminationReason?: string;
  terminatedAt?: string;
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
}

export interface UpdateActionInput {
  title: string;
  description: string;
  planDate?: string;
  deadline?: string;
}

export const ACTION_VIEWS: ActionView[] = ["today", "upcoming", "all", "completed", "projects", "goals"];

export const isActionView = (value?: string): value is ActionView => ACTION_VIEWS.includes(value as ActionView);
