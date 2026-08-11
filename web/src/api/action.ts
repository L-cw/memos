import dayjs from "dayjs";
import {
  ActionHabitRecord,
  ActionItem,
  ActionMemoReference,
  ActionStatus,
  CreateActionInput,
  GoalRecordOperation,
  UpdateActionInput,
} from "@/types/action";
import type {
  Action as ActionContract,
  ActionStatusHistory as ActionStatusHistoryContract,
  GoalRecord as GoalRecordContract,
  HabitRecord as HabitRecordContract,
  ListActionMemoRelationsResponse,
  ListActionsResponse,
  ListHabitRecordsResponse,
  ListMemoActionRelationsResponse,
  MemoReference as MemoReferenceContract,
} from "@/types/proto/api/v1/action_service";

type JsonGoalRecord = Omit<GoalRecordContract, "recordedTime" | "createTime"> & {
  recordedTime?: string;
  createTime?: string;
};

type JsonHabitRecord = Omit<HabitRecordContract, "createTime" | "updateTime"> & {
  createTime?: string;
  updateTime?: string;
};

type JsonActionStatusHistory = Omit<ActionStatusHistoryContract, "createTime"> & {
  createTime?: string;
};

type JsonAction = Omit<
  ActionContract,
  "deadline" | "createTime" | "updateTime" | "completeTime" | "terminateTime" | "children" | "goalRecords" | "statusHistory"
> & {
  deadline?: string;
  createTime?: string;
  updateTime?: string;
  completeTime?: string;
  terminateTime?: string;
  children?: JsonAction[];
  goalRecords?: JsonGoalRecord[];
  statusHistory?: JsonActionStatusHistory[];
};

type JsonMemoReference = Omit<MemoReferenceContract, "updateTime"> & { updateTime?: string };

interface JsonListActionsResponse extends Omit<ListActionsResponse, "actions"> {
  actions?: JsonAction[];
}

interface JsonListActionMemoRelationsResponse extends Omit<ListActionMemoRelationsResponse, "memos"> {
  memos?: JsonMemoReference[];
}

interface JsonListHabitRecordsResponse extends Omit<ListHabitRecordsResponse, "habitRecords"> {
  habitRecords?: JsonHabitRecord[];
}

interface JsonListMemoActionRelationsResponse extends Omit<ListMemoActionRelationsResponse, "actions"> {
  actions?: JsonAction[];
}

interface JsonMemo {
  name: string;
  content?: string;
  snippet?: string;
  updateTime?: string;
}

interface JsonListMemosResponse {
  memos?: JsonMemo[];
  nextPageToken?: string;
}

interface JsonAuthUser {
  name: string;
}

interface GatewayErrorBody {
  code?: number;
  message?: string;
}

export class ActionApiError extends Error {
  readonly status: number;
  readonly code?: number;

  constructor(message: string, status: number, code?: number) {
    super(message);
    this.name = "ActionApiError";
    this.status = status;
    this.code = code;
  }
}

const requestJson = async <T>(path: string, init: RequestInit = {}): Promise<T> => {
  const hasBody = init.body !== undefined;
  const response = await fetch(path, {
    ...init,
    credentials: "include",
    headers: {
      Accept: "application/json",
      ...(hasBody ? { "Content-Type": "application/json" } : {}),
      ...init.headers,
    },
  });
  if (!response.ok) {
    let body: GatewayErrorBody | undefined;
    try {
      body = (await response.json()) as GatewayErrorBody;
    } catch {
      body = undefined;
    }
    throw new ActionApiError(body?.message || `请求失败 (${response.status})`, response.status, body?.code);
  }
  if (response.status === 204 || response.headers.get("content-length") === "0") {
    return {} as T;
  }
  return (await response.json()) as T;
};

const resourcePath = (name: string) => name.split("/").map(encodeURIComponent).join("/");

