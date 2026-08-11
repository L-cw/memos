import dayjs from "dayjs";
import { create } from "zustand";
import { actionApi } from "@/api/action";
import {
  ActionHabitRecord,
  ActionItem,
  ActionMemoReference,
  ActionView,
  CreateActionInput,
  GoalRecordOperation,
  UpdateActionInput,
} from "@/types/action";

export const flattenActions = (actions: ActionItem[]): ActionItem[] =>
  actions.flatMap((action) => [action, ...flattenActions(action.children)]);

export const findAction = (actions: ActionItem[], uid?: string): ActionItem | undefined => {
  if (!uid) return undefined;
  return flattenActions(actions).find((action) => action.uid === uid);
};

export const sortActionChildren = (actions: ActionItem[]): ActionItem[] =>
  actions
    .map((action, index) => ({ action, index }))
    .sort((left, right) => {
      const leftCompleted = ["DONE", "TERMINATED"].includes(left.action.status);
      const rightCompleted = ["DONE", "TERMINATED"].includes(right.action.status);
      if (leftCompleted !== rightCompleted) return leftCompleted ? 1 : -1;
      if (left.action.sortOrder !== right.action.sortOrder) return left.action.sortOrder - right.action.sortOrder;
      return left.index - right.index;
    })
    .map(({ action }) => action);

export const projectProgress = (action: ActionItem) => {
  const activeDescendants = (items: ActionItem[]): ActionItem[] =>
    items.flatMap((item) => (item.status === "TERMINATED" ? [] : [item, ...activeDescendants(item.children)]));
  const descendants = activeDescendants(action.children);
  return {
    done: descendants.filter((item) => item.status === "DONE").length,
    total: descendants.length,
  };
};

export const filterActionsByView = (actions: ActionItem[], view: ActionView): ActionItem[] => {
  const today = dayjs().format("YYYY-MM-DD");
  switch (view) {
    case "today":
      return actions.filter(
        (action) => action.type === "TASK" && action.planDate === today && ["TODO", "IN_PROGRESS"].includes(action.status),
      );
    case "upcoming":
      return actions.filter(
        (action) => Boolean(action.planDate && action.planDate > today) && ["TODO", "IN_PROGRESS"].includes(action.status),
      );
    case "all":
      return actions.filter((action) => ["TODO", "IN_PROGRESS"].includes(action.status));
    case "completed":
      return actions.filter((action) => ["DONE", "TERMINATED"].includes(action.status));
    case "projects":
      return actions.filter((action) => action.type === "PROJECT" && ["TODO", "IN_PROGRESS"].includes(action.status));
    case "goals":
      return actions.filter((action) => action.type === "GOAL" && ["TODO", "IN_PROGRESS"].includes(action.status));
    case "habits":
      return actions.filter((action) => action.type === "HABIT" && ["TODO", "IN_PROGRESS"].includes(action.status));
  }
};

export const getActionViewCounts = (actions: ActionItem[]) => ({
  today: filterActionsByView(actions, "today").length,
  upcoming: filterActionsByView(actions, "upcoming").length,
  all: filterActionsByView(actions, "all").length,
  completed: filterActionsByView(actions, "completed").length,
  projects: filterActionsByView(actions, "projects").length,
  goals: filterActionsByView(actions, "goals").length,
  habits: filterActionsByView(actions, "habits").length,
});

interface MutationResult {
  ok: boolean;
  message: string;
}

