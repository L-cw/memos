import { Tooltip } from "@mui/joy";
import { useEffect } from "react";
import useNavigateTo from "@/hooks/useNavigateTo";
import { Routes } from "@/router";
import { findAction, useActionStore } from "@/store/v1";
import { actionTypeMeta } from "../../Action/ActionTypeBadge";

interface Props {
  resourceId: string;
  params: string;
}

const actionStatusLabel = {
  TODO: "待开始",
  IN_PROGRESS: "进行中",
  DONE: "已完成",
  TERMINATED: "已终止",
};

const ReferencedAction = ({ resourceId: uid, params: paramsStr }: Props) => {
  const navigateTo = useNavigateTo();
  const actions = useActionStore((state) => state.actions);
  const initialized = useActionStore((state) => state.initialized);
  const initialize = useActionStore((state) => state.initialize);
  const selectAction = useActionStore((state) => state.selectAction);
  const action = findAction(actions, uid);
  const originalText = `[[actions/${uid}]]`;

  useEffect(() => {
    if (!initialized) void initialize();
  }, [initialize, initialized]);

  if (!action) {
    return <span>{originalText}</span>;
  }

  const params = new URLSearchParams(paramsStr);
  const displayText = params.get("text") || action.title;
  const meta = actionTypeMeta[action.type];
  const Icon = meta.icon;

  return (
    <Tooltip title={`${meta.label} · ${actionStatusLabel[action.status]}`} placement="top">
      <button
        className="mx-0.5 inline-flex max-w-full items-center gap-1 align-baseline text-primary underline decoration-1 hover:text-primary-dark"
        type="button"
        onClick={() => {
          selectAction(uid);
          navigateTo(`${Routes.ACTIONS}/all`);
        }}
      >
        <Icon className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate">{displayText}</span>
      </button>
    </Tooltip>
  );
};

export default ReferencedAction;
