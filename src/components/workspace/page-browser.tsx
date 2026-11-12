"use client";

import { mdiFindReplace, mdiCloudUploadOutline, mdiFolderMoveOutline, mdiMagnify, mdiTrashCanOutline } from "@mdi/js";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { PagePicker, type PickTarget } from "@/components/ops/page-picker";
import { ErrorNote, PathText, relativeTime } from "@/components/ops/primitives";
import { useAsync } from "@/hooks/use-async";
import { useSettings } from "@/hooks/use-settings";
import type { AsyncState } from "@/hooks/use-async";
import type { RedirectState } from "@/hooks/use-sitecore";
import { logActivity } from "@/lib/activity";
import { runListJob } from "@/lib/jobs";
import { useJobs } from "@/hooks/use-sitecore";
import { Icon } from "@/lib/icon";
import { deletePage, movePage } from "@/lib/ops/operations";
import { sameId, type SitecoreApi } from "@/lib/sitecore/api";
import { parentRoute } from "@/lib/sitecore/routes";
import type { LivePage } from "@/lib/sitecore/types";
import { cn } from "@/lib/utils";

export type BrowseView = "tree" | "all" | "bin";
type Row = LivePage;

/**
 * The one place to find pages: a tree for navigating, a flat list for bulk work, and a filter for
 * URLs that need fixing. Selecting pages shows bulk actions; clicking one opens it.
 */
