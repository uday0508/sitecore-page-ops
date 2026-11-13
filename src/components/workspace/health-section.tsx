"use client";

import {
  mdiAutoFix,
  mdiCloudUploadOutline,
  mdiDownload,
  mdiGoogle,
  mdiLinkVariantOff,
  mdiPlus,
  mdiRadar,
  mdiTrayArrowUp,
} from "@mdi/js";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
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
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ErrorNote, PathText, relativeTime } from "@/components/ops/primitives";
import { Spinner } from "@/components/ops/spinner";
import type { AsyncState } from "@/hooks/use-async";
import { useSettings } from "@/hooks/use-settings";
import type { RedirectState } from "@/hooks/use-sitecore";
import { logActivity } from "@/lib/activity";
import { Icon } from "@/lib/icon";
import { fetchSearchConsolePages, loadNotFound, parseNotFoundCsv, saveNotFound, stillMissing, suggestTarget, type NotFoundUrl } from "@/lib/ops/not-found";
import { addRedirects, changeUrl } from "@/lib/ops/operations";
import { loadScan, type PageHealth, type ScanPhase, type SiteScan } from "@/lib/ops/scan";
import { cancelJob, runListJob } from "@/lib/jobs";
import { useJobs, usePageBuilderLink } from "@/hooks/use-sitecore";
import { SCAN_EVENT, startScan } from "./scan-job";
import type { SitecoreApi } from "@/lib/sitecore/api";
import { lastSegment } from "@/lib/sitecore/routes";
import { lintSlug, slugify } from "@/lib/sitecore/slug";
import { csvRow, daysSince, downloadText } from "@/lib/util";
import { cn } from "@/lib/utils";
import type { Nav } from "./workspace-app";

type Report = "broken" | "unpublished" | "orphans" | "stale" | "urls" | "notfound" | "schedule" | "a11y";

const REPORTS: { id: Report; label: string; needsScan: boolean; tone: "danger" | "warning" | "neutral"; about: string }[] = [
  { id: "broken", label: "Broken links", needsScan: true, tone: "danger", about: "Pages pointing at items that no longer exist: links in text, link fields and component content." },
  { id: "unpublished", label: "Linked but not live", needsScan: true, tone: "danger", about: "Pages other pages link to that aren’t published, so visitors following those links get a 404." },
  { id: "notfound", label: "Not found (404)", needsScan: false, tone: "danger", about: "URLs people still visit that don’t exist and have no redirect." },
  { id: "a11y", label: "Accessibility", needsScan: true, tone: "danger", about: "Pages with images missing alt text, empty links, vague link text or skipped headings. Open a page to fix them; image fields are checked there." },
  { id: "schedule", label: "Scheduled and offline", needsScan: true, tone: "neutral", about: "Pages with go-live or take-down dates, and pages taken offline but kept in Sitecore." },
  { id: "orphans", label: "No incoming links", needsScan: true, tone: "warning", about: "Pages nothing links to. Visitors can only find them through search or by typing the URL." },
  { id: "stale", label: "Stale content", needsScan: true, tone: "neutral", about: "Pages nobody has edited for a while, oldest first, with who edited them last." },
  { id: "urls", label: "URL issues", needsScan: false, tone: "warning", about: "URLs that are harder to read, share or rank. Fixing one adds a permanent redirect from the old URL." },
];

function Empty({ children }: { children: ReactNode }) {
  return <p className="rounded-lg border px-4 py-10 text-center text-md text-subtle-text">{children}</p>;
}

function OpenButton({ id, nav, edit }: { id: string; nav: Nav; edit?: (() => void) | null }) {
  return (
    <span className="inline-flex gap-1">
      <Button size="xs" variant="ghost" onClick={() => nav({ section: "pages", pageId: id })}>
        Open
      </Button>
      {edit && (
        <Button size="xs" variant="ghost" colorScheme="primary" onClick={edit} title="Edit in Page builder (new tab)">
          Edit
        </Button>
      )}
    </span>
  );
}

