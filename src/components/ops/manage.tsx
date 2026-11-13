"use client";

import {
  mdiCheckCircle,
  mdiCloudCheckOutline,
  mdiCloudOffOutline,
  mdiContentCopy,
  mdiFileDocumentPlusOutline,
  mdiOpenInNew,
  mdiPlus,
  mdiRestore,
  mdiTranslate,
  mdiTrashCanOutline,
} from "@mdi/js";
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
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useAsync } from "@/hooks/use-async";
import { usePageBuilderLink } from "@/hooks/use-sitecore";
import { logActivity } from "@/lib/activity";
import { Icon } from "@/lib/icon";
import { useMarketplace } from "@/lib/marketplace/provider";
import type { SitecoreApi } from "@/lib/sitecore/api";
import { childRoute } from "@/lib/sitecore/routes";
import { hasBlockingIssue, lintSlug, slugify } from "@/lib/sitecore/slug";
import type { PageRef, PageVersion } from "@/lib/sitecore/types";
import { cn } from "@/lib/utils";
import { toText, wordDiff } from "@/lib/diff";
import { makeContentLocal } from "@/lib/ops/operations";
import { BrandCheck } from "./brand-check";
import { FlowFrame } from "./flow-frame";
import type { FlowProps } from "./flows";
import { CopyButton, ErrorNote, ImpactRow, PathText, SectionLabel, relativeTime } from "./primitives";
import { PublishPanel } from "./publish-panel";
import { SlugField } from "./slug-field";
import { Spinner } from "./spinner";

/* ================================================================== */
/* Create subpage                                                      */
/* ================================================================== */

