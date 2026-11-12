"use client";

import {
  mdiAlertCircle,
  mdiArrowDecisionOutline,
  mdiCalendarClock,
  mdiCheckCircle,
  mdiCloudUploadOutline,
  mdiRadar,
  mdiUndoVariant,
} from "@mdi/js";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { relativeTime } from "@/components/ops/primitives";
import { Spinner } from "@/components/ops/spinner";
import { useUndo } from "@/components/ops/use-undo";
import { useActivity } from "@/hooks/use-activity";
import type { AsyncState } from "@/hooks/use-async";
import { useJobs, usePending, type RedirectState } from "@/hooks/use-sitecore";
import { Icon } from "@/lib/icon";
import { publishPending } from "@/lib/ops/publish-pending";
import { loadScan, type SiteScan } from "@/lib/ops/scan";
import type { SitecoreApi } from "@/lib/sitecore/api";
import { cn } from "@/lib/utils";
import { useSetupResult } from "./setup-check";
import { PendingList } from "./tray";
import { startScan, SCAN_EVENT } from "./scan-job";
import type { Nav } from "./workspace-app";

function Card({ title, icon, tone = "neutral", action, children }: { title: string; icon: string; tone?: "neutral" | "warning" | "danger" | "success"; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="flex flex-col rounded-xl border bg-body-bg">
      <header className="flex items-center gap-2.5 border-b px-4 py-3">
        <span
          className={cn(
            "flex size-7 items-center justify-center rounded-md",
            tone === "warning" && "bg-warning-bg text-warning-fg",
            tone === "danger" && "bg-danger-bg text-danger-fg",
            tone === "success" && "bg-success-bg text-success-fg",
            tone === "neutral" && "bg-neutral-bg text-neutral-fg",
          )}
        >
          <Icon path={icon} className="size-4" />
        </span>
        <h2 className="flex-1 text-md font-semibold">{title}</h2>
        {action}
      </header>
      <div className="flex flex-col px-4 py-2">{children}</div>
    </section>
  );
}

function Row({ label, count, tone = "neutral", onClick }: { label: string; count: number; tone?: "danger" | "warning" | "neutral"; onClick?: () => void }) {
  return (
    <button type="button" onClick={onClick} className="-mx-2 flex items-center gap-3 rounded-md px-2 py-2 text-left hover:bg-neutral-bg focus-visible:ring-[3px] focus-visible:ring-primary/40 focus-visible:outline-none">
      <span className="flex-1 text-md">{label}</span>
      <span className={cn("text-md font-semibold tabular-nums", tone === "danger" && "text-danger-fg", tone === "warning" && "text-warning-fg")}>{count}</span>
    </button>
  );
}

