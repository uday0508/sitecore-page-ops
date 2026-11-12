"use client";

import { mdiAlertCircleOutline, mdiCheckCircle, mdiFindReplace, mdiInformationOutline } from "@mdi/js";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { useAsync } from "@/hooks/use-async";
import { checkFields, withAlt, type A11yIssue } from "@/lib/a11y";
import { logActivity, type UndoPayload } from "@/lib/activity";
import { Icon } from "@/lib/icon";
import { saveFieldEdit } from "@/lib/ops/operations";
import { applyMatches, findMatches, searchable, type Match, type ReplaceOptions } from "@/lib/replace";
import { SitecoreApi } from "@/lib/sitecore/api";
import type { PageRef } from "@/lib/sitecore/types";
import { pool } from "@/lib/util";
import { cn } from "@/lib/utils";
import { FlowFrame } from "./flow-frame";
import type { FlowProps } from "./flows";
import { ErrorNote, PathText } from "./primitives";
import { Spinner } from "./spinner";

/* ================================================================== */
/* Accessibility                                                       */
/* ================================================================== */

function AltFix({ onSave }: { onSave: (alt: string) => Promise<void> }) {
  const [alt, setAlt] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="mt-2 flex gap-2"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
          await onSave(alt.trim());
        } finally {
          setBusy(false);
        }
      }}
    >
      <Input value={alt} onChange={(e) => setAlt(e.target.value)} placeholder="Describe the image" className="h-8" aria-label="Alt text" />
      <Button size="sm" type="submit" disabled={!alt.trim() || busy}>
        {busy && <Spinner className="text-inverse-text" />}
        Save
      </Button>
    </form>
  );
}

export function AccessibilityContent({ api, page }: { api: SitecoreApi; page: PageRef }) {
  const check = useAsync(async () => {
    const set = await api.pageFields(page.id, page.language);
    const refs = SitecoreApi.referencedIds(set);
    const info = refs.length ? await api.itemInfo(refs.map((r) => r.id)).catch(() => new Map()) : new Map();
    const mediaAlt = new Map<string, string>();
    for (const v of info.values()) if (v.alt !== undefined) mediaAlt.set(String(v.id).replace(/[{}-]/g, "").toLowerCase(), v.alt);
    return { set, issues: checkFields(set.fields, mediaAlt) };
  }, [api, page.id]);

  const fix = async (issue: A11yIssue, alt: string) => {
    const value = check.data!.set.fields.find((f) => f.name === issue.field)?.value ?? "";
    try {
      await saveFieldEdit(api, { page, field: issue.field, value: withAlt(value, issue, alt), title: `Added alt text on ${page.displayName}` });
      toast.success("Alt text saved. Publish the page to make it live.");
      await check.reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn’t save");
    }
  };

  if (check.loading && !check.data) return <Skeleton className="h-32 w-full" />;
  if (check.error) return <ErrorNote error={check.error} onRetry={check.reload} />;
  const issues = check.data?.issues ?? [];
  if (!issues.length) {
    return (
      <div className="flex items-center gap-3 rounded-lg bg-success-bg px-4 py-3 text-success-fg">
        <Icon path={mdiCheckCircle} className="size-5" />
        <span className="text-md">No problems found in this page’s text, images and links.</span>
      </div>
    );
  }
  const errors = issues.filter((i) => i.severity === "error");
  return (
    <div className="flex flex-col gap-4">
      <p className="text-md text-subtle-text">
        {errors.length} problem{errors.length === 1 ? "" : "s"} that block screen reader users, {issues.length - errors.length} to improve. Checked in {page.language}, latest version.
      </p>
      <ul className="flex flex-col divide-y rounded-lg border">
        {issues.map((i) => (
          <li key={i.key} className="flex items-start gap-3 px-4 py-3">
            <Icon path={i.severity === "error" ? mdiAlertCircleOutline : mdiInformationOutline} className={cn("mt-0.5 size-5 shrink-0", i.severity === "error" ? "text-danger-fg" : "text-warning-fg")} />
            <div className="min-w-0 flex-1">
              <p className="text-md">{i.message}</p>
              <p className="text-sm text-subtle-text">
                In {i.field}
                {i.snippet ? (
                  <>
                    : <span className="font-path">{i.snippet}</span>
                  </>
                ) : null}
              </p>
              {i.alt && <AltFix onSave={(alt) => fix(i, alt)} />}
            </div>
          </li>
        ))}
      </ul>
      <p className="text-sm text-subtle-text">Other fixes, like link text and headings, are made in the Pages editor.</p>
    </div>
  );
}

