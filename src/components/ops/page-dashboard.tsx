"use client";

import {
  mdiAccountLockOutline,
  mdiArrowDecisionOutline,
  mdiCloudCheckOutline,
  mdiCloudOffOutline,
  mdiContentDuplicate,
  mdiEyeOffOutline,
  mdiFileDocumentPlusOutline,
  mdiFolderMoveOutline,
  mdiFormTextboxPassword,
  mdiInformationOutline,
  mdiLinkVariant,
  mdiOpenInNew,
  mdiProgressClock,
  mdiPuzzleOutline,
  mdiTranslate,
  mdiTrashCanOutline,
  mdiUndoVariant,
} from "@mdi/js";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { useActivity } from "@/hooks/use-activity";
import { useAsync } from "@/hooks/use-async";
import { useRedirectState } from "@/hooks/use-sitecore";
import { Icon } from "@/lib/icon";
import { useMarketplace } from "@/lib/marketplace/provider";
import { editRedirects } from "@/lib/ops/operations";
import { sameId, type SitecoreApi } from "@/lib/sitecore/api";
import { isPattern, samePath } from "@/lib/sitecore/redirects";
import { lastSegment } from "@/lib/sitecore/routes";
import { lintSlug } from "@/lib/sitecore/slug";
import type { PageRef } from "@/lib/sitecore/types";
import { cn } from "@/lib/utils";
import type { ChangeKind } from "./flows";
import { ReferenceList } from "./impact";
import { FlowView, type FlowId } from "./page-workbench";
import { CopyButton, PathText, relativeTime } from "./primitives";
import { useUndo } from "./use-undo";

const FLOW_TITLE: Record<FlowId, string> = {
  rename: "Change URL",
  move: "Move page",
  duplicate: "Duplicate page",
  delete: "Delete page",
  create: "Create subpage",
  languages: "Languages and versions",
  components: "Components and content",
  details: "Details and live status",
};

function Tile({
  icon,
  title,
  description,
  onClick,
  disabledReason,
  tone = "primary",
}: {
  icon: string;
  title: string;
  description: string;
  onClick: () => void;
  disabledReason?: string | null;
  tone?: "primary" | "danger";
}) {
  const off = !!disabledReason;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={off}
      title={disabledReason ?? undefined}
      className={cn(
        "group flex min-h-[8.5rem] flex-col items-start gap-3 rounded-xl border bg-body-bg p-4 text-left transition-[border-color,box-shadow]",
        "outline-none focus-visible:ring-[3px] focus-visible:ring-primary/40",
        off ? "cursor-not-allowed opacity-60" : tone === "danger" ? "hover:border-danger/50 hover:shadow-sm" : "hover:border-primary/50 hover:shadow-sm",
      )}
    >
      <span
        className={cn(
          "flex size-10 items-center justify-center rounded-lg",
          off ? "bg-neutral-bg text-subtle-text" : tone === "danger" ? "bg-danger-bg text-danger-fg" : "bg-primary-bg text-primary-fg",
        )}
      >
        <Icon path={icon} className="size-5" />
      </span>
      <span className="flex flex-col gap-0.5">
        <span className="text-md font-semibold">{title}</span>
        <span className="text-sm leading-snug text-subtle-text">{disabledReason ?? description}</span>
      </span>
    </button>
  );
}

function Card({ title, action, children, className }: { title: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn("flex flex-col rounded-xl border bg-body-bg", className)}>
      <header className="flex items-center justify-between gap-2 border-b px-4 py-3">
        <h2 className="text-md font-semibold">{title}</h2>
        {action}
      </header>
      <div className="flex flex-col px-4 py-2">{children}</div>
    </section>
  );
}

