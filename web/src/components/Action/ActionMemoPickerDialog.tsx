import { LoaderCircleIcon, NotebookTabsIcon, SearchIcon, XIcon } from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { toast } from "react-hot-toast";
import { actionApi } from "@/api/action";
import { findAction, useActionStore } from "@/store/v1";
import { ActionMemoReference } from "@/types/action";
import { cn } from "@/utils";

const ActionMemoPickerDialog = () => {
  const pickerActionUid = useActionStore((state) => state.memoPickerActionUid);
  const actions = useActionStore((state) => state.actions);
  const memos = useActionStore((state) => state.memos);
  const closeMemoPicker = useActionStore((state) => state.closeMemoPicker);
  const setMemoRelations = useActionStore((state) => state.setMemoRelations);
  const action = findAction(actions, pickerActionUid);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [searchResults, setSearchResults] = useState<ActionMemoReference[]>();
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    setQuery("");
    setSelected(action?.relatedMemoNames || []);
    setSaving(false);
    setSearchResults(undefined);
    setSearching(false);
  }, [pickerActionUid]);

  const filteredMemos = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const candidates = searchResults || memos;
    if (!normalizedQuery) return candidates;
    return candidates.filter((memo) => `${memo.title} ${memo.snippet}`.toLowerCase().includes(normalizedQuery));
  }, [memos, query, searchResults]);

  if (!pickerActionUid || !action) return null;

  const handleSave = async () => {
    setSaving(true);
    const result = await setMemoRelations(action.uid, selected);
    setSaving(false);
    result.ok ? toast.success(result.message) : toast.error(result.message);
  };

  const handleSearch = async (event: FormEvent) => {
    event.preventDefault();
    const normalizedQuery = query.trim();
    if (!normalizedQuery) {
      setSearchResults(undefined);
      return;
    }
    setSearching(true);
    try {
      setSearchResults(await actionApi.searchMemos(normalizedQuery));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Memo 搜索失败");
    } finally {
      setSearching(false);
    }
  };

  const toggleSelected = (name: string) => {
    setSelected((current) => (current.includes(name) ? current.filter((item) => item !== name) : [...current, name]));
  };

  return (
    <div
      className="fixed inset-0 z-[1100] flex items-center justify-center bg-zinc-950/45 p-4 backdrop-blur-[2px]"
      role="presentation"
      onMouseDown={(event) => event.currentTarget === event.target && closeMemoPicker()}
    >
      <div
        className="flex max-h-[min(680px,calc(100vh-2rem))] w-full max-w-lg flex-col overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-2xl dark:border-zinc-700 dark:bg-zinc-900"
        role="dialog"
        aria-modal="true"
        aria-labelledby="memo-picker-title"
      >
        <header className="flex items-center justify-between border-b border-zinc-200 px-5 py-4 dark:border-zinc-800">
          <div className="min-w-0">
            <h2 id="memo-picker-title" className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
              关联 Memo
            </h2>
            <p className="mt-0.5 truncate text-xs text-zinc-500">{action.title}</p>
          </div>
          <button
            className="rounded-md p-1.5 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
            type="button"
            aria-label="关闭"
            onClick={closeMemoPicker}
          >
            <XIcon className="h-4 w-4" />
          </button>
        </header>

        <form className="border-b border-zinc-200 px-5 py-3 dark:border-zinc-800" role="search" onSubmit={handleSearch}>
          <label className="relative block">
            <SearchIcon className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-zinc-400" />
            <input
              className="w-full rounded-md border border-zinc-200 bg-white py-2 pl-9 pr-10 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/15 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setSearchResults(undefined);
              }}
              placeholder="搜索标题或内容"
              aria-label="搜索 Memo"
            />
            <button
              className="absolute right-1.5 top-1.5 flex h-7 w-7 items-center justify-center rounded text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 disabled:cursor-wait dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
              type="submit"
              aria-label="执行 Memo 搜索"
              disabled={searching}
            >
              {searching ? <LoaderCircleIcon className="h-4 w-4 animate-spin" /> : <SearchIcon className="h-4 w-4" />}
            </button>
          </label>
        </form>

        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
          {filteredMemos.length > 0 ? (
            filteredMemos.map((memo) => {
              const checked = selected.includes(memo.name);
              return (
                <label
                  className={cn(
                    "flex cursor-pointer items-start gap-3 rounded-md border px-3 py-3 transition-colors",
                    checked
                      ? "border-primary/35 bg-teal-50 dark:border-teal-700 dark:bg-teal-950/30"
                      : "border-transparent hover:bg-zinc-50 dark:hover:bg-zinc-800/70",
                  )}
                  key={memo.name}
                >
                  <input
                    className="mt-1 h-4 w-4 accent-primary"
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleSelected(memo.name)}
                  />
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
                    <NotebookTabsIcon className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-zinc-800 dark:text-zinc-200">{memo.title}</span>
                    <span className="mt-0.5 line-clamp-2 block text-xs leading-5 text-zinc-500">{memo.snippet}</span>
                  </span>
                </label>
              );
            })
          ) : (
            <div className="flex min-h-48 flex-col items-center justify-center text-center text-zinc-500">
              <NotebookTabsIcon className="mb-3 h-8 w-8 opacity-50" />
              <p className="text-sm">没有匹配的 Memo</p>
            </div>
          )}
        </div>

        <footer className="flex items-center justify-between border-t border-zinc-200 px-5 py-4 dark:border-zinc-800">
          <span className="text-xs text-zinc-500">已选择 {selected.length} 项</span>
          <div className="flex gap-2">
            <button
              className="rounded-md border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
              type="button"
              onClick={closeMemoPicker}
            >
              取消
            </button>
            <button
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-60"
              type="button"
              disabled={saving}
              onClick={handleSave}
            >
              {saving ? "保存中..." : "保存关联"}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
};

export default ActionMemoPickerDialog;