/** Site-wide reports. One scan feeds the first four; URL issues and 404s need no scan. */
export function HealthSection({ api, redirects, nav, initialReport }: { api: SitecoreApi; redirects: AsyncState<RedirectState>; nav: Nav; initialReport?: string }) {
  const [settings, saveSettings] = useSettings();
  const link = usePageBuilderLink();
  const [scan, setScan] = useState<SiteScan | null>(null);
  const jobs = useJobs();
  const scanJob = jobs.find((j) => j.id === `scan:${api.site.name}`);
  const phase: ScanPhase | null = scanJob?.status === "running" ? { label: scanJob.phase ?? "Scanning", done: scanJob.done, total: scanJob.total } : null;
  const scanError = scanJob?.status === "failed" ? (scanJob.error ?? "Scan failed") : null;
  const [report, setReport] = useState<Report>(REPORTS.some((r) => r.id === initialReport) ? (initialReport as Report) : "broken");
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const job = jobs.find((j) => j.id.startsWith(`health:${api.site.name}`) && j.status === "running");
  const [confirmFix, setConfirmFix] = useState(false);
  const [notFound, setNotFound] = useState<NotFoundUrl[]>([]);
  const [targets, setTargets] = useState<Record<string, string>>({});
  const [gscBusy, setGscBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setScan(loadScan(api.site.name));
    setNotFound(loadNotFound(api.site.name));
    setChecked(new Set());
    const reload = () => setScan(loadScan(api.site.name));
    window.addEventListener(SCAN_EVENT, reload);
    return () => window.removeEventListener(SCAN_EVENT, reload);
  }, [api.site.name]);
  useEffect(() => {
    if (initialReport && REPORTS.some((r) => r.id === initialReport)) setReport(initialReport as Report);
  }, [initialReport]);

  const runScan = () => void startScan(api);
  const live = redirects.data?.livePages ?? null;
  const rules = redirects.data?.rules ?? [];
  const staleDays = settings.staleMonths * 30.4;

  const data = useMemo(() => {
    const pages = scan?.pages ?? [];
    return {
      broken: pages.filter((p) => p.broken.length > 0),
      unpublished: pages.filter((p) => p.live === false && (p.referrers ?? 0) > 0),
      orphans: pages.filter((p) => p.referrers === 0 && p.route !== "/"),
      stale: pages.filter((p) => (daysSince(p.updatedAt) ?? 0) > staleDays).sort((a, b) => (a.updatedAt ?? "").localeCompare(b.updatedAt ?? "")),
      urls: (live ?? [])
        .filter((p) => p.route !== "/")
        .map((p) => ({ ...p, issue: lintSlug(lastSegment(p.route))[0]?.message, suggestion: slugify(lastSegment(p.route)) }))
        .filter((r) => r.issue && r.suggestion && r.suggestion !== lastSegment(r.route)),
      notfound: stillMissing(notFound, live, rules).sort((a, b) => (b.hits ?? 0) - (a.hits ?? 0)),
      schedule: pages
        .filter((p) => p.neverPublish || p.publishFrom || p.publishTo)
        .sort((a, b) => (a.publishFrom ?? a.publishTo ?? "~").localeCompare(b.publishFrom ?? b.publishTo ?? "~")),
      a11y: pages.filter((p) => p.a11y && p.a11y.errors + p.a11y.warnings > 0).sort((a, b) => b.a11y!.errors - a.a11y!.errors || b.a11y!.warnings - a.a11y!.warnings),
    };
  }, [scan, live, rules, notFound, staleDays]);

  const count = (r: Report) => (REPORTS.find((x) => x.id === r)!.needsScan && !scan ? null : data[r].length);
  const meta = REPORTS.find((r) => r.id === report)!;
  const pick = (r: Report) => {
    setReport(r);
    setChecked(new Set());
  };
  const toggle = (id: string) => {
    const s = new Set(checked);
    if (s.has(id)) s.delete(id);
    else s.add(id);
    setChecked(s);
  };

  const runJob = <T,>(label: string, list: T[], name: (t: T) => string, fn: (t: T) => Promise<unknown>) =>
    runListJob(label, list, name, fn, {
      key: `health:${api.site.name}:${label}`,
      onDone: () => {
        setChecked(new Set());
        api.invalidate();
      },
    });

  /* ---------- 404 sources ---------- */
  const importCsv = async (file: File) => {
    const rows = parseNotFoundCsv(await file.text());
    if (!rows.length) return toast.error("No URLs found in that file.");
    const merged = mergeUrls(notFound, rows);
    setNotFound(merged);
    saveNotFound(api.site.name, merged);
    toast.success(`Imported ${rows.length} URLs`);
  };
  const connectGsc = async () => {
    setGscBusy(true);
    try {
      const rows = await fetchSearchConsolePages(settings.gscClientId, settings.gscProperty);
      const merged = mergeUrls(
        notFound.filter((n) => n.source !== "search-console"),
        rows,
      );
      setNotFound(merged);
      saveNotFound(api.site.name, merged);
      const missing = stillMissing(rows, live, rules).length;
      toast.success(`Search Console: ${rows.length} URLs checked, ${missing} lead nowhere`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Search Console failed");
    } finally {
      setGscBusy(false);
    }
  };
  const targetFor = (u: NotFoundUrl) => targets[u.path] ?? suggestTarget(u.path, live).route;

  /* ---------- render helpers ---------- */
  const pageTable = (rows: PageHealth[], cols: { head: string; cell: (p: PageHealth) => ReactNode; className?: string }[], selectable = false) => (
    <Table>
      <TableHeader>
        <TableRow>
          {selectable && (
            <TableHead className="w-10">
              <Checkbox
                checked={rows.length > 0 && rows.every((r) => checked.has(r.id))}
                onCheckedChange={() => setChecked(rows.every((r) => checked.has(r.id)) ? new Set() : new Set(rows.map((r) => r.id)))}
                aria-label="Select all"
              />
            </TableHead>
          )}
          <TableHead>Page</TableHead>
          {cols.map((c) => (
            <TableHead key={c.head} className={c.className}>
              {c.head}
            </TableHead>
          ))}
          <TableHead className="w-20" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((p) => (
          <TableRow key={p.id}>
            {selectable && (
              <TableCell>
                <Checkbox checked={checked.has(p.id)} onCheckedChange={() => toggle(p.id)} aria-label={`Select ${p.route}`} />
              </TableCell>
            )}
            <TableCell>
              <span className="block text-md font-medium">{p.displayName}</span>
              <PathText className="text-subtle-text">{p.route}</PathText>
            </TableCell>
            {cols.map((c) => (
              <TableCell key={c.head} className={cn("text-sm", c.className)}>
                {c.cell(p)}
              </TableCell>
            ))}
            <TableCell className="text-right">
              <OpenButton id={p.id} nav={nav} edit={link({ id: p.id, language: api.language }, api.site.name)?.open} />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );

  const needScan = meta.needsScan && !scan;

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-8 py-6">
      {/* Scan bar */}
      <div className="flex flex-wrap items-center gap-3">
        <p className="min-w-0 flex-1 text-md text-subtle-text">
          {phase
            ? `${phase.label}… ${phase.total > 1 ? `${phase.done} of ${phase.total}` : ""} You can leave this screen; the scan keeps going.`
            : scan
              ? `Scanned ${scan.pages.length} pages ${relativeTime(scan.at)}.${scan.linksChecked ? "" : " Link checks were skipped: this environment didn’t allow reading page fields."}`
              : "Scan the site to find broken links, unpublished pages, orphans and stale content."}
        </p>
        {phase ? (
          <Button variant="outline" onClick={() => cancelJob(`scan:${api.site.name}`)}>
            Cancel
          </Button>
        ) : (
          <Button variant={scan ? "outline" : "default"} onClick={runScan}>
            <Icon path={mdiRadar} className="size-5" />
            {scan ? "Scan again" : "Scan site"}
          </Button>
        )}
      </div>
      {phase && <Progress value={phase.total ? (phase.done / phase.total) * 100 : 0} />}
      {scanError && <ErrorNote error={scanError} onRetry={runScan} />}

      {/* Report picker */}
      <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Report">
        {REPORTS.map((r) => {
          const n = count(r.id);
          return (
            <button
              key={r.id}
              type="button"
              role="radio"
              aria-checked={report === r.id}
              onClick={() => pick(r.id)}
              className={cn(
                "flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-primary/40",
                report === r.id ? "border-primary bg-primary-bg font-medium text-primary-fg" : "hover:bg-neutral-bg",
              )}
            >
              {r.label}
              <span className={cn("tabular-nums", report !== r.id && n && r.tone === "danger" ? "text-danger-fg" : "text-subtle-text")}>{n ?? "–"}</span>
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-3xl text-md text-subtle-text">{meta.about}</p>
        <div className="flex flex-wrap items-center gap-2">
          {report === "stale" && (
            <Select value={String(settings.staleMonths)} onValueChange={(v: string) => saveSettings({ ...settings, staleMonths: Number(v) })}>
              <SelectTrigger className="h-8 w-48" aria-label="Stale after">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[3, 6, 12, 24].map((m) => (
                  <SelectItem key={m} value={String(m)}>
                    Not edited in {m} months
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {report === "stale" && data.stale.length > 0 && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() =>
                downloadText(
                  `${api.site.name}-stale-pages.csv`,
                  [csvRow(["url", "title", "last edited", "edited by"]), ...data.stale.map((p) => csvRow([p.route, p.displayName, p.updatedAt?.slice(0, 10), p.updatedBy]))].join("\n"),
                )
              }
            >
              <Icon path={mdiDownload} className="size-4" />
              Export CSV
            </Button>
          )}
          {report === "notfound" && (
            <>
              <input ref={fileRef} type="file" accept=".csv,.txt,text/csv" className="sr-only" onChange={(e) => e.target.files?.[0] && void importCsv(e.target.files[0])} />
              <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()}>
                <Icon path={mdiTrayArrowUp} className="size-4" />
                Import CSV
              </Button>
              <Button size="sm" variant="outline" onClick={connectGsc} disabled={gscBusy}>
                {gscBusy ? <Spinner /> : <Icon path={mdiGoogle} className="size-4" />}
                {notFound.some((n) => n.source === "search-console") ? "Refresh from Search Console" : "Check with Search Console"}
              </Button>
            </>
          )}
        </div>
      </div>

      {job && (
        <div className="flex flex-col gap-2 rounded-lg border p-4" aria-live="polite">
          <span className="text-md">
            {job.label}: {job.done} of {job.total}… <span className="text-subtle-text">It keeps running if you leave this screen.</span>
          </span>
          <Progress value={job.total ? (job.done / job.total) * 100 : 0} />
        </div>
      )}

      {checked.size > 0 && !job && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg bg-primary-bg px-4 py-2">
          <span className="mr-auto text-md font-medium">{checked.size} selected</span>
          {report === "unpublished" && (
            <Button
              size="sm"
              onClick={() =>
                void runJob("Publish", data.unpublished.filter((p) => checked.has(p.id)), (p) => p.route, async (p) => {
                  await api.publish([p.id]);
                }).then(() => logActivity({ kind: "publish", site: api.site.name, title: `Published ${checked.size} linked pages` }))
              }
            >
              <Icon path={mdiCloudUploadOutline} className="size-4" />
              Publish
            </Button>
          )}
          {report === "urls" && (
            <Button size="sm" onClick={() => setConfirmFix(true)}>
              <Icon path={mdiAutoFix} className="size-4" />
              Fix URLs
            </Button>
          )}
          {report === "notfound" && (
            <Button
              size="sm"
              onClick={async () => {
                const list = data.notfound.filter((u) => checked.has(u.path)).map((u) => ({ source: u.path, target: targetFor(u) }));
                try {
                  await addRedirects(api, list, `Redirected ${list.length} not-found URLs`);
                  toast.success(`Added ${list.length} redirects. Publish the redirect map to make them live.`);
                  setChecked(new Set());
                  await redirects.reload();
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : "Couldn’t add redirects");
                }
              }}
            >
              <Icon path={mdiPlus} className="size-4" />
              Add {checked.size} redirect{checked.size === 1 ? "" : "s"}
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={() => setChecked(new Set())}>
            Clear
          </Button>
        </div>
      )}

      {/* Report body */}
      {needScan ? (
        <div className="flex flex-col items-center gap-3 rounded-lg border px-6 py-14 text-center">
          <span className="flex size-12 items-center justify-center rounded-full bg-primary-bg text-primary-fg">
            <Icon path={mdiRadar} className="size-6" />
          </span>
          <h2 className="text-lg font-semibold">Scan the site to see this report</h2>
          <p className="max-w-md text-md text-subtle-text">The scan reads every page once. It takes about a minute for a few hundred pages, and the result is kept here until you scan again.</p>
          <Button onClick={runScan} disabled={!!phase}>
            Scan site
          </Button>
        </div>
      ) : phase && !scan ? (
        <Skeleton className="h-40 w-full" />
      ) : report === "broken" ? (
        data.broken.length === 0 ? (
          <Empty>{scan?.linksChecked === false ? "Link checks didn’t run on this environment." : "No broken links."}</Empty>
        ) : (
          pageTable(data.broken, [
            {
              head: "Missing",
              cell: (p) => (
                <ul className="flex flex-col gap-0.5">
                  {p.broken.slice(0, 4).map((b) => (
                    <li key={b.id} className="flex items-center gap-1.5">
                      <Icon path={mdiLinkVariantOff} className="size-3.5 shrink-0 text-danger-fg" />
                      <span className="font-medium">{b.field}</span>
                      <PathText className="text-subtle-text">{b.id}</PathText>
                    </li>
                  ))}
                  {p.broken.length > 4 && <li className="text-subtle-text">and {p.broken.length - 4} more</li>}
                </ul>
              ),
            },
          ])
        )
      ) : report === "unpublished" ? (
        data.unpublished.length === 0 ? (
          <Empty>Every page that’s linked to is live.</Empty>
        ) : (
          pageTable(data.unpublished, [{ head: "Linked from", cell: (p) => `${p.referrerNames.join(", ")}${(p.referrers ?? 0) > p.referrerNames.length ? ` and ${(p.referrers ?? 0) - p.referrerNames.length} more` : ""}` }], true)
        )
      ) : report === "a11y" ? (
        data.a11y.length === 0 ? (
          <Empty>No accessibility problems found in page text.</Empty>
        ) : (
          pageTable(data.a11y, [
            { head: "Blocking", cell: (p) => <span className={p.a11y!.errors ? "font-medium text-danger-fg" : "text-subtle-text"}>{p.a11y!.errors}</span>, className: "w-24" },
            { head: "To improve", cell: (p) => p.a11y!.warnings, className: "w-24" },
          ])
        )
      ) : report === "schedule" ? (
        data.schedule.length === 0 ? (
          <Empty>No pages are scheduled or offline.</Empty>
        ) : (
          pageTable(data.schedule, [
            {
              head: "Status",
              cell: (p) => {
                const d = (iso: string) => new Date(iso).toLocaleDateString(undefined, { dateStyle: "medium" });
                const now = new Date().toISOString();
                return (
                  <span className="flex flex-col">
                    {p.neverPublish && <span className="font-medium text-danger-fg">Offline, kept in Sitecore</span>}
                    {p.publishFrom && <span>{p.publishFrom > now ? `Goes live ${d(p.publishFrom)}` : `Live since ${d(p.publishFrom)}`}</span>}
                    {p.publishTo && <span className={p.publishTo < now ? "text-warning-fg" : undefined}>{p.publishTo < now ? `Ended ${d(p.publishTo)}` : `Taken down ${d(p.publishTo)}`}</span>}
                  </span>
                );
              },
            },
          ])
        )
      ) : report === "orphans" ? (
        data.orphans.length === 0 ? (
          <Empty>Every page is linked from somewhere.</Empty>
        ) : (
          pageTable(data.orphans, [
            { head: "Live", cell: (p) => (p.live === true ? "Yes" : p.live === false ? "No" : "–"), className: "w-20" },
            { head: "Last edited", cell: (p) => (p.updatedAt ? relativeTime(p.updatedAt) : "–"), className: "w-36" },
          ])
        )
      ) : report === "stale" ? (
        data.stale.length === 0 ? (
          <Empty>Every page was edited in the last {settings.staleMonths} months.</Empty>
        ) : (
          pageTable(data.stale, [
            { head: "Last edited", cell: (p) => (p.updatedAt ? new Date(p.updatedAt).toLocaleDateString(undefined, { dateStyle: "medium" }) : "–"), className: "w-36" },
            { head: "Edited by", cell: (p) => p.updatedBy ?? "–", className: "w-56" },
          ])
        )
      ) : report === "urls" ? (
        !live ? (
          <Skeleton className="h-32 w-full" />
        ) : data.urls.length === 0 ? (
          <Empty>Every page URL is clean.</Empty>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox
                    checked={data.urls.every((r) => checked.has(r.id))}
                    onCheckedChange={() => setChecked(data.urls.every((r) => checked.has(r.id)) ? new Set() : new Set(data.urls.map((r) => r.id)))}
                    aria-label="Select all"
                  />
                </TableHead>
                <TableHead>Current URL</TableHead>
                <TableHead>Suggested</TableHead>
                <TableHead>Why</TableHead>
                <TableHead className="w-20" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.urls.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>
                    <Checkbox checked={checked.has(r.id)} onCheckedChange={() => toggle(r.id)} aria-label={`Select ${r.route}`} />
                  </TableCell>
                  <TableCell>
                    <PathText>{r.route}</PathText>
                  </TableCell>
                  <TableCell>
                    <PathText className="text-success-fg">{r.suggestion!}</PathText>
                  </TableCell>
                  <TableCell className="text-sm text-subtle-text">{r.issue}</TableCell>
                  <TableCell className="text-right">
                    <OpenButton id={r.id} nav={nav} edit={link({ id: r.id, language: api.language }, api.site.name)?.open} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )
      ) : notFound.length === 0 ? (
        <div className="flex flex-col gap-3 rounded-lg border px-6 py-10">
          <h2 className="text-lg font-semibold">Find URLs that lead nowhere</h2>
          <ul className="flex max-w-2xl flex-col gap-2 text-md text-subtle-text">
            <li>
              <span className="font-medium text-body-text">Import CSV.</span> In Search Console, open Pages, choose “Not found (404)” and export. Server or CDN logs work too: any CSV with a URL column.
            </li>
            <li>
              <span className="font-medium text-body-text">Check with Search Console.</span> Finds pages Google sent visitors to in the last 28 days that no longer exist and have no redirect.
              {!settings.gscClientId && " Add your Google client ID and property in Settings first."}
            </li>
          </ul>
        </div>
      ) : data.notfound.length === 0 ? (
        <Empty>All {notFound.length} imported URLs now exist or redirect somewhere.</Empty>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <Checkbox
                  checked={data.notfound.every((r) => checked.has(r.path))}
                  onCheckedChange={() => setChecked(data.notfound.every((r) => checked.has(r.path)) ? new Set() : new Set(data.notfound.map((r) => r.path)))}
                  aria-label="Select all"
                />
              </TableHead>
              <TableHead>URL</TableHead>
              <TableHead className="w-24 text-right">Visits</TableHead>
              <TableHead className="w-[22rem]">Redirect to</TableHead>
              <TableHead className="w-32" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.notfound.slice(0, 300).map((u) => {
              const s = suggestTarget(u.path, live);
              return (
                <TableRow key={u.path}>
                  <TableCell>
                    <Checkbox checked={checked.has(u.path)} onCheckedChange={() => toggle(u.path)} aria-label={`Select ${u.path}`} />
                  </TableCell>
                  <TableCell>
                    <PathText>{u.path}</PathText>
                    <span className="block text-xs text-subtle-text">{u.source === "search-console" ? "Search Console" : "Imported"}</span>
                  </TableCell>
                  <TableCell className="text-right text-sm tabular-nums">{u.hits ?? "–"}</TableCell>
                  <TableCell>
                    <Input
                      value={targetFor(u)}
                      onChange={(e) => setTargets({ ...targets, [u.path]: e.target.value })}
                      list="health-live-routes"
                      className="font-path h-8"
                      aria-label={`Redirect target for ${u.path}`}
                    />
                    {!targets[u.path] && <span className="text-xs text-subtle-text">{s.reason}</span>}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      size="xs"
                      variant="outline"
                      colorScheme="primary"
                      onClick={async () => {
                        try {
                          await addRedirects(api, [{ source: u.path, target: targetFor(u) }], `Redirected ${u.path}`);
                          toast.success("Redirect added. Publish the redirect map to make it live.");
                          await redirects.reload();
                        } catch (e) {
                          toast.error(e instanceof Error ? e.message : "Couldn’t add the redirect");
                        }
                      }}
                    >
                      Add redirect
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
      <datalist id="health-live-routes">{live?.slice(0, 1000).map((p) => <option key={p.id} value={p.route} />)}</datalist>

      <AlertDialog open={confirmFix} onOpenChange={setConfirmFix}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Fix {checked.size} URL{checked.size === 1 ? "" : "s"}?
            </AlertDialogTitle>
            <AlertDialogDescription>Each page gets its suggested URL and a permanent redirect from the old one. You can undo each change from Activity.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                void runJob("Fix URLs", data.urls.filter((r) => checked.has(r.id)), (r) => r.route, async (r) => {
                  const page = await api.getPage(r.id);
                  await changeUrl(
                    api,
                    { page, newName: r.suggestion!, redirect: { enabled: true, includeChildren: settings.redirectChildren, collapseChains: settings.collapseChains } },
                    () => {},
                  );
                })
              }
            >
              Fix URLs
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function mergeUrls(a: NotFoundUrl[], b: NotFoundUrl[]): NotFoundUrl[] {
  const m = new Map(a.map((u) => [u.path.toLowerCase(), u]));
  for (const u of b) {
    const prev = m.get(u.path.toLowerCase());
    m.set(u.path.toLowerCase(), prev ? { ...u, hits: Math.max(prev.hits ?? 0, u.hits ?? 0) || undefined } : u);
  }
  return [...m.values()];
}
