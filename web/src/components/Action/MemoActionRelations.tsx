import { LinkIcon, PlusIcon, SearchIcon, UnlinkIcon, XIcon } from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { toast } from "react-hot-toast";
import { flattenActions, useActionStore } from "@/store/v1";
import { Memo } from "@/types/proto/api/v1/memo_service";
import { cn } from "@/utils";
import ActionTypeBadge from "./ActionTypeBadge";

interface Props {
  memo: Memo;
}

const getMemoTitle = (memo: Memo) => {
  const firstLine = memo.content
    .split("\n")
    .map((line) => line.trim())
    .find(Boolean);
  return firstLine?.slice(0, 60) || `Memo ${memo.name.split("/").pop()}`;
};

const MemoActionRelations = ({ memo }: Props) => {
  const actions = useActionStore((state) => state.actions);
  const initialized = useActionStore((state) => state.initialized);
  const initialize = useActionStore((state) => state.initialize);
  const setActionRelationsForMemo = useActionStore((state) => state.setActionRelationsForMemo);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const allActions = useMemo(() => flattenActions(actions), [actions]);
  const relatedActions = useMemo(() => allActions.filter((action) => action.relatedMemoNames.includes(memo.name)), [allActions, memo.name]);
  const filteredActions = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return allActions;
    return allActions.filter((action) => `${action.title} ${action.description}`.toLowerCase().includes(normalizedQuery));
  }, [allActions, query]);
  const memoReference = {
    name: memo.name,
    title: getMemoTitle(memo),
    snippet: memo.content.replace(/\s+/g, " ").trim().slice(0, 120),
    updatedAt: memo.updateTime?.toLocaleString() || "",
  };

  useEffect(() => {
    if (!initialized) void initialize();
  }, [initialize, initialized]);

  const openDialog = () => {
    setSelected(relatedActions.map((action) => action.uid));
    setQuery("");
    setDialogOpen(true);
  };

  const handleSave = async () => {
    const result = await setActionRelationsForMemo(memoReference, selected);
    if (result.ok) setDialogOpen(false);
    result.ok ? toast.success(result.message) : toast.error(result.message);
  };

  const unlinkAction = async (uid: string) => {
    const result = await setActionRelationsForMemo(
      memoReference,
      relatedActions.filter((action) => action.uid !== uid).map((action) => action.uid),
    );
    result.ok ? toast.success("关联已移除") : toast.error(result.message);
  };

  return (
    <>
      <section className="w-full border-b border-zinc-200 pb-3 dark:border-zinc-800" aria-labelledby="memo-action-relations-title">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h3 id="memo-action-relations-title" className="flex min-w-0 items-center gap-1.5 text-sm text-gray-400 dark:text-gray-500">
            <LinkIcon className="h-4 w-4 shrink-0" />
            <span className="truncate">关联 Action</span>
            <span className="shrink-0">({relatedActions.length})</span>
          </h3>
          <button
            className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-primary hover:text-primary-dark"
            type="button"
            onClick={openDialog}
          >
            <PlusIcon className="h-3.5 w-3.5" />
            添加
          </button>
        </div>
        {relatedActions.length > 0 ? (
          <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {relatedActions.map((action) => (
              <div className="grid grid-cols-[auto_minmax(0,1fr)_28px] items-center gap-2 py-2" key={action.uid}>
                <ActionTypeBadge type={action.type} compact />
                <span className="min-w-0 truncate text-sm text-zinc-700 dark:text-zinc-300">{action.title}</span>
                <button
                  className="flex h-7 w-7 items-center justify-center rounded text-zinc-400 hover:bg-zinc-100 hover:text-red-600 dark:hover:bg-zinc-800"
                  type="button"
                  aria-label={`移除 ${action.title} 关联`}
                  title="移除关联"
                  onClick={() => void unlinkAction(action.uid)}
                >
                  <UnlinkIcon className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-zinc-400">暂无关联 Action</p>
        )}
      </section>

      {dialogOpen && (
        <div
          className="fixed inset-0 z-[1200] flex items-center justify-center bg-zinc-950/45 p-4 backdrop-blur-[2px]"
          role="presentation"
          onMouseDown={(event) => event.currentTarget === event.target && setDialogOpen(false)}
        >
          <div
            className="flex max-h-[min(680px,calc(100vh-2rem))] w-full max-w-lg flex-col overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-2xl dark:border-zinc-700 dark:bg-zinc-900"
            role="dialog"
            aria-modal="true"
            aria-labelledby="memo-action-picker-title"
          >
            <header className="flex items-center justify-between border-b border-zinc-200 px-5 py-4 dark:border-zinc-800">
              <div className="min-w-0">
                <h2 id="memo-action-picker-title" className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
                  关联 Action
                </h2>
                <p className="mt-0.5 truncate text-xs text-zinc-500">{memoReference.title}</p>
              </div>
              <button
                className="rounded-md p-1.5 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                type="button"
                aria-label="关闭"
                onClick={() => setDialogOpen(false)}
              >
                <XIcon className="h-4 w-4" />
              </button>
            </header>
            <form
              className="border-b border-zinc-200 px-5 py-3 dark:border-zinc-800"
              role="search"
              onSubmit={(event: FormEvent) => event.preventDefault()}
            >
              <label className="relative block">
                <SearchIcon className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-zinc-400" />
                <input
                  className="w-full rounded-md border border-zinc-200 bg-white py-2 pl-9 pr-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/15 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="搜索 Action"
                  aria-label="搜索 Action"
                />
              </label>
            </form>
            <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
              {filteredActions.map((action) => {
                const checked = selected.includes(action.uid);
                return (
                  <label
                    className={cn(
                      "flex cursor-pointer items-center gap-3 rounded-md border px-3 py-3 transition-colors",
                      checked
                        ? "border-primary/35 bg-teal-50 dark:border-teal-700 dark:bg-teal-950/30"
                        : "border-transparent hover:bg-zinc-50 dark:hover:bg-zinc-800/70",
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
                    <ActionTypeBadge type={action.type} compact />
                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-zinc-800 dark:text-zinc-200">{action.title}</span>
                  </label>
                );
              })}
            </div>
            <footer className="flex items-center justify-between border-t border-zinc-200 px-5 py-4 dark:border-zinc-800">
              <span className="text-xs text-zinc-500">已选择 {selected.length} 项</span>
              <div className="flex gap-2">
                <button
                  className="rounded-md border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                  type="button"
                  onClick={() => setDialogOpen(false)}
                >
                  取消
                </button>
                <button
                  className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-dark"
                  type="button"
                  onClick={handleSave}
                >
                  保存关联
                </button>
              </div>
            </footer>
          </div>
        </div>
      )}
    </>
  );
};

export default MemoActionRelations;
