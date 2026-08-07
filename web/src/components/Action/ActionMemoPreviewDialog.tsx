import { XIcon } from "lucide-react";
import { useEffect, useState } from "react";
import MemoView from "@/components/MemoView";
import { useMemoStore } from "@/store/v1";

interface Props {
  memoName: string;
  onClose: () => void;
}

const ActionMemoPreviewDialog = ({ memoName, onClose }: Props) => {
  const memo = useMemoStore((state) => state.memoMapByName[memoName]);
  const getOrFetchMemoByName = useMemoStore((state) => state.getOrFetchMemoByName);
  const [loading, setLoading] = useState(!memo);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    void getOrFetchMemoByName(memoName)
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : "Memo 加载失败");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [getOrFetchMemoByName, memoName]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[1300] flex items-center justify-center bg-zinc-950/50 p-4 backdrop-blur-[2px]"
      role="presentation"
      onMouseDown={(event) => event.currentTarget === event.target && onClose()}
    >
      <section
        className="flex max-h-[min(760px,calc(100vh-2rem))] w-full max-w-3xl flex-col overflow-hidden rounded-lg border border-zinc-200 bg-zinc-50 shadow-2xl dark:border-zinc-700 dark:bg-zinc-950"
        role="dialog"
        aria-modal="true"
        aria-labelledby="action-memo-preview-title"
      >
        <header className="flex min-h-14 items-center justify-between gap-3 border-b border-zinc-200 bg-white px-4 dark:border-zinc-800 dark:bg-zinc-900">
          <h2 id="action-memo-preview-title" className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            Memo Detail
          </h2>
          <button
            className="flex h-8 w-8 items-center justify-center rounded text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
            type="button"
            aria-label="关闭 Memo 预览"
            onClick={onClose}
          >
            <XIcon className="h-4 w-4" />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-5">
          {memo ? (
            <MemoView className="!mb-0 shadow-sm" memo={memo} compact={false} showCreator readonlyPreview />
          ) : loading ? (
            <div className="flex min-h-48 items-center justify-center text-sm text-zinc-500">正在加载 Memo...</div>
          ) : (
            <div className="flex min-h-48 items-center justify-center text-sm text-red-600 dark:text-red-400">{error}</div>
          )}
        </div>
      </section>
    </div>
  );
};

export default ActionMemoPreviewDialog;
