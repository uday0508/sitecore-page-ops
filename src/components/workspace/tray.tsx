"use client";

import { mdiClose, mdiCloudUploadOutline, mdiFileDocumentOutline, mdiArrowDecisionOutline, mdiPuzzleOutline } from "@mdi/js";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Progress } from "@/components/ui/progress";
import { relativeTime } from "@/components/ops/primitives";
import { Spinner } from "@/components/ops/spinner";
import { useJobs, usePending, type RedirectState } from "@/hooks/use-sitecore";
import { Icon } from "@/lib/icon";
import { cancelJob, dismissJob } from "@/lib/jobs";
import { publishPending } from "@/lib/ops/publish-pending";
import { dismissPending, type PendingItem } from "@/lib/pending";
import type { SitecoreApi } from "@/lib/sitecore/api";
import { cn } from "@/lib/utils";

const KIND_ICON = { page: mdiFileDocumentOutline, redirects: mdiArrowDecisionOutline, content: mdiPuzzleOutline };

export function pendingLabel(p: PendingItem, redirects?: RedirectState) {
  if (p.kind !== "redirects") return p.label;
  const map = redirects?.maps.find((m) => m.id.replace(/[{}-]/g, "").toLowerCase() === p.id.replace(/[{}-]/g, "").toLowerCase());
  return map ? `Redirects: ${map.name}` : p.label;
}

export function PendingList({ api, items, redirects, compact = false }: { api: SitecoreApi; items: PendingItem[]; redirects?: RedirectState; compact?: boolean }) {
  return (
    <ul className="flex flex-col divide-y">
      {items.slice(0, compact ? 5 : 50).map((p) => (
        <li key={p.id} className="group flex items-start gap-2.5 py-2">
          <Icon path={KIND_ICON[p.kind]} className="mt-0.5 size-4 shrink-0 text-subtle-text" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-md">{pendingLabel(p, redirects)}</p>
            <p className="truncate text-xs text-subtle-text">
              {p.reason}
              {p.by ? `, ${p.by}` : ""}, {relativeTime(p.since)}
            </p>
          </div>
          <Button
            size="icon-xs"
            variant="ghost"
            aria-label={`Don’t publish ${pendingLabel(p, redirects)}`}
            title="Remove from this list without publishing"
            className="opacity-60 group-hover:opacity-100"
            onClick={() => dismissPending(api.site.name, p.id)}
          >
            <Icon path={mdiClose} className="size-4" />
          </Button>
        </li>
      ))}
      {compact && items.length > 5 && <li className="py-2 text-sm text-subtle-text">and {items.length - 5} more</li>}
    </ul>
  );
}

/** Top-bar reminder of everything saved but not published, with one-click publish. Hidden when all is live. */
export function PendingTray({ api, redirects }: { api: SitecoreApi; redirects?: RedirectState }) {
  const items = usePending(api.site.name);
  const jobs = useJobs();
  const publishing = jobs.some((j) => j.id === `publish-pending:${api.site.name}` && j.status === "running");
  if (!items.length) return null;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="border-warning/50 bg-warning-bg text-warning-fg hover:bg-warning-bg">
          {publishing ? <Spinner className="size-4 text-warning-fg" /> : <Icon path={mdiCloudUploadOutline} className="size-4" />}
          {items.length} not live
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-96 p-0">
        <div className="border-b px-4 py-3">
          <h2 className="text-md font-semibold">Saved, not live yet</h2>
          <p className="text-sm text-subtle-text">Changes made with Page Operations by anyone on {api.site.displayName}. Visitors see them once they’re published.</p>
        </div>
        <div className="max-h-80 overflow-y-auto px-4">
          <PendingList api={api} items={items} redirects={redirects} />
        </div>
        <div className="flex justify-end border-t px-4 py-3">
          <Button size="sm" disabled={publishing} onClick={() => void publishPending(api, items)}>
            {publishing && <Spinner className="text-inverse-text" />}
            Publish all {items.length}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

/** Background work: scans and bulk changes keep running while you use the rest of the app. */
export function JobsIndicator() {
  const jobs = useJobs();
  if (!jobs.length) return null;
  const running = jobs.filter((j) => j.status === "running");
  const lead = running[0];
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" aria-label="Background jobs">
          {running.length ? <Spinner className="size-4" /> : null}
          <span className="max-w-44 truncate">
            {lead ? `${lead.phase ?? lead.label}${lead.total > 1 ? ` ${lead.done}/${lead.total}` : "…"}` : `${jobs.length} finished`}
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <ul className="flex max-h-96 flex-col divide-y overflow-y-auto">
          {jobs.map((j) => (
            <li key={j.id} className="flex flex-col gap-1.5 px-4 py-3">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-md font-medium">{j.label}</span>
                {j.status === "running" ? (
                  <Button size="xs" variant="ghost" onClick={() => cancelJob(j.id)}>
                    Cancel
                  </Button>
                ) : (
                  <Button size="icon-xs" variant="ghost" aria-label="Dismiss" onClick={() => dismissJob(j.id)}>
                    <Icon path={mdiClose} className="size-4" />
                  </Button>
                )}
              </div>
              {j.status === "running" ? (
                <>
                  <Progress value={j.total ? (j.done / j.total) * 100 : 10} />
                  <span className="text-xs text-subtle-text">
                    {j.phase ?? "Working"}
                    {j.total > 1 ? `: ${j.done} of ${j.total}` : "…"}
                  </span>
                </>
              ) : (
                <span className={cn("text-sm", j.status === "failed" || j.failed.length ? "text-danger-fg" : "text-subtle-text")}>
                  {j.status === "cancelled" ? "Cancelled" : j.status === "failed" ? j.error : j.failed.length ? `${j.failed.length} didn’t work: ${j.failed.slice(0, 3).join(", ")}` : "Done"}
                </span>
              )}
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
