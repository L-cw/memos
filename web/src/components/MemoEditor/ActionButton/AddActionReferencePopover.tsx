import { Button, Checkbox, Tooltip } from "@mui/joy";
import { ListChecksIcon, SearchIcon } from "lucide-react";
import React, { useEffect, useMemo, useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/Popover";
import { flattenActions, useActionStore } from "@/store/v1";
import { cn } from "@/utils";
import ActionTypeBadge from "../../Action/ActionTypeBadge";
import { EditorRefActions } from "../Editor";

interface Props {
  editorRef: React.RefObject<EditorRefActions>;
  onCreateRelations: (actionUids: string[]) => void;
}

const AddActionReferencePopover = ({ editorRef, onCreateRelations }: Props) => {
  const actions = useActionStore((state) => state.actions);
  const initialized = useActionStore((state) => state.initialized);
  const loading = useActionStore((state) => state.loading);
  const initialize = useActionStore((state) => state.initialize);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [createRelations, setCreateRelations] = useState(true);
  const allActions = useMemo(() => flattenActions(actions), [actions]);
  const filteredActions = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return allActions;
    return allActions.filter((action) => `${action.title} ${action.description}`.toLowerCase().includes(normalized));
  }, [allActions, query]);

  useEffect(() => {
    if (open && !initialized) void initialize();
  }, [initialize, initialized, open]);

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (nextOpen) {
      setQuery("");
      setSelected([]);
      setCreateRelations(true);
    }
  };

  const insertReferences = () => {
    const editor = editorRef.current;
    if (!editor || selected.length === 0) return;
    const content = editor.getContent();
    const start = editor.getCursorPosition();
    const selectedText = editor.getSelectedContent();
    const end = start + selectedText.length;
    const prefix = start > 0 && !/\s/.test(content[start - 1]) ? " " : "";
    const suffix = end < content.length && !/\s/.test(content[end]) ? " " : "";
    const references = selected.map((uid) => `[[actions/${uid}]]`).join(" ");
    editor.insertText(`${prefix}${references}${suffix}`);
    if (createRelations) onCreateRelations(selected);
    setOpen(false);
    setTimeout(() => {
      editor.scrollToCursor();
      editor.focus();
    });
  };

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <Tooltip title="引用 Action" placement="top">
        <span className="relative inline-flex w-9">
          <PopoverTrigger asChild>
            <Button
              className="flex items-center justify-center !text-primary hover:!bg-teal-50 hover:!text-primary-dark dark:hover:!bg-teal-950/30 dark:hover:!text-primary-lighter"
              size="sm"
              variant="plain"
              aria-label="引用 Action"
            >
              <ListChecksIcon className="mx-auto h-5 w-5" />
            </Button>
          </PopoverTrigger>
        </span>
      </Tooltip>
      <PopoverContent align="center" className="!w-[20rem] !p-0">
        <div className="flex max-h-[26rem] flex-col overflow-hidden">
          <div className="border-b border-zinc-200 p-3 dark:border-zinc-700">
            <label className="relative block">
              <SearchIcon className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-zinc-400" />
              <input
                className="w-full rounded-md border border-zinc-200 bg-white py-2 pl-8 pr-3 text-sm outline-none focus:border-primary dark:border-zinc-700 dark:bg-zinc-900"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="搜索 Action"
                aria-label="搜索 Action"
              />
            </label>
          </div>
          <div className="min-h-32 flex-1 overflow-y-auto p-2">
            {loading && !initialized ? (
              <p className="px-2 py-8 text-center text-sm text-zinc-500">正在加载...</p>
            ) : filteredActions.length > 0 ? (
              filteredActions.map((action) => {
                const checked = selected.includes(action.uid);
                return (
                  <label
                    className={cn(
                      "flex cursor-pointer items-center gap-2 rounded-md px-2 py-2",
                      checked ? "bg-teal-50 dark:bg-teal-950/30" : "hover:bg-zinc-50 dark:hover:bg-zinc-800",
                    )}
                    key={action.uid}
                  >
                    <input
                      className="h-4 w-4 shrink-0 accent-primary"
                      type="checkbox"
                      checked={checked}
                      onChange={() =>
                        setSelected((current) =>
                          current.includes(action.uid) ? current.filter((uid) => uid !== action.uid) : [...current, action.uid],
                        )
                      }
                    />
                    <ActionTypeBadge type={action.type} compact iconOnly />
                    <span className="min-w-0 flex-1 truncate text-sm text-zinc-800 dark:text-zinc-200">{action.title}</span>
                  </label>
                );
              })
            ) : (
              <p className="px-2 py-8 text-center text-sm text-zinc-500">没有可引用的 Action</p>
            )}
          </div>
          <div className="flex items-center justify-between gap-3 border-t border-zinc-200 p-3 dark:border-zinc-700">
            <Checkbox size="sm" label="建立关联" checked={createRelations} onChange={(event) => setCreateRelations(event.target.checked)} />
            <Button size="sm" color="primary" disabled={selected.length === 0} onClick={insertReferences}>
              插入 {selected.length > 0 ? selected.length : ""}
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
};

export default AddActionReferencePopover;
