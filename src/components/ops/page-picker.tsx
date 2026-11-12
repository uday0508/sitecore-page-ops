"use client";

import { mdiChevronRight, mdiFileDocumentOutline, mdiHomeOutline, mdiMagnify } from "@mdi/js";
import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useAsync } from "@/hooks/use-async";
import { Icon } from "@/lib/icon";
import { sameId, shortId, type SitecoreApi } from "@/lib/sitecore/api";
import type { PageRef, TreeNode } from "@/lib/sitecore/types";
import { cn } from "@/lib/utils";
import { ErrorNote } from "./primitives";

export interface PickTarget {
  id: string;
  name: string;
  route: string;
}

function blockReason(node: TreeNode, page?: PageRef): string | null {
  if (!page) return null;
  if (sameId(node.id, page.id)) return "This page";
  if (page.route !== "/" && (node.route + "/").toLowerCase().startsWith(page.route.toLowerCase() + "/")) return "Inside this page";
  if (sameId(node.id, page.parentId)) return "Current location";
  if (node.insertOptionIds?.length && page.templateId && !node.insertOptionIds.some((t) => shortId(t) === shortId(page.templateId!)))
    return "Not allowed here";
  return null;
}

function Row({
  api,
  node,
  depth,
  page,
  selected,
  onSelect,
  mode,
}: {
  api: SitecoreApi;
  node: TreeNode;
  depth: number;
  page?: PageRef;
  selected: string | null;
  onSelect: (t: PickTarget) => void;
  mode: "parent" | "page";
}) {
  const [open, setOpen] = useState(depth === 0);
  const kids = useAsync(open && node.hasChildren ? () => api.listChildren(node.id) : null, [open, node.id]);
  const reason = mode === "parent" ? blockReason(node, page) : page && sameId(node.id, page.id) ? "This page" : null;
  const isSel = selected ? sameId(selected, node.id) : false;
  return (
    <li role="treeitem" aria-expanded={node.hasChildren ? open : undefined} aria-selected={isSel}>
      <div
        className={cn(
          "group flex items-center gap-1 rounded-md pr-2",
          isSel ? "bg-primary-bg" : "hover:bg-neutral-bg",
        )}
        style={{ paddingLeft: depth * 14 + 2 }}
      >
        <button
          type="button"
          className={cn("flex size-6 shrink-0 items-center justify-center rounded text-subtle-text", !node.hasChildren && "invisible")}
          onClick={() => setOpen(!open)}
          aria-label={open ? `Collapse ${node.displayName}` : `Expand ${node.displayName}`}
        >
          <Icon path={mdiChevronRight} className={cn("size-4 transition-transform", open && "rotate-90")} />
        </button>
        <button
          type="button"
          disabled={!!reason}
          onClick={() => onSelect({ id: node.id, name: node.displayName, route: node.route })}
          className="flex min-w-0 flex-1 items-center gap-2 py-1.5 text-left disabled:cursor-not-allowed"
        >
          <Icon path={depth === 0 ? mdiHomeOutline : mdiFileDocumentOutline} className={cn("size-4 shrink-0", isSel ? "text-primary-fg" : "text-subtle-text")} />
          <span className={cn("min-w-0 flex-1 truncate text-md", reason && "text-subtle-text", isSel && "font-medium text-primary-fg")}>
            {node.displayName}
          </span>
          {reason ? (
            <span className="shrink-0 text-xs text-subtle-text">{reason}</span>
          ) : (
            <span className="font-path hidden shrink-0 truncate text-xs text-subtle-text group-hover:inline">{node.route}</span>
          )}
        </button>
      </div>
      {open && node.hasChildren && (
        <ul role="group">
          {kids.loading && !kids.data && (
            <li className="py-1" style={{ paddingLeft: (depth + 1) * 14 + 30 }}>
              <Skeleton className="h-4 w-32" />
            </li>
          )}
          {kids.data?.map((c) => (
            <Row key={c.id} api={api} node={c} depth={depth + 1} page={page} selected={selected} onSelect={onSelect} mode={mode} />
          ))}
        </ul>
      )}
    </li>
  );
}

/** Browse the site tree or search by URL to choose a destination. */
export function PagePicker({
  api,
  page,
  selected,
  onSelect,
  mode = "parent",
  className,
  hideSearch = false,
}: {
  api: SitecoreApi;
  page?: PageRef;
  selected: string | null;
  onSelect: (t: PickTarget) => void;
  mode?: "parent" | "page";
  className?: string;
  hideSearch?: boolean;
}) {
  const [q, setQ] = useState("");
  const root = useAsync(() => api.getTreeRoot(), [api]);
  const all = useAsync(q.length > 0 ? () => api.listAllPages() : null, [api, q.length > 0]);
  const results = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle || !all.data) return [];
    return all.data
      .filter((p) => p.route.toLowerCase().includes(needle))
      .filter((p) => !page || mode === "page" || !(p.route + "/").toLowerCase().startsWith(page.route.toLowerCase() + "/"))
      .filter((p) => !page || !sameId(p.id, page.id))
      .slice(0, 30);
  }, [q, all.data, page, mode]);

  return (
    <div className={cn("flex min-h-0 flex-col gap-2", className)}>
      <div className={cn("relative", hideSearch && "hidden")}>
        <Icon path={mdiMagnify} className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-subtle-text" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by URL" className="pl-8" aria-label="Search pages by URL" />
      </div>
      <div className={cn("min-h-[12rem] flex-1 overflow-y-auto p-1", !hideSearch && "rounded-md border")}>
        {root.error && <ErrorNote error={root.error} onRetry={root.reload} />}
        {q ? (
          all.loading && !all.data ? (
            <div className="flex flex-col gap-2 p-2">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
            </div>
          ) : results.length === 0 ? (
            <p className="p-3 text-sm text-subtle-text">No pages match “{q}”.</p>
          ) : (
            <ul role="listbox" aria-label="Matching pages">
              {results.map((r) => (
                <li key={r.id}>
                  <button
                    type="button"
                    onClick={() => onSelect({ id: r.id, name: r.route, route: r.route })}
                    className={cn(
                      "font-path w-full truncate rounded-md px-2 py-1.5 text-left text-[0.8125rem] hover:bg-neutral-bg",
                      selected && sameId(selected, r.id) && "bg-primary-bg text-primary-fg",
                    )}
                  >
                    {r.route}
                  </button>
                </li>
              ))}
            </ul>
          )
        ) : root.data ? (
          <ul role="tree" aria-label="Site pages">
            <Row api={api} node={root.data} depth={0} page={page} selected={selected} onSelect={onSelect} mode={mode} />
          </ul>
        ) : (
          <div className="flex flex-col gap-2 p-2">
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="ml-4 h-4 w-2/3" />
            <Skeleton className="ml-4 h-4 w-1/3" />
          </div>
        )}
      </div>
    </div>
  );
}
