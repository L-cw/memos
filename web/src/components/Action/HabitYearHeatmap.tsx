import dayjs from "dayjs";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { ActionHabitRecord, ActionItem } from "@/types/action";
import { cn } from "@/utils";
import { isHabitDue } from "@/utils/habit";

interface Props {
  action: ActionItem;
  records: ActionHabitRecord[];
  selectedDate: string;
  onSelectDate: (date: string) => void;
}

const cellClass = {
  CHECKED_IN: "bg-emerald-500 hover:bg-emerald-600 dark:bg-emerald-500 dark:hover:bg-emerald-400",
  LEAVE: "bg-amber-400 hover:bg-amber-500 dark:bg-amber-500 dark:hover:bg-amber-400",
  UNCHECKED: "bg-rose-200 hover:bg-rose-300 dark:bg-rose-400/40 dark:hover:bg-rose-400/55",
  INACTIVE: "bg-zinc-100 dark:bg-zinc-800",
  FUTURE: "bg-zinc-100 dark:bg-zinc-800",
};

const HabitYearHeatmap = ({ action, records, selectedDate, onSelectDate }: Props) => {
  const currentYear = dayjs().year();
  const startYear = dayjs(action.habit?.startDate).year();
  const [year, setYear] = useState(currentYear);

  const heatmap = useMemo(() => {
    const start = dayjs(`${year}-01-01`);
    const end = start.endOf("year");
    const leadingDays = (start.day() + 6) % 7;
    const days: Array<{ date: string; dayOfMonth: number } | undefined> = Array.from({ length: leadingDays }, () => undefined);
    for (let date = start; !date.isAfter(end, "day"); date = date.add(1, "day")) {
      days.push({ date: date.format("YYYY-MM-DD"), dayOfMonth: date.date() });
    }
    const weekCount = Math.ceil(days.length / 7);
    const monthOffsets = Array.from({ length: 12 }, (_, month) => {
      const monthStart = start.month(month).startOf("month");
      return {
        label: `${month + 1}月`,
        left: Math.floor((leadingDays + monthStart.diff(start, "day")) / 7) * 11,
      };
    });
    return { days, monthOffsets, weekCount };
  }, [year]);

  const recordByDate = useMemo(() => new Map(records.map((record) => [record.occurrenceDate, record])), [records]);
  const today = dayjs().format("YYYY-MM-DD");
  const statistics = useMemo(
    () =>
      heatmap.days.reduce(
        (counts, day) => {
          if (!day || day.date > today) return counts;
          const record = recordByDate.get(day.date);
          if (record?.status === "CHECKED_IN") counts.CHECKED_IN += 1;
          else if (record?.status === "LEAVE") counts.LEAVE += 1;
          else if (isHabitDue(action, day.date)) counts.UNCHECKED += 1;
          return counts;
        },
        { CHECKED_IN: 0, LEAVE: 0, UNCHECKED: 0 },
      ),
    [action, heatmap.days, recordByDate, today],
  );

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-3">
        <div className="text-xs font-medium text-zinc-600 dark:text-zinc-300">年度记录</div>
        <div className="flex items-center gap-1">
          <button
            className="flex h-7 w-7 items-center justify-center rounded text-zinc-500 hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-30 dark:hover:bg-zinc-800"
            type="button"
            aria-label="上一年"
            disabled={year <= startYear}
            onClick={() => setYear((current) => current - 1)}
          >
            <ChevronLeftIcon className="h-4 w-4" />
          </button>
          <span className="min-w-12 text-center text-xs font-semibold tabular-nums text-zinc-700 dark:text-zinc-300">{year}</span>
          <button
            className="flex h-7 w-7 items-center justify-center rounded text-zinc-500 hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-30 dark:hover:bg-zinc-800"
            type="button"
            aria-label="下一年"
            disabled={year >= currentYear}
            onClick={() => setYear((current) => current + 1)}
          >
            <ChevronRightIcon className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="overflow-x-auto pb-1">
        <div className="min-w-max">
          <div className="ml-7 h-5" style={{ position: "relative", width: `${heatmap.weekCount * 11 - 2}px` }}>
            {heatmap.monthOffsets.map((month) => (
              <span className="absolute text-[10px] leading-4 text-zinc-400" style={{ left: month.left }} key={month.label}>
                {month.label}
              </span>
            ))}
          </div>
          <div className="flex gap-2">
            <div className="grid grid-rows-7 gap-0.5 text-[9px] leading-[9px] text-zinc-400">
              {["一", "", "三", "", "五", "", "日"].map((label, index) => (
                <span className="flex h-[9px] w-5 items-center justify-end" key={`${label}-${index}`}>
                  {label}
                </span>
              ))}
            </div>
            <div
              className="grid grid-flow-col grid-rows-7 gap-0.5"
              style={{ gridAutoColumns: "9px", gridTemplateColumns: `repeat(${heatmap.weekCount}, 9px)` }}
            >
              {heatmap.days.map((day, index) => {
                if (!day) return <span className="h-[9px] w-[9px]" key={`empty-${index}`} />;
                const record = recordByDate.get(day.date);
                const future = day.date > today;
                const due = isHabitDue(action, day.date);
                const state = record?.status || (future && due ? "FUTURE" : due ? "UNCHECKED" : "INACTIVE");
                const selectable = !future && (due || Boolean(record));
                const stateLabel =
                  record?.status === "CHECKED_IN"
                    ? "已打卡"
                    : record?.status === "LEAVE"
                      ? "请假"
                      : future
                        ? due
                          ? "未来计划"
                          : "非打卡日"
                        : due
                          ? "未打卡"
                          : "非打卡日";
                const title = `${day.date} · ${stateLabel}${record?.note ? ` · ${record.note}` : ""}`;
                const className = cn(
                  "h-[9px] w-[9px] rounded-[2px] outline-none transition-shadow",
                  cellClass[state],
                  selectedDate === day.date && selectable && "ring-2 ring-primary ring-offset-1 dark:ring-offset-zinc-900",
                );
                if (!selectable) {
                  return <span className={className} title={title} key={day.date} />;
                }
                return (
                  <button
                    className={cn(className, "focus-visible:ring-2 focus-visible:ring-primary")}
                    type="button"
                    title={title}
                    aria-label={title}
                    onClick={() => onSelectDate(day.date)}
                    key={day.date}
                  />
                );
              })}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-zinc-400">
        {[
          { label: "已打卡", count: statistics.CHECKED_IN, className: cellClass.CHECKED_IN },
          { label: "请假", count: statistics.LEAVE, className: cellClass.LEAVE },
          { label: "未打卡", count: statistics.UNCHECKED, className: cellClass.UNCHECKED },
          { label: "未来计划", className: cellClass.FUTURE },
          { label: "非打卡日", className: cellClass.INACTIVE },
        ].map((item) => (
          <span className="inline-flex items-center gap-1" key={item.label}>
            <span className={cn("h-2.5 w-2.5 rounded-[2px]", item.className)} />
            {item.label}
            {item.count !== undefined && <span className="font-medium tabular-nums text-zinc-600 dark:text-zinc-300">{item.count}</span>}
          </span>
        ))}
      </div>
    </div>
  );
};

export default HabitYearHeatmap;