interface ActionState {
  actions: ActionItem[];
  memos: ActionMemoReference[];
  todayHabitRecords: ActionHabitRecord[];
  initialized: boolean;
  loading: boolean;
  error?: string;
  selectedActionUid?: string;
  createDialogOpen: boolean;
  memoPickerActionUid?: string;
  initialize: (force?: boolean) => Promise<void>;
  refreshActions: () => Promise<void>;
  refreshMemos: () => Promise<void>;
  refreshTodayHabitRecords: () => Promise<void>;
  batchUpdateHabitRecords: (records: ActionHabitRecord[]) => Promise<MutationResult>;
  selectAction: (uid?: string) => void;
  setCreateDialogOpen: (open: boolean) => void;
  openMemoPicker: (uid: string) => Promise<void>;
  closeMemoPicker: () => void;
  createAction: (input: CreateActionInput) => Promise<MutationResult>;
  updateAction: (uid: string, input: UpdateActionInput) => Promise<MutationResult>;
  deleteAction: (uid: string) => Promise<MutationResult>;
  toggleComplete: (uid: string) => Promise<MutationResult>;
  reopenAction: (uid: string) => Promise<MutationResult>;
  moveAction: (uid: string, parentUid?: string) => Promise<MutationResult>;
  togglePin: (uid: string) => Promise<MutationResult>;
  addGoalRecord: (uid: string, operation: GoalRecordOperation, value: number, note: string, recordedAt: string) => Promise<MutationResult>;
  terminateAction: (uid: string, reason: string) => Promise<MutationResult>;
  addChild: (parentUid: string, title: string, planDate?: string) => Promise<MutationResult>;
  setMemoRelations: (uid: string, memoNames: string[]) => Promise<MutationResult>;
  setActionRelationsForMemo: (memo: ActionMemoReference, actionUids: string[]) => Promise<MutationResult>;
}

const getErrorMessage = (error: unknown) => (error instanceof Error ? error.message : "请求失败，请稍后重试");

const mergeMemoReferences = (current: ActionMemoReference[], incoming: ActionMemoReference[]) => {
  const byName = new Map(current.map((memo) => [memo.name, memo]));
  for (const memo of incoming) byName.set(memo.name, memo);
  return Array.from(byName.values());
};