function HealthRow({ icon, tone, title, detail, action, children }: { icon: string; tone: string; title: string; detail: string; action?: ReactNode; children?: ReactNode }) {
  return (
    <div className="flex flex-col border-b py-3 last:border-b-0">
      <div className="flex items-start gap-3">
        <span className={cn("mt-px flex size-8 shrink-0 items-center justify-center rounded-lg", tone)}>
          <Icon path={icon} className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-md font-medium">{title}</p>
          <p className="text-sm text-subtle-text">{detail}</p>
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

/**
 * Wide, card-based view of one page for the full-screen app. Operations open in a side sheet so the
 * page stays in view behind them.
 */
export function PageDashboard({
  api,
  page,
  onChanged,
  onOpenPage,
}: {
  api: SitecoreApi;
  page: PageRef;
  onChanged: (kind: ChangeKind, info?: { pageId?: string; parentId?: string }) => void;
  onOpenPage?: (id: string) => void;
}) {
  const { client } = useMarketplace();
  const [flow, setFlow] = useState<FlowId | null>(null);
  const [showRefs, setShowRefs] = useState(false);
  const [showIncoming, setShowIncoming] = useState(false);
  const refs = useAsync(() => api.findReferrers(page.id), [api, page.id]);
  const redirects = useRedirectState(api);
  const live = useAsync(() => api.liveState(page.id, page.language), [api, page.id]);
  const preview = useAsync(() => api.previewUrl(page.id, page.language).catch(() => null), [api, page.id]);
  const activity = useActivity((e) => sameId(e.pageId, page.id) && e.site === api.site.name).slice(0, 4);
  const { undo, busy } = useUndo(api, () => onChanged("undone"));

  const rules = redirects.data?.rules ?? [];
  const incoming = rules.filter((r) => !isPattern(r.source) && samePath(r.target, page.route));
  const hiding = rules.filter((r) => !isPattern(r.source) && samePath(r.source, page.route));
  const isHome = page.route === "/";
  const slugIssues = isHome ? [] : lintSlug(lastSegment(page.route));
  const refItems = refs.data?.items ?? [];

  const close = () => {
    setFlow(null);
    void refs.reload();
    void redirects.reload();
    void live.reload();
  };

  const removeHiding = async () => {
    try {
      await editRedirects(api, hiding.map((r) => ({ op: "remove" as const, mapId: r.mapId, source: r.source, target: r.target })), `Removed redirect hiding ${page.route}`, "redirect.delete");
      toast.success("Redirect removed. Publish the redirect map to update the live site.");
      void redirects.reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn’t remove the redirect");
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-5">
      {/* Page header */}
      <header className="flex flex-wrap items-start justify-between gap-4 rounded-xl border bg-body-bg px-5 py-4">
        <div className="flex min-w-0 flex-col gap-2">
          <h1 className="text-3xl leading-tight font-semibold break-words">{page.displayName}</h1>
          <div className="flex flex-wrap items-center gap-x-1 gap-y-2">
            <span className="flex items-center gap-1 rounded-md bg-subtle-bg py-0.5 pr-0.5 pl-2">
              <PathText className="text-body-text">{page.route}</PathText>
              <CopyButton value={page.route} label="Copy URL path" />
            </span>
            <span className="ml-2 flex flex-wrap gap-1.5">
              {live.data === true && (
                <Badge colorScheme="success">
                  <Icon path={mdiCloudCheckOutline} className="size-3" />
                  Live
                </Badge>
              )}
              {live.data === false && (
                <Badge colorScheme="warning">
                  <Icon path={mdiCloudOffOutline} className="size-3" />
                  Not published
                </Badge>
              )}
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
              {page.templateName && <Badge>{page.templateName}</Badge>}
            </span>
          </div>
          {page.meta?.updatedAt && (
            <p className="text-sm text-subtle-text">
              Edited {relativeTime(page.meta.updatedAt)}
              {page.meta.updatedBy ? ` by ${page.meta.updatedBy}` : ""}
            </p>
          )}
        </div>
        <div className="flex gap-2">
          {preview.data && (
            <Button variant="outline" onClick={() => void client?.navigateToExternalUrl(preview.data!, true).catch(() => window.open(preview.data!, "_blank", "noopener"))}>
              <Icon path={mdiOpenInNew} className="size-5" />
              Preview
            </Button>
          )}
          <Button onClick={() => setFlow("details")} variant="outline">
            <Icon path={mdiInformationOutline} className="size-5" />
            Details
          </Button>
        </div>
      </header>

      {hiding.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-danger/40 bg-danger-bg px-5 py-3 text-danger-fg">
          <Icon path={mdiEyeOffOutline} className="size-5" />
          <p className="min-w-0 flex-1 text-md">
            <span className="font-semibold">Visitors can’t reach this page.</span> A redirect in “{hiding[0].mapName}” sends it to <PathText>{hiding[0].target}</PathText>.
          </p>
          <Button size="sm" colorScheme="danger" onClick={removeHiding}>
            Remove redirect
          </Button>
        </div>
      )}

      {/* URL and structure */}
      <section className="flex flex-col gap-2.5">
        <h2 className="text-sm font-semibold text-subtle-text">URL and structure</h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Tile
            icon={mdiFormTextboxPassword}
            title="Change URL"
            description="Rename it and keep old links working"
            onClick={() => setFlow("rename")}
            disabledReason={isHome ? "The home page URL comes from the host name" : !page.permissions.canRename ? "You can’t rename this page" : null}
          />
          <Tile
            icon={mdiFolderMoveOutline}
            title="Move"
            description="Put it elsewhere in the site, with redirects"
            onClick={() => setFlow("move")}
            disabledReason={isHome ? "The home page can’t move" : !page.permissions.canWrite ? "You can’t move this page" : null}
          />
          <Tile icon={mdiContentDuplicate} title="Duplicate" description="Copy it with a clean URL and name" onClick={() => setFlow("duplicate")} />
          <Tile
            icon={mdiTrashCanOutline}
            title="Delete safely"
            description="See what links here, then redirect visitors"
            onClick={() => setFlow("delete")}
            tone="danger"
            disabledReason={isHome ? "The home page can’t be deleted" : !page.permissions.canDelete ? "You can’t delete this page" : null}
          />
        </div>
      </section>

      {/* Content */}
      <section className="flex flex-col gap-2.5">
        <h2 className="text-sm font-semibold text-subtle-text">Content</h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Tile
            icon={mdiFileDocumentPlusOutline}
            title="Create subpage"
            description="Add a page below this one"
            onClick={() => setFlow("create")}
            disabledReason={!page.permissions.canCreate ? "You can’t create pages here" : null}
          />
          <Tile icon={mdiTranslate} title="Languages and versions" description="Translate with AI, add or remove versions" onClick={() => setFlow("languages")} />
          <Tile icon={mdiPuzzleOutline} title="Components" description="What’s on the page and what’s shared" onClick={() => setFlow("components")} />
          <Tile icon={mdiInformationOutline} title="Details and live status" description="Screenshot, history, IDs and publishing" onClick={() => setFlow("details")} />
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-[3fr_2fr]">
        <Card title="Link health">
          {refs.loading && !refs.data ? (
            <div className="py-3">
              <Skeleton className="h-10 w-full" />
            </div>
          ) : (
            <HealthRow
              icon={mdiLinkVariant}
              tone={refItems.length ? "bg-primary-bg text-primary-fg" : "bg-neutral-bg text-neutral-fg"}
              title={refs.error ? "Couldn’t check incoming links" : refItems.length ? `Linked from ${refItems.length} item${refItems.length === 1 ? "" : "s"}` : "Nothing links to this page"}
              detail={refs.error ? refs.error.message : refItems.length ? "Links follow the page if it moves." : "Add it to navigation or link to it from related pages."}
              action={
                refItems.length > 0 && (
                  <Button variant="ghost" size="xs" onClick={() => setShowRefs(!showRefs)} aria-expanded={showRefs}>
                    {showRefs ? "Hide" : "View"}
                  </Button>
                )
              }
            >
              {showRefs && (
                <div className="pl-11">
                  <ReferenceList items={refItems} />
                </div>
              )}
            </HealthRow>
          )}
          {redirects.loading && !redirects.data ? (
            <div className="py-3">
              <Skeleton className="h-10 w-full" />
            </div>
          ) : (
            <HealthRow
              icon={mdiArrowDecisionOutline}
              tone="bg-neutral-bg text-neutral-fg"
              title={incoming.length ? `${incoming.length} old URL${incoming.length === 1 ? "" : "s"} redirect here` : "No redirects point here"}
              detail={incoming.length ? "Updated automatically when this page changes URL." : "Old URLs show up here after a URL change."}
              action={
                incoming.length > 0 && (
                  <Button variant="ghost" size="xs" onClick={() => setShowIncoming(!showIncoming)} aria-expanded={showIncoming}>
                    {showIncoming ? "Hide" : "View"}
                  </Button>
                )
              }
            >
              {showIncoming && (
                <ul className="mt-2 flex flex-col gap-1 pl-11">
                  {incoming.map((r) => (
                    <li key={r.key} className="flex items-baseline gap-2">
                      <PathText>{r.source}</PathText>
                      <span className="text-xs text-subtle-text">in {r.mapName}</span>
                    </li>
                  ))}
                </ul>
              )}
            </HealthRow>
          )}
          <HealthRow
            icon={mdiFormTextboxPassword}
            tone={slugIssues.length ? "bg-warning-bg text-warning-fg" : "bg-success-bg text-success-fg"}
            title={slugIssues.length ? "The URL could be cleaner" : "Clean URL"}
            detail={slugIssues.length ? slugIssues[0].message : "Lowercase, hyphenated and easy to share."}
            action={
              slugIssues.length > 0 &&
              page.permissions.canRename && (
                <Button variant="ghost" size="xs" colorScheme="primary" onClick={() => setFlow("rename")}>
                  Fix
                </Button>
              )
            }
          />
        </Card>

        <Card title="Recent changes">
          {activity.length === 0 ? (
            <p className="py-3 text-md text-subtle-text">Changes you make here show up with an undo button.</p>
          ) : (
            <ul className="flex flex-col">
              {activity.map((e) => (
                <li key={e.id} className="flex items-center gap-3 border-b py-2.5 last:border-b-0">
                  <div className="min-w-0 flex-1">
                    <p className={cn("truncate text-md", e.undone && "text-subtle-text line-through")}>{e.title}</p>
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
          )}
        </Card>
      </div>

      <Sheet open={!!flow} onOpenChange={(o: boolean) => !o && close()}>
        <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-xl">
          <SheetHeader className="sr-only">
            <SheetTitle>{flow ? FLOW_TITLE[flow] : ""}</SheetTitle>
            <SheetDescription>{page.displayName}</SheetDescription>
          </SheetHeader>
          {flow && <FlowView flow={flow} props={{ api, page, onClose: close, onChanged, onOpenPage }} />}
        </SheetContent>
      </Sheet>
    </div>
  );
}
