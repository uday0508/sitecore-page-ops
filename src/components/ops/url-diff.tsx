import { cn } from "@/lib/utils";

function segments(path: string) {
  return path.split("/").filter(Boolean);
}

function Path({ segs, from, tone }: { segs: string[]; from: number; tone: "removed" | "added" }) {
  if (segs.length === 0) return <span className="font-path text-[0.8125rem]">/</span>;
  return (
    <span className="font-path text-[0.8125rem] leading-6 break-all">
      {segs.map((s, i) => (
        <span key={i}>
          <span className="text-subtle-text">/</span>
          <span
            className={cn(
              i >= from &&
                (tone === "removed"
                  ? "rounded-sm bg-danger-bg px-0.5 text-danger-fg line-through decoration-1"
                  : "rounded-sm bg-success-bg px-0.5 text-success-fg"),
            )}
          >
            {s}
          </span>
        </span>
      ))}
    </span>
  );
}

/**
 * The before/after view of a URL change. Shared segments stay quiet; only the parts that
 * change are marked, so authors see exactly what visitors and search engines will notice.
 */
export function UrlDiff({
  from,
  to,
  toLabel = "After",
  emptyLabel = "No page here any more",
  className,
  animate = true,
}: {
  from: string;
  to: string | null;
  toLabel?: string;
  emptyLabel?: string;
  className?: string;
  animate?: boolean;
}) {
  const a = segments(from);
  const b = to ? segments(to) : [];
  let common = 0;
  while (to && common < a.length && common < b.length && a[common].toLowerCase() === b[common].toLowerCase()) common++;

  return (
    <div className={cn("relative rounded-lg border bg-subtle-bg px-3 py-2.5", className)}>
      <span aria-hidden className="absolute top-[1.35rem] bottom-[1.35rem] left-[1.06rem] w-px bg-border-color-a11y" />
      <dl className="grid grid-cols-[auto_1fr] items-start gap-x-3 gap-y-2">
        <dt className="flex items-center gap-2 pt-[0.3rem]">
          <span aria-hidden className="relative z-10 size-2 rounded-full bg-danger" />
          <span className="text-xs text-subtle-text">Now</span>
        </dt>
        <dd className="min-w-0">
          <Path segs={a} from={to ? common : 0} tone="removed" />
        </dd>
        <dt className="flex items-center gap-2 pt-[0.3rem]">
          <span aria-hidden className={cn("relative z-10 size-2 rounded-full", to ? "bg-success" : "bg-neutral")} />
          <span className="text-xs text-subtle-text">{toLabel}</span>
        </dt>
        <dd className={cn("min-w-0", animate && "animate-path-settle")} key={to ?? "none"}>
          {to ? <Path segs={b} from={common} tone="added" /> : <span className="text-md text-subtle-text">{emptyLabel}</span>}
        </dd>
      </dl>
    </div>
  );
}
