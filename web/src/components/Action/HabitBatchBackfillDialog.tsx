import { Tooltip } from "@mui/joy";
import dayjs, { Dayjs } from "dayjs";
import { CheckIcon, ChevronLeftIcon, ChevronRightIcon, CoffeeIcon, XIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "react-hot-toast";
import { actionApi } from "@/api/action";
import { ActionHabitRecord, ActionItem, HabitRecordStatus } from "@/types/action";
import { cn } from "@/utils";
import { isHabitDue } from "@/utils/habit";

interface Props {
  action: ActionItem;
  records: ActionHabitRecord[];
  open: boolean;
  onClose: () => void;
  onSaved: () => Promise<void>;
}

const inputClass =
  "h-9 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm text-zinc-800 outline-none transition-colors placeholder:text-zinc-400 focus:border-primary focus:ring-2 focus:ring-primary/15 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder:text-zinc-600";

const HabitBatchBackfillDialog = ({ action, records, open, onClose, onSaved }: Props) => {
  const [month, setMonth] = useState<Dayjs>(dayjs().startOf("month"));
  const [selectedDates, setSelectedDates] = useState<Set<string>>(new Set());
  const [status, setStatus] = useState<HabitRecordStatus>("CHECKED_IN");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setMonth(dayjs().startOf("month"));
    setSelectedDates(new Set());
    setStatus("CHECKED_IN");
    setNote("");
  }, [action.uid, open]);

  const recordByDate = useMemo(() => new Map(records.map((record) => [record.occurrenceDate, record])), [records]);
  const today = dayjs().format("YYYY-MM-DD");
  const startMonth = dayjs(action.habit?.startDate).startOf("month");
  const currentMonth = dayjs().startOf("month");
  const monthDays = useMemo(() => {
    const leadingDays = (month.startOf("month").day() + 6) % 7;
    const days: Array<string | undefined> = Array.from({ length: leadingDays }, () => undefined);
    for (let date = month.startOf("month"); !date.isAfter(month.endOf("month"), "day"); date = date.add(1, "day")) {
      days.push(date.format("YYYY-MM-DD"));
    }
    return days;
  }, [month]);
  const eligibleDates = monthDays.filter((date): date is string =>
    Boolean(date && date < today && isHabitDue(action, date) && !recordByDate.has(date)),
  );
  const allSelected = eligibleDates.length > 0 && eligibleDates.every((date) => selectedDates.has(date));

  if (!open) return null;

  const toggleDate = (date: string) => {
    setSelectedDates((current) => {
      const next = new Set(current);
      next.has(date) ? next.delete(date) : next.add(date);
      return next;
    });
  };

  const handleSubmit = async () => {
    const dates = Array.from(selectedDates).sort();
    if (dates.length === 0) {
      toast.error("请至少选择一个补签日期");
      return;
    }
    setSubmitting(true);
    try {
      await actionApi.batchUpdateHabitRecords(
        dates.map((date) => ({ actionUid: action.uid, occurrenceDate: date, status, note: note.trim() })),
      );
      await onSaved();
      toast.success(`已补签 ${dates.length} 天`);
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "批量补签失败");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-zinc-950/45 p-4" role="presentation" onMouseDown={onClose}>
      <div
        className="w-full max-w-lg rounded-lg border border-zinc-200 bg-white shadow-2xl dark:border-zinc-700 dark:bg-zinc-900"
        role="dialog"
        aria-modal="true"
        aria-labelledby="habit-batch-backfill-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-zinc-200 px-5 py-4 dark:border-zinc-800">
          <div>
            <h2 id="habit-batch-backfill-title" className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
              批量补签
            </h2>
            <p className="mt-0.5 text-xs text-zinc-500">仅可选择计划内且尚未记录的日期</p>
          </div>
          <button
            className="rounded-md p-2 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
            type="button"
            aria-label="关闭批量补签"
            onClick={onClose}
          >
            <XIcon className="h-4 w-4" />
          </button>
        </header>

        <div className="space-y-4 px-5 py-4">
          <div className="flex items-center justify-between">
            <button
              className="flex h-8 w-8 items-center justify-center rounded text-zinc-500 hover:bg-zinc-100 disabled:opacity-30 dark:hover:bg-zinc-800"
              type="button"
              aria-label="上个月"
              disabled={month.subtract(1, "month").isBefore(startMonth, "month")}
              onClick={() => {
                setMonth((current) => current.subtract(1, "month"));
                setSelectedDates(new Set());
              }}
            >
              <ChevronLeftIcon className="h-4 w-4" />
            </button>
            <span className="text-sm font-semibold tabular-nums text-zinc-800 dark:text-zinc-200">{month.format("YYYY年 M月")}</span>
            <button
              className="flex h-8 w-8 items-center justify-center rounded text-zinc-500 hover:bg-zinc-100 disabled:opacity-30 dark:hover:bg-zinc-800"
              type="button"
              aria-label="下个月"
              disabled={month.isSame(currentMonth, "month")}
              onClick={() => {
                setMonth((current) => current.add(1, "month"));
                setSelectedDates(new Set());
              }}
            >
              <ChevronRightIcon className="h-4 w-4" />
            </button>
          </div>

          <div>
            <div className="mb-1 grid grid-cols-7 text-center text-[11px] text-zinc-400">
              {["一", "二", "三", "四", "五", "六", "日"].map((weekday) => (
                <span className="py-1" key={weekday}>
                  {weekday}
                </span>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {monthDays.map((date, index) => {
                if (!date) return <span className="h-10" key={`empty-${index}`} />;
                const record = recordByDate.get(date);
                const due = isHabitDue(action, date);
                const eligible = date < today && due && !record;
                const selected = selectedDates.has(date);
                const Icon = record?.status === "CHECKED_IN" ? CheckIcon : record?.status === "LEAVE" ? CoffeeIcon : undefined;
                return (
                  <button
                    className={cn(
                      "relative flex h-10 items-center justify-center rounded-md border text-xs tabular-nums transition-colors",
                      selected && "border-primary bg-primary text-white",
                      !selected &&
                        eligible &&
                        "border-rose-200 text-rose-700 hover:border-primary hover:bg-primary/5 dark:border-rose-900 dark:text-rose-400",
                      !selected &&
                        record?.status === "CHECKED_IN" &&
                        "border-emerald-100 bg-emerald-50 text-emerald-700 dark:border-emerald-950 dark:bg-emerald-950/40 dark:text-emerald-400",
                      !selected &&
                        record?.status === "LEAVE" &&
                        "border-amber-100 bg-amber-50 text-amber-700 dark:border-amber-950 dark:bg-amber-950/40 dark:text-amber-400",
                      !selected && !eligible && !record && "cursor-default border-transparent text-zinc-300 dark:text-zinc-700",
                    )}
                    type="button"
                    disabled={!eligible}
                    aria-label={`${date}${selected ? "，已选择" : eligible ? "，可补签" : record ? "，已有记录" : "，不可补签"}`}
                    aria-pressed={eligible ? selected : undefined}
                    onClick={() => toggleDate(date)}
                    key={date}
                  >
                    {dayjs(date).date()}
                    {Icon && <Icon className="absolute bottom-0.5 right-0.5 h-3 w-3" />}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex items-center justify-between gap-3">
            <button
              className="text-xs font-medium text-primary hover:text-primary-dark disabled:cursor-not-allowed disabled:text-zinc-300 dark:disabled:text-zinc-700"
              type="button"
              disabled={eligibleDates.length === 0}
              onClick={() => setSelectedDates(allSelected ? new Set() : new Set(eligibleDates))}
            >
              {allSelected ? "取消全选" : `选择本月全部未打卡（${eligibleDates.length}）`}
            </button>
            <span className="text-xs text-zinc-400">已选 {selectedDates.size} 天</span>
          </div>

          <div className="grid grid-cols-2 gap-1 rounded-md bg-zinc-100 p-1 dark:bg-zinc-800">
            {[
              { value: "CHECKED_IN" as const, label: "打卡", icon: CheckIcon },
              { value: "LEAVE" as const, label: "请假", icon: CoffeeIcon },
            ].map((option) => {
              const Icon = option.icon;
              const selected = status === option.value;
              return (
                <button
                  className={cn(
                    "flex h-8 items-center justify-center gap-1.5 rounded text-xs font-medium",
                    selected ? "bg-white text-zinc-800 shadow-sm dark:bg-zinc-700 dark:text-zinc-100" : "text-zinc-500",
                  )}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => setStatus(option.value)}
                  key={option.value}
                >
                  <Icon className="h-3.5 w-3.5" />
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
              placeholder="统一备注（可选）"
              aria-label="批量补签备注"
              onChange={(event) => setNote(event.target.value)}
            />
            {note && (
              <Tooltip title="清空" placement="top">
                <button
                  className="absolute right-1 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
                  type="button"
                  aria-label="清空批量补签备注"
                  onClick={() => setNote("")}
                >
                  <XIcon className="h-3.5 w-3.5" />
                </button>
              </Tooltip>
            )}
          </div>
        </div>

        <footer className="flex justify-end gap-2 border-t border-zinc-200 px-5 py-4 dark:border-zinc-800">
          <button
            className="rounded-md border border-zinc-200 px-4 py-2 text-sm text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
            type="button"
            onClick={onClose}
          >
            取消
          </button>
          <button
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-50"
            type="button"
            disabled={selectedDates.size === 0 || submitting}
            onClick={handleSubmit}
          >
            {submitting ? "提交中" : `补签 ${selectedDates.size} 天`}
          </button>
        </footer>
      </div>
    </div>
  );
};

export default HabitBatchBackfillDialog;
