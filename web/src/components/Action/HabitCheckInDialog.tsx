import dayjs from "dayjs";
import { CheckIcon, CircleIcon, CoffeeIcon, XIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "react-hot-toast";
import { flattenActions, useActionStore } from "@/store/v1";
import { ActionHabitRecord, HabitRecordStatus } from "@/types/action";
import { cn } from "@/utils";
import { isHabitDue } from "@/utils/habit";

interface Props {
  open: boolean;
  onClose: () => void;
}

const statusOptions: { value: HabitRecordStatus; label: string; icon: typeof CircleIcon }[] = [
  { value: "UNCHECKED", label: "未打卡", icon: CircleIcon },
  { value: "CHECKED_IN", label: "已打卡", icon: CheckIcon },
  { value: "LEAVE", label: "请假", icon: CoffeeIcon },
];

const HabitCheckInDialog = ({ open, onClose }: Props) => {
  const actions = useActionStore((state) => state.actions);
  const todayHabitRecords = useActionStore((state) => state.todayHabitRecords);
  const refreshTodayHabitRecords = useActionStore((state) => state.refreshTodayHabitRecords);
  const batchUpdateHabitRecords = useActionStore((state) => state.batchUpdateHabitRecords);
  const [drafts, setDrafts] = useState<Record<string, Pick<ActionHabitRecord, "status" | "note">>>({});
  const [submitting, setSubmitting] = useState(false);
  const today = dayjs().format("YYYY-MM-DD");
  const dueHabits = useMemo(
    () => flattenActions(actions).filter((action) => isHabitDue(action, today) && ["TODO", "IN_PROGRESS"].includes(action.status)),
    [actions, today],
  );

  useEffect(() => {
    if (open) void refreshTodayHabitRecords();
  }, [open, refreshTodayHabitRecords]);

  useEffect(() => {
    if (!open) return;
    const recordsByAction = new Map(todayHabitRecords.map((record) => [record.actionUid, record]));
    setDrafts(
      Object.fromEntries(
        dueHabits.map((habit) => {
          const record = recordsByAction.get(habit.uid);
          return [habit.uid, { status: record?.status || "UNCHECKED", note: record?.note || "" }];
        }),
      ),
    );
  }, [dueHabits, open, todayHabitRecords]);

  const values = dueHabits.map((habit) => drafts[habit.uid] || { status: "UNCHECKED" as const, note: "" });
  const checkedCount = values.filter((item) => item.status === "CHECKED_IN").length;
  const leaveCount = values.filter((item) => item.status === "LEAVE").length;
  const pendingCount = values.filter((item) => item.status === "UNCHECKED").length;
  const effectiveTotal = dueHabits.length - leaveCount;

  if (!open) return null;

  const updateDraft = (uid: string, update: Partial<Pick<ActionHabitRecord, "status" | "note">>) => {
    setDrafts((current) => {
      const existing = current[uid] || { status: "UNCHECKED" as const, note: "" };
      return { ...current, [uid]: { ...existing, ...update } };
    });
  };

  const handleSubmit = async () => {
    if (dueHabits.length === 0) return;
    setSubmitting(true);
    const result = await batchUpdateHabitRecords(
      dueHabits.map((habit) => ({
        actionUid: habit.uid,
        occurrenceDate: today,
        status: drafts[habit.uid]?.status || "UNCHECKED",
        note: drafts[habit.uid]?.note || "",
      })),
    );
    setSubmitting(false);
    if (result.ok) {
      toast.success(result.message);
      onClose();
    } else {
      toast.error(result.message);
    }
  };

  return (
    <div
      className="fixed inset-0 z-1000 flex items-end justify-center bg-zinc-950/45 p-0 backdrop-blur-[2px] sm:items-center sm:p-4"
      role="presentation"
      onMouseDown={(event) => event.currentTarget === event.target && onClose()}
    >
      <section
        className="flex max-h-[min(90vh,760px)] w-full max-w-2xl flex-col overflow-hidden rounded-t-lg border border-zinc-200 bg-white shadow-2xl sm:rounded-lg dark:border-zinc-700 dark:bg-zinc-900"
        role="dialog"
        aria-modal="true"
        aria-labelledby="habit-check-in-title"
      >
        <header className="flex shrink-0 items-center justify-between border-b border-zinc-200 px-4 py-4 sm:px-5 dark:border-zinc-800">
          <div className="min-w-0">
            <h2 id="habit-check-in-title" className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
              今日打卡
            </h2>
            <p className="mt-0.5 text-xs text-zinc-500">
              已打卡 {checkedCount}/{effectiveTotal} · 请假 {leaveCount} · 未处理 {pendingCount}
            </p>
          </div>
          <button
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
            type="button"
            aria-label="关闭今日打卡"
            onClick={onClose}
          >
            <XIcon className="h-4 w-4" />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5">
          {dueHabits.length === 0 ? (
            <div className="flex min-h-48 flex-col items-center justify-center text-center">
              <CheckIcon className="mb-3 h-7 w-7 text-green-500" />
              <h3 className="text-sm font-medium text-zinc-800 dark:text-zinc-200">今天没有需要打卡的习惯</h3>
              <p className="mt-1 text-xs text-zinc-500">可以休息一下，或到习惯页面查看周期安排。</p>
            </div>
          ) : (
            <div className="space-y-3">
              {dueHabits.map((habit) => {
                const draft = drafts[habit.uid] || { status: "UNCHECKED" as const, note: "" };
                return (
                  <article className="rounded-md border border-zinc-200 p-3 sm:p-4 dark:border-zinc-700" key={habit.uid}>
                    <h3 className="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-100">{habit.title}</h3>
                    <div className="mt-3 grid grid-cols-3 gap-1 rounded-md bg-zinc-100 p-1 dark:bg-zinc-800">
                      {statusOptions.map((option) => {
                        const Icon = option.icon;
                        const selected = draft.status === option.value;
                        return (
                          <button
                            className={cn(
                              "flex h-9 min-w-0 items-center justify-center gap-1.5 rounded px-2 text-xs font-medium transition-colors",
                              selected
                                ? option.value === "CHECKED_IN"
                                  ? "bg-white text-green-700 shadow-sm dark:bg-zinc-700 dark:text-green-400"
                                  : option.value === "LEAVE"
                                    ? "bg-white text-amber-700 shadow-sm dark:bg-zinc-700 dark:text-amber-400"
                                    : "bg-white text-zinc-700 shadow-sm dark:bg-zinc-700 dark:text-zinc-200"
                                : "text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200",
                            )}
                            type="button"
                            aria-pressed={selected}
                            onClick={() => updateDraft(habit.uid, { status: option.value })}
                            key={option.value}
                          >
                            <Icon className="h-3.5 w-3.5 shrink-0" />
                            <span className="truncate">{option.label}</span>
                          </button>
                        );
                      })}
                    </div>
                    <label className="mt-3 block">
                      <span className="sr-only">{habit.title}的备注</span>
                      <span className="relative block">
                        <input
                          className="h-10 w-full rounded-md border border-zinc-200 bg-white px-3 pr-10 text-sm text-zinc-800 outline-none placeholder:text-zinc-400 focus:border-primary focus:ring-2 focus:ring-primary/15 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                          value={draft.note}
                          maxLength={500}
                          placeholder="记录今天的变化或请假原因（可选）"
                          onChange={(event) => updateDraft(habit.uid, { note: event.target.value })}
                        />
                        {draft.note && (
                          <button
                            className="absolute right-1 top-1 flex h-8 w-8 items-center justify-center rounded text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
                            type="button"
                            aria-label={`清除${habit.title}的备注`}
                            onClick={() => updateDraft(habit.uid, { note: "" })}
                          >
                            <XIcon className="h-4 w-4" />
                          </button>
                        )}
                      </span>
                    </label>
                  </article>
                );
              })}
            </div>
          )}
        </div>

        <footer className="flex shrink-0 items-center justify-between gap-3 border-t border-zinc-200 px-4 py-4 sm:px-5 dark:border-zinc-800">
          <button
            className="rounded-md border border-zinc-200 px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
            type="button"
            disabled={pendingCount === 0}
            onClick={() =>
              setDrafts((current) =>
                Object.fromEntries(
                  dueHabits.map((habit) => {
                    const draft = current[habit.uid] || { status: "UNCHECKED" as const, note: "" };
                    return [habit.uid, { ...draft, status: draft.status === "UNCHECKED" ? "CHECKED_IN" : draft.status }];
                  }),
                ),
              )
            }
          >
            全部打卡
          </button>
          <div className="flex gap-2">
            <button
              className="rounded-md px-3 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
              type="button"
              onClick={onClose}
            >
              取消
            </button>
            <button
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-50"
              type="button"
              disabled={submitting || dueHabits.length === 0}
              onClick={() => void handleSubmit()}
            >
              {submitting ? "保存中..." : "保存"}
            </button>
          </div>
        </footer>
      </section>
    </div>
  );
};

export default HabitCheckInDialog;
