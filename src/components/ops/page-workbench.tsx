"use client";

import {
  mdiAccountLockOutline,
  mdiArrowDecisionOutline,
  mdiChevronRight,
  mdiContentDuplicate,
  mdiEyeOffOutline,
  mdiFolderMoveOutline,
  mdiFormTextboxPassword,
  mdiFileDocumentPlusOutline,
  mdiCalendarClock,
  mdiCloudOffOutline,
  mdiCloudUploadOutline,
  mdiFindReplace,
  mdiHumanWheelchair,
  mdiSortVariant,
  mdiHistory,
  mdiInformationOutline,
  mdiPuzzleOutline,
  mdiTranslate,
  mdiLinkVariant,
  mdiProgressClock,
  mdiTrashCanOutline,
  mdiUndoVariant,
} from "@mdi/js";
import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useActivity } from "@/hooks/use-activity";
import { useAsync } from "@/hooks/use-async";
import { useRedirectState } from "@/hooks/use-sitecore";
import { Icon } from "@/lib/icon";
import { editRedirects } from "@/lib/ops/operations";
import { sameId, type SitecoreApi } from "@/lib/sitecore/api";
import { isPattern, samePath } from "@/lib/sitecore/redirects";
import { lastSegment } from "@/lib/sitecore/routes";
import { lintSlug } from "@/lib/sitecore/slug";
import type { PageRef } from "@/lib/sitecore/types";
import { cn } from "@/lib/utils";
import { ChangeUrlFlow, DeleteFlow, DuplicateFlow, MoveFlow, type ChangeKind } from "./flows";
import { ComponentsView, CreatePageFlow, DetailsView, LanguagesView, VersionsView } from "./manage";
import { PublishFlow, PublishingBadges, ReorderFlow, ScheduleFlow, UnpublishFlow } from "./lifecycle";
import { AccessibilityView, ReplaceView } from "./content-tools";
import { ReferenceList } from "./impact";
import { CopyButton, ErrorNote, ImpactRow, PathText, SectionLabel, relativeTime } from "./primitives";
import { useUndo } from "./use-undo";

export type FlowId =
  | "rename"
  | "move"
  | "duplicate"
  | "delete"
  | "create"
  | "languages"
  | "versions"
  | "components"
  | "details"
  | "publish"
  | "unpublish"
  | "schedule"
  | "reorder"
  | "replace"
  | "a11y";

function ActionGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col">
      <SectionLabel>{title}</SectionLabel>
      <nav aria-label={title} className="-mx-2 flex flex-col">
        {children}
      </nav>
    </section>
  );
}

function ActionRow({
  icon,
  title,
  description,
  onClick,
  disabledReason,
  tone = "neutral",
}: {
  icon: string;
  title: string;
  description: string;
  onClick: () => void;
  disabledReason?: string | null;
  tone?: "neutral" | "danger";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!!disabledReason}
      className="group flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left outline-none hover:bg-neutral-bg focus-visible:ring-[3px] focus-visible:ring-primary/40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
    >
      <span
        className={cn(
          "flex size-8 shrink-0 items-center justify-center rounded-lg",
          tone === "danger" ? "bg-danger-bg text-danger-fg" : "bg-primary-bg text-primary-fg",
          disabledReason && "bg-neutral-bg text-subtle-text",
        )}
      >
        <Icon path={icon} className="size-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className={cn("block text-md font-medium", disabledReason && "text-subtle-text")}>{title}</span>
        <span className="block text-sm text-subtle-text">{disabledReason ?? description}</span>
      </span>
      {!disabledReason && <Icon path={mdiChevronRight} className="size-5 text-subtle-text transition-transform group-hover:translate-x-0.5" />}
    </button>
  );
}

/**
 * Everything for one page: its address, the four safe operations, and its link health.
 * Used by the Pages context panel and by the Pages section of the full-screen workspace.
 */
