"use client";

import {
  mdiAccountLockOutline,
  mdiCalendarClock,
  mdiChevronDown,
  mdiFindReplace,
  mdiSortVariant,
  mdiCloudCheckOutline,
  mdiCloudOffOutline,
  mdiCloudUploadOutline,
  mdiContentDuplicate,
  mdiEyeOffOutline,
  mdiFileDocumentPlusOutline,
  mdiFolderMoveOutline,
  mdiFormTextboxPassword,
  mdiOpenInNew,
  mdiProgressClock,
  mdiTrashCanOutline,
} from "@mdi/js";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useAsync } from "@/hooks/use-async";
import { useRedirectState } from "@/hooks/use-sitecore";
import { logActivity } from "@/lib/activity";
import { Icon } from "@/lib/icon";
import { useMarketplace } from "@/lib/marketplace/provider";
import { editRedirects } from "@/lib/ops/operations";
import type { SitecoreApi } from "@/lib/sitecore/api";
import { isPattern, samePath } from "@/lib/sitecore/redirects";
import { lastSegment } from "@/lib/sitecore/routes";
import { lintSlug } from "@/lib/sitecore/slug";
import type { PageRef } from "@/lib/sitecore/types";
import type { ChangeKind } from "./flows";
import { ComponentsContent, DetailsContent, LanguagesContent, VersionsContent } from "./manage";
import { FlowView, type FlowId } from "./page-workbench";
import { PublishingBadges } from "./lifecycle";
import { AccessibilityContent } from "./content-tools";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { CopyButton, PathText, relativeTime } from "./primitives";
import { Spinner } from "./spinner";

type Action = Extract<FlowId, "rename" | "move" | "duplicate" | "delete" | "create" | "publish" | "unpublish" | "schedule" | "reorder" | "replace">;
const ACTION_TITLE: Record<Action, string> = {
  rename: "Change URL",
  move: "Move page",
  duplicate: "Duplicate page",
  delete: "Delete page",
  create: "New subpage",
  publish: "Publish",
  unpublish: "Take offline",
  schedule: "Schedule",
  reorder: "Reorder subpages",
  replace: "Find and replace",
};

function IconAction({ label, icon, onClick, disabled, danger }: { label: string; icon: string; onClick: () => void; disabled?: string | null; danger?: boolean }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span>
          <Button variant="ghost" size="icon" colorScheme={danger ? "danger" : "neutral"} aria-label={label} disabled={!!disabled} onClick={onClick}>
            <Icon path={icon} className="size-5" />
          </Button>
        </span>
      </TooltipTrigger>
      <TooltipContent>{disabled ?? label}</TooltipContent>
    </Tooltip>
  );
}