const toActionStatus = (value: ActionContract["status"]): ActionStatus =>
  value === "IN_PROGRESS" || value === "DONE" || value === "TERMINATED" ? value : "TODO";

const toActionItem = (action: JsonAction): ActionItem => ({
  uid: action.name.replace(/^actions\//, ""),
  type: action.type === "GOAL" || action.type === "PROJECT" || action.type === "HABIT" ? action.type : "TASK",
  status: toActionStatus(action.status),
  title: action.title,
  description: action.description,
  parentUid: action.parent?.replace(/^actions\//, "") || undefined,
  sortOrder: Number(action.sortOrder || 0),
  planDate: action.planDate || undefined,
  deadline: action.deadline ? dayjs(action.deadline).format("YYYY-MM-DDTHH:mm") : undefined,
  pinned: action.pinned,
  goal: action.goal ? { current: action.goal.current, target: action.goal.target, unit: action.goal.unit } : undefined,
  goalRecords: (action.goalRecords || []).map((record) => ({
    uid: record.name.split("/").pop() || record.name,
    delta: record.delta,
    valueAfter: record.valueAfter,
    operation: record.operation === "OVERWRITE" ? "OVERWRITE" : "DELTA",
    note: record.note,
    recordedAt: record.recordedTime ? dayjs(record.recordedTime).format("YYYY-MM-DD HH:mm") : "",
  })),
  habit: action.habit
    ? {
        startDate: action.habit.startDate,
        scheduleType:
          action.habit.scheduleType === "INTERVAL_DAYS" || action.habit.scheduleType === "WEEKLY" ? action.habit.scheduleType : "DAILY",
        intervalDays: action.habit.intervalDays || undefined,
        weekdays: action.habit.weekdays || [],
      }
    : undefined,
  children: (action.children || []).map(toActionItem),
  relatedMemoNames: action.relatedMemos || [],
  createdAt: action.createTime ? dayjs(action.createTime).format("YYYY-MM-DD HH:mm") : "",
  updatedAt: action.updateTime ? dayjs(action.updateTime).format("YYYY-MM-DD HH:mm") : "",
  completedAt: action.completeTime ? dayjs(action.completeTime).format("YYYY-MM-DD HH:mm") : undefined,
  terminationReason: action.terminationReason || undefined,
  terminatedAt: action.terminateTime ? dayjs(action.terminateTime).format("YYYY-MM-DD HH:mm") : undefined,
  statusHistory: (action.statusHistory || []).map((history) => ({
    fromStatus: toActionStatus(history.fromStatus),
    toStatus: toActionStatus(history.toStatus),
    reason: history.reason,
    effectiveDate: history.effectiveDate,
    createdAt: history.createTime ? dayjs(history.createTime).format("YYYY-MM-DD HH:mm") : undefined,
  })),
});

const toMemoReference = (memo: JsonMemo | JsonMemoReference): ActionMemoReference => {
  const content = "content" in memo ? memo.content || "" : "";
  const firstLine = content
    .split("\n")
    .map((line) => line.trim())
    .find(Boolean);
  return {
    name: memo.name,
    title: "title" in memo ? memo.title : firstLine?.slice(0, 60) || `Memo ${memo.name.split("/").pop()}`,
    snippet: memo.snippet || content.replace(/\s+/g, " ").trim().slice(0, 120),
    updatedAt: memo.updateTime ? dayjs(memo.updateTime).format("YYYY-MM-DD HH:mm") : "",
  };
};

const toHabitRecord = (record: JsonHabitRecord): ActionHabitRecord => ({
  uid: record.name ? record.name.split("/").pop() : undefined,
  actionUid: record.action.replace(/^actions\//, ""),
  occurrenceDate: record.occurrenceDate,
  status: record.status === "LEAVE" ? "LEAVE" : "CHECKED_IN",
  note: record.note,
  createdAt: record.createTime ? dayjs(record.createTime).format("YYYY-MM-DD HH:mm") : undefined,
  updatedAt: record.updateTime ? dayjs(record.updateTime).format("YYYY-MM-DD HH:mm") : undefined,
});

const actionBody = (input: CreateActionInput) => ({
  type: input.type,
  title: input.title,
  description: input.description,
  ...(input.parentUid ? { parent: `actions/${input.parentUid}` } : {}),
  planDate: input.planDate || "",
  ...(input.deadline ? { deadline: dayjs(input.deadline).toISOString() } : {}),
  ...(input.type === "GOAL" ? { goal: { current: 0, target: input.goalTarget, unit: input.goalUnit } } : {}),
  ...(input.type === "HABIT"
    ? {
        habit: {
          startDate: input.habitStartDate,
          scheduleType: input.habitScheduleType,
          intervalDays: input.habitIntervalDays || 0,
          weekdays: input.habitWeekdays || [],
        },
      }
    : {}),
});

export const actionApi = {
  async listActions(): Promise<ActionItem[]> {
    const response = await requestJson<JsonListActionsResponse>("/api/v1/actions?pageSize=500");
    return (response.actions || []).map(toActionItem);
  },

  async createAction(input: CreateActionInput): Promise<ActionItem> {
    const response = await requestJson<JsonAction>("/api/v1/actions", { method: "POST", body: JSON.stringify(actionBody(input)) });
    return toActionItem(response);
  },

  async updateAction(uid: string, input: UpdateActionInput): Promise<ActionItem> {
    const body = {
      title: input.title,
      description: input.description,
      planDate: input.planDate || "",
      ...(input.deadline ? { deadline: dayjs(input.deadline).toISOString() } : { deadline: null }),
    };
    const query = new URLSearchParams();
    ["title", "description", "plan_date", "deadline"].forEach((path) => query.append("updateMask.paths", path));
    const response = await requestJson<JsonAction>(`/api/v1/actions/${encodeURIComponent(uid)}?${query.toString()}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    });
    return toActionItem(response);
  },

  async deleteAction(uid: string): Promise<void> {
    await requestJson(`/api/v1/actions/${encodeURIComponent(uid)}`, { method: "DELETE" });
  },

  async completeAction(uid: string): Promise<ActionItem> {
    const response = await requestJson<JsonAction>(`/api/v1/actions/${encodeURIComponent(uid)}:complete`, { method: "POST", body: "{}" });
    return toActionItem(response);
  },

  async reopenAction(uid: string): Promise<ActionItem> {
    const response = await requestJson<JsonAction>(`/api/v1/actions/${encodeURIComponent(uid)}:reopen`, {
      method: "POST",
      body: JSON.stringify({ effectiveDate: dayjs().format("YYYY-MM-DD") }),
    });
    return toActionItem(response);
  },

  async moveAction(uid: string, parentUid: string | undefined, sortOrder: number): Promise<ActionItem> {
    const response = await requestJson<JsonAction>(`/api/v1/actions/${encodeURIComponent(uid)}:move`, {
      method: "POST",
      body: JSON.stringify({ ...(parentUid ? { parent: `actions/${parentUid}` } : {}), sortOrder }),
    });
    return toActionItem(response);
  },

  async terminateAction(uid: string, reason: string): Promise<ActionItem> {
    const response = await requestJson<JsonAction>(`/api/v1/actions/${encodeURIComponent(uid)}:terminate`, {
      method: "POST",
      body: JSON.stringify({ reason, effectiveDate: dayjs().format("YYYY-MM-DD") }),
    });
    return toActionItem(response);
  },

  async setPinned(uid: string, pinned: boolean): Promise<ActionItem> {
    const response = await requestJson<JsonAction>(`/api/v1/actions/${encodeURIComponent(uid)}?updateMask.paths=pinned`, {
      method: "PATCH",
      body: JSON.stringify({ pinned }),
    });
    return toActionItem(response);
  },

  async createGoalRecord(uid: string, operation: GoalRecordOperation, value: number, note: string, recordedAt: string): Promise<void> {
    await requestJson(`/api/v1/actions/${encodeURIComponent(uid)}/goalRecords`, {
      method: "POST",
      body: JSON.stringify({
        operation,
        ...(operation === "OVERWRITE" ? { overwriteValue: value } : { delta: value }),
        note,
        recordedTime: dayjs(recordedAt).toISOString(),
      }),
    });
  },

  async listHabitRecords(occurrenceDate?: string, actionUid?: string): Promise<ActionHabitRecord[]> {
    const query = new URLSearchParams();
    if (occurrenceDate) query.set("occurrenceDate", occurrenceDate);
    if (actionUid) query.set("action", `actions/${actionUid}`);
    const suffix = query.size > 0 ? `?${query.toString()}` : "";
    const response = await requestJson<JsonListHabitRecordsResponse>(`/api/v1/habitRecords${suffix}`);
    return (response.habitRecords || []).map(toHabitRecord);
  },

  async batchUpdateHabitRecords(records: ActionHabitRecord[]): Promise<ActionHabitRecord[]> {
    const response = await requestJson<JsonListHabitRecordsResponse>("/api/v1/habitRecords:batchUpdate", {
      method: "POST",
      body: JSON.stringify({
        habitRecords: records.map((record) => ({
          action: `actions/${record.actionUid}`,
          occurrenceDate: record.occurrenceDate,
          status: record.status,
          note: record.note,
        })),
      }),
    });
    return (response.habitRecords || []).map(toHabitRecord);
  },

  async setActionMemoRelations(uid: string, memoNames: string[]): Promise<void> {
    await requestJson(`/api/v1/actions/${encodeURIComponent(uid)}/memoRelations`, {
      method: "PATCH",
      body: JSON.stringify({ memoNames }),
    });
  },

  async listActionMemoRelations(uid: string): Promise<ActionMemoReference[]> {
    const response = await requestJson<JsonListActionMemoRelationsResponse>(`/api/v1/actions/${encodeURIComponent(uid)}/memoRelations`);
    return (response.memos || []).map(toMemoReference);
  },

  async setMemoActionRelations(memoName: string, actionUids: string[]): Promise<void> {
    await requestJson(`/api/v1/${resourcePath(memoName)}/actions`, {
      method: "PATCH",
      body: JSON.stringify({ actionNames: actionUids.map((uid) => `actions/${uid}`) }),
    });
  },

  async listMemoActionRelations(memoName: string): Promise<ActionItem[]> {
    const response = await requestJson<JsonListMemoActionRelationsResponse>(`/api/v1/${resourcePath(memoName)}/actions`);
    return (response.actions || []).map(toActionItem);
  },

  async listMemos(): Promise<ActionMemoReference[]> {
    const user = await requestJson<JsonAuthUser>("/api/v1/auth/status", { method: "POST" });
    const response = await requestJson<JsonListMemosResponse>(`/api/v1/${resourcePath(user.name)}/memos?pageSize=100&state=NORMAL`);
    return (response.memos || []).map(toMemoReference);
  },

  async searchMemos(query: string): Promise<ActionMemoReference[]> {
    const user = await requestJson<JsonAuthUser>("/api/v1/auth/status", { method: "POST" });
    const memos: JsonMemo[] = [];
    let pageToken = "";
    do {
      const params = new URLSearchParams({
        pageSize: "100",
        state: "NORMAL",
        oldFilter: `content_search == [${JSON.stringify(query)}]`,
      });
      if (pageToken) params.set("pageToken", pageToken);
      const response = await requestJson<JsonListMemosResponse>(`/api/v1/${resourcePath(user.name)}/memos?${params.toString()}`);
      memos.push(...(response.memos || []));
      pageToken = response.nextPageToken || "";
    } while (pageToken);
    return memos.map(toMemoReference);
  },
};