export function CreatePageFlow({ api, page, onClose, onChanged, onOpenPage }: FlowProps) {
  const templates = useAsync(() => api.insertOptions(page.id, page.language), [api, page.id]);
  const siblings = useAsync(() => api.siblingNames(page.id), [api, page.id]);
  const [templateId, setTemplateId] = useState<string>("");
  const [displayName, setDisplayName] = useState("");
  const [name, setName] = useState("");
  const [nameTouched, setNameTouched] = useState(false);
  const [state, setState] = useState<"edit" | "running" | "done">("edit");
  const [error, setError] = useState<Error | null>(null);
  const [created, setCreated] = useState<{ id: string; route: string } | null>(null);

  const tpl = templateId || templates.data?.[0]?.id || "";
  const slug = nameTouched ? name : slugify(displayName);
  const blocked = !tpl || hasBlockingIssue(lintSlug(slug, { siblings: siblings.data }));

  const run = async () => {
    setState("running");
    setError(null);
    try {
      const r = await api.createPage({ parentId: page.id, name: slug, templateId: tpl, displayName: displayName.trim() || slug, language: page.language });
      const fresh = await api.getPage(r.pageId, page.language);
      setCreated({ id: fresh.id, route: fresh.route });
      logActivity({ kind: "duplicate", site: api.site.name, title: `Created ${displayName || slug}`, pageId: fresh.id, toRoute: fresh.route, undo: [{ kind: "duplicate", pageId: fresh.id }] });
      setState("done");
      onChanged("duplicated", { pageId: fresh.id });
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
      setState("edit");
    }
  };

  return (
    <FlowFrame
      title="Create subpage"
      stages={["Details", "Done"]}
      stage={state === "done" ? 1 : 0}
      onBack={state === "running" ? undefined : onClose}
      footer={
        state === "done" && created ? (
          <>
            <Button variant="ghost" onClick={onClose}>
              Done
            </Button>
            {onOpenPage && <Button onClick={() => onOpenPage(created.id)}>Open the new page</Button>}
          </>
        ) : (
          <>
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button disabled={blocked || state === "running"} onClick={run}>
              {state === "running" ? <Spinner className="text-inverse-text" /> : <Icon path={mdiFileDocumentPlusOutline} className="size-5" />}
              Create page
            </Button>
          </>
        )
      }
    >
      {state === "done" && created ? (
        <div className="flex flex-col gap-4">
          <div className="flex items-start gap-3">
            <Icon path={mdiCheckCircle} className="mt-0.5 size-6 shrink-0 text-success-fg" />
            <div>
              <h3 className="text-lg font-semibold">Page created</h3>
              <p className="text-md text-subtle-text">
                At <PathText className="text-body-text">{created.route}</PathText>. Add content, then publish.
              </p>
            </div>
          </div>
          <PublishPanel api={api} items={[{ id: created.id, label: displayName || slug, hint: "The new page", defaultChecked: false }]} canPublish={page.permissions.canPublish} />
        </div>
      ) : templates.loading && !templates.data ? (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
        </div>
      ) : templates.error ? (
        <ErrorNote error={templates.error} onRetry={templates.reload} />
      ) : !templates.data?.length ? (
        <Alert variant="warning">
          <AlertDescription>Pages can’t be created under {page.displayName}. Its template has no page insert options.</AlertDescription>
        </Alert>
      ) : (
        <div className="flex flex-col gap-5">
          <p className="text-md text-subtle-text">
            New page under <span className="font-medium text-body-text">{page.displayName}</span>.
          </p>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="new-template">Page type</Label>
            <Select value={tpl} onValueChange={setTemplateId}>
              <SelectTrigger id="new-template">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {templates.data.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="new-display">Page title</Label>
            <Input id="new-display" value={displayName} onChange={(e) => setDisplayName(e.target.value)} autoFocus placeholder="Winter camping guide" />
            <BrandCheck api={api} text={displayName} onApply={setDisplayName} />
          </div>
          <SlugField
            parentRoute={page.route}
            value={slug}
            onChange={(v) => {
              setNameTouched(true);
              setName(v);
            }}
            siblings={siblings.data}
          />
          {slug && !hasBlockingIssue(lintSlug(slug, { siblings: siblings.data })) && (
            <p className="-mt-3 text-sm text-subtle-text">
              URL <PathText className="text-body-text">{childRoute(page.route, slug)}</PathText>
            </p>
          )}
          {error && <ErrorNote error={error} />}
        </div>
      )}
    </FlowFrame>
  );
}

/* ================================================================== */
/* Languages & versions                                                */
/* ================================================================== */

function LanguageRow({ api, page, language, sourceLanguage }: { api: SitecoreApi; page: PageRef; language: string; sourceLanguage: string }) {
  const versions = useAsync(() => api.pageVersions(page.id, language), [api, page.id, language]);
  const live = useAsync(() => api.liveState(page.id, language), [api, page.id, language]);
  const [busy, setBusy] = useState<string | null>(null);
  const list = versions.data ?? [];
  const latest = list[0];
  const isSource = language === sourceLanguage;

  const act = async (key: string, fn: () => Promise<unknown>, success: string, title: string) => {
    setBusy(key);
    try {
      await fn();
      toast.success(success);
      logActivity({ kind: "publish", site: api.site.name, title, pageId: page.id, publish: [{ id: page.id, label: page.displayName, kind: "page" }] });
      await versions.reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "That didn’t work");
    } finally {
      setBusy(null);
    }
  };

  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-md font-semibold">{language}</span>
          {isSource && <Badge size="sm">Current</Badge>}
          {live.data === true && (
            <Badge size="sm" colorScheme="success">
              <Icon path={mdiCloudCheckOutline} className="size-3" />
              Live
            </Badge>
          )}
          {live.data === false && list.length > 0 && (
            <Badge size="sm" colorScheme="warning">
              <Icon path={mdiCloudOffOutline} className="size-3" />
              Not published
            </Badge>
          )}
        </div>
        <p className="text-sm text-subtle-text">
          {versions.loading && !versions.data
            ? "Checking…"
            : versions.error
              ? versions.error.message
              : latest
                ? `v${latest.version}${latest.updatedAt ? `, edited ${relativeTime(latest.updatedAt)}` : ""}${latest.updatedBy ? ` by ${latest.updatedBy}` : ""}`
                : "Not translated yet"}
        </p>
      </div>
      {!versions.loading && !isSource && (
        <div className="flex flex-wrap gap-1.5">
          <Button
            size="xs"
            variant={list.length ? "ghost" : "default"}
            colorScheme={list.length ? "primary" : "ai"}
            disabled={!!busy}
            onClick={() =>
              act(
                "translate",
                () => api.translatePage(page.id, sourceLanguage, language, list.length > 0),
                list.length ? `New ${language} translation added as a version` : `Translated into ${language}. Review it before publishing.`,
                `Translated ${page.displayName} into ${language}`,
              )
            }
          >
            {busy === "translate" ? <Spinner className="size-3.5" /> : <Icon path={mdiTranslate} className="size-4" />}
            {list.length ? "Re-translate" : `Translate from ${sourceLanguage}`}
          </Button>
          {list.length === 0 && (
            <Button size="xs" variant="ghost" disabled={!!busy} onClick={() => act("add", () => api.addLanguage(page.id, language), `Added an empty ${language} version`, `Added ${language} to ${page.displayName}`)}>
              {busy === "add" && <Spinner className="size-3.5" />}
              Start empty
            </Button>
          )}
        </div>
      )}
    </li>
  );
}

