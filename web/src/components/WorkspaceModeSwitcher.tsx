import { Tooltip } from "@mui/joy";
import { ListChecksIcon, NotebookTabsIcon } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { Routes } from "@/router";
import { cn } from "@/utils";
import { useTranslate } from "@/utils/i18n";

interface Props {
  collapsed?: boolean;
}

const WorkspaceModeSwitcher = ({ collapsed = false }: Props) => {
  const location = useLocation();
  const navigate = useNavigate();
  const t = useTranslate();
  const isActionMode = location.pathname.startsWith(Routes.ACTIONS);

  const modes = [
    {
      id: "memos",
      active: !isActionMode,
      label: t("action.workspace.memos"),
      icon: NotebookTabsIcon,
      path: Routes.ROOT,
    },
    {
      id: "action",
      active: isActionMode,
      label: t("action.workspace.action"),
      icon: ListChecksIcon,
      path: `${Routes.ACTIONS}/today`,
    },
  ];

  return (
    <div
      className={cn(
        "flex shrink-0 rounded-md bg-zinc-200/70 p-0.5 dark:bg-zinc-700/70",
        collapsed ? "mt-2 h-[62px] w-8 flex-col" : "h-8 w-[62px] flex-row",
      )}
      role="group"
      aria-label={t("action.workspace.switch")}
    >
      {modes.map((mode) => {
        const Icon = mode.icon;
        return (
          <Tooltip title={mode.label} placement={collapsed ? "right" : "bottom"} arrow key={mode.id}>
            <button
              className={cn(
                "flex h-7 w-7 shrink-0 items-center justify-center rounded text-zinc-500 transition-colors hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100",
                mode.active && "bg-white text-primary shadow-sm dark:bg-zinc-800 dark:text-primary-light",
              )}
              type="button"
              aria-label={mode.label}
              aria-pressed={mode.active}
              onClick={() => navigate(mode.path)}
            >
              <Icon className="h-4 w-4" />
            </button>
          </Tooltip>
        );
      })}
    </div>
  );
};

export default WorkspaceModeSwitcher;
