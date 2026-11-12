"use client";

import {
  mdiArrowDown,
  mdiArrowUp,
  mdiCheckCircle,
  mdiCloudOffOutline,
  mdiCloudUploadOutline,
  mdiDragVertical,
  mdiFileDocumentOutline,
  mdiImageOutline,
  mdiPuzzleOutline,
} from "@mdi/js";
import { useState } from "react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Skeleton } from "@/components/ui/skeleton";
import { useAsync } from "@/hooks/use-async";
import { useSettings } from "@/hooks/use-settings";
import { Icon } from "@/lib/icon";
import { publishWithDependencies, putBackOnline, reorderChildren, schedulePage, unpublishPage, type Step } from "@/lib/ops/operations";
import type { SitecoreApi } from "@/lib/sitecore/api";
import { parentRoute } from "@/lib/sitecore/routes";
import type { Dependency, PageRef } from "@/lib/sitecore/types";
import { cn } from "@/lib/utils";
import { FlowFrame } from "./flow-frame";
import type { FlowProps } from "./flows";
import { ReferencesRow } from "./impact";
import { PagePicker, type PickTarget } from "./page-picker";
import { ErrorNote, PathText, StepList, relativeTime } from "./primitives";
import { Spinner } from "./spinner";
import { UrlDiff } from "./url-diff";
import { useUndo } from "./use-undo";

function Done({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <Icon path={mdiCheckCircle} className="mt-0.5 size-6 shrink-0 text-success-fg" />
      <div>
        <h3 className="text-lg font-semibold">{title}</h3>
        {children && <p className="text-md text-subtle-text">{children}</p>}
      </div>
    </div>
  );
}

/* ================================================================== */
/* Publish with everything it needs                                    */
/* ================================================================== */

