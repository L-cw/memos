import dayjs from "dayjs";
import { CalendarClockIcon, CircleCheckIcon, FolderKanbanIcon, TargetIcon, XIcon } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { toast } from "react-hot-toast";
import { useActionStore } from "@/store/v1";
import { ActionType, HabitScheduleType } from "@/types/action";
import { cn } from "@/utils";

const inputClass =
  "w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-800 outline-none transition-colors placeholder:text-zinc-400 focus:border-primary focus:ring-2 focus:ring-primary/15 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder:text-zinc-600";

const typeOptions: { value: ActionType; label: string; icon: typeof CircleCheckIcon }[] = [
  { value: "TASK", label: "Todo", icon: CircleCheckIcon },
  { value: "GOAL", label: "Goal", icon: TargetIcon },
  { value: "PROJECT", label: "Project", icon: FolderKanbanIcon },
  { value: "HABIT", label: "习惯", icon: CalendarClockIcon },
];

const weekdays = [
  { value: 1, label: "一" },
  { value: 2, label: "二" },
  { value: 3, label: "三" },
  { value: 4, label: "四" },
  { value: 5, label: "五" },
  { value: 6, label: "六" },
  { value: 7, label: "日" },
];

interface Props {
  defaultType?: ActionType;
}

const ActionCreateDialog = ({ defaultType = "TASK" }: Props) => {
  const open = useActionStore((state) => state.createDialogOpen);
  const setOpen = useActionStore((state) => state.setCreateDialogOpen);
  const createAction = useActionStore((state) => state.createAction);
  const [type, setType] = useState<ActionType>("TASK");
  const [habitScheduleType, setHabitScheduleType] = useState<HabitScheduleType>("DAILY");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setType(defaultType);
      setHabitScheduleType("DAILY");
      setSubmitting(false);
    }
  }, [defaultType, open]);

  if (!open) return null;

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const title = String(data.get("title") || "").trim();
    if (!title) return;

    setSubmitting(true);
    const result = await createAction({
      type,
      title,
      description: String(data.get("description") || "").trim(),
      planDate: String(data.get("planDate") || ""),
      deadline: String(data.get("deadline") || ""),
      goalTarget: type === "GOAL" ? Number(data.get("goalTarget")) : undefined,
      goalUnit: type === "GOAL" ? String(data.get("goalUnit") || "") : undefined,
      habitStartDate: type === "HABIT" ? String(data.get("habitStartDate") || "") : undefined,
      habitScheduleType: type === "HABIT" ? habitScheduleType : undefined,
      habitIntervalDays: type === "HABIT" && habitScheduleType === "INTERVAL_DAYS" ? Number(data.get("habitIntervalDays")) : undefined,
      habitWeekdays:
        type === "HABIT" && habitScheduleType === "WEEKLY" ? data.getAll("habitWeekdays").map((value) => Number(value)) : undefined,
    });
    setSubmitting(false);
    result.ok ? toast.success(result.message) : toast.error(result.message);
  };

  return (
    <div
      className="fixed inset-0 z-1000 flex items-center justify-center bg-zinc-950/40 p-4 backdrop-blur-[2px]"
      role="presentation"
      onMouseDown={(event) => event.currentTarget === event.target && setOpen(false)}
    >
      <form
        className="max-h-[calc(100vh-2rem)] w-full max-w-xl overflow-auto rounded-lg border border-zinc-200 bg-white shadow-2xl dark:border-zinc-700 dark:bg-zinc-900"
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-action-title"
        onSubmit={handleSubmit}
      >
        <header className="flex items-center justify-between border-b border-zinc-200 px-5 py-4 dark:border-zinc-800">
          <h2 id="create-action-title" className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
            新建 Action
          </h2>
          <button
            className="rounded-md p-1.5 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
            type="button"
            aria-label="关闭"
            onClick={() => setOpen(false)}
          >
            <XIcon className="h-4 w-4" />
          </button>
        </header>

        <div className="space-y-5 px-5 py-5">
          <fieldset>
            <legend className="mb-2 text-xs font-medium text-zinc-600 dark:text-zinc-400">类型</legend>
            <div className="grid grid-cols-2 gap-2 rounded-md bg-zinc-100 p-1 sm:grid-cols-4 dark:bg-zinc-800">
              {typeOptions.map((option) => {
                const Icon = option.icon;
                return (
                  <label
                    className={cn(
                      "flex min-w-0 cursor-pointer items-center justify-center gap-2 rounded px-3 py-2 text-sm transition-colors",
                      type === option.value
                        ? "bg-white font-medium text-zinc-900 shadow-sm dark:bg-zinc-700 dark:text-zinc-100"
                        : "text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200",
                    )}
                    key={option.value}
                  >
                    <input
                      className="sr-only"
                      type="radio"
                      name="type"
                      value={option.value}
                      checked={type === option.value}
                      onChange={() => setType(option.value)}
                    />
                    <Icon className="h-4 w-4 shrink-0" />
                    <span className="truncate">{option.label}</span>
                  </label>
                );
              })}
            </div>
          </fieldset>

          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-zinc-600 dark:text-zinc-400">标题</span>
            <input className={inputClass} name="title" placeholder="准备做什么？" maxLength={80} autoFocus required />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-zinc-600 dark:text-zinc-400">描述</span>
            <textarea className={cn(inputClass, "min-h-24 resize-y")} name="description" placeholder="补充上下文（可选）" />
          </label>

          {type !== "HABIT" && (
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-zinc-600 dark:text-zinc-400">计划日期</span>
                <input className={inputClass} name="planDate" type="date" defaultValue={dayjs().format("YYYY-MM-DD")} />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-zinc-600 dark:text-zinc-400">截止时间</span>
                <input className={inputClass} name="deadline" type="datetime-local" />
              </label>
            </div>
          )}

          {type === "GOAL" && (
            <div className="grid gap-4 border-t border-zinc-200 pt-5 sm:grid-cols-2 dark:border-zinc-800">
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-zinc-600 dark:text-zinc-400">目标值</span>
                <input className={inputClass} name="goalTarget" type="number" min="0.01" step="0.01" defaultValue="100" required />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-zinc-600 dark:text-zinc-400">单位</span>
                <input className={inputClass} name="goalUnit" defaultValue="次" maxLength={12} required />
              </label>
            </div>
          )}

          {type === "HABIT" && (
            <div className="space-y-4 border-t border-zinc-200 pt-5 dark:border-zinc-800">
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-1.5 block text-xs font-medium text-zinc-600 dark:text-zinc-400">开始日期</span>
                  <input className={inputClass} name="habitStartDate" type="date" defaultValue={dayjs().format("YYYY-MM-DD")} required />
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-xs font-medium text-zinc-600 dark:text-zinc-400">重复周期</span>
                  <select
                    className={inputClass}
                    value={habitScheduleType}
                    onChange={(event) => setHabitScheduleType(event.target.value as HabitScheduleType)}
                  >
                    <option value="DAILY">每天</option>
                    <option value="INTERVAL_DAYS">每隔几天</option>
                    <option value="WEEKLY">每周指定日期</option>
                  </select>
                </label>
              </div>

              {habitScheduleType === "INTERVAL_DAYS" && (
                <label className="block max-w-48">
                  <span className="mb-1.5 block text-xs font-medium text-zinc-600 dark:text-zinc-400">间隔天数</span>
                  <input className={inputClass} name="habitIntervalDays" type="number" min="2" max="365" defaultValue="2" required />
                </label>
              )}

              {habitScheduleType === "WEEKLY" && (
                <fieldset>
                  <legend className="mb-2 text-xs font-medium text-zinc-600 dark:text-zinc-400">每周打卡日</legend>
                  <div className="flex flex-wrap gap-2">
                    {weekdays.map((weekday) => (
                      <label
                        className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-md border border-zinc-200 text-sm text-zinc-600 has-checked:border-primary has-checked:bg-primary has-checked:text-white dark:border-zinc-700 dark:text-zinc-300"
                        key={weekday.value}
                      >
                        <input
                          className="sr-only"
                          type="checkbox"
                          name="habitWeekdays"
                          value={weekday.value}
                          defaultChecked={weekday.value <= 5}
                        />
                        {weekday.label}
                      </label>
                    ))}
                  </div>
                </fieldset>
              )}
            </div>
          )}
        </div>

        <footer className="flex justify-end gap-2 border-t border-zinc-200 px-5 py-4 dark:border-zinc-800">
          <button
            className="rounded-md border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
            type="button"
            onClick={() => setOpen(false)}
          >
            取消
          </button>
          <button
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-60"
            type="submit"
            disabled={submitting}
          >
            {submitting ? "创建中..." : "创建"}
          </button>
        </footer>
      </form>
    </div>
  );
};

export default ActionCreateDialog;
