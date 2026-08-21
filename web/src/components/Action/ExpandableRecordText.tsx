import { Tooltip } from "@mui/joy";
import { ChevronDownIcon, ChevronUpIcon } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { cn } from "@/utils";

interface Props {
  text: string;
  className?: string;
}

const ExpandableRecordText = ({ text, className }: Props) => {
  const textRef = useRef<HTMLSpanElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [overflowing, setOverflowing] = useState(false);

  useEffect(() => {
    setExpanded(false);
  }, [text]);

  useLayoutEffect(() => {
    const element = textRef.current;
    if (!element || expanded) return;

    const measure = () => setOverflowing(element.scrollWidth > element.clientWidth + 1);
    measure();

    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [expanded, text]);

  return (
    <div className="flex min-w-0 items-start gap-1">
      <span
        ref={textRef}
        className={cn("min-w-0 flex-1 text-sm text-zinc-500", expanded ? "whitespace-pre-wrap break-words" : "truncate", className)}
      >
        {text}
      </span>
      {(overflowing || expanded) && (
        <Tooltip title={expanded ? "收起" : "展开"} placement="top">
          <button
            className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
            type="button"
            aria-label={expanded ? "收起记录内容" : "展开记录内容"}
            aria-expanded={expanded}
            onClick={() => setExpanded((current) => !current)}
          >
            {expanded ? <ChevronUpIcon className="h-3.5 w-3.5" /> : <ChevronDownIcon className="h-3.5 w-3.5" />}
          </button>
        </Tooltip>
      )}
    </div>
  );
};

export default ExpandableRecordText;
