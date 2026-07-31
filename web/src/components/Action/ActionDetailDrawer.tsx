import { Tooltip } from "@mui/joy";
import dayjs from "dayjs";
import {
  CalendarDaysIcon,
  CheckIcon,
  CircleCheckBigIcon,
  CircleIcon,
  Clock3Icon,
  LinkIcon,
  ListTreeIcon,
  NotebookTabsIcon,
  PinIcon,
  PinOffIcon,
  PlusIcon,
  RotateCcwIcon,
  TargetIcon,
  Trash2Icon,
  TriangleAlertIcon,
  UnlinkIcon,
  XIcon,
} from "lucide-react";
import { FormEvent, KeyboardEvent, useEffect, useMemo, useState } from "react";
import { toast } from "react-hot-toast";
import { findAction, flattenActions, projectProgress, useActionStore } from "@/store/v1";
import { ActionItem, UpdateActionInput } from "@/types/action";
import { cn } from "@/utils";
import ActionTypeBadge from "./ActionTypeBadge";

const inputClass =
  "w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-800 outline-none transition-colors placeholder:text-zinc-400 focus:border-primary focus:ring-2 focus:ring-primary/15 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder:text-zinc-600";

const preventInputEnterSubmit = (event: KeyboardEvent<HTMLFormElement>) => {
  if (event.key === "Enter" && !(event.target instanceof HTMLTextAreaElement)) {
    event.preventDefault();
  }
};

const statusMeta = {
  TODO: { label: "待开始", className: "text-zinc-500", icon: CircleIcon },
  IN_PROGRESS: { label: "进行中", className: "text-blue-600 dark:text-blue-400", icon: Clock3Icon },
  DONE: { label: "已完成", className: "text-green-600 dark:text-green-400", icon: CircleCheckBigIcon },
  TERMINATED: { label: "已终止", className: "text-red-600 dark:text-red-400", icon: TriangleAlertIcon },
};

const ActionStatus = ({ action }: { action: ActionItem }) => {
  const meta = statusMeta[action.status];
  const Icon = meta.icon;
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-sm font-medium", meta.className)}>
      <Icon className="h-4 w-4" />
      {meta.label}
    </span>
  );
};

const TreeItems = ({ items, depth = 0 }: { items: ActionItem[]; depth?: number }) => {
  const toggleComplete = useActionStore((state) => state.toggleComplete);

  return (
    <>
      {items.map((item) => (
        <div key={item.uid}>
          <div
            className="grid min-h-10 grid-cols-[28px_minmax(0,1fr)_auto] items-center gap-2 border-b border-zinc-100 py-1.5 last:border-b-0 dark:border-zinc-800"
            style={{ paddingLeft: `${Math.min(depth, 3) * 18}px` }}
          >
            <button
              className={cn(
                "flex h-7 w-7 items-center justify-center rounded text-zinc-400 hover:bg-zinc-100 hover:text-primary dark:hover:bg-zinc-800",
                item.status === "DONE" && "text-green-600 dark:text-green-400",
              )}
              type="button"
              aria-label={item.status === "DONE" ? `重新打开 ${item.title}` : `完成 ${item.title}`}
              onClick={async () => {
                const result = await toggleComplete(item.uid);
                result.ok ? toast.success(result.message) : toast.error(result.message);
              }}
            >
              {item.status === "DONE" ? <CircleCheckBigIcon className="h-4 w-4" /> : <CircleIcon className="h-4 w-4" />}
            </button>
            <span
              className={cn(
                "min-w-0 truncate text-sm text-zinc-800 dark:text-zinc-200",
                item.status === "DONE" && "text-zinc-400 line-through",
              )}
            >
              {item.title}
            </span>
            <span className="text-xs text-zinc-400">{item.planDate ? dayjs(item.planDate).format("M月D日") : ""}</span>
          </div>
          {item.children.length > 0 && <TreeItems items={item.children} depth={depth + 1} />}
        </div>
      ))}
    </>
  );
};

