import { LoaderIcon } from "lucide-react";

function Loading() {
  return (
    <div className="fixed inset-0 z-[2000] flex min-h-[100svh] w-full items-center justify-center bg-zinc-100 text-zinc-700 dark:bg-zinc-900 dark:text-zinc-200">
      <div className="flex items-center gap-3" role="status" aria-label="正在加载">
        <span className="flex h-10 w-10 items-center justify-center rounded-md bg-white shadow-sm dark:bg-zinc-800">
          <LoaderIcon className="h-5 w-5 animate-spin text-teal-600 dark:text-teal-400" />
        </span>
        <div>
          <p className="text-sm font-semibold">Memos</p>
          <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">正在加载...</p>
        </div>
      </div>
    </div>
  );
}

export default Loading;
