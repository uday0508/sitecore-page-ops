"use client";

import { mdiCheckCircle, mdiContentDuplicate, mdiInformationOutline, mdiUndoVariant } from "@mdi/js";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useAsync } from "@/hooks/use-async";
import { useSettings } from "@/hooks/use-settings";
import { useRedirectState } from "@/hooks/use-sitecore";
import { Icon } from "@/lib/icon";
import {
  changeUrl,
  deletePage,
  duplicatePage,
  makeContentLocal,
  movePage,
  type OpResult,
  type RedirectOptions,
  type Step,
} from "@/lib/ops/operations";
import type { SitecoreApi } from "@/lib/sitecore/api";
import { isPattern, planUrlChange, samePath } from "@/lib/sitecore/redirects";
import { childRoute, parentRoute } from "@/lib/sitecore/routes";
import { hasBlockingIssue, lintSlug } from "@/lib/sitecore/slug";
import type { PageRef } from "@/lib/sitecore/types";
import { BrandCheck } from "./brand-check";
import { FlowFrame } from "./flow-frame";
import { ReferencesRow, UrlChangeImpact } from "./impact";
import { PagePicker, type PickTarget } from "./page-picker";
import { ErrorNote, ImpactRow, PathText, StepList } from "./primitives";
import { PublishPanel, type PublishItem } from "./publish-panel";
import { RedirectControls } from "./redirect-controls";
import { SlugField } from "./slug-field";
import { Spinner } from "./spinner";
import { UrlDiff } from "./url-diff";
import { useUndo } from "./use-undo";

export type ChangeKind = "renamed" | "moved" | "duplicated" | "deleted" | "undone";
export interface FlowProps {
  api: SitecoreApi;
  page: PageRef;
  onClose: () => void;
  /** Called after Sitecore content changed, so the host can refresh. */
  onChanged: (kind: ChangeKind, info?: { pageId?: string; parentId?: string }) => void;
  /** Ask the host to open a page (e.g. the new duplicate). */
  onOpenPage?: (id: string) => void;
}

type Stage = "edit" | "review" | "running" | "done" | "error";

function useRedirectDefaults(): [RedirectOptions, (r: RedirectOptions) => void] {
  const [settings] = useSettings();
  const [r, setR] = useState<RedirectOptions>({ enabled: true, includeChildren: settings.redirectChildren, collapseChains: settings.collapseChains });
  useEffect(() => {
    setR((prev) => ({ ...prev, includeChildren: settings.redirectChildren, collapseChains: settings.collapseChains }));
  }, [settings.redirectChildren, settings.collapseChains]);
  return [r, setR];
}

function publishItemsFor(page: PageRef, result: OpResult, refs: { id: string; name: string; kind: string }[] | undefined): PublishItem[] {
  const [pageId, ...mapIds] = result.publishIds;
  const items: PublishItem[] = [];
  if (pageId)
    items.push({
      id: pageId,
      label: page.hasChildren ? `${page.displayName} and the pages below it` : page.displayName,
      hint: result.newRoute ? `Goes live at ${result.newRoute}` : undefined,
      subItems: page.hasChildren,
    });
  mapIds.forEach((id, i) => items.push({ id, label: mapIds.length > 1 ? `Redirect map ${i + 1}` : "Redirects", hint: "Sends the old URL to the new one" }));
  const pages = (refs ?? []).filter((r) => r.kind === "page");
  pages.forEach((r) => items.push({ id: r.id, label: r.name, hint: "Links here, shows the new URL after publishing", defaultChecked: pages.length <= 8 }));
  return items;
}