function Row({ title, detail, action, children }: { title: ReactNode; detail?: ReactNode; action?: ReactNode; children?: ReactNode }) {
  return (
    <div className="flex flex-col gap-2 border-b py-4 last:border-b-0">
      <div className="flex items-start gap-4">
        <div className="min-w-0 flex-1">
          <h3 className="text-md font-semibold">{title}</h3>
          {detail && <p className="text-sm text-subtle-text">{detail}</p>}
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

/** Links tab: everything about how visitors and other pages reach this one, in one place. */
function LinksContent({ api, page, onFix }: { api: SitecoreApi; page: PageRef; onFix: () => void }) {
  const refs = useAsync(() => api.findReferrers(page.id), [api, page.id]);
  const redirects = useRedirectState(api);
  const [allRefs, setAllRefs] = useState(false);
  const items = refs.data?.items ?? [];
  const incoming = (redirects.data?.rules ?? []).filter((r) => !isPattern(r.source) && samePath(r.target, page.route));
  const slugIssues = page.route === "/" ? [] : lintSlug(lastSegment(page.route));
  const shown = allRefs ? items : items.slice(0, 8);

  return (
    <div className="flex flex-col">
      <Row
        title={refs.loading && !refs.data ? "Linked from…" : refs.error ? "Couldn’t check links" : `Linked from ${items.length} item${items.length === 1 ? "" : "s"}`}
        detail={refs.error ? refs.error.message : items.length ? "Their links follow this page when it moves or changes URL." : "Nothing links here yet."}
      >
        {refs.loading && !refs.data ? (
          <Skeleton className="h-16 w-full" />
        ) : (
          items.length > 0 && (
            <ul className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
              {shown.map((r) => (
                <li key={r.id} className="flex min-w-0 items-center gap-2">
                  <span className="truncate text-md">{r.name}</span>
                  {r.kind === "content" && <span className="shrink-0 text-xs text-subtle-text">shared content</span>}
                </li>
              ))}
              {items.length > 8 && (
                <li>
                  <Button variant="link" size="xs" className="px-0" onClick={() => setAllRefs(!allRefs)}>
                    {allRefs ? "Show fewer" : `Show all ${items.length}`}
                  </Button>
                </li>
              )}
            </ul>
          )
        )}
      </Row>
      <Row
        title={incoming.length ? `${incoming.length} old URL${incoming.length === 1 ? "" : "s"} redirect here` : "No redirects point here"}
        detail={incoming.length ? "Kept up to date automatically when this page changes URL." : "Old URLs appear here after you change this page’s URL."}
      >
        {incoming.length > 0 && (
          <ul className="flex flex-wrap gap-1.5">
            {incoming.map((r) => (
              <li key={r.key} className="rounded-md bg-subtle-bg px-2 py-0.5" title={`In ${r.mapName}`}>
                <PathText>{r.source}</PathText>
              </li>
            ))}
          </ul>
        )}
      </Row>
      <Row
        title={slugIssues.length ? "The URL could be cleaner" : "Clean URL"}
        detail={slugIssues.length ? slugIssues[0].message : "Lowercase, hyphenated and easy to share."}
        action={
          slugIssues.length > 0 &&
          page.permissions.canRename && (
            <Button size="sm" variant="outline" colorScheme="primary" onClick={onFix}>
              Fix URL
            </Button>
          )
        }
      />
    </div>
  );
}

/**
 * One page, full screen. The header holds every action that changes the page; the tabs below hold
 * everything you read about it. Actions open in a side sheet so the page stays in view.
 */
export function PageDetail({
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
  const [action, setAction] = useState<Action | null>(null);
  const [initialName, setInitialName] = useState<string | undefined>();
  const [tab, setTab] = useState("links");
  const [rev, setRev] = useState(0);
  const live = useAsync(() => api.liveState(page.id, page.language), [api, page.id, rev]);
  const preview = useAsync(() => api.previewUrl(page.id, page.language).catch(() => null), [api, page.id]);
  const redirects = useRedirectState(api);
  const hiding = (redirects.data?.rules ?? []).filter((r) => !isPattern(r.source) && samePath(r.source, page.route));
  const isHome = page.route === "/";
  const p = page.permissions;

  const open = (a: Action, name?: string) => {
    setInitialName(name);
    setAction(a);
  };
  const close = () => {
    setAction(null);
    setRev((r) => r + 1);
    void redirects.reload();
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
    <div className="mx-auto flex w-full max-w-5xl flex-col">
      <header className="flex flex-col gap-4 border-b pb-5">
        <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
          <div className="flex min-w-0 flex-col gap-1.5">
            <h1 className="text-3xl leading-tight font-semibold break-words">{page.displayName}</h1>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm text-subtle-text">
              <span className="flex items-center">
                <PathText className="text-body-text">{page.route}</PathText>
                <CopyButton value={page.route} label="Copy URL path" />
              </span>
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
              <PublishingBadges api={api} page={page} rev={rev} />
              {page.workflowState && (
                <Badge colorScheme="primary">
                  <Icon path={mdiProgressClock} className="size-3" />
                  {page.workflowState}
                </Badge>
              )}
              {page.locked && (
                <Badge colorScheme={page.lockedByMe ? "neutral" : "warning"}>
                  <Icon path={mdiAccountLockOutline} className="size-3" />
                  {page.lockedByMe ? "Locked by you" : "Locked"}
                </Badge>
              )}
              {page.meta?.updatedAt && (
                <span>
                  Edited {relativeTime(page.meta.updatedAt)}
                  {page.meta.updatedBy ? ` by ${page.meta.updatedBy}` : ""}
                </span>
              )}
            </div>
          </div>
          {preview.data && (
            <Button variant="ghost" size="sm" onClick={() => void client?.navigateToExternalUrl(preview.data!, true).catch(() => window.open(preview.data!, "_blank", "noopener"))}>
              <Icon path={mdiOpenInNew} className="size-4" />
              Preview
            </Button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2" role="toolbar" aria-label="Page actions">
          <Button onClick={() => open("publish")} disabled={!p.canPublish}>
            <Icon path={mdiCloudUploadOutline} className="size-5" />
            Publish
          </Button>
          <Button variant="outline" onClick={() => open("rename")} disabled={isHome || !p.canRename} title={isHome ? "The home page URL comes from the host name" : undefined}>
            <Icon path={mdiFormTextboxPassword} className="size-5" />
            Change URL
          </Button>
          <Button variant="outline" onClick={() => open("move")} disabled={isHome || !p.canWrite}>
            <Icon path={mdiFolderMoveOutline} className="size-5" />
            Move
          </Button>
          <Button variant="outline" onClick={() => open("create")} disabled={!p.canCreate}>
            <Icon path={mdiFileDocumentPlusOutline} className="size-5" />
            New subpage
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" aria-label="More actions">
                More
                <Icon path={mdiChevronDown} className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="min-w-56">
              <DropdownMenuItem onSelect={() => open("duplicate")}>
                <Icon path={mdiContentDuplicate} className="size-4" />
                Duplicate
              </DropdownMenuItem>
              {page.hasChildren && (
                <DropdownMenuItem onSelect={() => open("reorder")}>
                  <Icon path={mdiSortVariant} className="size-4" />
                  Reorder subpages
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onSelect={() => open("replace")}>
                <Icon path={mdiFindReplace} className="size-4" />
                Find and replace on this page
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => open("schedule")}>
                <Icon path={mdiCalendarClock} className="size-4" />
                Schedule
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => open("unpublish")}>
                <Icon path={mdiCloudOffOutline} className="size-4" />
                Take offline or put back
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" disabled={isHome || !p.canDelete} onSelect={() => open("delete")}>
                <Icon path={mdiTrashCanOutline} className="size-4" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      {hiding.length > 0 && (
        <div className="mt-4 flex flex-wrap items-center gap-3 rounded-lg bg-danger-bg px-4 py-3 text-danger-fg">
          <Icon path={mdiEyeOffOutline} className="size-5" />
          <p className="min-w-0 flex-1 text-md">
            <span className="font-semibold">Visitors can’t reach this page.</span> A redirect sends it to <PathText>{hiding[0].target}</PathText>.
          </p>
          <Button size="sm" colorScheme="danger" onClick={removeHiding}>
            Remove redirect
          </Button>
        </div>
      )}

      <Tabs value={tab} onValueChange={setTab} className="mt-2">
        <TabsList>
          <TabsTrigger value="links">Links</TabsTrigger>
          <TabsTrigger value="languages">Languages</TabsTrigger>
          <TabsTrigger value="versions">Versions</TabsTrigger>
          <TabsTrigger value="components">Components</TabsTrigger>
          <TabsTrigger value="a11y">Accessibility</TabsTrigger>
          <TabsTrigger value="details">Details</TabsTrigger>
        </TabsList>
        <TabsContent value="links" className="pt-1">
          <LinksContent key={rev} api={api} page={page} onFix={() => open("rename")} />
        </TabsContent>
        <TabsContent value="languages" className="pt-3">
          <LanguagesContent api={api} page={page} />
        </TabsContent>
        <TabsContent value="versions" className="pt-3">
          <VersionsContent api={api} page={page} />
        </TabsContent>
        <TabsContent value="components" className="pt-3">
          <ComponentsContent api={api} page={page} />
        </TabsContent>
        <TabsContent value="a11y" className="pt-3">
          <AccessibilityContent api={api} page={page} />
        </TabsContent>
        <TabsContent value="details" className="pt-3">
          <div className="flex max-w-2xl flex-col gap-5">
            <DetailsContent api={api} page={page} showLive={false} />
          </div>
        </TabsContent>
      </Tabs>


      <Sheet open={!!action} onOpenChange={(o: boolean) => !o && close()}>
        <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-xl">
          <SheetHeader className="sr-only">
            <SheetTitle>{action ? ACTION_TITLE[action] : ""}</SheetTitle>
            <SheetDescription>{page.displayName}</SheetDescription>
          </SheetHeader>
          {action && <FlowView flow={action} props={{ api, page, onClose: close, onChanged, onOpenPage }} initialName={initialName} />}
        </SheetContent>
      </Sheet>
    </div>
  );
}
