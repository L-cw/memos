import { Tooltip } from "@mui/joy";
import dayjs from "dayjs";
import {
  CalendarCheck2Icon,
  CalendarDaysIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  CircleCheckBigIcon,
  CircleIcon,
  FlagIcon,
  FolderKanbanIcon,
  LinkIcon,
  ListChecksIcon,
  PinIcon,
  PinOffIcon,
  PlusIcon,
  CalendarClockIcon,
  TargetIcon,
  TriangleAlertIcon,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "react-hot-toast";
import { useNavigate, useParams } from "react-router-dom";
import ActionCreateDialog from "@/components/Action/ActionCreateDialog";
import ActionDetailDrawer from "@/components/Action/ActionDetailDrawer";
import ActionMemoPickerDialog from "@/components/Action/ActionMemoPickerDialog";
import ActionTypeBadge from "@/components/Action/ActionTypeBadge";
import HabitCheckInDialog from "@/components/Action/HabitCheckInDialog";
import MobileHeader from "@/components/MobileHeader";
import { filterActionsByView, flattenActions, getActionViewCounts, projectProgress, sortActionChildren, useActionStore } from "@/store/v1";
import { ACTION_VIEWS, ActionItem, ActionView, isActionView } from "@/types/action";
import { cn } from "@/utils";
import { habitScheduleLabel } from "@/utils/habit";
import { Translations, useTranslate } from "@/utils/i18n";

const actionViewLabelKeys: Record<ActionView, Translations> = {
  today: "action.views.today",
  upcoming: "action.views.upcoming",
  all: "action.views.all",
  completed: "action.views.completed",
  projects: "action.views.projects",
  goals: "action.views.goals",
  habits: "action.views.habits",
};

const viewTitle: Record<ActionView, { title: string; description: string }> = {
  today: { title: "Today", description: "今天计划完成的 Todo" },
  upcoming: { title: "Upcoming", description: "接下来有计划日期的 Action" },
  all: { title: "All", description: "全部进行中的 Action" },
  completed: { title: "Completed", description: "已完成和已终止的 Action" },
  projects: { title: "Projects", description: "进行中的项目与拆解进度" },
  goals: { title: "Goals", description: "进行中的数值目标" },
  habits: { title: "习惯", description: "长期坚持与打卡记录" },
};

const formatDate = (value?: string) => {
  if (!value) return "无计划日期";
  const target = dayjs(value);
  if (target.isSame(dayjs(), "day")) return "今天";
  if (target.isSame(dayjs().add(1, "day"), "day")) return "明天";
  return target.format("M月D日");
};

const getActionSummary = (action: ActionItem) => {
  if (action.type === "GOAL" && action.goal) {
    return `${action.goal.current}/${action.goal.target} ${action.goal.unit}`;
  }
  if (action.type === "PROJECT") {
    const progress = projectProgress(action);
    return `${progress.done}/${progress.total} 子项`;
  }
  if (action.type === "HABIT") return habitScheduleLabel(action);
  if (action.status === "DONE") return "已完成";
  if (action.status === "TERMINATED") return "已终止";
  return action.status === "IN_PROGRESS" ? "进行中" : "待开始";
};

const PinnedActionCard = ({ action }: { action: ActionItem }) => {
  const selectAction = useActionStore((state) => state.selectAction);
  const togglePin = useActionStore((state) => state.togglePin);
  const progress = action.type === "GOAL" && action.goal ? Math.min(100, (action.goal.current / action.goal.target) * 100) : undefined;

  return (
    <article className="relative h-[76px] w-[78vw] min-w-[250px] shrink-0 snap-start overflow-hidden rounded-md border border-zinc-200 bg-white p-3 shadow-sm transition-colors hover:border-zinc-300 sm:w-auto sm:min-w-0 sm:shrink dark:border-zinc-700 dark:bg-zinc-900 dark:hover:border-zinc-600">
      <button className="absolute inset-0 z-0" type="button" aria-label={`打开 ${action.title}`} onClick={() => selectAction(action.uid)} />
      <div className="pointer-events-none relative z-1 flex h-6 min-w-0 items-center gap-2">
        <ActionTypeBadge type={action.type} compact iconOnly />
        <h3 className="min-w-0 flex-1 truncate text-sm font-semibold text-zinc-900 dark:text-zinc-100">{action.title}</h3>
        <Tooltip title="取消置顶" placement="left">
          <button
            className="pointer-events-auto flex h-6 w-6 shrink-0 items-center justify-center rounded text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
            type="button"
            aria-label={`取消置顶 ${action.title}`}
            onClick={async () => {
              const result = await togglePin(action.uid);
              result.ok ? toast.success(result.message) : toast.error(result.message);
            }}
          >
            <PinOffIcon className="h-4 w-4" />
          </button>
        </Tooltip>
      </div>
      <div className="pointer-events-none relative z-1 mt-2 flex h-4 min-w-0 items-center gap-2 text-xs text-zinc-500">
        {progress !== undefined ? (
          <>
            <span className="shrink-0 truncate">{getActionSummary(action)}</span>
            <div className="h-1.5 min-w-8 flex-1 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
              <div className="h-full rounded-full bg-teal-500" style={{ width: `${progress}%` }} />
            </div>
            <span className="shrink-0 tabular-nums">{Math.round(progress)}%</span>
          </>
        ) : (
          <>
            <span className="min-w-0 flex-1 truncate">{getActionSummary(action)}</span>
            <span className="shrink-0">{formatDate(action.planDate)}</span>
          </>
        )}
      </div>
    </article>
  );
};

const ActionRow = ({ action, expanded, onToggleExpanded }: { action: ActionItem; expanded: boolean; onToggleExpanded: () => void }) => {
  const selectAction = useActionStore((state) => state.selectAction);
  const toggleComplete = useActionStore((state) => state.toggleComplete);
  const togglePin = useActionStore((state) => state.togglePin);
  const canComplete = action.type === "TASK";
  const isDone = action.status === "DONE";
  const isTerminated = action.status === "TERMINATED";
  const project = projectProgress(action);
  const goalPercent = action.goal ? Math.min(100, Math.max(0, (action.goal.current / action.goal.target) * 100)) : 0;
  const sortedChildren = sortActionChildren(action.children);
  const visibleChildren = expanded
    ? sortedChildren
    : action.type === "PROJECT"
      ? sortedChildren.filter((child) => !["DONE", "TERMINATED"].includes(child.status)).slice(0, 4)
      : [];

  const handleComplete = async () => {
    const result = await toggleComplete(action.uid);
    result.ok ? toast.success(result.message) : toast.error(result.message);
  };

  const handleTogglePin = async () => {
    const result = await togglePin(action.uid);
    result.ok ? toast.success(result.message) : toast.error(result.message);
  };

  return (
    <article
      className={cn(
        "border-b border-zinc-100 last:border-b-0 dark:border-zinc-800",
        (isDone || isTerminated) && "bg-zinc-50/60 dark:bg-zinc-900/50",
      )}
    >
      <div className="grid min-h-[74px] grid-cols-[36px_minmax(0,1fr)_auto] items-center gap-2 px-3 py-3 sm:grid-cols-[36px_minmax(0,1fr)_auto_auto] sm:px-4">
        <button
          className={cn(
            "flex h-8 w-8 items-center justify-center rounded text-zinc-400 transition-colors",
            canComplete ? "hover:bg-zinc-100 hover:text-primary dark:hover:bg-zinc-800" : "cursor-default",
            isDone && "text-green-600 dark:text-green-400",
            isTerminated && "text-red-500",
          )}
          type="button"
          disabled={!canComplete || isTerminated}
          aria-label={isDone ? `重新打开 ${action.title}` : `完成 ${action.title}`}
          onClick={handleComplete}
        >
          {isDone ? <CircleCheckBigIcon className="h-5 w-5" /> : <CircleIcon className="h-5 w-5" />}
        </button>

        <button className="min-w-0 text-left" type="button" onClick={() => selectAction(action.uid)}>
          <div className="flex min-w-0 items-center gap-2">
            <ActionTypeBadge type={action.type} compact iconOnly />
            <h3
              className={cn(
                "min-w-0 truncate text-sm font-medium text-zinc-900 dark:text-zinc-100",
                isDone && "text-zinc-400 line-through dark:text-zinc-500",
              )}
            >
              {action.title}
            </h3>
            {isTerminated && (
              <span className="shrink-0 rounded bg-red-50 px-1.5 py-0.5 text-[11px] font-medium text-red-600 dark:bg-red-950/30 dark:text-red-400">
                已终止
              </span>
            )}
          </div>
          <div className="mt-1.5 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-500">
            {action.type === "HABIT" ? (
              <span className="inline-flex items-center gap-1">
                <CalendarClockIcon className="h-3.5 w-3.5" />
                {habitScheduleLabel(action)}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1">
                <CalendarDaysIcon className="h-3.5 w-3.5" />
                {formatDate(action.planDate)}
              </span>
            )}
            {action.deadline && (
              <span className="inline-flex items-center gap-1">
                <FlagIcon className="h-3.5 w-3.5" />
                {dayjs(action.deadline).format("M月D日 HH:mm")}
              </span>
            )}
            {action.type === "PROJECT" && (
              <span>
                {project.done}/{project.total} 子项
              </span>
            )}
            {action.type === "GOAL" && action.goal && (
              <span>
                {action.goal.current}/{action.goal.target} {action.goal.unit}
              </span>
            )}
            {action.relatedMemoNames.length > 0 && (
              <span className="inline-flex items-center gap-1">
                <LinkIcon className="h-3.5 w-3.5" />
                {action.relatedMemoNames.length} Memo
              </span>
            )}
          </div>
          {action.type === "GOAL" && action.goal && (
            <div className="mt-2 h-1 w-full max-w-56 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
              <div className="h-full rounded-full bg-teal-500" style={{ width: `${goalPercent}%` }} />
            </div>
          )}
        </button>

        <Tooltip title={action.pinned ? "取消置顶" : "置顶"} placement="top">
          <button
            className="flex h-8 w-8 items-center justify-center rounded text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
            type="button"
            aria-label={action.pinned ? `取消置顶 ${action.title}` : `置顶 ${action.title}`}
            onClick={handleTogglePin}
          >
            {action.pinned ? <PinOffIcon className="h-4 w-4" /> : <PinIcon className="h-4 w-4" />}
          </button>
        </Tooltip>

        {action.children.length > 0 ? (
          <Tooltip title={expanded ? "收起子项" : "展开子项"} placement="top">
            <button
              className="hidden h-8 w-8 items-center justify-center rounded text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 sm:flex"
              type="button"
              aria-label={expanded ? `收起 ${action.title} 子项` : `展开 ${action.title} 子项`}
              onClick={onToggleExpanded}
            >
              {expanded ? <ChevronDownIcon className="h-4 w-4" /> : <ChevronRightIcon className="h-4 w-4" />}
            </button>
          </Tooltip>
        ) : (
          <button
            className="hidden h-8 w-8 items-center justify-center text-zinc-300 sm:flex"
            type="button"
            aria-label={`打开 ${action.title}`}
            onClick={() => selectAction(action.uid)}
          >
            <ChevronRightIcon className="h-4 w-4" />
          </button>
        )}
      </div>

      {visibleChildren.length > 0 && (
        <div className="border-t border-zinc-100 bg-zinc-50 px-4 py-2 pl-14 dark:border-zinc-800 dark:bg-zinc-950/40">
          {visibleChildren.map((child) => (
            <div className="flex w-full min-w-0 items-center gap-2 py-2 text-left" key={child.uid}>
              <button
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded hover:bg-zinc-100 dark:hover:bg-zinc-800"
                type="button"
                aria-label={child.status === "DONE" ? `重新打开 ${child.title}` : `完成 ${child.title}`}
                onClick={async () => {
                  const result = await toggleComplete(child.uid);
                  result.ok ? toast.success(result.message) : toast.error(result.message);
                }}
              >
                {child.status === "DONE" ? (
                  <CircleCheckBigIcon className="h-4 w-4 text-green-600" />
                ) : (
                  <CircleIcon className="h-4 w-4 text-zinc-400" />
                )}
              </button>
              <span
                className={cn(
                  "min-w-0 flex-1 truncate text-sm text-zinc-700 dark:text-zinc-300",
                  child.status === "DONE" && "text-zinc-400 line-through",
                )}
              >
                {child.title}
              </span>
              <span className="shrink-0 text-xs text-zinc-400">{formatDate(child.planDate)}</span>
            </div>
          ))}
        </div>
      )}
    </article>
  );
};

const Actions = () => {
  const t = useTranslate();
  const params = useParams<{ view?: string }>();
  const navigate = useNavigate();
  const actions = useActionStore((state) => state.actions);
  const initialized = useActionStore((state) => state.initialized);
  const loading = useActionStore((state) => state.loading);
  const error = useActionStore((state) => state.error);
  const initialize = useActionStore((state) => state.initialize);
  const setCreateDialogOpen = useActionStore((state) => state.setCreateDialogOpen);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [habitCheckInOpen, setHabitCheckInOpen] = useState(false);
  const view: ActionView = isActionView(params.view) ? params.view : "today";
  const filteredActions = useMemo(() => filterActionsByView(actions, view), [actions, view]);
  const pinnedActions = useMemo(
    () =>
      flattenActions(actions)
        .filter((action) => action.pinned)
        .slice(0, 6),
    [actions],
  );
  const counts = useMemo(() => getActionViewCounts(actions), [actions]);
  const topLevelToday = actions.filter((action) => action.type === "TASK" && action.planDate === dayjs().format("YYYY-MM-DD"));
  const todayDone = topLevelToday.filter((action) => action.status === "DONE").length;
  const activeGoals = actions.filter((action) => action.type === "GOAL" && ["TODO", "IN_PROGRESS"].includes(action.status)).length;
  const activeProjects = actions.filter((action) => action.type === "PROJECT" && ["TODO", "IN_PROGRESS"].includes(action.status));
  const projectTotals = activeProjects.reduce(
    (total, action) => {
      const progress = projectProgress(action);
      return { done: total.done + progress.done, total: total.total + progress.total };
    },
    { done: 0, total: 0 },
  );
  const currentView = viewTitle[view];
  const defaultCreateType = view === "projects" ? "PROJECT" : view === "goals" ? "GOAL" : view === "habits" ? "HABIT" : "TASK";

  useEffect(() => {
    void initialize();
  }, [initialize]);

  return (
    <section className="w-full max-w-6xl pb-24 sm:px-6 sm:pt-6">
      <MobileHeader className="md:hidden" />

      <div className="px-4 sm:px-0">
        {view === "all" && (
          <section
            className="grid grid-cols-3 divide-x divide-zinc-200 border-b border-zinc-200 py-4 dark:divide-zinc-800 dark:border-zinc-800"
            aria-label="Action 统计"
          >
            <div className="min-w-0 px-2 first:pl-0 sm:px-5 sm:first:pl-0">
              <div className="flex items-center gap-1.5 text-xs text-zinc-500">
                <CalendarCheck2Icon className="h-3.5 w-3.5" />
                今日完成
              </div>
              <div className="mt-1 text-lg font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">
                {todayDone}/{topLevelToday.length}
              </div>
            </div>
            <div className="min-w-0 px-2 sm:px-5">
              <div className="flex items-center gap-1.5 text-xs text-zinc-500">
                <TargetIcon className="h-3.5 w-3.5" />
                进行中 Goal
              </div>
              <div className="mt-1 text-lg font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">{activeGoals}</div>
            </div>
            <div className="min-w-0 px-2 sm:px-5">
              <div className="flex items-center gap-1.5 text-xs text-zinc-500">
                <FolderKanbanIcon className="h-3.5 w-3.5" />
                项目子项
              </div>
              <div className="mt-1 text-lg font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">
                {projectTotals.done}/{projectTotals.total}
              </div>
            </div>
          </section>
        )}

        <section className="py-4 sm:py-5" aria-label="置顶 Action">
          <div className="-mx-4 flex snap-x gap-2 overflow-x-auto px-4 hide-scrollbar sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 lg:grid-cols-3">
            {pinnedActions.map((action) => (
              <PinnedActionCard action={action} key={action.uid} />
            ))}
          </div>
        </section>

        <div className="mb-3 md:hidden">
          <label className="relative block">
            <span className="sr-only">Action 视图</span>
            <select
              className="w-full appearance-none rounded-md border border-zinc-200 bg-white px-3 py-2.5 pr-10 text-sm font-medium text-zinc-800 outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
              value={view}
              onChange={(event) => navigate(`/actions/${event.target.value}`)}
            >
              {ACTION_VIEWS.map((item) => (
                <option value={item} key={item}>
                  {t(actionViewLabelKeys[item])} ({counts[item]})
                </option>
              ))}
            </select>
            <ChevronDownIcon className="pointer-events-none absolute right-3 top-3 h-4 w-4 text-zinc-400" />
          </label>
        </div>

        <section
          className="overflow-hidden rounded-md border border-zinc-200 bg-white shadow-sm dark:border-zinc-700 dark:bg-zinc-900"
          aria-labelledby="action-list-title"
        >
          <header className="flex min-h-16 items-center justify-between gap-3 border-b border-zinc-200 px-4 dark:border-zinc-800">
            <div className="min-w-0">
              <h2 id="action-list-title" className="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                {currentView.title}
              </h2>
              <p className="mt-0.5 truncate text-xs text-zinc-500">{currentView.description}</p>
            </div>
            <span className="rounded bg-zinc-100 px-2 py-1 text-xs font-medium tabular-nums text-zinc-500 dark:bg-zinc-800">
              {filteredActions.length}
            </span>
          </header>
          {loading && !initialized ? (
            <div className="flex min-h-56 items-center justify-center px-6 text-sm text-zinc-500">正在加载 Action...</div>
          ) : error ? (
            <div className="flex min-h-56 flex-col items-center justify-center px-6 text-center">
              <TriangleAlertIcon className="mb-3 h-6 w-6 text-red-500" />
              <p className="text-sm text-zinc-700 dark:text-zinc-300">{error}</p>
              <button
                className="mt-3 rounded-md border border-zinc-200 px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                type="button"
                onClick={() => void initialize(true)}
              >
                重新加载
              </button>
            </div>
          ) : filteredActions.length > 0 ? (
            filteredActions.map((action) => (
              <ActionRow
                action={action}
                expanded={expanded.has(action.uid)}
                onToggleExpanded={() =>
                  setExpanded((current) => {
                    const next = new Set(current);
                    next.has(action.uid) ? next.delete(action.uid) : next.add(action.uid);
                    return next;
                  })
                }
                key={action.uid}
              />
            ))
          ) : (
            <div className="flex min-h-56 flex-col items-center justify-center px-6 text-center">
              <span className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-zinc-100 text-zinc-400 dark:bg-zinc-800">
                <ListChecksIcon className="h-5 w-5" />
              </span>
              <h3 className="text-sm font-medium text-zinc-800 dark:text-zinc-200">这里还没有 Action</h3>
              <p className="mt-1 text-xs text-zinc-500">当前视图暂无内容</p>
            </div>
          )}
        </section>
      </div>

      <div className="fixed bottom-[calc(1rem+env(safe-area-inset-bottom))] right-4 z-20 flex flex-col gap-2 sm:bottom-6 sm:right-6">
        <Tooltip title="今日打卡" placement="left">
          <button
            className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-600 text-white shadow-lg transition-colors hover:bg-emerald-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 sm:h-14 sm:w-14"
            type="button"
            aria-label="今日打卡"
            onClick={(event) => {
              event.currentTarget.blur();
              setHabitCheckInOpen(true);
            }}
          >
            <CalendarClockIcon className="h-5 w-5 sm:h-6 sm:w-6" />
          </button>
        </Tooltip>
        <Tooltip title="新建 Action" placement="left">
          <button
            className="flex h-12 w-12 items-center justify-center rounded-full bg-primary text-white shadow-lg transition-colors hover:bg-primary-dark focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary sm:h-14 sm:w-14"
            type="button"
            aria-label="新建 Action"
            onClick={(event) => {
              event.currentTarget.blur();
              setCreateDialogOpen(true);
            }}
          >
            <PlusIcon className="h-5 w-5 sm:h-6 sm:w-6" />
          </button>
        </Tooltip>
      </div>

      <ActionCreateDialog defaultType={defaultCreateType} />
      <ActionDetailDrawer />
      <ActionMemoPickerDialog />
      <HabitCheckInDialog open={habitCheckInOpen} onClose={() => setHabitCheckInOpen(false)} />
    </section>
  );
};

export default Actions;