function DoneHeader({ title, children }: { title: string; children?: React.ReactNode }) {
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
/* Change URL                                                          */
/* ================================================================== */

export function ChangeUrlFlow({ api, page, onClose, onChanged, initialName }: FlowProps & { initialName?: string }) {
  const [stage, setStage] = useState<Stage>("edit");
  const [name, setName] = useState(initialName ?? page.name);
  const [displayName, setDisplayName] = useState(page.displayName);
  const [redirect, setRedirect] = useRedirectDefaults();
  const [steps, setSteps] = useState<Step[]>([]);
  const [result, setResult] = useState<OpResult | null>(null);
  const [error, setError] = useState<Error | null>(null);

  const siblings = useAsync(page.parentId ? () => api.siblingNames(page.parentId!) : null, [api, page.parentId]);
  const redirects = useRedirectState(api);
  const refs = useAsync(() => api.findReferrers(page.id), [api, page.id]);
  const { undo, busy: undoing } = useUndo(api, () => {
    onChanged("undone");
    onClose();
  });

  const predicted = childRoute(parentRoute(page.route), name);
  const urlChanges = !samePath(predicted, page.route);
  const issues = lintSlug(name, { siblings: siblings.data, current: page.name });
  const blocked = hasBlockingIssue(issues);
  const nothingToDo = name === page.name && displayName.trim() === page.displayName;
  const plan = useMemo(
    () =>
      redirects.data && urlChanges
        ? planUrlChange({
            from: page.route,
            to: predicted,
            rules: redirects.data.rules,
            includeChildren: redirect.includeChildren && page.hasChildren,
            collapseChains: redirect.collapseChains,
          })
        : null,
    [redirects.data, urlChanges, page.route, predicted, redirect.includeChildren, redirect.collapseChains, page.hasChildren],
  );

  if (page.route === "/") {
    return (
      <FlowFrame title="Change URL" stages={["Edit", "Review", "Done"]} stage={0} onBack={onClose}>
        <Alert>
          <AlertDescription>The home page URL comes from the site’s host name, so it can’t be changed here.</AlertDescription>
        </Alert>
      </FlowFrame>
    );
  }

  const run = async () => {
    setStage("running");
    setError(null);
    try {
      const r = await changeUrl(api, { page, newName: name.trim(), newDisplayName: displayName.trim(), redirect }, setSteps);
      setResult(r);
      setStage("done");
      onChanged("renamed");
      toast.success("URL changed", { action: { label: "Undo", onClick: () => void undo(r.entry) } });
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
      setStage("error");
    }
  };

  const stageIndex = { edit: 0, review: 1, running: 1, error: 1, done: 2 }[stage];

  return (
    <FlowFrame
      title="Change URL"
      stages={["Edit", "Review", "Done"]}
      stage={stageIndex}
      onBack={stage === "review" || stage === "error" ? () => setStage("edit") : stage === "edit" || stage === "done" ? onClose : undefined}
      footer={
        stage === "edit" ? (
          <>
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button disabled={blocked || nothingToDo} onClick={() => setStage("review")}>
              Review changes
            </Button>
          </>
        ) : stage === "review" ? (
          <>
            <Button variant="ghost" onClick={() => setStage("edit")}>
              Back
            </Button>
            <Button onClick={run}>Change URL</Button>
          </>
        ) : stage === "error" ? (
          <>
            <Button variant="ghost" onClick={() => setStage("edit")}>
              Edit
            </Button>
            <Button onClick={run}>Try again</Button>
          </>
        ) : stage === "done" && result ? (
          <>
            {result.entry.undo && (
              <Button variant="outline" disabled={undoing} onClick={() => void undo(result.entry)}>
                {undoing ? <Spinner /> : <Icon path={mdiUndoVariant} className="size-5" />}
                Undo
              </Button>
            )}
            <Button onClick={onClose}>Done</Button>
          </>
        ) : null
      }
    >
      {stage === "edit" && (
        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <SlugField
              parentRoute={parentRoute(page.route)}
              value={name}
              onChange={setName}
              siblings={siblings.data}
              current={page.name}
              autoFocus
            />
            {urlChanges && !blocked && (
              <p className="text-sm text-subtle-text">
                New URL <PathText className="text-body-text">{predicted}</PathText>
              </p>
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="display-name">Display name</Label>
            <Input id="display-name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
            <p className="text-sm text-subtle-text">
              Shown in navigation and breadcrumbs, in {page.language} only. The URL change applies to every language.
            </p>
            <BrandCheck api={api} text={displayName} onApply={setDisplayName} />
          </div>
          {urlChanges && <RedirectControls value={redirect} onChange={setRedirect} hasChildren={page.hasChildren} />}
        </div>
      )}

      {stage === "review" && (
        <div className="flex flex-col gap-4">
          {urlChanges ? (
            <UrlDiff from={page.route} to={predicted} />
          ) : (
            <Alert>
              <AlertDescription>Only the display name changes. The URL stays {page.route}.</AlertDescription>
            </Alert>
          )}
          {urlChanges && (
            <UrlChangeImpact
              page={page}
              plan={plan}
              redirectsOn={redirect.enabled}
              redirectsLoading={redirects.loading}
              references={{ loading: refs.loading, error: refs.error, items: refs.data?.items }}
            />
          )}
          {redirects.error && redirect.enabled && <ErrorNote error={redirects.error} onRetry={redirects.reload} />}
        </div>
      )}

      {(stage === "running" || stage === "error") && (
        <div className="flex flex-col gap-4">
          <StepList steps={steps} />
          {error && <ErrorNote error={error} />}
          {error && steps.some((s) => s.status === "done") && (
            <p className="text-sm text-subtle-text">Steps marked done were saved. Trying again picks up from the current state.</p>
          )}
        </div>
      )}

      {stage === "done" && result && (
        <div className="flex flex-col gap-4">
          <DoneHeader title="URL changed">
            {result.entry.detail ? `Saved, with ${result.entry.detail}.` : "Saved."} The live site updates when you publish.
          </DoneHeader>
          {result.newRoute && !samePath(result.newRoute, page.route) && <UrlDiff from={page.route} to={result.newRoute} animate={false} />}
          <PublishPanel api={api} items={publishItemsFor(page, result, refs.data?.items)} canPublish={page.permissions.canPublish} />
        </div>
      )}
    </FlowFrame>
  );
}

/* ================================================================== */
/* Move                                                                */
/* ================================================================== */

export function MoveFlow({ api, page, onClose, onChanged }: FlowProps) {
  const [stage, setStage] = useState<Stage>("edit");
  const [target, setTarget] = useState<PickTarget | null>(null);
  const [redirect, setRedirect] = useRedirectDefaults();
  const [steps, setSteps] = useState<Step[]>([]);
  const [result, setResult] = useState<OpResult | null>(null);
  const [error, setError] = useState<Error | null>(null);

  const redirects = useRedirectState(api);
  const refs = useAsync(() => api.findReferrers(page.id), [api, page.id]);
  const targetKids = useAsync(target ? () => api.siblingNames(target.id) : null, [api, target?.id]);
  const { undo, busy: undoing } = useUndo(api, () => {
    onChanged("undone");
    onClose();
  });

  const predicted = target ? childRoute(target.route, page.name) : null;
  const clash = !!targetKids.data?.some((n) => n.toLowerCase() === page.name.toLowerCase());
  const plan = useMemo(
    () =>
      redirects.data && predicted
        ? planUrlChange({
            from: page.route,
            to: predicted,
            rules: redirects.data.rules,
            includeChildren: redirect.includeChildren && page.hasChildren,
            collapseChains: redirect.collapseChains,
          })
        : null,
    [redirects.data, predicted, page.route, redirect.includeChildren, redirect.collapseChains, page.hasChildren],
  );

  const run = async () => {
    if (!target) return;
    setStage("running");
    setError(null);
    try {
      const r = await movePage(api, { page, targetParentId: target.id, targetName: target.name, redirect }, setSteps);
      setResult(r);
      setStage("done");
      onChanged("moved");
      toast.success("Page moved", { action: { label: "Undo", onClick: () => void undo(r.entry) } });
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
      setStage("error");
    }
  };
  const stageIndex = { edit: 0, review: 1, running: 1, error: 1, done: 2 }[stage];

  return (
    <FlowFrame
      title="Move page"
      stages={["Choose", "Review", "Done"]}
      stage={stageIndex}
      onBack={stage === "review" || stage === "error" ? () => setStage("edit") : stage === "edit" || stage === "done" ? onClose : undefined}
      footer={
        stage === "edit" ? (
          <>
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button disabled={!target || clash || targetKids.loading} onClick={() => setStage("review")}>
              Review move
            </Button>
          </>
        ) : stage === "review" ? (
          <>
            <Button variant="ghost" onClick={() => setStage("edit")}>
              Back
            </Button>
            <Button onClick={run}>Move page</Button>
          </>
        ) : stage === "error" ? (
          <>
            <Button variant="ghost" onClick={() => setStage("edit")}>
              Choose again
            </Button>
            <Button onClick={run}>Try again</Button>
          </>
        ) : stage === "done" && result ? (
          <>
            <Button variant="outline" disabled={undoing} onClick={() => void undo(result.entry)}>
              {undoing ? <Spinner /> : <Icon path={mdiUndoVariant} className="size-5" />}
              Undo
            </Button>
            <Button onClick={onClose}>Done</Button>
          </>
        ) : null
      }
    >
      {stage === "edit" && (
        <div className="flex h-full min-h-0 flex-col gap-4">
          <p className="text-md text-subtle-text">
            Choose the page that <span className="font-medium text-body-text">{page.displayName}</span> moves under.
          </p>
          <PagePicker api={api} page={page} selected={target?.id ?? null} onSelect={setTarget} className="min-h-[16rem] flex-1" />
          {target && predicted && (
            <div className="flex flex-col gap-2">
              {clash ? (
                <ErrorNote error={`“${target.name}” already has a page named “${page.name}”. Change this page’s URL first.`} />
              ) : (
                <p className="text-sm text-subtle-text">
                  New URL <PathText className="text-body-text">{predicted}</PathText>
                </p>
              )}
            </div>
          )}
          <RedirectControls value={redirect} onChange={setRedirect} hasChildren={page.hasChildren} />
        </div>
      )}
      {stage === "review" && predicted && (
        <div className="flex flex-col gap-4">
          <UrlDiff from={page.route} to={predicted} />
          <UrlChangeImpact
            page={page}
            plan={plan}
            redirectsOn={redirect.enabled}
            redirectsLoading={redirects.loading}
            references={{ loading: refs.loading, error: refs.error, items: refs.data?.items }}
          />
        </div>
      )}
      {(stage === "running" || stage === "error") && (
        <div className="flex flex-col gap-4">
          <StepList steps={steps} />
          {error && <ErrorNote error={error} />}
        </div>
      )}
      {stage === "done" && result && (
        <div className="flex flex-col gap-4">
          <DoneHeader title="Page moved">The live site updates when you publish.</DoneHeader>
          {result.newRoute && <UrlDiff from={page.route} to={result.newRoute} animate={false} />}
          <PublishPanel api={api} items={publishItemsFor(page, result, refs.data?.items)} canPublish={page.permissions.canPublish} />
        </div>
      )}
    </FlowFrame>
  );
}

/* ================================================================== */
/* Duplicate                                                           */
/* ================================================================== */

export function DuplicateFlow({ api, page, onClose, onChanged, onOpenPage }: FlowProps) {
  const [stage, setStage] = useState<Stage>("edit");
  const [name, setName] = useState(`${page.name}-copy`);
  const [displayName, setDisplayName] = useState(`${page.displayName} (copy)`);
  const [steps, setSteps] = useState<Step[]>([]);
  const [result, setResult] = useState<OpResult | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const siblings = useAsync(page.parentId ? () => api.siblingNames(page.parentId!) : null, [api, page.parentId]);
  const { undo, busy: undoing } = useUndo(api, () => {
    onChanged("undone");
    onClose();
  });
  const blocked = hasBlockingIssue(lintSlug(name, { siblings: siblings.data }));
  const [ownCopies, setOwnCopies] = useState(false);

  const run = async () => {
    setStage("running");
    setError(null);
    try {
      const r = await duplicatePage(api, { page, newName: name.trim(), displayName: displayName.trim() || name.trim() }, setSteps);
      if (ownCopies && r.newPageId) {
        const copy = await api.getPage(r.newPageId, page.language);
        const shared = (await api.components(copy.id, copy.language, copy.path)).filter((c) => c.scope === "shared" && !/header|footer|nav|menu/i.test(c.placeholder ?? ""));
        if (shared.length) await makeContentLocal(api, { page: copy, components: shared.map((c) => ({ name: c.name, dataSource: c.dataSource!, dataSourcePath: c.dataSourcePath })) });
      }
      setResult(r);
      setStage("done");
      onChanged("duplicated", { pageId: r.newPageId });
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
      setStage("error");
    }
  };

  return (
    <FlowFrame
      title="Duplicate page"
      stages={["Name", "Done"]}
      stage={stage === "done" ? 1 : 0}
      onBack={stage === "running" ? undefined : stage === "error" ? () => setStage("edit") : onClose}
      footer={
        stage === "edit" ? (
          <>
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button disabled={blocked || siblings.loading} onClick={run}>
              <Icon path={mdiContentDuplicate} className="size-5" />
              Duplicate page
            </Button>
          </>
        ) : stage === "error" ? (
          <>
            <Button variant="ghost" onClick={() => setStage("edit")}>
              Edit
            </Button>
            <Button onClick={run}>Try again</Button>
          </>
        ) : stage === "done" && result ? (
          <>
            <Button variant="outline" disabled={undoing} onClick={() => void undo(result.entry)}>
              {undoing ? <Spinner /> : <Icon path={mdiUndoVariant} className="size-5" />}
              Remove copy
            </Button>
            {onOpenPage && result.newPageId ? <Button onClick={() => onOpenPage(result.newPageId!)}>Open the copy</Button> : <Button onClick={onClose}>Done</Button>}
          </>
        ) : null
      }
    >
      {stage === "edit" && (
        <div className="flex flex-col gap-5">
          <SlugField parentRoute={parentRoute(page.route)} value={name} onChange={setName} siblings={siblings.data} autoFocus label="URL name for the copy" />
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="dup-display">Display name</Label>
            <Input id="dup-display" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
            <BrandCheck api={api} text={displayName} onApply={setDisplayName} />
          </div>
          <div className="flex flex-col divide-y rounded-lg border px-3">
            <ImpactRow icon={mdiContentDuplicate} tone="primary" title="Copies the content, layout and child pages">
              The copy is created next to the original and isn’t published.
            </ImpactRow>
            <ImpactRow icon={mdiInformationOutline} tone="warning" title="Shared components stay shared">
              Components that use content from the site’s Data folder point at the same items. Editing them in the copy changes the
              original too.
            </ImpactRow>
          </div>
          <label className="flex items-start gap-2.5">
            <Checkbox checked={ownCopies} onCheckedChange={(c: boolean | "indeterminate") => setOwnCopies(c === true)} className="mt-0.5" />
            <span className="flex flex-col">
              <Label className="text-md">Give the copy its own content</Label>
              <span className="text-sm text-subtle-text">Copies shared component content into the new page, so you can edit it freely. Headers and footers stay shared.</span>
            </span>
          </label>
        </div>
      )}
      {(stage === "running" || stage === "error") && (
        <div className="flex flex-col gap-4">
          <StepList steps={steps} />
          {error && <ErrorNote error={error} />}
        </div>
      )}
      {stage === "done" && result && (
        <div className="flex flex-col gap-4">
          <DoneHeader title="Copy created">
            At <PathText className="text-body-text">{result.newRoute ?? ""}</PathText>. Review it before publishing.
          </DoneHeader>
          <PublishPanel
            api={api}
            items={[{ id: result.newPageId!, label: displayName, hint: "The new page", defaultChecked: false }]}
            canPublish={page.permissions.canPublish}
          />
        </div>
      )}
    </FlowFrame>
  );
}

/* ================================================================== */
/* Delete                                                              */
/* ================================================================== */

export function DeleteFlow({ api, page, onClose, onChanged }: FlowProps) {
  const [settings] = useSettings();
  const [stage, setStage] = useState<Stage>("review");
  const [destMode, setDestMode] = useState<"parent" | "other" | "none">(page.route === "/" ? "none" : "parent");
  const [other, setOther] = useState<PickTarget | null>(null);
  const [confirm, setConfirm] = useState("");
  const [redirect] = useRedirectDefaults();
  const [steps, setSteps] = useState<Step[]>([]);
  const [result, setResult] = useState<OpResult | null>(null);
  const [error, setError] = useState<Error | null>(null);

  const refs = useAsync(() => api.findReferrers(page.id), [api, page.id]);
  const redirects = useRedirectState(api);
  const parent = parentRoute(page.route);
  const { undo, busy: undoing } = useUndo(api, () => {
    onChanged("undone");
    onClose();
  });
  const dest = destMode === "parent" ? parent : destMode === "other" ? (other?.route ?? null) : null;
  const incoming = (redirects.data?.rules ?? []).filter((r) => !isPattern(r.source) && samePath(r.target, page.route));
  const needsTyping = settings.requireTypedDeleteConfirm;
  const typedOk = !needsTyping || confirm.trim().toLowerCase() === page.name.toLowerCase();

  if (page.route === "/" || !page.permissions.canDelete) {
    return (
      <FlowFrame title="Delete page" stages={["Review", "Done"]} stage={0} onBack={onClose}>
        <Alert variant="warning">
          <AlertDescription>
            {page.route === "/" ? "The home page can’t be deleted." : "You don’t have permission to delete this page."}
          </AlertDescription>
        </Alert>
      </FlowFrame>
    );
  }

  const run = async () => {
    setStage("running");
    setError(null);
    try {
      const r = await deletePage(api, { page, redirectTo: dest, redirect }, setSteps);
      setResult(r);
      setStage("done");
      onChanged("deleted", { parentId: page.parentId });
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
      setStage("error");
    }
  };

  return (
    <FlowFrame
      title="Delete page"
      stages={["Review", "Done"]}
      stage={stage === "done" ? 1 : 0}
      onBack={stage === "running" ? undefined : stage === "error" ? () => setStage("review") : onClose}
      footer={
        stage === "review" ? (
          <>
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button colorScheme="danger" disabled={!typedOk || (destMode === "other" && !other)} onClick={run}>
              Delete page
            </Button>
          </>
        ) : stage === "error" ? (
          <>
            <Button variant="ghost" onClick={() => setStage("review")}>
              Back
            </Button>
            <Button colorScheme="danger" onClick={run}>
              Try again
            </Button>
          </>
        ) : stage === "done" ? (
          <>
            {result?.entry.undo && (
              <Button variant="outline" disabled={undoing} onClick={() => void undo(result.entry)}>
                {undoing ? <Spinner /> : <Icon path={mdiUndoVariant} className="size-5" />}
                Restore page
              </Button>
            )}
            <Button onClick={onClose}>Done</Button>
          </>
        ) : null
      }
    >
      {stage === "review" && (
        <div className="flex flex-col gap-5">
          <UrlDiff from={page.route} to={dest} toLabel="Visitors go to" emptyLabel="A 404 page" />
          <div className="flex flex-col divide-y">
            <ReferencesRow loading={refs.loading} error={refs.error} items={refs.data?.items} verb="delete" />
            {incoming.length > 0 && (
              <ImpactRow icon={mdiInformationOutline} tone={dest ? "primary" : "warning"} title={`${incoming.length} redirect${incoming.length === 1 ? "" : "s"} point here`}>
                {dest ? "They’ll be updated to the new destination." : "They’ll lead to a 404 page."}
              </ImpactRow>
            )}
            {page.hasChildren && (
              <ImpactRow icon={mdiInformationOutline} tone="danger" title="Pages below this one are deleted too">
                {dest ? "The redirect covers their URLs as well." : "Their URLs will show a 404 page."}
              </ImpactRow>
            )}
          </div>

          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-md font-semibold">Where should visitors go?</legend>
            <RadioGroup value={destMode} onValueChange={(v: string) => setDestMode(v as typeof destMode)} className="gap-2">
              <label className="flex items-start gap-2.5">
                <RadioGroupItem value="parent" className="mt-0.5" />
                <span className="text-md">
                  The parent page <PathText className="text-subtle-text">{parent}</PathText>
                </span>
              </label>
              <label className="flex items-start gap-2.5">
                <RadioGroupItem value="other" className="mt-0.5" />
                <span className="text-md">Another page</span>
              </label>
              {destMode === "other" && <PagePicker api={api} page={page} mode="page" selected={other?.id ?? null} onSelect={setOther} className="ml-6 h-64" />}
              <label className="flex items-start gap-2.5">
                <RadioGroupItem value="none" className="mt-0.5" />
                <span className="text-md">Nowhere. Show a 404 page.</span>
              </label>
            </RadioGroup>
          </fieldset>

          {needsTyping && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="confirm-delete">
                Type <span className="font-path font-semibold">{page.name}</span> to confirm
              </Label>
              <Input id="confirm-delete" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="off" spellCheck={false} />
              <p className="text-sm text-subtle-text">The page goes to the Page Operations bin. Restore it from Pages → Bin any time.</p>
            </div>
          )}
        </div>
      )}
      {(stage === "running" || stage === "error") && (
        <div className="flex flex-col gap-4">
          <StepList steps={steps} />
          {error && <ErrorNote error={error} />}
        </div>
      )}
      {stage === "done" && result && (
        <div className="flex flex-col gap-4">
          <DoneHeader title="Page deleted">
            In the bin, so you can restore it any time.{dest ? " Visitors to the old URL go to the new destination once you publish." : ""}
          </DoneHeader>
          <PublishPanel
            api={api}
            canPublish={page.permissions.canPublish}
            items={[
              { id: page.id, label: page.displayName, hint: "Publishing it now removes it from the live site", subItems: page.hasChildren },
              ...result.publishIds.map((id) => ({ id, label: "Redirects", hint: "Send the old URL to its new destination" })),
            ]}
          />
        </div>
      )}
    </FlowFrame>
  );
}