function DepGroup({ icon, title, items, note }: { icon: string; title: string; items: Dependency[]; note: string }) {
  const [open, setOpen] = useState(false);
  if (!items.length) return null;
  return (
    <div className="flex flex-col gap-1 py-2.5">
      <div className="flex items-center gap-3">
        <span className="flex size-7 items-center justify-center rounded-md bg-neutral-bg text-neutral-fg">
          <Icon path={icon} className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-md font-medium">
            {items.length} {title}
          </p>
          <p className="text-sm text-subtle-text">{note}</p>
        </div>
        <Button size="xs" variant="ghost" onClick={() => setOpen(!open)} aria-expanded={open}>
          {open ? "Hide" : "View"}
        </Button>
      </div>
      {open && (
        <ul className="ml-10 flex flex-col gap-0.5">
          {items.map((d) => (
            <li key={d.id} className="truncate text-sm" title={d.path}>
              {d.name} <span className="text-subtle-text">in {d.field}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function PublishFlow({ api, page, onClose, onChanged }: FlowProps) {
  const deps = useAsync(() => api.dependencies(page), [api, page.id]);
  const flags = useAsync(() => api.pageFlags(page.id), [api, page.id]);
  const [related, setRelated] = useState(true);
  const [sub, setSub] = useState(false);
  const [pick, setPick] = useState<Set<string> | null>(null);
  const [state, setState] = useState<"edit" | "running" | "done">("edit");
  const list = deps.data ?? [];
  const content = list.filter((d) => d.kind === "content");
  const media = list.filter((d) => d.kind === "media");
  const pages = list.filter((d) => d.kind === "page");
  const offline = pages.filter((p) => p.live === false);
  const chosen = pick ?? new Set(offline.map((p) => p.id));
  const langs = api.publishLanguages;

  const run = async () => {
    setState("running");
    try {
      await publishWithDependencies(api, { page, related, subItems: sub, pageIds: [...chosen] });
      setState("done");
      onChanged("renamed");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Publishing failed");
      setState("edit");
    }
  };

  return (
    <FlowFrame
      title="Publish"
      stages={[]}
      stage={0}
      onBack={state === "running" ? undefined : onClose}
      footer={
        state === "done" ? (
          <Button onClick={onClose}>Done</Button>
        ) : (
          <>
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={run} disabled={state === "running" || !page.permissions.canPublish || flags.data?.neverPublish}>
              {state === "running" ? <Spinner className="text-inverse-text" /> : <Icon path={mdiCloudUploadOutline} className="size-5" />}
              Publish {1 + chosen.size} page{chosen.size ? "s" : ""}
            </Button>
          </>
        )
      }
    >
      {state === "done" ? (
        <Done title="Publishing started">Changes reach the live site in a minute or two.</Done>
      ) : (
        <div className="flex flex-col gap-4">
          <p className="text-md text-subtle-text">
            {page.displayName} in {langs.length === 1 ? langs[0] : `all ${langs.length} languages`}.
          </p>
          {flags.data?.neverPublish && (
            <Alert variant="warning">
              <AlertDescription>This page is taken offline, so publishing won’t make it live. Put it back online first.</AlertDescription>
            </Alert>
          )}
          {!page.permissions.canPublish && (
            <Alert variant="warning">
              <AlertDescription>You don’t have publishing rights for this site.</AlertDescription>
            </Alert>
          )}
          <section className="flex flex-col">
            <h3 className="text-sm font-semibold text-subtle-text">What this page uses</h3>
            {deps.loading && !deps.data ? (
              <Skeleton className="mt-2 h-20 w-full" />
            ) : deps.error ? (
              <ErrorNote error={deps.error} onRetry={deps.reload} />
            ) : list.length === 0 ? (
              <p className="py-2 text-md text-subtle-text">Nothing else: it only uses its own text.</p>
            ) : (
              <div className="flex flex-col divide-y">
                <DepGroup icon={mdiPuzzleOutline} title={`content item${content.length === 1 ? "" : "s"} used by components`} items={content} note="Banners, cards and other component content." />
                <DepGroup icon={mdiImageOutline} title={`image${media.length === 1 ? "" : "s"}`} items={media} note="From the media library." />
                <DepGroup icon={mdiFileDocumentOutline} title={`linked page${pages.length === 1 ? "" : "s"}`} items={pages} note={offline.length ? `${offline.length} not published yet.` : "All live."} />
              </div>
            )}
          </section>
          <label className="flex items-start gap-2.5">
            <Checkbox checked={related} onCheckedChange={(c: boolean | "indeterminate") => setRelated(c === true)} className="mt-0.5" />
            <span className="flex flex-col">
              <Label className="text-md">Publish its content and images too</Label>
              <span className="text-sm text-subtle-text">Only what changed is sent. Recommended, so nothing on the page is missing or out of date.</span>
            </span>
          </label>
          {page.hasChildren && (
            <label className="flex items-start gap-2.5">
              <Checkbox checked={sub} onCheckedChange={(c: boolean | "indeterminate") => setSub(c === true)} className="mt-0.5" />
              <span className="flex flex-col">
                <Label className="text-md">Include the pages below it</Label>
                <span className="text-sm text-subtle-text">Needed after a move or URL change.</span>
              </span>
            </label>
          )}
          {offline.length > 0 && (
            <section className="flex flex-col gap-2 rounded-lg border p-3">
              <h3 className="text-md font-semibold">Linked pages that aren’t live</h3>
              <p className="text-sm text-subtle-text">Links to these show a 404 page until they’re published.</p>
              {offline.map((p) => (
                <label key={p.id} className="flex items-center gap-2.5">
                  <Checkbox
                    checked={chosen.has(p.id)}
                    onCheckedChange={() => {
                      const s = new Set(chosen);
                      if (s.has(p.id)) s.delete(p.id);
                      else s.add(p.id);
                      setPick(s);
                    }}
                  />
                  <span className="text-md">{p.name}</span>
                </label>
              ))}
            </section>
          )}
        </div>
      )}
    </FlowFrame>
  );
}

/* ================================================================== */
/* Take offline / put back online                                      */
/* ================================================================== */

export function UnpublishFlow({ api, page, onClose, onChanged }: FlowProps) {
  const [settings] = useSettings();
  const flags = useAsync(() => api.pageFlags(page.id), [api, page.id]);
  const refs = useAsync(() => api.findReferrers(page.id), [api, page.id]);
  const [dest, setDest] = useState<"parent" | "other" | "none">(page.route === "/" ? "none" : "parent");
  const [other, setOther] = useState<PickTarget | null>(null);
  const [removeRedirects, setRemoveRedirects] = useState(true);
  const [stage, setStage] = useState<"edit" | "running" | "done" | "error">("edit");
  const [steps, setSteps] = useState<Step[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [entry, setEntry] = useState<Awaited<ReturnType<typeof unpublishPage>>["entry"] | null>(null);
  const { undo, busy } = useUndo(api, () => {
    onChanged("undone");
    onClose();
  });
  const offline = flags.data?.neverPublish;
  const to = dest === "parent" ? parentRoute(page.route) : dest === "other" ? (other?.route ?? null) : null;

  const takeOffline = async () => {
    setStage("running");
    setError(null);
    try {
      const r = await unpublishPage(api, { page, redirectTo: to, redirect: { enabled: true, includeChildren: settings.redirectChildren, collapseChains: settings.collapseChains } }, setSteps);
      setEntry(r.entry);
      setStage("done");
      onChanged("renamed");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStage("error");
    }
  };
  const bringBack = async () => {
    setStage("running");
    try {
      await putBackOnline(api, { page, removeRedirects });
      setStage("done");
      onChanged("renamed");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStage("error");
    }
  };

  if (flags.loading && !flags.data) {
    return (
      <FlowFrame title="Take offline" stages={[]} stage={0} onBack={onClose}>
        <Skeleton className="h-32 w-full" />
      </FlowFrame>
    );
  }

  if (offline) {
    return (
      <FlowFrame
        title="Put back online"
        stages={[]}
        stage={0}
        onBack={stage === "running" ? undefined : onClose}
        footer={
          stage === "done" ? (
            <Button onClick={onClose}>Done</Button>
          ) : (
            <>
              <Button variant="ghost" onClick={onClose}>
                Cancel
              </Button>
              <Button onClick={bringBack} disabled={stage === "running"}>
                {stage === "running" && <Spinner className="text-inverse-text" />}
                Put back online
              </Button>
            </>
          )
        }
      >
        {stage === "done" ? (
          <Done title="Back online">Publishing started. The page returns to {page.route} in a minute or two.</Done>
        ) : (
          <div className="flex flex-col gap-4">
            <p className="text-md text-subtle-text">This page is kept in Sitecore but not published. Putting it back turns publishing on and publishes it with its content.</p>
            <label className="flex items-start gap-2.5">
              <Checkbox checked={removeRedirects} onCheckedChange={(c: boolean | "indeterminate") => setRemoveRedirects(c === true)} className="mt-0.5" />
              <span className="flex flex-col">
                <Label className="text-md">Remove redirects from {page.route}</Label>
                <span className="text-sm text-subtle-text">Otherwise visitors keep being sent elsewhere.</span>
              </span>
            </label>
            {error && <ErrorNote error={error} />}
          </div>
        )}
      </FlowFrame>
    );
  }

  return (
    <FlowFrame
      title="Take offline"
      stages={[]}
      stage={0}
      onBack={stage === "running" ? undefined : onClose}
      footer={
        stage === "edit" || stage === "error" ? (
          <>
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button colorScheme="danger" onClick={takeOffline} disabled={dest === "other" && !other}>
              <Icon path={mdiCloudOffOutline} className="size-5" />
              Take offline
            </Button>
          </>
        ) : stage === "done" ? (
          <>
            {entry && (
              <Button variant="outline" disabled={busy} onClick={() => void undo(entry)}>
                Undo
              </Button>
            )}
            <Button onClick={onClose}>Done</Button>
          </>
        ) : null
      }
    >
      {stage === "edit" || stage === "error" ? (
        <div className="flex flex-col gap-5">
          <p className="text-md text-subtle-text">
            Removes the page from the live site but keeps it in Sitecore with all its content. Put it back online any time.
            {page.hasChildren ? " The pages below it go offline too." : ""}
          </p>
          <UrlDiff from={page.route} to={to} toLabel="Visitors go to" emptyLabel="A 404 page" />
          <div className="divide-y">
            <ReferencesRow loading={refs.loading} error={refs.error} items={refs.data?.items} verb="delete" />
          </div>
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-md font-semibold">Where should visitors go?</legend>
            <RadioGroup value={dest} onValueChange={(v: string) => setDest(v as typeof dest)} className="gap-2">
              {page.route !== "/" && (
                <label className="flex items-center gap-2.5">
                  <RadioGroupItem value="parent" />
                  <span className="text-md">
                    The parent page <PathText className="text-subtle-text">{parentRoute(page.route)}</PathText>
                  </span>
                </label>
              )}
              <label className="flex items-center gap-2.5">
                <RadioGroupItem value="other" />
                <span className="text-md">Another page</span>
              </label>
              {dest === "other" && <PagePicker api={api} page={page} mode="page" selected={other?.id ?? null} onSelect={setOther} className="ml-6 h-60" />}
              <label className="flex items-center gap-2.5">
                <RadioGroupItem value="none" />
                <span className="text-md">Nowhere. Show a 404 page.</span>
              </label>
            </RadioGroup>
          </fieldset>
          {error && <ErrorNote error={error} />}
        </div>
      ) : stage === "running" ? (
        <StepList steps={steps} />
      ) : (
        <Done title="Taken offline">Publishing started, so the page leaves the live site in a minute or two. It’s still in Sitecore.</Done>
      )}
    </FlowFrame>
  );
}

/* ================================================================== */
/* Schedule                                                            */
/* ================================================================== */

const dateValue = (iso?: string) => (iso ? iso.slice(0, 10) : "");

export function ScheduleFlow({ api, page, onClose, onChanged }: FlowProps) {
  const flags = useAsync(() => api.pageFlags(page.id), [api, page.id]);
  const [from, setFrom] = useState<string | null>(null);
  const [to, setTo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const f = from ?? dateValue(flags.data?.publishFrom);
  const t = to ?? dateValue(flags.data?.publishTo);
  const invalid = !!(f && t && f >= t);

  const save = async (clear = false) => {
    setBusy(true);
    try {
      await schedulePage(api, { page, from: clear || !f ? null : new Date(`${f}T00:00:00`), to: clear || !t ? null : new Date(`${t}T23:59:59`) });
      toast.success(clear ? "Schedule cleared" : "Schedule saved. Publish the page to apply it.");
      onChanged("renamed");
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn’t save the schedule");
    } finally {
      setBusy(false);
    }
  };

  return (
    <FlowFrame
      title="Schedule"
      stages={[]}
      stage={0}
      onBack={onClose}
      footer={
        <>
          {(flags.data?.publishFrom || flags.data?.publishTo) && (
            <Button variant="ghost" colorScheme="danger" onClick={() => save(true)} disabled={busy}>
              Clear schedule
            </Button>
          )}
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => save()} disabled={busy || invalid || (!f && !t)}>
            {busy && <Spinner className="text-inverse-text" />}
            Save schedule
          </Button>
        </>
      }
    >
      {flags.loading && !flags.data ? (
        <Skeleton className="h-32 w-full" />
      ) : (
        <div className="flex flex-col gap-5">
          <p className="text-md text-subtle-text">Set when this page may appear on the live site. It applies to every language.</p>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="sch-from">Go live on</Label>
              <Input id="sch-from" type="date" value={f} onChange={(e) => setFrom(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="sch-to">Take down on</Label>
              <Input id="sch-to" type="date" value={t} onChange={(e) => setTo(e.target.value)} />
            </div>
          </div>
          {invalid && <p className="text-sm text-danger-fg">The take-down date has to be after the go-live date.</p>}
          <Alert>
            <AlertDescription>
              Sitecore applies these dates when the page is next published after each date. If your environment doesn’t publish on a schedule, publish the page on those days, or ask your
              developers to set up scheduled publishing.
            </AlertDescription>
          </Alert>
        </div>
      )}
    </FlowFrame>
  );
}

/* ================================================================== */
/* Reorder subpages                                                    */
/* ================================================================== */

export function ReorderFlow({ api, page, onClose, onChanged }: FlowProps) {
  const kids = useAsync(() => api.listChildren(page.id), [api, page.id]);
  const [order, setOrder] = useState<{ id: string; name: string; route: string }[] | null>(null);
  const [drag, setDrag] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const list = order ?? (kids.data ?? []).map((k) => ({ id: k.id, name: k.displayName, route: k.route }));
  const changed = order && kids.data && order.some((o, i) => o.id !== kids.data![i]?.id);

  const move = (from: number, to: number) => {
    if (to < 0 || to >= list.length || from === to) return;
    const next = [...list];
    const [it] = next.splice(from, 1);
    next.splice(to, 0, it);
    setOrder(next);
  };

  const save = async () => {
    setBusy(true);
    try {
      const entry = await reorderChildren(api, { parent: page, ordered: list });
      toast.success("Order saved", { action: { label: "Publish", onClick: () => void api.publish([page.id], { subItems: true }).then(() => toast.success("Publishing started")) } });
      void entry;
      onChanged("renamed");
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn’t save the order");
    } finally {
      setBusy(false);
    }
  };

  return (
    <FlowFrame
      title="Reorder subpages"
      stages={[]}
      stage={0}
      onBack={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save} disabled={!changed || busy}>
            {busy && <Spinner className="text-inverse-text" />}
            Save order
          </Button>
        </>
      }
    >
      {kids.loading && !kids.data ? (
        <Skeleton className="h-40 w-full" />
      ) : kids.error ? (
        <ErrorNote error={kids.error} onRetry={kids.reload} />
      ) : list.length < 2 ? (
        <p className="text-md text-subtle-text">There’s nothing to reorder below {page.displayName}.</p>
      ) : (
        <div className="flex flex-col gap-3">
          <p className="text-md text-subtle-text">Drag pages, or use the arrows. This is the order navigation and lists show them in.</p>
          <ol className="flex flex-col gap-1.5">
            {list.map((k, i) => (
              <li
                key={k.id}
                draggable
                onDragStart={() => setDrag(i)}
                onDragOver={(e) => {
                  e.preventDefault();
                  if (drag !== null && drag !== i) {
                    move(drag, i);
                    setDrag(i);
                  }
                }}
                onDragEnd={() => setDrag(null)}
                className={cn("flex items-center gap-2 rounded-lg border bg-body-bg px-2 py-1.5", drag === i && "border-primary shadow-sm")}
              >
                <Icon path={mdiDragVertical} className="size-5 cursor-grab text-subtle-text" />
                <span className="w-6 text-sm text-subtle-text tabular-nums">{i + 1}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-md">{k.name}</span>
                  <PathText className="text-subtle-text">{k.route}</PathText>
                </span>
                <Button size="icon-xs" variant="ghost" aria-label={`Move ${k.name} up`} disabled={i === 0} onClick={() => move(i, i - 1)}>
                  <Icon path={mdiArrowUp} className="size-4" />
                </Button>
                <Button size="icon-xs" variant="ghost" aria-label={`Move ${k.name} down`} disabled={i === list.length - 1} onClick={() => move(i, i + 1)}>
                  <Icon path={mdiArrowDown} className="size-4" />
                </Button>
              </li>
            ))}
          </ol>
        </div>
      )}
    </FlowFrame>
  );
}

/** Status badges for publishing settings (offline, scheduled). */
export function PublishingBadges({ api, page, rev = 0 }: { api: SitecoreApi; page: PageRef; rev?: number }) {
  const flags = useAsync(() => api.pageFlags(page.id), [api, page.id, rev]);
  const f = flags.data;
  if (!f) return null;
  const fmt = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" });
  return (
    <>
      {f.neverPublish && (
        <Badge colorScheme="danger">
          <Icon path={mdiCloudOffOutline} className="size-3" />
          Offline
        </Badge>
      )}
      {f.publishFrom && new Date(f.publishFrom) > new Date() && <Badge colorScheme="primary">Goes live {fmt(f.publishFrom)}</Badge>}
      {f.publishTo && <Badge colorScheme={new Date(f.publishTo) < new Date() ? "warning" : "neutral"}>{new Date(f.publishTo) < new Date() ? `Ended ${relativeTime(f.publishTo)}` : `Until ${fmt(f.publishTo)}`}</Badge>}
    </>
  );
}