export function PageWorkbench({
  api,
  page,
  onChanged,
  onOpenPage,
  initialFlow = null,
  initialName,
  onFlowChange,
}: {
  api: SitecoreApi;
  page: PageRef;
  onChanged: (kind: ChangeKind, info?: { pageId?: string; parentId?: string }) => void;
  onOpenPage?: (id: string) => void;
  initialFlow?: FlowId | null;
  initialName?: string;
  onFlowChange?: (f: FlowId | null) => void;
}) {
  const [flow, setFlowState] = useState<FlowId | null>(initialFlow);
  const setFlow = (f: FlowId | null) => {
    setFlowState(f);
    onFlowChange?.(f);
  };
  const refs = useAsync(() => api.findReferrers(page.id), [api, page.id]);
  const redirects = useRedirectState(api);
  const [showRefs, setShowRefs] = useState(false);
  const [showIncoming, setShowIncoming] = useState(false);
  const activity = useActivity((e) => sameId(e.pageId, page.id) && e.site === api.site.name).slice(0, 3);
  const { undo, busy } = useUndo(api, () => onChanged("undone"));

  const flowProps = {
    api,
    page,
    onClose: () => {
      setFlow(null);
      void refs.reload();
      void redirects.reload();
    },
    onChanged,
    onOpenPage,
  };
  if (flow) return <FlowView flow={flow} props={flowProps} initialName={initialName} />;

  const rules = redirects.data?.rules ?? [];
  const incoming = rules.filter((r) => !isPattern(r.source) && samePath(r.target, page.route));
  const hiding = rules.filter((r) => !isPattern(r.source) && samePath(r.source, page.route));
  const slugIssues = page.route === "/" ? [] : lintSlug(lastSegment(page.route));
  const isHome = page.route === "/";
  const lockedByOther = page.locked && !page.lockedByMe;
  const refItems = refs.data?.items ?? [];

  const removeHiding = async () => {
    try {
      await editRedirects(
        api,
        hiding.map((r) => ({ op: "remove" as const, mapId: r.mapId, source: r.source, target: r.target })),
        `Removed redirect hiding ${page.route}`,
        "redirect.delete",
      );
      toast.success("Redirect removed. Publish the redirect map to update the live site.");
      void redirects.reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn’t remove the redirect");
    }
  };

  return (
    <div className="flex flex-col gap-5 px-4 py-4">
      <header className="flex flex-col gap-1.5">
        <h2 className="text-xl leading-tight font-semibold">{page.displayName}</h2>
        <div className="flex items-center gap-1">
          <PathText className="text-subtle-text">{page.route}</PathText>
          <CopyButton value={page.route} label="Copy URL path" />
        </div>
        {(
          <div className="flex flex-wrap gap-1.5">
            <PublishingBadges api={api} page={page} />
            {page.workflowState && (
              <Badge colorScheme="primary">
                <Icon path={mdiProgressClock} className="size-3" />
                {page.workflowState}
              </Badge>
            )}
            {page.locked && (
              <Badge colorScheme={page.lockedByMe ? "neutral" : "warning"}>
                <Icon path={mdiAccountLockOutline} className="size-3" />
                {page.lockedByMe ? "Locked by you" : "Locked by another author"}
              </Badge>
            )}
          </div>
        )}
      </header>

      {hiding.length > 0 && (
        <div className="rounded-lg border border-danger/40 bg-danger-bg px-3">
          <ImpactRow
            icon={mdiEyeOffOutline}
            tone="danger"
            title="Visitors can’t reach this page"
            action={
              <Button size="xs" colorScheme="danger" onClick={removeHiding}>
                Remove redirect
              </Button>
            }
          >
            A redirect in “{hiding[0].mapName}” sends <PathText>{page.route}</PathText> to <PathText>{hiding[0].target}</PathText>.
          </ImpactRow>
        </div>
      )}

      <Button className="w-full" onClick={() => setFlow("publish")} disabled={!page.permissions.canPublish}>
        <Icon path={mdiCloudUploadOutline} className="size-5" />
        Publish
      </Button>

      <ActionGroup title="Page">
        <ActionRow
          icon={mdiFormTextboxPassword}
          title="Change URL"
          description="Rename it and keep old links working"
          onClick={() => setFlow("rename")}
          disabledReason={isHome ? "The home page URL comes from the host name" : !page.permissions.canRename ? "You can’t rename this page" : null}
        />
        <ActionRow
          icon={mdiFolderMoveOutline}
          title="Move"
          description="Put it elsewhere in the site, with redirects"
          onClick={() => setFlow("move")}
          disabledReason={isHome ? "The home page can’t move" : !page.permissions.canWrite ? "You can’t move this page" : null}
        />
        <ActionRow icon={mdiContentDuplicate} title="Duplicate" description="Copy it with a clean URL and name" onClick={() => setFlow("duplicate")} />
        <ActionRow
          icon={mdiFileDocumentPlusOutline}
          title="Create subpage"
          description="Add a page below this one"
          onClick={() => setFlow("create")}
          disabledReason={!page.permissions.canCreate ? "You can’t create pages here" : null}
        />
        {page.hasChildren && <ActionRow icon={mdiSortVariant} title="Reorder subpages" description="Change the order they appear in" onClick={() => setFlow("reorder")} />}
      </ActionGroup>

      <ActionGroup title="Content">
        <ActionRow icon={mdiTranslate} title="Languages" description="Add languages and translate with AI" onClick={() => setFlow("languages")} />
        <ActionRow icon={mdiHistory} title="Version history" description="Compare versions and restore one" onClick={() => setFlow("versions")} />
        <ActionRow icon={mdiPuzzleOutline} title="Components" description="See shared content and make it local" onClick={() => setFlow("components")} />
        <ActionRow icon={mdiHumanWheelchair} title="Accessibility" description="Alt text, links and headings" onClick={() => setFlow("a11y")} />
        <ActionRow icon={mdiFindReplace} title="Find and replace" description="Change text across this page" onClick={() => setFlow("replace")} />
      </ActionGroup>

      <ActionGroup title="Publishing">
        <ActionRow icon={mdiCalendarClock} title="Schedule" description="Go live and take down on dates" onClick={() => setFlow("schedule")} />
        <ActionRow icon={mdiCloudOffOutline} title="Take offline or put back" description="Remove it from the live site, keep it in Sitecore" onClick={() => setFlow("unpublish")} />
        <ActionRow icon={mdiInformationOutline} title="Details and live status" description="Screenshot, preview, history and IDs" onClick={() => setFlow("details")} />
        <ActionRow
          icon={mdiTrashCanOutline}
          title="Delete"
          description="Move to the bin, with a redirect"
          onClick={() => setFlow("delete")}
          tone="danger"
          disabledReason={isHome ? "The home page can’t be deleted" : !page.permissions.canDelete ? "You can’t delete this page" : null}
        />
      </ActionGroup>

      {lockedByOther && <p className="-mt-3 text-sm text-warning-fg">Another author has this page locked. Changes may fail until they finish.</p>}

      <section className="flex flex-col">
        <SectionLabel>Link health</SectionLabel>
        <div className="flex flex-col divide-y">
          {refs.loading && !refs.data ? (
            <div className="py-2.5">
              <Skeleton className="h-9 w-full" />
            </div>
          ) : refs.error ? (
            <ImpactRow icon={mdiLinkVariant} tone="warning" title="Couldn’t check incoming links">
              {refs.error.message}
            </ImpactRow>
          ) : (
            <ImpactRow
              icon={mdiLinkVariant}
              tone={refItems.length ? "primary" : "neutral"}
              title={refItems.length ? `Linked from ${refItems.length} item${refItems.length === 1 ? "" : "s"}` : "Nothing links to this page"}
              action={
                refItems.length > 0 && (
                  <Button variant="ghost" size="xs" onClick={() => setShowRefs(!showRefs)} aria-expanded={showRefs}>
                    {showRefs ? "Hide" : "View"}
                  </Button>
                )
              }
            >
              {refItems.length ? "Links follow the page if it moves." : "Use navigation or other pages to help people find it."}
              {showRefs && <ReferenceList items={refItems} />}
            </ImpactRow>
          )}
          {redirects.loading && !redirects.data ? (
            <div className="py-2.5">
              <Skeleton className="h-9 w-full" />
            </div>
          ) : redirects.error ? (
            <div className="py-2.5">
              <ErrorNote error={redirects.error} onRetry={redirects.reload} />
            </div>
          ) : (
            <ImpactRow
              icon={mdiArrowDecisionOutline}
              tone="neutral"
              title={incoming.length ? `${incoming.length} old URL${incoming.length === 1 ? "" : "s"} redirect here` : "No redirects point here"}
              action={
                incoming.length > 0 && (
                  <Button variant="ghost" size="xs" onClick={() => setShowIncoming(!showIncoming)} aria-expanded={showIncoming}>
                    {showIncoming ? "Hide" : "View"}
                  </Button>
                )
              }
            >
              {incoming.length ? "They’re updated automatically when this page changes URL." : "Old URLs appear here after you change this page’s URL."}
              {showIncoming && (
                <ul className="mt-2 flex flex-col gap-1">
                  {incoming.map((r) => (
                    <li key={r.key} className="flex items-center gap-2">
                      <PathText className="text-body-text">{r.source}</PathText>
                      <span className="text-xs">in {r.mapName}</span>
                    </li>
                  ))}
                </ul>
              )}
            </ImpactRow>
          )}
          {slugIssues.length > 0 && (
            <ImpactRow
              icon={mdiFormTextboxPassword}
              tone="warning"
              title="The URL could be cleaner"
              action={
                page.permissions.canRename && (
                  <Button variant="ghost" size="xs" colorScheme="primary" onClick={() => setFlow("rename")}>
                    Fix
                  </Button>
                )
              }
            >
              {slugIssues[0].message}
            </ImpactRow>
          )}
        </div>
      </section>

      {activity.length > 0 && (
        <section className="flex flex-col">
          <SectionLabel>Recent changes</SectionLabel>
          <ul className="flex flex-col divide-y">
            {activity.map((e) => (
              <li key={e.id} className="flex items-center gap-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className={cn("text-md", e.undone && "text-subtle-text line-through")}>{e.title}</p>
                  <p className="text-sm text-subtle-text">{relativeTime(e.at)}</p>
                </div>
                {e.undo && !e.undone && (
                  <Button variant="ghost" size="xs" disabled={busy} onClick={() => void undo(e)}>
                    <Icon path={mdiUndoVariant} className="size-4" />
                    Undo
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

/** Renders one page operation. Shared by the context panel (inline) and the full screen (in a sheet). */
export function FlowView({ flow, props, initialName }: { flow: FlowId; props: React.ComponentProps<typeof MoveFlow>; initialName?: string }) {
  switch (flow) {
    case "rename":
      return <ChangeUrlFlow {...props} initialName={initialName} />;
    case "move":
      return <MoveFlow {...props} />;
    case "duplicate":
      return <DuplicateFlow {...props} />;
    case "delete":
      return <DeleteFlow {...props} />;
    case "create":
      return <CreatePageFlow {...props} />;
    case "languages":
      return <LanguagesView {...props} />;
    case "versions":
      return <VersionsView {...props} />;
    case "components":
      return <ComponentsView {...props} />;
    case "details":
      return <DetailsView {...props} />;
    case "publish":
      return <PublishFlow {...props} />;
    case "unpublish":
      return <UnpublishFlow {...props} />;
    case "schedule":
      return <ScheduleFlow {...props} />;
    case "reorder":
      return <ReorderFlow {...props} />;
    case "replace":
      return <ReplaceView {...props} />;
    case "a11y":
      return <AccessibilityView {...props} />;
  }
}
