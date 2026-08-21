import dayjs from "dayjs";
import { ActionItem } from "@/types/action";

const weekdayLabels = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];

export const isHabitDue = (action: ActionItem, date: string): boolean => {
  if (action.type !== "HABIT" || !action.habit) return false;
  const target = dayjs(date).startOf("day");
  const start = dayjs(action.habit.startDate).startOf("day");
  if (!target.isValid() || !start.isValid() || target.isBefore(start, "day") || !isActionActiveOnDate(action, date)) return false;

  if (action.habit.scheduleType === "DAILY") return true;
  if (action.habit.scheduleType === "INTERVAL_DAYS") {
    const interval = action.habit.intervalDays || 0;
    return interval >= 2 && target.diff(start, "day") % interval === 0;
  }
  const isoWeekday = target.day() === 0 ? 7 : target.day();
  return action.habit.weekdays.includes(isoWeekday);
};

export const isActionActiveOnDate = (action: ActionItem, date: string): boolean => {
  let active = true;
  for (const history of action.statusHistory) {
    if (history.effectiveDate > date) break;
    if (["DONE", "TERMINATED"].includes(history.toStatus)) active = false;
    else if (["DONE", "TERMINATED"].includes(history.fromStatus)) active = true;
  }
  return active;
};

export const habitScheduleLabel = (action: ActionItem): string => {
  if (!action.habit) return "未设置周期";
  if (action.habit.scheduleType === "DAILY") return "每天";
  if (action.habit.scheduleType === "INTERVAL_DAYS") return `每 ${action.habit.intervalDays || 2} 天`;
  return action.habit.weekdays
    .map((weekday) => weekdayLabels[weekday - 1])
    .filter(Boolean)
    .join("、");
};

export const countHabitOccurrences = (action: ActionItem, throughDate: string): number => {
  if (action.type !== "HABIT" || !action.habit) return 0;
  const start = dayjs(action.habit.startDate).startOf("day");
  const end = dayjs(throughDate).startOf("day");
  if (!start.isValid() || !end.isValid() || end.isBefore(start, "day")) return 0;

  let count = 0;
  for (let date = start; !date.isAfter(end, "day"); date = date.add(1, "day")) {
    if (isHabitDue(action, date.format("YYYY-MM-DD"))) count += 1;
  }
  return count;
};