const ActionDetailDrawer = () => {
  const actions = useActionStore((state) => state.actions);
  const memos = useActionStore((state) => state.memos);
  const selectedActionUid = useActionStore((state) => state.selectedActionUid);
  const selectAction = useActionStore((state) => state.selectAction);
  const updateAction = useActionStore((state) => state.updateAction);
  const deleteAction = useActionStore((state) => state.deleteAction);
  const toggleComplete = useActionStore((state) => state.toggleComplete);
  const reopenAction = useActionStore((state) => state.reopenAction);
  const moveAction = useActionStore((state) => state.moveAction);
  const togglePin = useActionStore((state) => state.togglePin);
  const addGoalRecord = useActionStore((state) => state.addGoalRecord);
  const terminateGoal = useActionStore((state) => state.terminateGoal);
  const addChild = useActionStore((state) => state.addChild);
  const openMemoPicker = useActionStore((state) => state.openMemoPicker);
  const setMemoRelations = useActionStore((state) => state.setMemoRelations);
  const action = findAction(actions, selectedActionUid);
  const [draft, setDraft] = useState<UpdateActionInput>({ title: "", description: "" });
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [terminateDialogOpen, setTerminateDialogOpen] = useState(false);
  const [parentUid, setParentUid] = useState("");
  const [moving, setMoving] = useState(false);

  useEffect(() => {
    if (!action) return;
    setDraft({
      title: action.title,
      description: action.description,
      planDate: action.planDate,
      deadline: action.deadline,
    });
    setConfirmDelete(false);
    setTerminateDialogOpen(false);
    setParentUid(action.parentUid || "");
  }, [action?.uid]);

  const relatedMemos = useMemo(
    () => action?.relatedMemoNames.map((name) => memos.find((memo) => memo.name === name)).filter((memo) => memo !== undefined) || [],
    [action?.relatedMemoNames, memos],
  );
  const parentOptions = useMemo(() => {
    if (!action) return [];
    const descendantUids = new Set(flattenActions(action.children).map((item) => item.uid));
    return flattenActions(actions).filter((item) => item.uid !== action.uid && !descendantUids.has(item.uid));
  }, [action, actions]);

  if (!action) return null;

  const handleSave = async () => {
    const title = draft.title.trim();
    if (!title) {
      toast.error("标题不能为空");
      return;
    }
    const result = await updateAction(action.uid, { ...draft, title, description: draft.description.trim() });
    result.ok ? toast.success(result.message) : toast.error(result.message);
  };

  const handleTogglePin = async () => {
    const result = await togglePin(action.uid);
    result.ok ? toast.success(result.message) : toast.error(result.message);
  };

  const handleComplete = async () => {
    const result = action.status === "DONE" ? await reopenAction(action.uid) : await toggleComplete(action.uid);
    result.ok ? toast.success(result.message) : toast.error(result.message);
  };

  const handleMove = async () => {
    setMoving(true);
    const result = await moveAction(action.uid, parentUid || undefined);
    setMoving(false);
    result.ok ? toast.success(result.message) : toast.error(result.message);
  };

  const handleGoalSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const amount = Number(data.get("amount"));
    const direction = data.get("direction") === "-" ? -1 : 1;
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error("请输入大于 0 的进度值");
      return;
    }
    const result = await addGoalRecord(
      action.uid,
      direction * amount,
      String(data.get("note") || ""),
      dayjs(String(data.get("recordedAt"))).format("YYYY-MM-DD HH:mm"),
    );
    result.ok ? toast.success(result.message) : toast.error(result.message);
    if (result.ok) event.currentTarget.reset();
  };

  const handleChildSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const title = String(data.get("title") || "").trim();
    if (!title) return;
    const result = await addChild(action.uid, title, String(data.get("planDate") || ""));
    if (result.ok) event.currentTarget.reset();
    result.ok ? toast.success(result.message) : toast.error(result.message);
  };

  const goalPercent = action.goal ? Math.min(100, Math.max(0, (action.goal.current / action.goal.target) * 100)) : 0;
  const progress = projectProgress(action);

  return (
    <>
      <div className="fixed inset-0 z-100 bg-zinc-950/35 backdrop-blur-[1px]" role="presentation" onMouseDown={() => selectAction()} />
      <aside
        className="fixed inset-y-0 right-0 z-[101] flex w-full max-w-2xl flex-col border-l border-zinc-200 bg-white shadow-2xl dark:border-zinc-700 dark:bg-zinc-900"
        role="dialog"
        aria-modal="true"
        aria-label={`${action.title} 详情`}
        data-testid="action-detail-drawer"
      >
        <header className="flex min-h-16 items-center justify-between gap-3 border-b border-zinc-200 px-4 sm:px-6 dark:border-zinc-800">
          <ActionTypeBadge type={action.type} />
          <div className="flex items-center gap-1">
            <Tooltip title={action.pinned ? "取消置顶" : "置顶"} placement="bottom">
              <button
                className="rounded-md p-2 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
                type="button"
                aria-label={action.pinned ? "取消置顶" : "置顶"}
                onClick={handleTogglePin}
              >
                {action.pinned ? <PinOffIcon className="h-4 w-4" /> : <PinIcon className="h-4 w-4" />}
              </button>
            </Tooltip>
            <Tooltip title={confirmDelete ? "再次点击确认删除" : "删除"} placement="bottom">
              <button
                className={cn(
                  "rounded-md p-2 text-zinc-500 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/30",
                  confirmDelete && "bg-red-50 text-red-600 dark:bg-red-950/30 dark:text-red-400",
                )}
                type="button"
                aria-label={confirmDelete ? "确认删除" : "删除"}
                onClick={async () => {
                  if (!confirmDelete) {
                    setConfirmDelete(true);
                    return;
                  }
                  const result = await deleteAction(action.uid);
                  result.ok ? toast.success(result.message) : toast.error(result.message);
                }}
              >
                <Trash2Icon className="h-4 w-4" />
              </button>
            </Tooltip>
            <Tooltip title="关闭" placement="bottom">
              <button
                className="rounded-md p-2 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
                type="button"
                aria-label="关闭详情"
                onClick={() => selectAction()}
              >
                <XIcon className="h-4 w-4" />
              </button>
            </Tooltip>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <section className="space-y-4 px-4 py-5 sm:px-6">
            <input
              className="w-full border-0 bg-transparent p-0 text-xl font-semibold text-zinc-900 outline-none placeholder:text-zinc-400 dark:text-zinc-100"
              value={draft.title}
              aria-label="Action 标题"
              maxLength={80}
              onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))}
            />
            <div className="flex flex-wrap items-center gap-3">
              <ActionStatus action={action} />
              {action.type === "PROJECT" && (
                <span className="rounded bg-zinc-100 px-2 py-1 text-xs text-zinc-500 dark:bg-zinc-800">状态由子项计算</span>
              )}
              {action.type === "GOAL" && ["TODO", "IN_PROGRESS"].includes(action.status) && (
                <span className="rounded bg-zinc-100 px-2 py-1 text-xs text-zinc-500 dark:bg-zinc-800">达到目标值后自动完成</span>
              )}
              {action.type === "TASK" && (
                <button
                  className="ml-auto inline-flex items-center gap-1.5 rounded-md border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                  type="button"
                  onClick={handleComplete}
                >
                  {action.status === "DONE" ? <RotateCcwIcon className="h-3.5 w-3.5" /> : <CheckIcon className="h-3.5 w-3.5" />}
                  {action.status === "DONE" ? "重新打开" : "标记完成"}
                </button>
              )}
              {action.type === "GOAL" && action.status === "DONE" && (
                <button
                  className="ml-auto inline-flex items-center gap-1.5 rounded-md border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                  type="button"
                  onClick={handleComplete}
                >
                  <RotateCcwIcon className="h-3.5 w-3.5" />
                  重新打开
                </button>
              )}
            </div>

            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-zinc-500">描述</span>
              <textarea
                className={cn(inputClass, "min-h-24 resize-y")}
                value={draft.description}
                placeholder="添加描述"
                onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))}
              />
            </label>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-zinc-500">
                  <CalendarDaysIcon className="h-3.5 w-3.5" />
                  计划日期
                </span>
                <input
                  className={inputClass}
                  type="date"
                  value={draft.planDate || ""}
                  onChange={(event) => setDraft((current) => ({ ...current, planDate: event.target.value }))}
                />
              </label>
              <label className="block">
                <span className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-zinc-500">
                  <Clock3Icon className="h-3.5 w-3.5" />
                  截止时间
                </span>
                <input
                  className={inputClass}
                  type="datetime-local"
                  value={draft.deadline || ""}
                  onChange={(event) => setDraft((current) => ({ ...current, deadline: event.target.value }))}
                />
              </label>
            </div>

            <div>
              <span className="mb-1.5 block text-xs font-medium text-zinc-500">父级 Action</span>
              <div className="flex gap-2">
                <select
                  className={inputClass}
                  value={parentUid}
                  aria-label="父级 Action"
                  onChange={(event) => setParentUid(event.target.value)}
                >
                  <option value="">无父级</option>
                  {parentOptions.map((item) => (
                    <option value={item.uid} key={item.uid}>
                      {item.title}
                    </option>
                  ))}
                </select>
                <button
                  className="shrink-0 rounded-md border border-zinc-200 px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                  type="button"
                  disabled={moving || parentUid === (action.parentUid || "")}
                  onClick={handleMove}
                >
                  {moving ? "移动中..." : "移动"}
                </button>
              </div>
            </div>
          </section>

          {action.type === "GOAL" && action.goal && (
            <section className="border-t border-zinc-200 px-4 py-5 sm:px-6 dark:border-zinc-800">
              <div className="mb-4 flex items-center justify-between gap-3">
                <h3 className="flex items-center gap-2 text-sm font-semibold text-zinc-800 dark:text-zinc-200">
                  <TargetIcon className="h-4 w-4 text-teal-600 dark:text-teal-400" />
                  目标进度
                </h3>
                {["TODO", "IN_PROGRESS"].includes(action.status) && (
                  <button
                    className="text-xs font-medium text-red-600 hover:text-red-700 dark:text-red-400"
                    type="button"
                    onClick={() => setTerminateDialogOpen(true)}
                  >
                    终止目标
                  </button>
                )}
              </div>
              <div className="mb-5">
                <div className="mb-2 flex items-end justify-between gap-3">
                  <span className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">
                    {action.goal.current} <small className="text-sm font-medium text-zinc-500">{action.goal.unit}</small>
                  </span>
                  <span className="text-xs text-zinc-500">
                    目标 {action.goal.target} {action.goal.unit} · {Math.round(goalPercent)}%
                  </span>
                </div>
                <div
                  className="h-2 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800"
                  role="progressbar"
                  aria-label={`${action.title} 进度`}
                  aria-valuenow={action.goal.current}
                  aria-valuemin={0}
                  aria-valuemax={action.goal.target}
                >
                  <div className="h-full rounded-full bg-teal-500 transition-all" style={{ width: `${goalPercent}%` }} />
                </div>
              </div>

              {action.status === "TERMINATED" ? (
                <div className="mb-5 border-l-2 border-red-400 bg-red-50 px-4 py-3 dark:bg-red-950/25">
                  <div className="text-xs font-semibold text-red-700 dark:text-red-300">终止原因</div>
                  <p className="mt-1 text-sm leading-6 text-red-700 dark:text-red-300">{action.terminationReason}</p>
                  <p className="mt-1 text-xs text-red-500">{action.terminatedAt}</p>
                </div>
              ) : (
                action.status !== "DONE" && (
                  <form className="mb-5 space-y-3" onSubmit={handleGoalSubmit} onKeyDown={preventInputEnterSubmit}>
                    <div className="grid grid-cols-[72px_minmax(0,1fr)] gap-2 sm:grid-cols-[72px_120px_minmax(0,1fr)]">
                      <select className={inputClass} name="direction" aria-label="进度方向" defaultValue="+">
                        <option value="+">+</option>
                        <option value="-">-</option>
                      </select>
                      <input
                        className={inputClass}
                        name="amount"
                        type="number"
                        min="0.01"
                        step="0.01"
                        defaultValue="20"
                        aria-label="进度数值"
                        required
                      />
                      <input
                        className={cn(inputClass, "col-span-2 sm:col-span-1")}
                        name="recordedAt"
                        type="datetime-local"
                        defaultValue={dayjs().format("YYYY-MM-DDTHH:mm")}
                        aria-label="记录时间"
                        required
                      />
                    </div>
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <input className={inputClass} name="note" placeholder="记录说明" aria-label="记录说明" />
                      <button
                        className="shrink-0 rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-dark"
                        type="submit"
                      >
                        记录进度
                      </button>
                    </div>
                  </form>
                )
              )}

              <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {action.goalRecords.map((record) => (
                  <div className="grid grid-cols-[52px_minmax(0,1fr)_auto] items-center gap-3 py-3" key={record.uid}>
                    <span className={cn("text-sm font-semibold tabular-nums", record.delta >= 0 ? "text-teal-600" : "text-red-600")}>
                      {record.delta > 0 ? "+" : ""}
                      {record.delta}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm text-zinc-700 dark:text-zinc-300">{record.note || "进度更新"}</span>
                      <span className="block text-xs text-zinc-400">{record.recordedAt}</span>
                    </span>
                    <span className="text-xs text-zinc-500">累计 {record.valueAfter}</span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {action.type !== "GOAL" && (
            <section className="border-t border-zinc-200 px-4 py-5 sm:px-6 dark:border-zinc-800">
              <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-zinc-800 dark:text-zinc-200">
                <ListTreeIcon className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                子项{" "}
                {progress.total > 0 && (
                  <span className="font-normal text-zinc-500">
                    ({progress.done}/{progress.total})
                  </span>
                )}
              </h3>
              <div className="mb-3">
                {action.children.length > 0 ? (
                  <TreeItems items={action.children} />
                ) : (
                  <p className="py-3 text-sm text-zinc-400">暂无子项</p>
                )}
              </div>
              <form
                className="grid gap-2 sm:grid-cols-[130px_minmax(0,1fr)_auto]"
                onSubmit={handleChildSubmit}
                onKeyDown={preventInputEnterSubmit}
              >
                <input
                  className={inputClass}
                  name="planDate"
                  type="date"
                  defaultValue={dayjs().format("YYYY-MM-DD")}
                  aria-label="子项计划日期"
                />
                <input className={inputClass} name="title" placeholder="添加 Todo 子项" maxLength={80} required />
                <button
                  className="inline-flex items-center justify-center gap-1.5 rounded-md border border-zinc-200 px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                  type="submit"
                >
                  <PlusIcon className="h-4 w-4" />
                  添加
                </button>
              </form>
            </section>
          )}

          <section className="border-t border-zinc-200 px-4 py-5 sm:px-6 dark:border-zinc-800">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h3 className="flex items-center gap-2 text-sm font-semibold text-zinc-800 dark:text-zinc-200">
                <LinkIcon className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                关联 Memo
                <span className="font-normal text-zinc-500">({relatedMemos.length})</span>
              </h3>
              <button
                className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:text-primary-dark"
                type="button"
                onClick={() => openMemoPicker(action.uid)}
              >
                <PlusIcon className="h-3.5 w-3.5" />
                添加
              </button>
            </div>
            <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {relatedMemos.length > 0 ? (
                relatedMemos.map((memo) => (
                  <div className="grid grid-cols-[32px_minmax(0,1fr)_32px] items-center gap-3 py-3" key={memo.name}>
                    <span className="flex h-8 w-8 items-center justify-center rounded bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
                      <NotebookTabsIcon className="h-4 w-4" />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-zinc-800 dark:text-zinc-200">{memo.title}</span>
                      <span className="block truncate text-xs text-zinc-500">{memo.snippet}</span>
                    </span>
                    <Tooltip title="移除关联" placement="left">
                      <button
                        className="flex h-8 w-8 items-center justify-center rounded text-zinc-400 hover:bg-zinc-100 hover:text-red-600 dark:hover:bg-zinc-800"
                        type="button"
                        aria-label={`移除 ${memo.title} 关联`}
                        onClick={async () => {
                          const result = await setMemoRelations(
                            action.uid,
                            action.relatedMemoNames.filter((name) => name !== memo.name),
                          );
                          result.ok ? toast.success("关联已移除") : toast.error(result.message);
                        }}
                      >
                        <UnlinkIcon className="h-4 w-4" />
                      </button>
                    </Tooltip>
                  </div>
                ))
              ) : (
                <p className="py-4 text-sm text-zinc-400">暂无关联 Memo</p>
              )}
            </div>
          </section>
        </div>

        <footer className="flex items-center justify-between gap-3 border-t border-zinc-200 px-4 py-4 sm:px-6 dark:border-zinc-800">
          <span className="truncate text-xs text-zinc-400">更新于 {action.updatedAt}</span>
          <div className="flex shrink-0 gap-2">
            <button
              className="rounded-md border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
              type="button"
              onClick={() => selectAction()}
            >
              取消
            </button>
            <button
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-dark"
              type="button"
              onClick={handleSave}
            >
              保存
            </button>
          </div>
        </footer>
      </aside>

      {terminateDialogOpen && (
        <div className="fixed inset-0 z-[1200] flex items-center justify-center bg-zinc-950/50 p-4" role="presentation">
          <form
            className="w-full max-w-md rounded-lg border border-zinc-200 bg-white shadow-2xl dark:border-zinc-700 dark:bg-zinc-900"
            role="dialog"
            aria-modal="true"
            aria-labelledby="terminate-goal-title"
            onKeyDown={preventInputEnterSubmit}
            onSubmit={async (event) => {
              event.preventDefault();
              const data = new FormData(event.currentTarget);
              const result = await terminateGoal(action.uid, String(data.get("reason") || ""));
              if (result.ok) {
                toast.success(result.message);
                setTerminateDialogOpen(false);
              } else {
                toast.error(result.message);
              }
            }}
          >
            <div className="px-5 py-5">
              <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-full bg-red-50 text-red-600 dark:bg-red-950/30 dark:text-red-400">
                <TriangleAlertIcon className="h-5 w-5" />
              </div>
              <h2 id="terminate-goal-title" className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
                终止 Goal
              </h2>
              <p className="mt-1 text-sm leading-6 text-zinc-500">终止后不能重新打开或继续记录进度，历史记录会保留。</p>
              <label className="mt-4 block">
                <span className="mb-1.5 block text-xs font-medium text-zinc-500">终止原因</span>
                <textarea
                  className={cn(inputClass, "min-h-24 resize-y")}
                  name="reason"
                  placeholder="说明停止目标的原因"
                  autoFocus
                  required
                />
              </label>
            </div>
            <footer className="flex justify-end gap-2 border-t border-zinc-200 px-5 py-4 dark:border-zinc-800">
              <button
                className="rounded-md border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-700 dark:border-zinc-700 dark:text-zinc-300"
                type="button"
                onClick={() => setTerminateDialogOpen(false)}
              >
                取消
              </button>
              <button className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700" type="submit">
                确认终止
              </button>
            </footer>
          </form>
        </div>
      )}
    </>
  );
};

export default ActionDetailDrawer;
