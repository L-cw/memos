import dayjs from "dayjs";
import useCurrentUser from "@/hooks/useCurrentUser";
import { useWorkspaceSettingStore } from "@/store/v1";
import { WorkspaceGeneralSetting } from "@/types/proto/api/v1/workspace_setting_service";
import { WorkspaceSettingKey } from "@/types/proto/store/workspace_setting";
import { cn } from "@/utils";
import UserAvatar from "./UserAvatar";
import WorkspaceModeSwitcher from "./WorkspaceModeSwitcher";

interface Props {
  collapsed?: boolean;
}

const weekdayLabels = ["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"];

const UserBanner = (props: Props) => {
  const { collapsed } = props;
  const user = useCurrentUser();
  const workspaceSettingStore = useWorkspaceSettingStore();
  const workspaceGeneralSetting =
    workspaceSettingStore.getWorkspaceSettingByKey(WorkspaceSettingKey.GENERAL).generalSetting || WorkspaceGeneralSetting.fromPartial({});
  const title = (user ? user.nickname || user.username : workspaceGeneralSetting.customProfile?.title) || "Memos";
  const avatarUrl = (user ? user.avatarUrl : workspaceGeneralSetting.customProfile?.logoUrl) || "/full-logo.webp";

  return (
    <div className={cn("relative w-full h-auto px-1 shrink-0", collapsed && "flex flex-col items-center")}>
      <div className={cn("flex min-w-0 items-center", collapsed ? "flex-col" : "w-full gap-1")}>
        <div
          className={cn("my-1 flex min-w-0 items-center py-1 text-gray-800 dark:text-gray-400", collapsed ? "px-1" : "flex-1 pl-3 pr-1")}
        >
          <UserAvatar className="shrink-0" avatarUrl={avatarUrl} />
          {!collapsed && <span className="ml-2 min-w-0 truncate text-base font-medium text-slate-800 dark:text-gray-300">{title}</span>}
        </div>
        {collapsed && <WorkspaceModeSwitcher collapsed />}
      </div>
      {!collapsed && (
        <div className="flex items-center justify-between gap-2 px-3 pb-1">
          <p className="min-w-0 truncate text-xs tabular-nums text-zinc-500 dark:text-zinc-500">
            {dayjs().format("M月D日")} · {weekdayLabels[dayjs().day()]}
          </p>
          <WorkspaceModeSwitcher />
        </div>
      )}
    </div>
  );
};

export default UserBanner;