/** The front door: only what needs attention now, each with the one action that deals with it. */
export function HomeSection({ api, redirects, nav, openSettings }: { api: SitecoreApi; redirects: AsyncState<RedirectState>; nav: Nav; openSettings: () => void }) {
  const pending = usePending(api.site.name);
  const jobs = useJobs();
  const activity = useActivity((e) => e.site === api.site.name).slice(0, 6);
  const { undo, busy } = useUndo(api, () => void redirects.reload());
  const setup = useSetupResult(api);
  const [scan, setScan] = useState<SiteScan | null>(null);

  useEffect(() => {
    const load = () => setScan(loadScan(api.site.name));
    load();
    window.addEventListener(SCAN_EVENT, load);
    return () => window.removeEventListener(SCAN_EVENT, load);
  }, [api.site.name]);

  const scanning = jobs.find((j) => j.id === `scan:${api.site.name}` && j.status === "running");
  const publishing = jobs.some((j) => j.id === `publish-pending:${api.site.name}` && j.status === "running");
  const setupProblems = setup.result?.checks.filter((c) => c.status === "fail") ?? [];

  const state = redirects.data;
  const counts = useMemo(() => {
    const c = { loop: 0, broken: 0, shadowed: 0, chain: 0 };
    for (const list of state?.issues.values() ?? []) for (const i of list) if (i.code in c) c[i.code as keyof typeof c]++;
    return c;
  }, [state]);
  const campaigns = useMemo(() => api.campaigns(state?.maps ?? []), [api, state]);
  const ended = campaigns.filter((c) => c.status === "ended");

  const week = Date.now() + 7 * 86400000;
  const soon = (iso?: string) => !!iso && new Date(iso).getTime() > Date.now() && new Date(iso).getTime() < week;
  const upcoming = [
    ...(scan?.pages ?? []).flatMap((p) => [
      ...(soon(p.publishFrom) ? [{ when: p.publishFrom!, text: `${p.displayName} goes live`, id: p.id }] : []),
      ...(soon(p.publishTo) ? [{ when: p.publishTo!, text: `${p.displayName} is taken down`, id: p.id }] : []),
    ]),
    ...campaigns.flatMap((c) => [
      ...(soon(c.startsAt) ? [{ when: c.startsAt!, text: `Campaign ${c.name} starts`, id: "" }] : []),
      ...(soon(c.endsAt) ? [{ when: c.endsAt!, text: `Campaign ${c.name} ends`, id: "" }] : []),
    ]),
  ].sort((a, b) => a.when.localeCompare(b.when));

  const health = scan
    ? {
        broken: scan.pages.filter((p) => p.broken.length).length,
        unpublished: scan.pages.filter((p) => p.live === false && (p.referrers ?? 0) > 0).length,
        a11y: scan.pages.filter((p) => (p.a11y?.errors ?? 0) > 0).length,
      }
    : null;
  const redirectProblems = counts.loop + counts.broken + counts.shadowed;
  const allClear = !pending.length && !redirectProblems && !ended.length && !upcoming.length && health && !health.broken && !health.unpublished && !health.a11y && !setupProblems.length;

  return (
    <div className="min-h-full bg-subtle-bg">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-8 py-8">
        <header>
          <h1 className="text-2xl font-semibold">{api.site.displayName}</h1>
          <p className="text-md text-subtle-text">{allClear ? "Nothing needs you right now." : "What needs attention, with the action that deals with it."}</p>
        </header>

        {setupProblems.length > 0 && (
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-danger/40 bg-danger-bg px-4 py-3 text-danger-fg">
            <Icon path={mdiAlertCircle} className="size-5" />
            <p className="min-w-0 flex-1 text-md">
              <span className="font-semibold">Setup: {setupProblems.map((c) => c.label.toLowerCase()).join(", ")}.</span> Some features won’t work until this is fixed.
            </p>
            <Button size="sm" colorScheme="danger" onClick={openSettings}>
              Review setup
            </Button>
          </div>
        )}

        <div className="grid gap-5 lg:grid-cols-2">
          {pending.length > 0 && (
            <Card
              title={`${pending.length} change${pending.length === 1 ? "" : "s"} not live yet`}
              icon={mdiCloudUploadOutline}
              tone="warning"
              action={
                <Button size="sm" disabled={publishing} onClick={() => void publishPending(api, pending)}>
                  {publishing && <Spinner className="text-inverse-text" />}
                  Publish all
                </Button>
              }
            >
              <PendingList api={api} items={pending} redirects={state} compact />
            </Card>
          )}

          <Card
            title="Site health"
            icon={mdiRadar}
            tone={health && (health.broken || health.unpublished || health.a11y) ? "danger" : health ? "success" : "neutral"}
            action={
              <Button size="sm" variant="ghost" disabled={!!scanning} onClick={() => startScan(api)}>
                {scanning && <Spinner />}
                {scanning ? `${scanning.done}/${scanning.total || "…"}` : scan ? "Scan again" : "Scan site"}
              </Button>
            }
          >
            {!health ? (
              <p className="py-2 text-md text-subtle-text">{scanning ? "Scanning in the background. Keep working; this updates when it’s done." : "Scan once to see broken links, unpublished linked pages and accessibility problems."}</p>
            ) : (
              <>
                <Row label="Pages with broken links" count={health.broken} tone={health.broken ? "danger" : "neutral"} onClick={() => nav({ section: "health", filter: "broken" })} />
                <Row label="Linked pages that aren’t live" count={health.unpublished} tone={health.unpublished ? "danger" : "neutral"} onClick={() => nav({ section: "health", filter: "unpublished" })} />
                <Row label="Pages with accessibility problems" count={health.a11y} tone={health.a11y ? "warning" : "neutral"} onClick={() => nav({ section: "health", filter: "a11y" })} />
                <p className="py-1 text-xs text-subtle-text">Scanned {relativeTime(scan!.at)}</p>
              </>
            )}
          </Card>

          {(redirectProblems > 0 || ended.length > 0) && (
            <Card title="Redirects to fix" icon={mdiArrowDecisionOutline} tone="danger">
              {counts.loop > 0 && <Row label="Loops: visitors get an error" count={counts.loop} tone="danger" onClick={() => nav({ section: "redirects", filter: "loop" })} />}
              {counts.broken > 0 && <Row label="Pointing at pages that don’t exist" count={counts.broken} tone="danger" onClick={() => nav({ section: "redirects", filter: "broken" })} />}
              {counts.shadowed > 0 && <Row label="Hiding live pages" count={counts.shadowed} tone="danger" onClick={() => nav({ section: "redirects", filter: "shadowed" })} />}
              {ended.length > 0 && <Row label="Ended campaigns to remove" count={ended.length} tone="warning" onClick={() => nav({ section: "redirects", filter: "campaigns" })} />}
            </Card>
          )}

          {upcoming.length > 0 && (
            <Card title="Coming up this week" icon={mdiCalendarClock}>
              <ul className="flex flex-col divide-y">
                {upcoming.slice(0, 6).map((u, i) => (
                  <li key={i} className="flex items-center gap-3 py-2">
                    <span className="w-24 shrink-0 text-sm text-subtle-text">{new Date(u.when).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })}</span>
                    <span className="flex-1 text-md">{u.text}</span>
                    {u.id && (
                      <Button size="xs" variant="ghost" onClick={() => nav({ section: "pages", pageId: u.id })}>
                        Open
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            </Card>
          )}

          <Card title="Recent changes" icon={mdiUndoVariant} action={activity.length > 0 && <Button size="xs" variant="ghost" onClick={() => nav({ section: "activity" })}>All activity</Button>}>
            {activity.length === 0 ? (
              <p className="py-2 text-md text-subtle-text">Changes made by anyone on this site show up here, with undo.</p>
            ) : (
              <ul className="flex flex-col divide-y">
                {activity.map((e) => (
                  <li key={e.id} className="flex items-center gap-3 py-2">
                    <div className="min-w-0 flex-1">
                      <p className={cn("truncate text-md", e.undone && "text-subtle-text line-through")}>{e.title}</p>
                      <p className="text-xs text-subtle-text">
                        {e.user ? `${e.user}, ` : ""}
                        {relativeTime(e.at)}
                      </p>
                    </div>
                    {e.undo?.length && !e.undone ? (
                      <Button size="xs" variant="ghost" disabled={busy} onClick={() => void undo(e)}>
                        Undo
                      </Button>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {allClear && (
            <Card title="All clear" icon={mdiCheckCircle} tone="success">
              <p className="py-2 text-md text-subtle-text">Everything is published, redirects are healthy and the last scan found no problems.</p>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
