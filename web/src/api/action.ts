import dayjs from "dayjs";
import { ActionItem, ActionMemoReference, CreateActionInput, UpdateActionInput } from "@/types/action";
import type {
  Action as ActionContract,
  GoalRecord as GoalRecordContract,
  ListActionMemoRelationsResponse,
  ListActionsResponse,
  ListMemoActionRelationsResponse,
  MemoReference as MemoReferenceContract,
} from "@/types/proto/api/v1/action_service";

type JsonGoalRecord = Omit<GoalRecordContract, "recordedTime" | "createTime"> & {
  recordedTime?: string;
  createTime?: string;
};

type JsonAction = Omit<
  ActionContract,
  "deadline" | "createTime" | "updateTime" | "completeTime" | "terminateTime" | "children" | "goalRecords"
> & {
  deadline?: string;
  createTime?: string;
  updateTime?: string;
  completeTime?: string;
  terminateTime?: string;
  children?: JsonAction[];
  goalRecords?: JsonGoalRecord[];
};

type JsonMemoReference = Omit<MemoReferenceContract, "updateTime"> & { updateTime?: string };

interface JsonListActionsResponse extends Omit<ListActionsResponse, "actions"> {
  actions?: JsonAction[];
}

interface JsonListActionMemoRelationsResponse extends Omit<ListActionMemoRelationsResponse, "memos"> {
  memos?: JsonMemoReference[];
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

const toActionItem = (action: JsonAction): ActionItem => ({
  uid: action.name.replace(/^actions\//, ""),
  type: action.type === "GOAL" || action.type === "PROJECT" ? action.type : "TASK",
  status: action.status === "IN_PROGRESS" || action.status === "DONE" || action.status === "TERMINATED" ? action.status : "TODO",
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
    note: record.note,
    recordedAt: record.recordedTime ? dayjs(record.recordedTime).format("YYYY-MM-DD HH:mm") : "",
  })),
  children: (action.children || []).map(toActionItem),
  relatedMemoNames: action.relatedMemos || [],
  createdAt: action.createTime ? dayjs(action.createTime).format("YYYY-MM-DD HH:mm") : "",
  updatedAt: action.updateTime ? dayjs(action.updateTime).format("YYYY-MM-DD HH:mm") : "",
  completedAt: action.completeTime ? dayjs(action.completeTime).format("YYYY-MM-DD HH:mm") : undefined,
  terminationReason: action.terminationReason || undefined,
  terminatedAt: action.terminateTime ? dayjs(action.terminateTime).format("YYYY-MM-DD HH:mm") : undefined,
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

const actionBody = (input: CreateActionInput) => ({
  type: input.type,
  title: input.title,
  description: input.description,
  ...(input.parentUid ? { parent: `actions/${input.parentUid}` } : {}),
  planDate: input.planDate || "",
  ...(input.deadline ? { deadline: dayjs(input.deadline).toISOString() } : {}),
  ...(input.type === "GOAL" ? { goal: { current: 0, target: input.goalTarget, unit: input.goalUnit } } : {}),
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
    const response = await requestJson<JsonAction>(`/api/v1/actions/${encodeURIComponent(uid)}:reopen`, { method: "POST", body: "{}" });
    return toActionItem(response);
  },

  async moveAction(uid: string, parentUid: string | undefined, sortOrder: number): Promise<ActionItem> {
    const response = await requestJson<JsonAction>(`/api/v1/actions/${encodeURIComponent(uid)}:move`, {
      method: "POST",
      body: JSON.stringify({ ...(parentUid ? { parent: `actions/${parentUid}` } : {}), sortOrder }),
    });
    return toActionItem(response);
  },

  async terminateGoal(uid: string, reason: string): Promise<ActionItem> {
    const response = await requestJson<JsonAction>(`/api/v1/actions/${encodeURIComponent(uid)}:terminate`, {
      method: "POST",
      body: JSON.stringify({ reason }),
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

  async createGoalRecord(uid: string, delta: number, note: string, recordedAt: string): Promise<void> {
    await requestJson(`/api/v1/actions/${encodeURIComponent(uid)}/goalRecords`, {
      method: "POST",
      body: JSON.stringify({ delta, note, recordedTime: dayjs(recordedAt).toISOString() }),
    });
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
