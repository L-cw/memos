import { Tooltip } from "@mui/joy";
import dayjs from "dayjs";
import { CalendarClockIcon, CheckIcon, CoffeeIcon, XIcon } from "lucide-react";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { toast } from "react-hot-toast";
import { actionApi } from "@/api/action";
import { useActionStore } from "@/store/v1";
import { ActionHabitRecord, ActionItem, HabitRecordStatus } from "@/types/action";
import { cn } from "@/utils";
import { countHabitOccurrences, habitScheduleLabel, isHabitDue } from "@/utils/habit";

const inputClass =
  "h-9 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm text-zinc-800 outline-none transition-colors placeholder:text-zinc-400 focus:border-primary focus:ring-2 focus:ring-primary/15 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder:text-zinc-600";

interface Props {
  action: ActionItem;
}

const HabitHistory = ({ action }: Props) => {
  const [records, setRecords] = useState<ActionHabitRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [recordDate, setRecordDate] = useState(dayjs().format("YYYY-MM-DD"));
  const [recordStatus, setRecordStatus] = useState<HabitRecordStatus>("CHECKED_IN");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const refreshActions = useActionStore((state) => state.refreshActions);
  const refreshTodayHabitRecords = useActionStore((state) => state.refreshTodayHabitRecords);

  const loadRecords = useCallback(async () => {
    setLoading(true);
    try {
      setRecords(await actionApi.listHabitRecords(undefined, action.uid));
    } catch {
      setRecords([]);
    } finally {
      setLoading(false);
    }
  }, [action.uid]);

  useEffect(() => {
    setRecordDate(dayjs().format("YYYY-MM-DD"));
    setRecordStatus("CHECKED_IN");
    setNote("");
    void loadRecords();
  }, [action.uid, loadRecords]);

  const today = dayjs().format("YYYY-MM-DD");
  const elapsedRecords = records.filter((record) => record.occurrenceDate <= today);
  const checkedCount = elapsedRecords.filter((record) => record.status === "CHECKED_IN").length;
  const leaveCount = elapsedRecords.filter((record) => record.status === "LEAVE").length;
  const uncheckedCount = Math.max(0, countHabitOccurrences(action, today) - checkedCount - leaveCount);

  const handleAddRecord = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!isHabitDue(action, recordDate)) {
      toast.error("所选日期不在这个习惯的打卡周期内");
      return;
    }

    setSubmitting(true);
    try {
      await actionApi.batchUpdateHabitRecords([
        {
          actionUid: action.uid,
          occurrenceDate: recordDate,
          status: recordStatus,
          note: note.trim(),
        },
      ]);
      await Promise.all([loadRecords(), refreshActions(), recordDate === today ? refreshTodayHabitRecords() : Promise.resolve()]);
      setNote("");
      toast.success("打卡记录已保存");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "保存打卡记录失败");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="border-t border-zinc-200 px-4 py-4 sm:px-6 dark:border-zinc-800">
      <div className="mb-4 grid grid-cols-4 divide-x divide-zinc-200 rounded-md bg-zinc-50 py-2 text-center dark:divide-zinc-700 dark:bg-zinc-800/60">
        {[
          { label: "周期", value: habitScheduleLabel(action), className: "text-zinc-700 dark:text-zinc-300" },
          { label: "已打卡", value: checkedCount, className: "text-green-600 dark:text-green-400" },
          { label: "请假", value: leaveCount, className: "text-amber-600 dark:text-amber-400" },
          { label: "未打卡", value: uncheckedCount, className: "text-zinc-600 dark:text-zinc-300" },
        ].map((item) => (
          <div className="min-w-0 px-1" key={item.label}>
            <div className="text-[11px] leading-4 text-zinc-500">{item.label}</div>
            <div className={cn("truncate text-xs font-semibold leading-5 tabular-nums", item.className)} title={String(item.value)}>
              {item.value}
            </div>
          </div>
        ))}
      </div>

      {action.status !== "TERMINATED" && (
        <form className="mb-5 grid gap-2 sm:grid-cols-[132px_150px_minmax(0,1fr)_auto]" onSubmit={handleAddRecord}>
          <input
            className={inputClass}
            type="date"
            value={recordDate}
            min={action.habit?.startDate}
            max={today}
            aria-label="打卡日期"
            required
            onChange={(event) => setRecordDate(event.target.value)}
          />
          <div className="grid h-9 grid-cols-2 gap-1 rounded-md bg-zinc-100 p-1 dark:bg-zinc-800">
            {[
              { value: "CHECKED_IN" as const, label: "打卡", icon: CheckIcon },
              { value: "LEAVE" as const, label: "请假", icon: CoffeeIcon },
            ].map((option) => {
              const Icon = option.icon;
              const selected = recordStatus === option.value;
              return (
                <button
                  className={cn(
                    "flex min-w-0 items-center justify-center gap-1 rounded text-xs font-medium transition-colors",
                    selected
                      ? option.value === "CHECKED_IN"
                        ? "bg-white text-green-700 shadow-sm dark:bg-zinc-700 dark:text-green-400"
                        : "bg-white text-amber-700 shadow-sm dark:bg-zinc-700 dark:text-amber-400"
                      : "text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200",
                  )}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => setRecordStatus(option.value)}
                  key={option.value}
                >
                  <Icon className="h-3.5 w-3.5 shrink-0" />
                  {option.label}
                </button>
              );
            })}
          </div>
          <div className="relative">
            <input
              className={cn(inputClass, "pr-9")}
              value={note}
              maxLength={500}
              placeholder="备注（可选）"
              aria-label="打卡备注"
              onChange={(event) => setNote(event.target.value)}
            />
            {note && (
              <Tooltip title="清空" placement="top">
                <button
                  className="absolute right-1 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
                  type="button"
                  aria-label="清空打卡备注"
                  onClick={() => setNote("")}
                >
                  <XIcon className="h-3.5 w-3.5" />
                </button>
              </Tooltip>
            )}
          </div>
          <button
            className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md bg-primary px-3 text-sm font-medium text-white hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-50"
            type="submit"
            disabled={submitting}
          >
            {submitting ? "提交中" : "提交"}
          </button>
        </form>
      )}

      <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-zinc-800 dark:text-zinc-200">
        <CalendarClockIcon className="h-4 w-4 text-rose-600 dark:text-rose-400" />
        打卡记录
      </h3>
      {loading ? (
        <p className="py-2 text-sm text-zinc-400">正在加载记录...</p>
      ) : records.length === 0 ? (
        <p className="py-2 text-sm text-zinc-400">还没有打卡记录</p>
      ) : (
        <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
          {records.map((record) => {
            const checked = record.status === "CHECKED_IN";
            const Icon = checked ? CheckIcon : CoffeeIcon;
            return (
              <div
                className="grid min-h-9 grid-cols-[24px_80px_minmax(0,1fr)] items-center gap-2 py-1.5"
                key={`${record.actionUid}-${record.occurrenceDate}`}
              >
                <Tooltip title={checked ? "已打卡" : "请假"} placement="top">
                  <span
                    aria-label={checked ? "已打卡" : "请假"}
                    className={`flex h-6 w-6 items-center justify-center rounded-full ${
                      checked
                        ? "bg-green-50 text-green-600 dark:bg-green-950/50 dark:text-green-400"
                        : "bg-amber-50 text-amber-600 dark:bg-amber-950/50 dark:text-amber-400"
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5" />
                  </span>
                </Tooltip>
                <time className="text-xs tabular-nums text-zinc-400">{record.occurrenceDate}</time>
                <span className="min-w-0 truncate text-sm text-zinc-500" title={record.note || undefined}>
                  {record.note || "-"}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
};

export default HabitHistory;