export function PageBrowser({
  api,
  redirects,
  selectedId,
  onOpen,
  view,
  onView,
  onChanged,
  refreshKey = 0,
  onFindReplace,
}: {
  refreshKey?: number;
  onFindReplace?: () => void;
  api: SitecoreApi;
  redirects: AsyncState<RedirectState>;
  selectedId: string | null;
  onOpen: (id: string) => void;
  view: BrowseView;
  onView: (v: BrowseView) => void;
  onChanged: () => void;
}) {
  const [settings] = useSettings();
  const [q, setQ] = useState("");
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [dialog, setDialog] = useState<"move" | "delete" | null>(null);
  const [target, setTarget] = useState<PickTarget | null>(null);
  const [toParent, setToParent] = useState(true);
  const [treeKey, setTreeKey] = useState(0);
  const pages = redirects.data?.livePages;
  const bin = useAsync(view === "bin" ? () => api.listBin() : null, [api, view, refreshKey]);

  const mode: BrowseView = q.trim() ? "all" : view;
  const rows: Row[] = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const base: Row[] = pages ?? [];
    return base.filter((p) => !needle || p.route.toLowerCase().includes(needle)).sort((a, b) => a.route.localeCompare(b.route));
  }, [pages, q]);

  const chosen = rows.filter((r) => checked.has(r.id) && r.route !== "/");
  const roots = chosen.filter((r) => !chosen.some((o) => o.id !== r.id && r.route.toLowerCase().startsWith(`${o.route.toLowerCase()}/`)));
  const redirectOpts = { enabled: true, includeChildren: settings.redirectChildren, collapseChains: settings.collapseChains };

  const run = (label: string, list: Row[], fn: (r: Row) => Promise<unknown>) => {
    setDialog(null);
    setChecked(new Set());
    return runListJob(label, list, (r) => r.route, fn, {
      key: `bulk:${api.site.name}:${label}`,
      onDone: () => {
        api.invalidate();
        setTreeKey((k) => k + 1);
        onChanged();
      },
    });
  };
  const jobs = useJobs();
  const job = jobs.find((j) => j.id.startsWith(`bulk:${api.site.name}`) && j.status === "running");

  const toggle = (id: string) => {
    const s = new Set(checked);
    if (s.has(id)) s.delete(id);
    else s.add(id);
    setChecked(s);
  };

  const segments: { id: BrowseView; label: string }[] = [
    { id: "tree", label: "Tree" },
    { id: "all", label: pages ? `All ${pages.length}` : "All" },
    { id: "bin", label: bin.data ? `Bin ${bin.data.length}` : "Bin" },
  ];

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-col gap-2 border-b p-3">
        <div className="relative">
          <Icon path={mdiMagnify} className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-subtle-text" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search pages by URL" className="pl-8" aria-label="Search pages" />
        </div>
        {onFindReplace && (
          <Button size="sm" variant="ghost" className="justify-start" onClick={onFindReplace}>
            <Icon path={mdiFindReplace} className="size-4" />
            Find and replace across pages
          </Button>
        )}
        <div role="radiogroup" aria-label="Show" className="grid grid-cols-3 gap-1 rounded-md bg-subtle-bg p-0.5">
          {segments.map((s) => (
            <button
              key={s.id}
              type="button"
              role="radio"
              aria-checked={mode === s.id}
              onClick={() => {
                setQ("");
                onView(s.id);
                setChecked(new Set());
              }}
              className={cn(
                "rounded px-2 py-1 text-sm whitespace-nowrap outline-none focus-visible:ring-[3px] focus-visible:ring-primary/40",
                mode === s.id ? "bg-body-bg font-medium shadow-sm" : "text-subtle-text hover:text-body-text",
              )}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {mode === "bin" ? (
          bin.loading && !bin.data ? (
            <div className="flex flex-col gap-2 p-3">
              <Skeleton className="h-7 w-full" />
              <Skeleton className="h-7 w-full" />
            </div>
          ) : bin.error ? (
            <div className="p-3">
              <ErrorNote error={bin.error} onRetry={bin.reload} />
            </div>
          ) : !bin.data?.length ? (
            <p className="p-4 text-md text-subtle-text">The bin is empty. Pages you delete here wait in the bin until you restore them or delete them for good.</p>
          ) : (
            <ul className="flex flex-col p-1">
              {bin.data.map((b) => (
                <li key={b.id}>
                  <button
                    type="button"
                    onClick={() => onOpen(`bin:${b.id}`)}
                    className={cn("flex w-full flex-col items-start rounded-md px-2 py-1.5 text-left", selectedId === `bin:${b.id}` ? "bg-primary-bg" : "hover:bg-neutral-bg")}
                  >
                    <span className="text-md">{b.displayName}</span>
                    <span className="text-xs text-subtle-text">
                      {b.fromRoute ?? "Unknown location"}
                      {b.deletedAt ? `, deleted ${relativeTime(b.deletedAt)}` : ""}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )
        ) : mode === "tree" ? (
          <PagePicker key={`${treeKey}-${refreshKey}`} api={api} mode="page" hideSearch selected={selectedId} onSelect={(t) => onOpen(t.id)} className="h-full" />
        ) : !pages ? (
          redirects.loading ? (
            <div className="flex flex-col gap-2 p-3">
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-7 w-full" />
              ))}
            </div>
          ) : (
            <div className="p-3">
              <ErrorNote error="Couldn’t list this site’s pages." onRetry={redirects.reload} />
            </div>
          )
        ) : rows.length === 0 ? (
          <p className="p-4 text-md text-subtle-text">No pages match “{q}”.</p>
        ) : (
          <ul className="flex flex-col p-1">
            {rows.map((r) => (
              <li
                key={r.id}
                className={cn("group flex items-start gap-2 rounded-md px-2 py-1.5", sameId(r.id, selectedId) ? "bg-primary-bg" : "hover:bg-neutral-bg")}
              >
                <Checkbox
                  className="mt-0.5"
                  checked={checked.has(r.id)}
                  disabled={r.route === "/"}
                  onCheckedChange={() => toggle(r.id)}
                  aria-label={`Select ${r.route}`}
                />
                <button type="button" onClick={() => onOpen(r.id)} className="flex min-w-0 flex-1 flex-col items-start text-left outline-none focus-visible:underline">
                  <PathText className={cn(sameId(r.id, selectedId) && "text-primary-fg")}>{r.route}</PathText>

                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {job ? (
        <div className="flex flex-col gap-2 border-t p-3" aria-live="polite">
          <span className="text-sm">
            {job.label}: {job.done} of {job.total}…
          </span>
          <Progress value={job.total ? (job.done / job.total) * 100 : 0} />
          <span className="text-xs text-subtle-text">Keeps running if you leave this screen.</span>
        </div>
      ) : (
        mode === "all" &&
        checked.size > 0 && (
          <div className="flex flex-col gap-2 border-t bg-primary-bg p-3">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium">{checked.size} selected</span>
              <Button size="xs" variant="ghost" onClick={() => setChecked(new Set())}>
                Clear
              </Button>
            </div>
            <div className="flex flex-wrap gap-1.5">

              <Button
                size="sm"
                variant="outline"
                disabled={!roots.length}
                onClick={() =>
                  void run("Publish", roots, async (r) => {
                    await api.publish([r.id]);
                  }).then(() => logActivity({ kind: "publish", site: api.site.name, title: `Published ${roots.length} pages` }))
                }
              >
                <Icon path={mdiCloudUploadOutline} className="size-4" />
                Publish
              </Button>
              <Button size="sm" variant="outline" disabled={!roots.length} onClick={() => setDialog("move")}>
                <Icon path={mdiFolderMoveOutline} className="size-4" />
                Move
              </Button>
              <Button size="sm" variant="ghost" colorScheme="danger" disabled={!roots.length} onClick={() => setDialog("delete")}>
                <Icon path={mdiTrashCanOutline} className="size-4" />
                Delete
              </Button>
            </div>
          </div>
        )
      )}

      <Dialog open={dialog === "move"} onOpenChange={(o: boolean) => !o && setDialog(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              Move {roots.length} page{roots.length === 1 ? "" : "s"}
            </DialogTitle>
            <DialogDescription>Each gets a permanent redirect from its old URL. Pages below them move too.</DialogDescription>
          </DialogHeader>
          <PagePicker api={api} mode="page" selected={target?.id ?? null} onSelect={setTarget} className="h-80" />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDialog(null)}>
              Cancel
            </Button>
            <Button
              disabled={!target}
              onClick={() => {
                const t = target!;
                const list = roots.filter((r) => r.route !== t.route && !t.route.toLowerCase().startsWith(`${r.route.toLowerCase()}/`));
                void run(`Move under ${t.name}`, list, async (r) => {
                  const page = await api.getPage(r.id);
                  await movePage(api, { page, targetParentId: t.id, targetName: t.name, redirect: redirectOpts }, () => {});
                });
              }}
            >
              Move under {target?.name ?? "…"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={dialog === "delete"} onOpenChange={(o: boolean) => !o && setDialog(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete {roots.length} page{roots.length === 1 ? "" : "s"}?
            </AlertDialogTitle>
            <AlertDialogDescription>They go to the recycle bin with any pages below them. Publish their parents afterwards to remove them from the live site.</AlertDialogDescription>
          </AlertDialogHeader>
          <label className="flex items-start gap-2.5">
            <Checkbox checked={toParent} onCheckedChange={(c: boolean | "indeterminate") => setToParent(c === true)} />
            <span className="flex flex-col">
              <Label className="text-md">Send visitors to each page’s parent</Label>
              <span className="text-sm text-subtle-text">Otherwise their old URLs show a 404 page.</span>
            </span>
          </label>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                void run("Delete", roots, async (r) => {
                  const page = await api.getPage(r.id);
                  await deletePage(api, { page, redirectTo: toParent ? parentRoute(page.route) : null, redirect: redirectOpts }, () => {});
                })
              }
            >
              Delete pages
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>


    </div>
  );
}
