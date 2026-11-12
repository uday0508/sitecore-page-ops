"use client";

import {
  mdiArrowDecisionOutline,
  mdiCheckCircle,
  mdiCloseCircle,
  mdiDownload,
  mdiFlaskOutline,
  mdiMagnify,
  mdiPlus,
  mdiTrayArrowUp,
} from "@mdi/js";
import { useEffect, useMemo, useRef, useState } from "react";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { ErrorNote, PathText } from "@/components/ops/primitives";
import { Spinner } from "@/components/ops/spinner";
import type { AsyncState } from "@/hooks/use-async";
import { EMPTY_REDIRECT_STATE, type RedirectState } from "@/hooks/use-sitecore";
import { Icon } from "@/lib/icon";
import { addRedirects, editRedirects } from "@/lib/ops/operations";
import type { RedirectChange } from "@/lib/activity";
import type { SitecoreApi } from "@/lib/sitecore/api";
import { analyze, isExternal, isPattern, normalizePath, parseCsv, resolve, samePath, toCsv, type CsvRow } from "@/lib/sitecore/redirects";
import { REDIRECT_TYPE_LABEL, type RedirectIssueCode, type RedirectRule } from "@/lib/sitecore/types";
import { cn } from "@/lib/utils";
import { CampaignsView } from "./campaigns";
import { ISSUE_LABEL, quickFix } from "./redirect-health";
import type { Nav, NavState } from "./workspace-app";

type Filter = "all" | "issues" | RedirectIssueCode;
const PAGE = 100;

/* ------------------------------------------------------------------ */
/* Section                                                             */
/* ------------------------------------------------------------------ */

