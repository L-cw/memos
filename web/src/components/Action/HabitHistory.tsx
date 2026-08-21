import { Tooltip } from "@mui/joy";
import dayjs from "dayjs";
import { CalendarClockIcon, CalendarPlusIcon, CheckIcon, CoffeeIcon, XIcon } from "lucide-react";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { toast } from "react-hot-toast";
import { actionApi } from "@/api/action";
import { useActionStore } from "@/store/v1";
import { ActionHabitRecord, ActionItem, HabitRecordStatus } from "@/types/action";
import { cn } from "@/utils";
import { isHabitDue } from "@/utils/habit";
import ExpandableRecordText from "./ExpandableRecordText";
import HabitBatchBackfillDialog from "./HabitBatchBackfillDialog";
import HabitYearHeatmap from "./HabitYearHeatmap";

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
  const [batchBackfillOpen, setBatchBackfillOpen] = useState(false);
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
    setBatchBackfillOpen(false);
    void loadRecords();
  }, [action.uid, loadRecords]);

  const today = dayjs().format("YYYY-MM-DD");
  const refreshHabitData = async (date = recordDate) => {
    await Promise.all([loadRecords(), refreshActions(), date === today ? refreshTodayHabitRecords() : Promise.resolve()]);
  };

  const selectRecordDate = (date: string) => {
    const existing = records.find((record) => record.occurrenceDate === date);
    setRecordDate(date);
    setRecordStatus(existing?.status || "CHECKED_IN");
    setNote(existing?.note || "");
  };

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
      await refreshHabitData();
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
      <div className="mb-5 rounded-lg border border-zinc-200 p-3 dark:border-zinc-700">
        <HabitYearHeatmap action={action} records={records} selectedDate={recordDate} onSelectDate={selectRecordDate} />
      </div>

      {["TODO", "IN_PROGRESS"].includes(action.status) && (
        <div className="mb-5 overflow-x-auto pb-1">
          <form className="grid min-w-[520px] grid-cols-[132px_150px_minmax(0,1fr)_36px_auto] gap-2" onSubmit={handleAddRecord}>
            <input
              className={inputClass}
              type="date"
              value={recordDate}
              min={action.habit?.startDate}
              max={today}
              aria-label="打卡日期"
              required
              onChange={(event) => selectRecordDate(event.target.value)}
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
            <Tooltip title="批量补签" placement="top">
              <button
                className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-zinc-200 text-zinc-500 hover:border-primary hover:text-primary dark:border-zinc-700 dark:text-zinc-300"
                type="button"
                aria-label="批量补签"
                onClick={() => setBatchBackfillOpen(true)}
              >
                <CalendarPlusIcon className="h-4 w-4" />
              </button>
            </Tooltip>
            <button
              className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md bg-primary px-3 text-sm font-medium text-white hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-50"
              type="submit"
              disabled={submitting}
            >
              {submitting ? "提交中" : "提交"}
            </button>
          </form>
        </div>
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
            const backfilled = Boolean(record.createdAt && record.createdAt.slice(0, 10) > record.occurrenceDate);
            const Icon = checked ? CheckIcon : CoffeeIcon;
            return (
              <div
                className="grid min-h-9 grid-cols-[24px_112px_minmax(0,1fr)] items-center gap-2 py-1.5"
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
                <div className="flex min-w-0 items-center gap-1.5">
                  <time className="text-xs tabular-nums text-zinc-400">{record.occurrenceDate}</time>
                  {backfilled && (
                    <span
                      className="inline-flex h-4 min-w-4 shrink-0 items-center justify-center rounded bg-zinc-100 px-1 text-[10px] font-medium leading-none text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"
                      title="补签记录"
                    >
                      补
                    </span>
                  )}
                </div>
                <ExpandableRecordText text={record.note || "-"} />
              </div>
            );
          })}
        </div>
      )}

      <HabitBatchBackfillDialog
        action={action}
        records={records}
        open={batchBackfillOpen}
        onClose={() => setBatchBackfillOpen(false)}
        onSaved={() => refreshHabitData(today)}
      />
    </section>
  );
};

export default HabitHistory;