export const useActionStore = create<ActionState>((set, get) => {
  const reloadActions = async () => {
    const actions = await actionApi.listActions();
    set({ actions, error: undefined });
  };

  return {
    actions: [],
    memos: [],
    todayHabitRecords: [],
    initialized: false,
    loading: false,
    error: undefined,
    selectedActionUid: undefined,
    createDialogOpen: false,
    memoPickerActionUid: undefined,

    initialize: async (force = false) => {
      const state = get();
      if (state.loading || (state.initialized && !force)) return;
      set({ loading: true, error: undefined });
      try {
        const today = dayjs().format("YYYY-MM-DD");
        const [actions, memos, todayHabitRecords] = await Promise.all([
          actionApi.listActions(),
          actionApi.listMemos(),
          actionApi.listHabitRecords(today),
        ]);
        set({ actions, memos, todayHabitRecords, initialized: true, loading: false });
      } catch (error) {
        set({ loading: false, initialized: true, error: getErrorMessage(error) });
      }
    },

    refreshActions: reloadActions,

    refreshMemos: async () => {
      const memos = await actionApi.listMemos();
      set({ memos, error: undefined });
    },

    refreshTodayHabitRecords: async () => {
      try {
        const todayHabitRecords = await actionApi.listHabitRecords(dayjs().format("YYYY-MM-DD"));
        set({ todayHabitRecords, error: undefined });
      } catch (error) {
        set({ error: getErrorMessage(error) });
      }
    },

    batchUpdateHabitRecords: async (records) => {
      try {
        await actionApi.batchUpdateHabitRecords(records);
        const todayHabitRecords = await actionApi.listHabitRecords(dayjs().format("YYYY-MM-DD"));
        set({ todayHabitRecords, error: undefined });
        return { ok: true, message: "今日习惯已更新" };
      } catch (error) {
        return { ok: false, message: getErrorMessage(error) };
      }
    },

    selectAction: (uid) => {
      set({ selectedActionUid: uid });
      if (!uid) return;
      void actionApi
        .listActionMemoRelations(uid)
        .then((memos) => set((state) => ({ memos: mergeMemoReferences(state.memos, memos) })))
        .catch(() => undefined);
    },

    setCreateDialogOpen: (open) => set({ createDialogOpen: open }),

    openMemoPicker: async (uid) => {
      set({ memoPickerActionUid: uid });
      try {
        const [allMemos, relatedMemos] = await Promise.all([actionApi.listMemos(), actionApi.listActionMemoRelations(uid)]);
        set({ memos: mergeMemoReferences(allMemos, relatedMemos) });
      } catch (error) {
        set({ error: getErrorMessage(error) });
      }
    },

    closeMemoPicker: () => set({ memoPickerActionUid: undefined }),

    createAction: async (input) => {
      try {
        const created = await actionApi.createAction(input);
        await reloadActions();
        set({ selectedActionUid: input.type === "TASK" ? undefined : created.uid, createDialogOpen: false });
        return { ok: true, message: "Action 已创建" };
      } catch (error) {
        return { ok: false, message: getErrorMessage(error) };
      }
    },

    updateAction: async (uid, input) => {
      try {
        await actionApi.updateAction(uid, input);
        await reloadActions();
        return { ok: true, message: "Action 已保存" };
      } catch (error) {
        return { ok: false, message: getErrorMessage(error) };
      }
    },

    deleteAction: async (uid) => {
      try {
        await actionApi.deleteAction(uid);
        await reloadActions();
        if (get().selectedActionUid === uid) set({ selectedActionUid: undefined });
        return { ok: true, message: "Action 已删除" };
      } catch (error) {
        return { ok: false, message: getErrorMessage(error) };
      }
    },

    toggleComplete: async (uid) => {
      const action = findAction(get().actions, uid);
      if (!action) return { ok: false, message: "Action 不存在" };
      try {
        if (action.status === "DONE") await actionApi.reopenAction(uid);
        else await actionApi.completeAction(uid);
        await reloadActions();
        return { ok: true, message: action.status === "DONE" ? "Action 已重新打开" : "Action 已完成" };
      } catch (error) {
        return { ok: false, message: getErrorMessage(error) };
      }
    },

    reopenAction: async (uid) => {
      try {
        await actionApi.reopenAction(uid);
        await reloadActions();
        return { ok: true, message: "Action 已重新打开" };
      } catch (error) {
        return { ok: false, message: getErrorMessage(error) };
      }
    },

    moveAction: async (uid, parentUid) => {
      const action = findAction(get().actions, uid);
      if (!action) return { ok: false, message: "Action 不存在" };
      try {
        await actionApi.moveAction(uid, parentUid, action.sortOrder);
        await reloadActions();
        return { ok: true, message: "父级已更新" };
      } catch (error) {
        return { ok: false, message: getErrorMessage(error) };
      }
    },

    togglePin: async (uid) => {
      const action = findAction(get().actions, uid);
      if (!action) return { ok: false, message: "Action 不存在" };
      try {
        await actionApi.setPinned(uid, !action.pinned);
        await reloadActions();
        return { ok: true, message: action.pinned ? "已取消置顶" : "已置顶" };
      } catch (error) {
        return { ok: false, message: getErrorMessage(error) };
      }
    },

    addGoalRecord: async (uid, operation, value, note, recordedAt) => {
      try {
        await actionApi.createGoalRecord(uid, operation, value, note, recordedAt);
        await reloadActions();
        const action = findAction(get().actions, uid);
        return { ok: true, message: action?.status === "DONE" ? "Goal 已达标并自动完成" : "Goal 进度已记录" };
      } catch (error) {
        return { ok: false, message: getErrorMessage(error) };
      }
    },

    terminateAction: async (uid, reason) => {
      try {
        await actionApi.terminateAction(uid, reason);
        await reloadActions();
        return { ok: true, message: "Action 已终止" };
      } catch (error) {
        return { ok: false, message: getErrorMessage(error) };
      }
    },

    addChild: async (parentUid, title, planDate) => {
      try {
        await actionApi.createAction({ type: "TASK", title, description: "", parentUid, planDate });
        await reloadActions();
        return { ok: true, message: "子项已添加" };
      } catch (error) {
        return { ok: false, message: getErrorMessage(error) };
      }
    },

    setMemoRelations: async (uid, memoNames) => {
      try {
        await actionApi.setActionMemoRelations(uid, memoNames);
        await reloadActions();
        set({ memoPickerActionUid: undefined });
        return { ok: true, message: "Memo 关联已更新" };
      } catch (error) {
        return { ok: false, message: getErrorMessage(error) };
      }
    },

    setActionRelationsForMemo: async (memo, actionUids) => {
      try {
        await actionApi.setMemoActionRelations(memo.name, actionUids);
        await reloadActions();
        set((state) => ({ memos: mergeMemoReferences(state.memos, [memo]) }));
        return { ok: true, message: "Action 关联已更新" };
      } catch (error) {
        return { ok: false, message: getErrorMessage(error) };
      }
    },
  };
});
