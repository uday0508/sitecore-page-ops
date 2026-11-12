"use client";

import { mdiCloudUploadOutline, mdiFolderMoveOutline, mdiMagnify, mdiTrashCanOutline } from "@mdi/js";
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PagePicker, type PickTarget } from "@/components/ops/page-picker";
import { ErrorNote, PathText } from "@/components/ops/primitives";
import { useSettings } from "@/hooks/use-settings";
import type { AsyncState } from "@/hooks/use-async";
import type { RedirectState } from "@/hooks/use-sitecore";
import { logActivity } from "@/lib/activity";
import { Icon } from "@/lib/icon";
import { deletePage, movePage } from "@/lib/ops/operations";
import type { SitecoreApi } from "@/lib/sitecore/api";
import { parentRoute } from "@/lib/sitecore/routes";
import type { LivePage } from "@/lib/sitecore/types";
import type { Nav } from "./workspace-app";

const PAGE = 150;
type Job = { label: string; done: number; total: number; failed: string[] };

/** Every page in the site, with bulk publish, move and delete. */
export function AllPages({ api, redirects, nav }: { api: SitecoreApi; redirects: AsyncState<RedirectState>; nav: Nav }) {
  const [settings] = useSettings();
  const pages = redirects.data?.livePages;
  const [q, setQ] = useState("");
  const [limit, setLimit] = useState(PAGE);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [job, setJob] = useState<Job | null>(null);
  const [moving, setMoving] = useState(false);
  const [target, setTarget] = useState<PickTarget | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [redirectToParent, setRedirectToParent] = useState(true);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (pages ?? []).filter((p) => !needle || p.route.toLowerCase().includes(needle)).sort((a, b) => a.route.localeCompare(b.route));
  }, [pages, q]);
  const chosen = rows.filter((r) => selected.has(r.id) && r.route !== "/");
  // Don't act on a page whose ancestor is also selected: the ancestor's operation covers it.
  const roots = chosen.filter((r) => !chosen.some((o) => o.id !== r.id && r.route.toLowerCase().startsWith(`${o.route.toLowerCase()}/`)));

  const run = async (label: string, list: LivePage[], fn: (p: LivePage) => Promise<unknown>) => {
    const j: Job = { label, done: 0, total: list.length, failed: [] };
    setJob({ ...j });
    for (const p of list) {
      try {
        await fn(p);
      } catch {
        j.failed.push(p.route);
      }
      j.done++;
      setJob({ ...j });
    }
    setSelected(new Set());
    api.invalidate();
    await redirects.reload();
    if (j.failed.length) toast.error(`${j.failed.length} of ${j.total} didn’t work`);
    else toast.success(`${label}: ${j.total} page${j.total === 1 ? "" : "s"} done`);
  };

  const redirectOpts = { enabled: true, includeChildren: settings.redirectChildren, collapseChains: settings.collapseChains };

  const bulkPublish = () =>
    run("Publish", roots, async (p) => {
      await api.publish([p.id], { subItems: false });
    }).then(() => logActivity({ kind: "publish", site: api.site.name, title: `Published ${roots.length} pages` }));

  const bulkMove = () => {
    if (!target) return;
    setMoving(false);
    const list = roots.filter((r) => !target.route.toLowerCase().startsWith(`${r.route.toLowerCase()}/`) && target.route !== r.route);
    void run(`Move under ${target.name}`, list, async (p) => {
      const page = await api.getPage(p.id);
      await movePage(api, { page, targetParentId: target.id, targetName: target.name, redirect: redirectOpts }, () => {});
    });
  };

  const bulkDelete = () => {
    setDeleting(false);
    void run("Delete", roots, async (p) => {
      const page = await api.getPage(p.id);
      await deletePage(api, { page, redirectTo: redirectToParent ? parentRoute(page.route) : null, redirect: redirectOpts }, () => {});
    });
  };

  if (!pages) {
    return redirects.loading ? (
      <div className="flex flex-col gap-2 p-8">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    ) : (
      <div className="p-8">
        <ErrorNote error="Couldn’t list this site’s pages." onRetry={redirects.reload} />
      </div>
    );
  }

  const allShown = rows.slice(0, limit);
  const allChecked = allShown.length > 0 && allShown.every((r) => selected.has(r.id));

  return (
    <div className="flex flex-col gap-4 px-8 py-6">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-sm">
          <Icon path={mdiMagnify} className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-subtle-text" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Search ${pages.length} pages by URL`} className="pl-8" aria-label="Search pages" />
        </div>
        {selected.size > 0 && !job && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-md font-medium">{selected.size} selected</span>
            <Button size="sm" variant="outline" onClick={bulkPublish} disabled={!roots.length}>
              <Icon path={mdiCloudUploadOutline} className="size-4" />
              Publish
            </Button>
            <Button size="sm" variant="outline" onClick={() => setMoving(true)} disabled={!roots.length}>
              <Icon path={mdiFolderMoveOutline} className="size-4" />
              Move
            </Button>
            <Button size="sm" variant="outline" colorScheme="danger" onClick={() => setDeleting(true)} disabled={!roots.length}>
              <Icon path={mdiTrashCanOutline} className="size-4" />
              Delete
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
              Clear
            </Button>
          </div>
        )}
      </div>

      {job && (
        <div className="flex flex-col gap-2 rounded-lg border p-4" aria-live="polite">
          <div className="flex items-center justify-between text-md">
            <span>{job.done < job.total ? `${job.label}: ${job.done + 1} of ${job.total}…` : `${job.label}: ${job.total - job.failed.length} of ${job.total} done`}</span>
            {job.done === job.total && (
              <Button size="sm" variant="ghost" onClick={() => setJob(null)}>
                Dismiss
              </Button>
            )}
          </div>
          <Progress value={job.total ? (job.done / job.total) * 100 : 100} />
          {job.failed.length > 0 && <p className="text-sm text-danger-fg">Not changed: {job.failed.join(", ")}</p>}
        </div>
      )}

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-10">
              <Checkbox
                checked={allChecked}
                onCheckedChange={() => setSelected(allChecked ? new Set() : new Set(allShown.map((r) => r.id)))}
                aria-label="Select all shown"
              />
            </TableHead>
            <TableHead>URL</TableHead>
            <TableHead className="w-32" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {allShown.map((p) => (
            <TableRow key={p.id} data-state={selected.has(p.id) ? "selected" : undefined}>
              <TableCell>
                <Checkbox
                  checked={selected.has(p.id)}
                  disabled={p.route === "/"}
                  onCheckedChange={() => {
                    const s = new Set(selected);
                    if (s.has(p.id)) s.delete(p.id);
                    else s.add(p.id);
                    setSelected(s);
                  }}
                  aria-label={`Select ${p.route}`}
                />
              </TableCell>
              <TableCell>
                <PathText>{p.route}</PathText>
              </TableCell>
              <TableCell className="text-right">
                <Button size="xs" variant="ghost" onClick={() => nav({ section: "pages", tab: "browse", pageId: p.id })}>
                  Open
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {rows.length > limit && (
        <Button variant="outline" className="self-center" onClick={() => setLimit(limit + PAGE)}>
          Show {Math.min(PAGE, rows.length - limit)} more
        </Button>
      )}

      <Dialog open={moving} onOpenChange={setMoving}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              Move {roots.length} page{roots.length === 1 ? "" : "s"}
            </DialogTitle>
            <DialogDescription>Each page gets a permanent redirect from its old URL. Pages below them move too.</DialogDescription>
          </DialogHeader>
          <PagePicker api={api} mode="page" selected={target?.id ?? null} onSelect={setTarget} className="h-80" />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setMoving(false)}>
              Cancel
            </Button>
            <Button disabled={!target} onClick={bulkMove}>
              Move under {target?.name ?? "…"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleting} onOpenChange={setDeleting}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete {roots.length} page{roots.length === 1 ? "" : "s"}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              They go to the recycle bin with any pages below them. Publish their parent pages afterwards to remove them from the live site.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <label className="flex items-start gap-2.5">
            <Checkbox checked={redirectToParent} onCheckedChange={(c: boolean | "indeterminate") => setRedirectToParent(c === true)} />
            <span className="flex flex-col">
              <Label className="text-md">Send visitors to each page’s parent</Label>
              <span className="text-sm text-subtle-text">Otherwise their old URLs show a 404 page.</span>
            </span>
          </label>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={bulkDelete}>Delete pages</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