export function AccessibilityView({ api, page, onClose }: FlowProps) {
  return (
    <FlowFrame title="Accessibility" stages={[]} stage={0} onBack={onClose}>
      <AccessibilityContent api={api} page={page} />
    </FlowFrame>
  );
}

/* ================================================================== */
/* Find and replace                                                    */
/* ================================================================== */

interface Hit {
  pageId: string;
  route: string;
  title: string;
  field: string;
  version: number;
  matches: Match[];
}

export type ReplaceScope = { kind: "page"; page: PageRef } | { kind: "site" } | { kind: "section"; route: string; name: string };

export function ReplaceContent({ api, scope, onDone }: { api: SitecoreApi; scope: ReplaceScope; onDone?: () => void }) {
  const [find, setFind] = useState("");
  const [repl, setRepl] = useState("");
  const [opts, setOpts] = useState<ReplaceOptions>({ caseSensitive: false, wholeWord: false, inMarkup: false });
  const [newVersion, setNewVersion] = useState(true);
  const [hits, setHits] = useState<Hit[] | null>(null);
  const [off, setOff] = useState<Set<string>>(new Set());
  const [progress, setProgress] = useState<{ label: string; done: number; total: number } | null>(null);
  const language = scope.kind === "page" ? scope.page.language : api.language;
  const total = useMemo(() => (hits ?? []).reduce((n, h) => n + h.matches.length, 0), [hits]);
  const selected = total - off.size;
  const k = (h: Hit, i: number) => `${h.pageId}|${h.field}|${i}`;

  const search = async () => {
    setHits(null);
    setOff(new Set());
    const pages =
      scope.kind === "page"
        ? [{ id: scope.page.id, route: scope.page.route }]
        : (await api.listAllPages()).filter((p) => scope.kind === "site" || p.route === scope.route || p.route.toLowerCase().startsWith(`${scope.route.toLowerCase()}/`));
    const out: Hit[] = [];
    let done = 0;
    setProgress({ label: "Searching", done: 0, total: pages.length });
    await pool(pages, 4, async (p) => {
      try {
        const set = await api.pageFields(p.id, language);
        const title = set.fields.find((f) => f.name === "Title")?.value || p.route;
        for (const f of set.fields) {
          if (!searchable(f.name, f.value)) continue;
          const matches = findMatches(f.value, find, opts);
          if (matches.length) out.push({ pageId: p.id, route: p.route, title, field: f.name, version: set.version, matches });
        }
      } catch {
        // page without a version in this language
      }
      setProgress({ label: "Searching", done: ++done, total: pages.length });
    });
    out.sort((a, b) => a.route.localeCompare(b.route) || a.field.localeCompare(b.field));
    setHits(out);
    setProgress(null);
  };

  const replace = async () => {
    if (!hits) return;
    const byPage = new Map<string, Hit[]>();
    for (const h of hits) if (h.matches.some((_, i) => !off.has(k(h, i)))) byPage.set(h.pageId, [...(byPage.get(h.pageId) ?? []), h]);
    const undo: UndoPayload[] = [];
    const skipped: string[] = [];
    let done = 0;
    setProgress({ label: "Replacing", done: 0, total: byPage.size });
    for (const [pageId, list] of byPage) {
      try {
        let version = list[0].version;
        if (newVersion) {
          await api.addVersion(pageId, language, version);
          version = (await api.pageVersions(pageId, language))[0].version;
          undo.push({ kind: "version", pageId, language, version });
        }
        const fresh = await api.rawFields(pageId, list.map((h) => h.field), language, version);
        const values: Record<string, string> = {};
        for (const h of list) {
          const now = findMatches(fresh[h.field], find, opts);
          if (now.length !== h.matches.length) {
            skipped.push(`${h.route} (${h.field} changed since the search)`);
            continue;
          }
          values[h.field] = applyMatches(fresh[h.field], now.filter((_, i) => !off.has(k(h, i))), repl);
        }
        if (Object.keys(values).length) {
          if (!newVersion) undo.push({ kind: "fields", pageId, language, version, values: Object.fromEntries(Object.keys(values).map((f) => [f, fresh[f]])) });
          await api.updateFields(pageId, values, language, version);
        }
      } catch {
        skipped.push(list[0].route);
      }
      setProgress({ label: "Replacing", done: ++done, total: byPage.size });
    }
    logActivity({
      kind: "replace",
      site: api.site.name,
      title: `Replaced “${find}” with “${repl}”`,
      detail: `${selected} change${selected === 1 ? "" : "s"} on ${byPage.size} page${byPage.size === 1 ? "" : "s"}${newVersion ? ", as new versions" : ""}`,
      pageId: scope.kind === "page" ? scope.page.id : undefined,
      undo,
      publish: [...byPage.entries()].map(([id, list]) => ({ id, label: list[0].title, kind: "page" as const })),
    });
    setProgress(null);
    setHits(null);
    if (skipped.length) toast.error(`Skipped: ${skipped.join(", ")}`);
    toast.success(`Replaced ${selected} match${selected === 1 ? "" : "es"}. Undo it from Activity; publish to make it live.`);
    onDone?.();
  };

  const toggleOpt = (key: keyof ReplaceOptions) => setOpts({ ...opts, [key]: !opts[key] });

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="fr-find">Find</Label>
          <Input id="fr-find" value={find} onChange={(e) => setFind(e.target.value)} placeholder="Old product name" autoFocus onKeyDown={(e) => e.key === "Enter" && find && void search()} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="fr-repl">Replace with</Label>
          <Input id="fr-repl" value={repl} onChange={(e) => setRepl(e.target.value)} placeholder="New product name" />
        </div>
      </div>
      <div className="flex flex-wrap gap-x-5 gap-y-2">
        {(
          [
            ["caseSensitive", "Match case"],
            ["wholeWord", "Whole words"],
            ["inMarkup", "Also in links and image paths"],
          ] as const
        ).map(([key, label]) => (
          <label key={key} className="flex items-center gap-2 text-md">
            <Checkbox checked={opts[key]} onCheckedChange={() => toggleOpt(key)} />
            {label}
          </label>
        ))}
        <label className="flex items-center gap-2 text-md">
          <Checkbox checked={newVersion} onCheckedChange={() => setNewVersion(!newVersion)} />
          Save as new versions
        </label>
      </div>
      <p className="text-sm text-subtle-text">
        {scope.kind === "page" ? `On ${scope.page.displayName}` : scope.kind === "section" ? `On ${scope.name} and the pages below it` : "On every page in the site"}, in {language}.{" "}
        {newVersion ? "Each changed page gets a new version, so the current one stays as it was." : "The latest version is edited directly."}
      </p>
      <div className="flex gap-2">
        <Button variant="outline" onClick={search} disabled={!find || !!progress}>
          <Icon path={mdiFindReplace} className="size-5" />
          Find matches
        </Button>
        {hits && selected > 0 && (
          <Button onClick={replace} disabled={!!progress}>
            Replace {selected} match{selected === 1 ? "" : "es"}
          </Button>
        )}
      </div>
      {progress && (
        <div className="flex flex-col gap-1.5" aria-live="polite">
          <span className="text-sm text-subtle-text">
            {progress.label}… {progress.done} of {progress.total}
          </span>
          <Progress value={progress.total ? (progress.done / progress.total) * 100 : 0} />
        </div>
      )}
      {hits && !progress && (
        hits.length === 0 ? (
          <p className="rounded-lg border px-4 py-6 text-center text-md text-subtle-text">No matches for “{find}”.</p>
        ) : (
          <ul className="flex flex-col divide-y rounded-lg border">
            {hits.map((h) => (
              <li key={`${h.pageId}|${h.field}`} className="flex flex-col gap-1.5 px-4 py-3">
                <div className="flex flex-wrap items-baseline gap-x-2">
                  {scope.kind !== "page" && <span className="text-md font-medium">{h.title}</span>}
                  {scope.kind !== "page" && <PathText className="text-subtle-text">{h.route}</PathText>}
                  <Badge size="sm">{h.field}</Badge>
                </div>
                {h.matches.map((m, i) => (
                  <label key={i} className="flex items-start gap-2.5">
                    <Checkbox
                      className="mt-0.5"
                      checked={!off.has(k(h, i))}
                      onCheckedChange={() => {
                        const s = new Set(off);
                        if (s.has(k(h, i))) s.delete(k(h, i));
                        else s.add(k(h, i));
                        setOff(s);
                      }}
                    />
                    <span className="text-md">
                      <span className="text-subtle-text">…{m.before}</span>
                      <del className="rounded-sm bg-danger-bg text-danger-fg">{m.text}</del>
                      {repl && <ins className="rounded-sm bg-success-bg text-success-fg no-underline">{repl}</ins>}
                      <span className="text-subtle-text">{m.after}…</span>
                    </span>
                  </label>
                ))}
              </li>
            ))}
          </ul>
        )
      )}
    </div>
  );
}

export function ReplaceView({ api, page, onClose }: FlowProps) {
  return (
    <FlowFrame title="Find and replace" stages={[]} stage={0} onBack={onClose}>
      <ReplaceContent api={api} scope={{ kind: "page", page }} />
    </FlowFrame>
  );
}