export function RedirectsSection({
  api,
  redirects,
  navState,
  nav,
  openTester,
  openSettings,
}: {
  api: SitecoreApi;
  redirects: AsyncState<RedirectState>;
  navState: NavState;
  nav: Nav;
  openTester: () => void;
  openSettings: () => void;
}) {
  const state = redirects.data;
  const usable = state ?? EMPTY_REDIRECT_STATE;
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>(navState.filter && navState.filter !== "campaigns" ? (navState.filter as Filter) : "all");
  const [mapId, setMapId] = useState("all");
  const [limit, setLimit] = useState(PAGE);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<RedirectRule | "new" | null>(null);
  const [importing, setImporting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<"rules" | "campaigns">(navState.filter === "campaigns" ? "campaigns" : "rules");
  useEffect(() => {
    if (navState.filter === "campaigns") setMode("campaigns");
  }, [navState.filter]);
  const campaignCount = (state?.maps ?? []).filter((m) => m.campaign).length;

  useEffect(() => {
    if (navState.filter && navState.filter !== "campaigns") setFilter(navState.filter as Filter);
    if (navState.edit && state) {
      const r = state.rules.find((x) => x.key === navState.edit);
      if (r) setEditing(r);
    }
    if (navState.edit === "new") setEditing("new");
  }, [navState.filter, navState.edit, state]);

  const rows = useMemo(() => {
    if (!state) return [];
    const needle = q.trim().toLowerCase();
    return state.rules.filter((r) => {
      if (mapId !== "all" && r.mapId !== mapId) return false;
      if (needle && !r.source.toLowerCase().includes(needle) && !r.target.toLowerCase().includes(needle)) return false;
      const issues = state.issues.get(r.key) ?? [];
      if (filter === "issues") return issues.length > 0;
      if (filter !== "all") return issues.some((i) => i.code === filter);
      return true;
    });
  }, [state, q, filter, mapId]);

  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.key));
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(rows.map((r) => r.key)));
  const toggle = (k: string) => {
    const s = new Set(selected);
    if (s.has(k)) s.delete(k);
    else s.add(k);
    setSelected(s);
  };

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: state?.rules.length ?? 0, issues: 0 };
    for (const list of state?.issues.values() ?? []) {
      if (list.length) c.issues++;
      for (const code of new Set(list.map((i) => i.code))) c[code] = (c[code] ?? 0) + 1;
    }
    return c;
  }, [state]);
  const chips: { id: Filter; label: string; count: number; tone?: "danger" }[] = [
    { id: "all", label: "All", count: counts.all },
    ...(["loop", "broken", "shadowed", "self", "duplicate", "chain"] as RedirectIssueCode[])
      .filter((c) => counts[c])
      .map((c) => ({ id: c as Filter, label: ISSUE_LABEL[c], count: counts[c], tone: (c === "chain" || c === "duplicate" ? undefined : "danger") as "danger" | undefined })),
  ];
  const chainFixes = useMemo(
    () => (state ? state.rules.filter((r) => state.issues.get(r.key)?.some((i) => i.code === "chain")).map((r) => quickFix(r, "chain", state)).filter((f): f is NonNullable<typeof f> => !!f) : []),
    [state],
  );
  const applyFix = async (changes: RedirectChange[], title: string) => {
    setBusy(true);
    try {
      await editRedirects(api, changes, title);
      toast.success("Fixed. Publish the redirect map to update the live site.");
      await redirects.reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn’t apply the fix");
    } finally {
      setBusy(false);
    }
  };

  const exportCsv = () => {
    if (!state) return;
    const csv = toCsv(rows);
    try {
      const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = `${api.site.name}-redirects.csv`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      void navigator.clipboard.writeText(csv).then(() => toast.success("Downloads are blocked here, so the CSV was copied to your clipboard."));
    }
  };

  const deleteSelected = async () => {
    if (!state) return;
    setBusy(true);
    const doomed = state.rules.filter((r) => selected.has(r.key));
    try {
      await editRedirects(
        api,
        doomed.map((r) => ({ op: "remove" as const, mapId: r.mapId, source: r.source, target: r.target })),
        `Deleted ${doomed.length} redirect${doomed.length === 1 ? "" : "s"}`,
        "redirect.delete",
      );
      toast.success(`Deleted ${doomed.length} redirect${doomed.length === 1 ? "" : "s"}. Undo it from Activity.`);
      setSelected(new Set());
      await redirects.reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn’t delete");
    } finally {
      setBusy(false);
      setConfirmDelete(false);
    }
  };

  const modeSwitch = (
    <div role="radiogroup" aria-label="Show" className="inline-flex rounded-md bg-subtle-bg p-0.5">
      {(["rules", "campaigns"] as const).map((m) => (
        <button
          key={m}
          type="button"
          role="radio"
          aria-checked={mode === m}
          onClick={() => setMode(m)}
          className={cn(
            "rounded px-3 py-1 text-sm whitespace-nowrap outline-none focus-visible:ring-[3px] focus-visible:ring-primary/40",
            mode === m ? "bg-body-bg font-medium shadow-sm" : "text-subtle-text hover:text-body-text",
          )}
        >
          {m === "rules" ? `Rules ${state?.rules.length ?? ""}` : `Campaigns ${campaignCount}`}
        </button>
      ))}
    </div>
  );

  if (mode === "campaigns") {
    return (
      <div className="flex h-full min-h-0 flex-col">
        <div className="border-b px-8 pt-5 pb-4">{modeSwitch}</div>
        <div className="min-h-0 flex-1 overflow-auto">
          <CampaignsView api={api} redirects={redirects} />
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex flex-col gap-3 border-b px-8 pt-5 pb-4">
        {modeSwitch}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="relative w-full max-w-xs">
            <Icon path={mdiMagnify} className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-subtle-text" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search URLs" className="pl-8" aria-label="Search redirects" />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="ghost" onClick={openTester}>
              <Icon path={mdiFlaskOutline} className="size-5" />
              Test a URL
            </Button>
            <Button variant="ghost" onClick={() => setImporting(true)}>
              <Icon path={mdiTrayArrowUp} className="size-5" />
              Import
            </Button>
            <Button variant="ghost" onClick={exportCsv} disabled={!rows.length}>
              <Icon path={mdiDownload} className="size-5" />
              Export
            </Button>
            <Button onClick={() => setEditing("new")}>
              <Icon path={mdiPlus} className="size-5" />
              Add redirect
            </Button>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1.5" role="radiogroup" aria-label="Filter">
          {chips.map((c) => (
            <button
              key={c.id}
              type="button"
              role="radio"
              aria-checked={filter === c.id}
              onClick={() => setFilter(c.id)}
              className={cn(
                "flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-primary/40",
                filter === c.id ? "border-primary bg-primary-bg font-medium text-primary-fg" : "hover:bg-neutral-bg",
              )}
            >
              {c.label}
              <span className={cn("tabular-nums", c.tone === "danger" && filter !== c.id ? "text-danger-fg" : "text-subtle-text")}>{c.count}</span>
            </button>
          ))}
          {state && state.maps.length > 1 && (
            <Select value={mapId} onValueChange={setMapId}>
              <SelectTrigger className="ml-auto h-8 w-44" aria-label="Filter by map">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All maps</SelectItem>
                {state.maps.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {filter === "chain" && chainFixes.length > 1 && (
            <Button size="sm" variant="outline" colorScheme="primary" disabled={busy} onClick={() => applyFix(chainFixes.map((f) => f.change), `Collapsed ${chainFixes.length} redirect chains`)}>
              Fix all {chainFixes.length} chains
            </Button>
          )}
        </div>
      </header>

      {selected.size > 0 && (
        <div className="flex items-center gap-3 border-b bg-primary-bg px-8 py-2">
          <span className="text-md font-medium">{selected.size} selected</span>
          <Button size="sm" colorScheme="danger" onClick={() => setConfirmDelete(true)}>
            Delete
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
            Clear selection
          </Button>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-auto px-8 py-4">
        {redirects.error && <ErrorNote error={redirects.error} onRetry={redirects.reload} />}
        {state?.mapsError && (
          <div className="mb-4">
            <ErrorNote error={`Couldn’t read redirect maps: ${state.mapsError}`} onRetry={redirects.reload} />
          </div>
        )}
        {!state && !redirects.error ? (
          <div className="flex flex-col gap-2">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : state && state.maps.length === 0 ? (
          <div className="mx-auto flex max-w-md flex-col items-center gap-3 py-16 text-center">
            <span className="flex size-12 items-center justify-center rounded-full bg-primary-bg text-primary-fg">
              <Icon path={mdiArrowDecisionOutline} className="size-6" />
            </span>
            <h2 className="text-lg font-semibold">{state.folderId || state.mapsError ? "No redirects yet" : "No redirects folder found"}</h2>
            <p className="text-md text-subtle-text">
              {state.folderId || state.mapsError
                ? "Add one, import a CSV, or change a page’s URL. Page Operations creates its own map the first time."
                : `Nothing at ${state.folderPath ?? "the configured path"}. Create a Redirects folder there in the Content Editor, or point Settings at your folder.`}
            </p>
            <div className="flex gap-2">
              {!state.folderId && !state.mapsError && (
                <Button variant="outline" onClick={openSettings}>
                  Open Settings
                </Button>
              )}
              <Button onClick={() => setEditing("new")}>Add redirect</Button>
            </div>
          </div>
        ) : state && rows.length === 0 ? (
          <p className="py-12 text-center text-md text-subtle-text">No redirects match these filters.</p>
        ) : (
          state && (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">
                      <Checkbox checked={allSelected} onCheckedChange={toggleAll} aria-label="Select all shown" />
                    </TableHead>
                    <TableHead>From</TableHead>
                    <TableHead>To</TableHead>
                    <TableHead className="w-32">Type</TableHead>
                    <TableHead className="w-40">Map</TableHead>
                    <TableHead className="w-56">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.slice(0, limit).map((r) => {
                    const issues = state.issues.get(r.key) ?? [];
                    return (
                      <TableRow key={r.key} className="cursor-pointer" onClick={() => setEditing(r)} data-state={selected.has(r.key) ? "selected" : undefined}>
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <Checkbox checked={selected.has(r.key)} onCheckedChange={() => toggle(r.key)} aria-label={`Select ${r.source}`} />
                        </TableCell>
                        <TableCell className="max-w-72">
                          <PathText>{r.source}</PathText>
                        </TableCell>
                        <TableCell className="max-w-72">
                          <PathText>{r.target}</PathText>
                        </TableCell>
                        <TableCell className="text-sm text-subtle-text">{REDIRECT_TYPE_LABEL[r.type]}</TableCell>
                        <TableCell className="text-sm">
                          {r.mapName}
                          {r.managed && <span className="block text-xs text-subtle-text">Managed by this app</span>}
                        </TableCell>
                        <TableCell>
                          {issues.length ? (
                            <div className="flex flex-wrap items-center gap-1.5">
                              {issues.map((i) => (
                                <Badge key={i.code} colorScheme={i.severity === "error" ? "danger" : "warning"} title={i.message}>
                                  {ISSUE_LABEL[i.code]}
                                </Badge>
                              ))}
                              {(() => {
                                const fix = issues.map((i) => quickFix(r, i.code, state)).find(Boolean);
                                return fix ? (
                                  <Button
                                    size="xs"
                                    variant="ghost"
                                    colorScheme="primary"
                                    disabled={busy}
                                    title={fix.label}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      void applyFix([fix.change], `${fix.label}: ${r.source}`);
                                    }}
                                  >
                                    Fix
                                  </Button>
                                ) : null;
                              })()}
                            </div>
                          ) : (
                            <span className="flex items-center gap-1 text-sm text-subtle-text">
                              <Icon path={mdiCheckCircle} className="size-3.5 text-success-fg" />
                              OK
                            </span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
              {rows.length > limit && (
                <div className="flex justify-center py-4">
                  <Button variant="outline" onClick={() => setLimit(limit + PAGE)}>
                    Show {Math.min(PAGE, rows.length - limit)} more of {rows.length - limit}
                  </Button>
                </div>
              )}
            </>
          )
        )}
      </div>

      {(
        <RedirectEditor
          api={api}
          state={usable}
          rule={editing}
          onClose={() => {
            setEditing(null);
            if (navState.edit) nav({ section: "redirects", filter: navState.filter });
          }}
          onSaved={() => void redirects.reload()}
        />
      )}
      <ImportDialog api={api} state={usable} open={importing} onOpenChange={setImporting} onDone={() => void redirects.reload()} />

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete {selected.size} redirect{selected.size === 1 ? "" : "s"}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Visitors using these old URLs get a 404 page once you publish. You can undo this from Activity.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={deleteSelected} disabled={busy}>
              Delete redirects
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Hop visual (shared by editor and tester)                            */
/* ------------------------------------------------------------------ */

export function HopTrail({ url, rules, livePages }: { url: string; rules: RedirectRule[]; livePages: Set<string> | undefined }) {
  const res = resolve(url, rules, livePages);
  const isLive = livePages?.has(normalizePath(url).toLowerCase());
  if (!url.trim()) return null;
  return (
    <div className="flex flex-col gap-2" aria-live="polite">
      <ol className="flex flex-col">
        <li className="flex items-center gap-2 py-1">
          <span className="size-2 shrink-0 rounded-full bg-neutral" />
          <PathText>{normalizePath(url)}</PathText>
        </li>
        {res.hops.map((h, i) => (
          <li key={i} className="flex flex-col border-l border-border-color-a11y py-1 pl-3" style={{ marginLeft: 3 }}>
            <span className="text-xs text-subtle-text">
              {REDIRECT_TYPE_LABEL[h.rule.type]}, in {h.rule.mapName}
            </span>
            <PathText>{h.to}</PathText>
          </li>
        ))}
      </ol>
      {res.loop ? (
        <Verdict tone="danger" text="Loops forever. Browsers show an error." />
      ) : res.hops.length === 0 ? (
        <Verdict tone={isLive ? "success" : "neutral"} text={isLive ? "No redirect. This is a live page." : "No redirect matches this URL."} />
      ) : res.landsOnPage === false ? (
        <Verdict tone="danger" text={`Ends at ${res.final}, which isn’t a live page.`} />
      ) : res.hops.length > 1 ? (
        <Verdict tone="warning" text={`Lands on a page after ${res.hops.length} hops. One is better.`} />
      ) : (
        <Verdict tone="success" text={isExternal(res.final) ? "Leaves the site in one hop." : "Lands on a live page in one hop."} />
      )}
    </div>
  );
}

function Verdict({ tone, text }: { tone: "success" | "warning" | "danger" | "neutral"; text: string }) {
  return (
    <p
      className={cn(
        "flex items-center gap-2 rounded-md px-3 py-2 text-md",
        tone === "success" && "bg-success-bg text-success-fg",
        tone === "warning" && "bg-warning-bg text-warning-fg",
        tone === "danger" && "bg-danger-bg text-danger-fg",
        tone === "neutral" && "bg-neutral-bg text-neutral-fg",
      )}
    >
      <Icon path={tone === "danger" ? mdiCloseCircle : mdiCheckCircle} className="size-4 shrink-0" />
      {text}
    </p>
  );
}

export function TesterDialog({ state, open, onOpenChange }: { state: RedirectState | undefined; open: boolean; onOpenChange: (o: boolean) => void }) {
  const [url, setUrl] = useState("");
  const live = state?.livePages ? new Set(state.livePages.map((p) => p.route.toLowerCase())) : undefined;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Test a URL</DialogTitle>
          <DialogDescription>See every hop a visitor takes, using the redirects saved in Sitecore.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <Input
            autoFocus
            value={url}
            onChange={(e) => setUrl(e.target.value.replace(/^https?:\/\/[^/]+/i, ""))}
            placeholder="/old-page or a full URL"
            className="font-path"
            aria-label="URL to test"
          />
          {state ? <HopTrail url={url} rules={state.rules} livePages={live} /> : <Skeleton className="h-16 w-full" />}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */
/* Editor                                                              */
/* ------------------------------------------------------------------ */

function RedirectEditor({
  api,
  state,
  rule,
  onClose,
  onSaved,
}: {
  api: SitecoreApi;
  state: RedirectState;
  rule: RedirectRule | "new" | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isNew = rule === "new";
  const existing = rule && rule !== "new" ? rule : null;
  const [source, setSource] = useState("");
  const [target, setTarget] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const managed = state.maps.find((m) => m.managed);

  useEffect(() => {
    setSource(existing?.source ?? "");
    setTarget(existing?.target ?? "");
  }, [rule]); // eslint-disable-line react-hooks/exhaustive-deps

  const live = state.livePages ? new Set(state.livePages.map((p) => p.route.toLowerCase())) : undefined;
  const cleanSource = isPattern(source) ? source.trim() : normalizePath(source);
  const cleanTarget = isExternal(target) ? target.trim() : normalizePath(target);

  // Simulate the rule set after saving, so checks reflect the edit.
  const simulated = useMemo(() => {
    const draft: RedirectRule = {
      key: existing?.key ?? "draft",
      mapId: existing?.mapId ?? managed?.id ?? "managed",
      mapName: existing?.mapName ?? managed?.name ?? api.settings.managedMapName,
      source: cleanSource,
      target: cleanTarget,
      type: existing?.type ?? managed?.type ?? api.settings.defaultRedirectType,
      preserveQueryString: true,
      managed: !existing || existing.managed,
    };
    const rest = state.rules.filter((r) => r.key !== existing?.key);
    // Managed-map rules are appended after others when new; keep original order for edits.
    const rules = existing ? state.rules.map((r) => (r.key === existing.key ? draft : r)) : [...rest, draft];
    return { draft, rules, issues: analyze(rules, state.livePages).get(draft.key) ?? [] };
  }, [cleanSource, cleanTarget, existing, managed, state, api.settings]);

  const blocking = !source.trim() || !target.trim() || simulated.issues.some((i) => i.code === "loop" || i.code === "self");
  const unchanged = existing && existing.source === cleanSource && existing.target === cleanTarget;

  const save = async () => {
    setSaving(true);
    try {
      if (isNew) {
        await addRedirects(api, [{ source: cleanSource, target: cleanTarget }], `Added redirect ${cleanSource}`);
      } else if (existing) {
        const changes: RedirectChange[] =
          existing.source === cleanSource
            ? [{ op: "retarget", mapId: existing.mapId, source: existing.source, from: existing.target, to: cleanTarget }]
            : [
                { op: "remove", mapId: existing.mapId, source: existing.source, target: existing.target },
                { op: "add", mapId: existing.mapId, source: cleanSource, target: cleanTarget },
              ];
        await editRedirects(api, changes, `Edited redirect ${cleanSource}`);
      }
      toast.success(isNew ? "Redirect added. Publish the redirect map to make it live." : "Redirect saved. Publish the redirect map to make it live.");
      onSaved();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn’t save");
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!existing) return;
    setSaving(true);
    try {
      await editRedirects(api, [{ op: "remove", mapId: existing.mapId, source: existing.source, target: existing.target }], `Deleted redirect ${existing.source}`, "redirect.delete");
      toast.success("Redirect deleted. Undo it from Activity.");
      onSaved();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn’t delete");
    } finally {
      setSaving(false);
      setConfirmDelete(false);
    }
  };

  return (
    <Sheet open={!!rule} onOpenChange={(o: boolean) => !o && onClose()}>
      <SheetContent className="flex w-full flex-col gap-0 sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{isNew ? "Add redirect" : "Edit redirect"}</SheetTitle>
          <SheetDescription>
            {isNew
              ? `Saved to “${managed?.name ?? api.settings.managedMapName}”${managed ? "" : ", created on first save"}.`
              : `In “${existing?.mapName}”. ${existing ? REDIRECT_TYPE_LABEL[existing.type] : ""} for every rule in this map.`}
          </SheetDescription>
        </SheetHeader>
        <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-4 py-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="rd-source">From</Label>
            <Input id="rd-source" value={source} onChange={(e) => setSource(e.target.value)} placeholder="/old-page" className="font-path" autoFocus spellCheck={false} />
            <p className="text-sm text-subtle-text">A path on this site. Patterns like ^/blog/(.*)$ also work.</p>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="rd-target">To</Label>
            <Input id="rd-target" value={target} onChange={(e) => setTarget(e.target.value)} placeholder="/new-page" className="font-path" list="live-routes" spellCheck={false} />
            <datalist id="live-routes">
              {state.livePages?.slice(0, 500).map((p) => <option key={p.id} value={p.route} />)}
            </datalist>
            <p className="text-sm text-subtle-text">A page on this site or a full https:// address. Use $1 to insert a pattern match.</p>
          </div>
          {source.trim() && target.trim() && (
            <div className="flex flex-col gap-3 border-t pt-4">
              <h3 className="text-md font-semibold">What visitors will see</h3>
              {simulated.issues
                .filter((i) => i.code === "shadowed" || i.code === "duplicate")
                .map((i) => (
                  <p key={i.code} className="rounded-md bg-warning-bg px-3 py-2 text-sm text-warning-fg">
                    {i.message}
                  </p>
                ))}
              {!isPattern(cleanSource) && <HopTrail url={cleanSource} rules={simulated.rules} livePages={live} />}
            </div>
          )}
        </div>
        <SheetFooter className="flex-row justify-between border-t">
          {existing ? (
            <Button variant="ghost" colorScheme="danger" onClick={() => setConfirmDelete(true)} disabled={saving}>
              Delete
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={save} disabled={blocking || !!unchanged || saving}>
              {saving && <Spinner className="text-inverse-text" />}
              {isNew ? "Add redirect" : "Save redirect"}
            </Button>
          </div>
        </SheetFooter>
        <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete this redirect?</AlertDialogTitle>
              <AlertDialogDescription>
                Visitors to {existing?.source} get a 404 page once you publish. You can undo this from Activity.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={remove}>Delete redirect</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </SheetContent>
    </Sheet>
  );
}

/* ------------------------------------------------------------------ */
/* Import                                                              */
/* ------------------------------------------------------------------ */

type RowStatus = { kind: "new" | "update" | "same" | "error" | "loop"; note: string };

function ImportDialog({
  api,
  state,
  open,
  onOpenChange,
  onDone,
}: {
  api: SitecoreApi;
  state: RedirectState;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onDone: () => void;
}) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const rows: CsvRow[] = useMemo(() => (text.trim() ? parseCsv(text) : []), [text]);
  const managed = state.maps.find((m) => m.managed);

  const statuses = useMemo(() => {
    const valid = rows.filter((r) => !r.error);
    const draft: RedirectRule[] = valid.map((r, i) => ({
      key: `import:${i}`,
      mapId: managed?.id ?? "managed",
      mapName: managed?.name ?? api.settings.managedMapName,
      source: r.source,
      target: r.target,
      type: api.settings.defaultRedirectType,
      preserveQueryString: true,
      managed: true,
    }));
    const others = state.rules.filter((r) => !draft.some((d) => d.source === r.source && r.managed));
    const issues = analyze([...others, ...draft], state.livePages);
    let vi = 0;
    return rows.map((r): RowStatus => {
      if (r.error) return { kind: "error", note: r.error };
      const key = `import:${vi++}`;
      const existing = state.rules.find((x) => x.source === r.source || (!isPattern(r.source) && samePath(x.source, r.source)));
      const iss = issues.get(key) ?? [];
      if (iss.some((i) => i.code === "loop")) return { kind: "loop", note: "Would create a loop" };
      if (existing && samePath(existing.target, r.target)) return { kind: "same", note: "Already exists" };
      const warn = iss.find((i) => i.code !== "duplicate")?.message;
      if (existing) return { kind: "update", note: warn ?? `Replaces → ${existing.target}` };
      return { kind: "new", note: warn ?? "" };
    });
  }, [rows, state, managed, api.settings]);

  const importable = rows.filter((_, i) => statuses[i].kind === "new" || statuses[i].kind === "update");
  const skipped = rows.length - importable.length;

  const run = async () => {
    setBusy(true);
    try {
      await addRedirects(api, importable.map((r) => ({ source: r.source, target: r.target })), `Imported ${importable.length} redirects`, "redirect.import");
      toast.success(`Imported ${importable.length} redirect${importable.length === 1 ? "" : "s"}. Publish the redirect map to make them live.`);
      setText("");
      onOpenChange(false);
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Import failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Import redirects</DialogTitle>
          <DialogDescription>
            Paste or upload a CSV with source and target columns. Rows are checked before anything is saved.
          </DialogDescription>
        </DialogHeader>
        {rows.length === 0 ? (
          <div className="flex flex-col gap-2">
            <Textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={8}
              className="font-path"
              placeholder={"source,target\n/old-page,/new-page\n/promo,https://shop.example.com"}
              aria-label="CSV content"
            />
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              className="sr-only"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (f) setText(await f.text());
              }}
            />
            <Button variant="outline" className="self-start" onClick={() => fileRef.current?.click()}>
              <Icon path={mdiTrayArrowUp} className="size-5" />
              Choose a CSV file
            </Button>
          </div>
        ) : (
          <div className="flex max-h-[50vh] flex-col gap-2 overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">Row</TableHead>
                  <TableHead>From</TableHead>
                  <TableHead>To</TableHead>
                  <TableHead className="w-56">Check</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r, i) => {
                  const s = statuses[i];
                  return (
                    <TableRow key={r.line} className={cn((s.kind === "error" || s.kind === "loop" || s.kind === "same") && "opacity-60")}>
                      <TableCell className="text-sm text-subtle-text tabular-nums">{r.line}</TableCell>
                      <TableCell>
                        <PathText>{r.source || "—"}</PathText>
                      </TableCell>
                      <TableCell>
                        <PathText>{r.target || "—"}</PathText>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col items-start gap-0.5">
                          <Badge
                            size="sm"
                            colorScheme={s.kind === "new" ? "success" : s.kind === "update" ? "primary" : s.kind === "same" ? "neutral" : "danger"}
                          >
                            {{ new: "New", update: "Update", same: "Skip", error: "Skip", loop: "Skip" }[s.kind]}
                          </Badge>
                          {s.note && <span className="text-xs text-subtle-text">{s.note}</span>}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
        <DialogFooter className="items-center sm:justify-between">
          <span className="text-sm text-subtle-text">
            {rows.length ? `${importable.length} to import${skipped ? `, ${skipped} skipped` : ""}` : ""}
          </span>
          <div className="flex gap-2">
            {rows.length > 0 && (
              <Button variant="ghost" onClick={() => setText("")}>
                Start over
              </Button>
            )}
            <Button disabled={!importable.length || busy} onClick={run}>
              {busy && <Spinner className="text-inverse-text" />}
              Import {importable.length || ""} redirect{importable.length === 1 ? "" : "s"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
