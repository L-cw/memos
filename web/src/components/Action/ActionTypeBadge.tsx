import { Tooltip } from "@mui/joy";
import { CalendarClockIcon, CircleCheckIcon, FolderKanbanIcon, TargetIcon } from "lucide-react";
import { ActionType } from "@/types/action";
import { cn } from "@/utils";

export const actionTypeMeta = {
  TASK: {
    label: "Todo",
    icon: CircleCheckIcon,
    badgeClass: "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-300",
  },
  GOAL: {
    label: "Goal",
    icon: TargetIcon,
    badgeClass: "border-teal-200 bg-teal-50 text-teal-700 dark:border-teal-900 dark:bg-teal-950/40 dark:text-teal-300",
  },
  PROJECT: {
    label: "Project",
    icon: FolderKanbanIcon,
    badgeClass: "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300",
  },
  HABIT: {
    label: "习惯",
    icon: CalendarClockIcon,
    badgeClass: "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300",
  },
} satisfies Record<ActionType, { label: string; icon: typeof CircleCheckIcon; badgeClass: string }>;

interface Props {
  type: ActionType;
  compact?: boolean;
  iconOnly?: boolean;
  className?: string;
}

const ActionTypeBadge = ({ type, compact = false, iconOnly = false, className }: Props) => {
  const meta = actionTypeMeta[type];
  const Icon = meta.icon;
  const badge = (
    <span
      aria-label={iconOnly ? meta.label : undefined}
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded border font-medium",
        iconOnly ? "h-6 w-6 justify-center p-0" : compact ? "px-1.5 py-0.5 text-[11px]" : "px-2 py-1 text-xs",
        meta.badgeClass,
        className,
      )}
    >
      <Icon className={compact ? "h-3 w-3" : "h-3.5 w-3.5"} />
      {!iconOnly && meta.label}
    </span>
  );

  return iconOnly ? (
    <Tooltip title={meta.label} placement="top">
      {badge}
    </Tooltip>
  ) : (
    badge
  );
};

export default ActionTypeBadge;