export function LanguagesContent({ api, page }: { api: SitecoreApi; page: PageRef }) {
  const languages = api.publishLanguages;
  return (
    <div className="flex flex-col gap-3">
      <p className="text-md text-subtle-text">
        The URL is shared by every language. AI translation copies the {page.language} content into a new version for review. Versions are in the Versions tab.
      </p>
      <ul className="flex flex-col divide-y">
        {languages.map((l) => (
          <LanguageRow key={l} api={api} page={page} language={l} sourceLanguage={page.language} />
        ))}
      </ul>
    </div>
  );
}

export function LanguagesView({ api, page, onClose }: FlowProps) {
  return (
    <FlowFrame title="Languages and versions" stages={[]} stage={0} onBack={onClose}>
      <div className="flex flex-col gap-4">
        <LanguagesContent api={api} page={page} />
        <PublishPanel api={api} items={[{ id: page.id, label: page.displayName, hint: `All ${api.publishLanguages.length} languages` }]} canPublish={page.permissions.canPublish} />
      </div>
    </FlowFrame>
  );
}

/* ================================================================== */
/* Components & content                                                */
/* ================================================================== */

export function ComponentsContent({ api, page }: { api: SitecoreApi; page: PageRef }) {
  const comps = useAsync(() => api.components(page.id, page.language, page.path), [api, page.id]);
  const groups = useMemo(() => {
    const g = new Map<string, NonNullable<typeof comps.data>>();
    for (const c of comps.data ?? []) {
      // Dynamic placeholders look like /headless-header/header-navigation-4: show the readable last part.
      const key = (c.placeholder || "Other").split("/").filter(Boolean).pop() ?? "Other";
      g.set(key, [...(g.get(key) ?? []), c]);
    }
    return [...g.entries()];
  }, [comps.data]);
  const sharedList = (comps.data ?? []).filter((c) => c.scope === "shared");
  const shared = sharedList.length;
  // Header, footer and similar site-wide parts are meant to be shared: don't offer them by default.
  const isChrome = (c: { placeholder?: string }) => /header|footer|nav|menu/i.test(c.placeholder ?? "");
  const [localBusy, setLocalBusy] = useState<string | null>(null);
  const makeLocal = async (list: typeof sharedList, key: string) => {
    setLocalBusy(key);
    try {
      const r = await makeContentLocal(api, { page, components: list.map((c) => ({ name: c.name, dataSource: c.dataSource!, dataSourcePath: c.dataSourcePath })) });
      if (r.made.length) toast.success(`${r.made.join(", ")} now use${r.made.length === 1 ? "s" : ""} this page’s own copy. Undo it from Activity.`);
      if (r.skipped.length) toast.error(`${r.skipped.join(", ")}: set in the page design, so change it there.`);
      await comps.reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn’t copy the content");
    } finally {
      setLocalBusy(null);
    }
  };
  const label = { local: "This page only", shared: "Shared", none: "No content", unknown: "Not found" } as const;
  const tone = { local: "teal", shared: "yellow", none: "neutral", unknown: "danger" } as const;

  return (
    <>
      {comps.loading && !comps.data ? (
        <div className="flex flex-col gap-2">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      ) : comps.error ? (
        <ErrorNote error={comps.error} onRetry={comps.reload} />
      ) : !comps.data?.length ? (
        <p className="text-md text-subtle-text">This page has no components yet.</p>
      ) : (
        <div className="flex flex-col gap-5">
          {shared > 0 && (
            <ImpactRow
              icon={mdiContentCopy}
              tone="warning"
              title={`${shared} component${shared === 1 ? " uses" : "s use"} shared content`}
              action={
                sharedList.some((c) => !isChrome(c)) && (
                  <Button size="xs" variant="outline" disabled={!!localBusy} onClick={() => makeLocal(sharedList.filter((c) => !isChrome(c)), "all")}>
                    {localBusy === "all" && <Spinner className="size-3.5" />}
                    Make all local
                  </Button>
                )
              }
            >
              Editing that content changes every page that uses it. Make it local to give this page its own copy. Headers and footers are left shared.
            </ImpactRow>
          )}
          {groups.map(([ph, list]) => (
            <section key={ph} className="flex flex-col">
              <SectionLabel>{ph}</SectionLabel>
              <ul className="flex flex-col divide-y rounded-lg border">
                {list.map((c) => (
                  <li key={c.id} className="flex items-center gap-3 px-3 py-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-md font-medium">{c.name}</p>
                      {(c.dataSourcePath || c.dataSource) && (
                        <p className="font-path truncate text-xs text-subtle-text" title={c.dataSourcePath ?? c.dataSource}>
                          {(c.dataSourcePath ?? c.dataSource)!.replace(/^\/sitecore\/content\/[^/]+\/[^/]+/i, "…")}
                        </p>
                      )}
                    </div>
                    {c.scope === "shared" && (
                      <Button size="xs" variant="ghost" colorScheme="primary" disabled={!!localBusy} onClick={() => makeLocal([c], c.id)}>
                        {localBusy === c.id && <Spinner className="size-3.5" />}
                        Make local
                      </Button>
                    )}
                    <Badge size="sm" colorScheme={tone[c.scope]}>
                      {label[c.scope]}
                    </Badge>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </>
  );
}

export function ComponentsView({ api, page, onClose }: FlowProps) {
  return (
    <FlowFrame title="Components and content" stages={[]} stage={0} onBack={onClose}>
      <ComponentsContent api={api} page={page} />
    </FlowFrame>
  );
}

/* ================================================================== */
/* Details, live status, preview                                       */
/* ================================================================== */

function Fact({ label, children, copy }: { label: string; children: React.ReactNode; copy?: string }) {
  return (
    <div className="grid grid-cols-[7.5rem_1fr] items-start gap-2 py-2">
      <dt className="text-sm text-subtle-text">{label}</dt>
      <dd className="flex min-w-0 items-start gap-1 text-md">
        <span className="min-w-0 break-words">{children}</span>
        {copy && <CopyButton value={copy} label={`Copy ${label.toLowerCase()}`} />}
      </dd>
    </div>
  );
}

const fmt = (iso?: string) => (iso ? new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "—");

export function DetailsContent({ api, page, showLive = true }: { api: SitecoreApi; page: PageRef; showLive?: boolean }) {
  const { client } = useMarketplace();
  const builderLink = usePageBuilderLink()({ id: page.id, language: page.language, version: page.meta?.version }, api.site.name);
  const live = useAsync(() => api.liveState(page.id, page.language), [api, page.id]);
  const preview = useAsync(() => api.previewUrl(page.id, page.language).catch(() => null), [api, page.id]);
  const [shot, setShot] = useState<{ loading: boolean; src: string | null; error: string | null }>({ loading: false, src: null, error: null });
  const m = page.meta ?? {};

  const loadShot = async () => {
    setShot({ loading: true, src: null, error: null });
    try {
      const src = await api.screenshot(page.id, m.version ?? 1, page.language);
      setShot({ loading: false, src, error: src ? null : "No screenshot returned" });
    } catch (e) {
      setShot({ loading: false, src: null, error: e instanceof Error ? e.message : "Screenshot failed" });
    }
  };

  const open = (url: string) => {
    void client?.navigateToExternalUrl(url, true).catch(() => window.open(url, "_blank", "noopener"));
  };

  return (
    <>
      <div className="flex flex-col gap-5">
        {showLive && (
        <div
          className={cn(
            "flex items-center gap-3 rounded-lg px-3 py-2.5",
            live.data === true ? "bg-success-bg text-success-fg" : live.data === false ? "bg-warning-bg text-warning-fg" : "bg-neutral-bg text-neutral-fg",
          )}
        >
          <Icon path={live.data === false ? mdiCloudOffOutline : mdiCloudCheckOutline} className="size-5" />
          <span className="flex-1 text-md font-medium">
            {live.loading && live.data === undefined ? "Checking the live site…" : live.data === true ? `Live in ${page.language}` : live.data === false ? `Not published in ${page.language}` : "Live status unavailable"}
          </span>
        </div>
        )}

        <div className="flex flex-col gap-2">
          <div className="aspect-[16/10] overflow-hidden rounded-lg border bg-subtle-bg">
            {shot.src ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={shot.src} alt={`Screenshot of ${page.displayName}`} className="size-full object-cover object-top" />
            ) : (
              <div className="flex size-full flex-col items-center justify-center gap-2 p-4 text-center">
                {shot.loading ? <Spinner className="size-6" /> : <p className="text-sm text-subtle-text">{shot.error ?? "See how this page looks right now."}</p>}
                {!shot.loading && (
                  <Button size="sm" variant="outline" onClick={loadShot}>
                    Take screenshot
                  </Button>
                )}
              </div>
            )}
          </div>
          {preview.data && (
            <Button variant="ghost" size="sm" className="self-start" onClick={() => open(preview.data!)}>
              <Icon path={mdiOpenInNew} className="size-4" />
              Open preview
            </Button>
          )}
        </div>

        <dl className="flex flex-col divide-y">
          <Fact label="URL path" copy={page.route}>
            <PathText>{page.route}</PathText>
          </Fact>
          {m.url && /^https?:\/\//i.test(m.url) && (
            <Fact label="Live URL" copy={m.url}>
              <PathText>{m.url}</PathText>
            </Fact>
          )}
          <Fact label="Page type">{page.templateName ?? "—"}</Fact>
          <Fact label="Language">{page.language}</Fact>
          <Fact label="Version">{m.version ? `v${m.version}` : "—"}</Fact>
          <Fact label="Workflow">{page.workflowState ?? "No workflow"}</Fact>
          <Fact label="Created">
            {fmt(m.createdAt)}
            {m.createdBy ? ` by ${m.createdBy}` : ""}
          </Fact>
          <Fact label="Last edited">
            {fmt(m.updatedAt)}
            {m.updatedBy ? ` by ${m.updatedBy}` : ""}
          </Fact>
          {(m.validFrom || m.validTo || m.isPublishable === false) && (
            <Fact label="Publishing">
              {m.isPublishable === false ? "Publishing is turned off for this page. " : ""}
              {m.validFrom ? `From ${fmt(m.validFrom)}. ` : ""}
              {m.validTo ? `Until ${fmt(m.validTo)}.` : ""}
            </Fact>
          )}
          {builderLink && (
            <Fact label="Page builder" copy={builderLink.url}>
              <button type="button" onClick={builderLink.open} className="text-left text-primary-fg underline">
                Open in Page builder
              </button>
            </Fact>
          )}
          <Fact label="Item ID" copy={page.id}>
            <PathText>{page.id}</PathText>
          </Fact>
          <Fact label="Item path" copy={page.path}>
            <PathText>{page.path}</PathText>
          </Fact>
        </dl>
      </div>
    </>
  );
}

export function DetailsView({ api, page, onClose }: FlowProps) {
  return (
    <FlowFrame title="Details and live status" stages={[]} stage={0} onBack={onClose}>
      <div className="flex flex-col gap-5">
        <DetailsContent api={api} page={page} />
        <PublishPanel api={api} items={[{ id: page.id, label: page.displayName, hint: "All languages" }]} canPublish={page.permissions.canPublish} />
      </div>
    </FlowFrame>
  );
}

/* ================================================================== */
/* Versions: history, compare, restore                                 */
/* ================================================================== */

function DiffText({ before, after }: { before: string; after: string }) {
  const parts = wordDiff(toText(before), toText(after));
  return (
    <p className="text-md leading-relaxed whitespace-pre-wrap">
      {parts.map((p, i) =>
        p.type === "same" ? (
          <span key={i}>{p.text}</span>
        ) : p.type === "del" ? (
          <del key={i} className="rounded-sm bg-danger-bg text-danger-fg decoration-1">
            {p.text}
          </del>
        ) : (
          <ins key={i} className="rounded-sm bg-success-bg text-success-fg no-underline">
            {p.text}
          </ins>
        ),
      )}
    </p>
  );
}

export function VersionsContent({ api, page }: { api: SitecoreApi; page: PageRef }) {
  const languages = api.publishLanguages;
  const [language, setLanguage] = useState(page.language);
  const versions = useAsync(() => api.pageVersions(page.id, language), [api, page.id, language]);
  const list = versions.data ?? [];
  const [a, setA] = useState<number | null>(null);
  const [b, setB] = useState<number | null>(null);
  const older = a ?? list[1]?.version ?? null;
  const newer = b ?? list[0]?.version ?? null;
  const diff = useAsync(
    older && newer && older !== newer
      ? async () => {
          const [x, y] = await Promise.all([api.pageFields(page.id, language, older), api.pageFields(page.id, language, newer)]);
          const names = [...new Set([...x.fields, ...y.fields].map((f) => f.name))];
          const val = (s: typeof x, n: string) => s.fields.find((f) => f.name === n)?.value ?? "";
          const changed = names.filter((n) => val(x, n) !== val(y, n)).map((n) => ({ name: n, before: val(x, n), after: val(y, n) }));
          return { changed, unchanged: names.length - changed.length, layoutChanged: x.layout !== y.layout };
        }
      : null,
    [api, page.id, language, older, newer],
  );
  const [confirm, setConfirm] = useState<{ kind: "restore" | "delete"; v: PageVersion } | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async () => {
    if (!confirm) return;
    const { kind, v } = confirm;
    setConfirm(null);
    setBusy(true);
    try {
      if (kind === "restore") {
        await api.addVersion(page.id, language, v.version, `Restored from v${v.version}`);
        logActivity({ kind: "publish", site: api.site.name, title: `Restored ${page.displayName} (${language}) from v${v.version}`, pageId: page.id, publish: [{ id: page.id, label: page.displayName, kind: "page" }] });
        toast.success(`v${v.version} restored as a new version. Publish to make it live.`);
      } else {
        await api.deleteVersion(page.id, v.version, language);
        logActivity({ kind: "publish", site: api.site.name, title: `Deleted ${language} v${v.version} of ${page.displayName}`, pageId: page.id, publish: [{ id: page.id, label: page.displayName, kind: "page" }] });
        toast.success(`Deleted v${v.version}`);
      }
      setA(null);
      setB(null);
      await versions.reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "That didn’t work");
    } finally {
      setBusy(false);
    }
  };

  const vSelect = (value: number | null, onChange: (v: number) => void, label: string) => (
    <Select value={value ? String(value) : undefined} onValueChange={(v: string) => onChange(Number(v))}>
      <SelectTrigger className="h-8 w-24" aria-label={label}>
        <SelectValue placeholder="—" />
      </SelectTrigger>
      <SelectContent>
        {list.map((v) => (
          <SelectItem key={v.version} value={String(v.version)}>
            v{v.version}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-2">
        {languages.length > 1 && (
          <Select
            value={language}
            onValueChange={(l: string) => {
              setLanguage(l);
              setA(null);
              setB(null);
            }}
          >
            <SelectTrigger className="h-8 w-32" aria-label="Language">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {languages.map((l) => (
                <SelectItem key={l} value={l}>
                  {l}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {list.length > 1 && (
          <>
            <span className="text-md text-subtle-text">Compare</span>
            {vSelect(older, setA, "Older version")}
            <span className="text-md text-subtle-text">with</span>
            {vSelect(newer, setB, "Newer version")}
          </>
        )}
      </div>

      {versions.loading && !versions.data ? (
        <Skeleton className="h-24 w-full" />
      ) : versions.error ? (
        <ErrorNote error={versions.error} onRetry={versions.reload} />
      ) : list.length === 0 ? (
        <p className="text-md text-subtle-text">No {language} version yet. Add one from the Languages tab.</p>
      ) : (
        <>
          {list.length > 1 && (
            <section className="flex flex-col gap-3 rounded-lg border p-4">
              {diff.loading && !diff.data ? (
                <Skeleton className="h-16 w-full" />
              ) : diff.error ? (
                <ErrorNote error={diff.error} onRetry={diff.reload} />
              ) : older === newer ? (
                <p className="text-md text-subtle-text">Pick two different versions.</p>
              ) : diff.data && diff.data.changed.length === 0 && !diff.data.layoutChanged ? (
                <p className="text-md text-subtle-text">
                  v{older} and v{newer} have the same content.
                </p>
              ) : (
                diff.data && (
                  <>
                    <p className="text-sm text-subtle-text">
                      {diff.data.changed.length} field{diff.data.changed.length === 1 ? "" : "s"} changed, {diff.data.unchanged} unchanged
                      {diff.data.layoutChanged ? ". Components or layout changed too." : "."}
                    </p>
                    {diff.data.changed.map((f) => (
                      <div key={f.name} className="flex flex-col gap-1 border-t pt-3">
                        <h4 className="text-sm font-semibold">{f.name}</h4>
                        <DiffText before={f.before} after={f.after} />
                      </div>
                    ))}
                  </>
                )
              )}
            </section>
          )}

          <ul className="flex flex-col divide-y rounded-lg border">
            {list.map((v, i) => (
              <li key={v.version} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
                <span className="w-10 text-md font-semibold tabular-nums">v{v.version}</span>
                <span className="min-w-0 flex-1 text-sm text-subtle-text">
                  {i === 0 && <span className="mr-1.5 font-medium text-body-text">Latest.</span>}
                  {v.name ? <span className="text-body-text">{v.name}. </span> : null}
                  {v.updatedAt ? relativeTime(v.updatedAt) : ""}
                  {v.updatedBy ? ` by ${v.updatedBy}` : ""}
                </span>
                {i > 0 && (
                  <Button size="xs" variant="ghost" colorScheme="primary" disabled={busy} onClick={() => setConfirm({ kind: "restore", v })}>
                    <Icon path={mdiRestore} className="size-4" />
                    Restore
                  </Button>
                )}
                <Button size="icon-xs" variant="ghost" colorScheme="danger" aria-label={`Delete v${v.version}`} disabled={busy} onClick={() => setConfirm({ kind: "delete", v })}>
                  <Icon path={mdiTrashCanOutline} className="size-4" />
                </Button>
              </li>
            ))}
          </ul>
        </>
      )}

      <AlertDialog open={!!confirm} onOpenChange={(o: boolean) => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirm?.kind === "restore" ? `Restore v${confirm.v.version}?` : `Delete v${confirm?.v.version}?`}</AlertDialogTitle>
            <AlertDialogDescription>
              {confirm?.kind === "restore"
                ? `This adds a new version with v${confirm.v.version}’s content and layout. Nothing is deleted, so you can switch back any time.`
                : list.length === 1
                  ? `This is the only ${language} version, so the page disappears from the ${language} site after publishing.`
                  : "Other versions stay. This can’t be undone here."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={run}>{confirm?.kind === "restore" ? "Restore as new version" : "Delete version"}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export function VersionsView({ api, page, onClose }: FlowProps) {
  return (
    <FlowFrame title="Version history" stages={[]} stage={0} onBack={onClose}>
      <VersionsContent api={api} page={page} />
    </FlowFrame>
  );
}
