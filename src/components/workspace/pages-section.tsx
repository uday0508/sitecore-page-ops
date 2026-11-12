"use client";

import { mdiDeleteForeverOutline, mdiDeleteRestore } from "@mdi/js";
import { useState } from "react";
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
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ReplaceContent } from "@/components/ops/content-tools";
import { PagePicker, type PickTarget } from "@/components/ops/page-picker";
import { PathText, relativeTime } from "@/components/ops/primitives";
import { Icon } from "@/lib/icon";
import { restorePage } from "@/lib/ops/operations";
import { Skeleton } from "@/components/ui/skeleton";
import type { ChangeKind } from "@/components/ops/flows";
import { PageDetail } from "@/components/ops/page-detail";
import { ErrorNote } from "@/components/ops/primitives";
import { useAsync, type AsyncState } from "@/hooks/use-async";
import type { RedirectState } from "@/hooks/use-sitecore";
import type { SitecoreApi } from "@/lib/sitecore/api";
import { PageBrowser, type BrowseView } from "./page-browser";
import type { Nav, NavState } from "./workspace-app";

export function PagesSection({ api, redirects, navState, nav }: { api: SitecoreApi; redirects: AsyncState<RedirectState>; navState: NavState; nav: Nav }) {
  const root = useAsync(navState.pageId ? null : () => api.getTreeRoot(), [api, !navState.pageId]);
  const selectedId = navState.pageId ?? root.data?.id ?? null;
  const binId = selectedId?.startsWith("bin:") ? selectedId.slice(4) : null;
  const [rev, setRev] = useState(0);
  const [replacing, setReplacing] = useState(false);
  const [scope, setScope] = useState<"site" | "section">("site");
  const page = useAsync(selectedId && !binId ? () => api.getPage(selectedId) : null, [api, selectedId, rev]);
  const view: BrowseView = navState.view ?? "tree";
  const go = (pageId?: string, v: BrowseView = view) => nav({ section: "pages", pageId, view: v });

  const onChanged = (kind: ChangeKind, info?: { pageId?: string; parentId?: string }) => {
    api.invalidate();
    void redirects.reload();
    if (kind === "deleted") go(info?.parentId);
    else setRev((r) => r + 1);
  };

  return (
    <div className="grid h-full min-h-0 grid-cols-[minmax(16rem,20rem)_1fr]">
      <aside className="min-h-0 border-r">
        <PageBrowser
          refreshKey={rev}
          api={api}
          redirects={redirects}
          selectedId={selectedId}
          onOpen={(id) => go(id)}
          view={view}
          onView={(v) => go(navState.pageId, v)}
          onChanged={() => setRev((r) => r + 1)}
          onFindReplace={() => setReplacing(true)}
        />
      </aside>
      <section className="min-h-0 overflow-y-auto px-8 py-6">
        {binId ? (
          <BinDetail
            key={binId}
            api={api}
            id={binId}
            onRestored={(id) => {
              setRev((r) => r + 1);
              void redirects.reload();
              go(id, "tree");
            }}
            onDeleted={() => {
              setRev((r) => r + 1);
              go(undefined, "bin");
            }}
          />
        ) : page.error || root.error ? (
          <ErrorNote error={(page.error ?? root.error)!} onRetry={page.error ? page.reload : root.reload} />
        ) : !page.data ? (
          <div className="mx-auto flex max-w-5xl flex-col gap-4">
            <Skeleton className="h-9 w-72" />
            <Skeleton className="h-5 w-96" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-48 w-full" />
          </div>
        ) : (
          <PageDetail key={page.data.id} api={api} page={page.data} onChanged={onChanged} onOpenPage={(id) => go(id)} />
        )}
      </section>

      <Sheet open={replacing} onOpenChange={setReplacing}>
        <SheetContent className="flex w-full flex-col gap-0 overflow-y-auto sm:max-w-3xl">
          <SheetHeader>
            <SheetTitle>Find and replace</SheetTitle>
            <SheetDescription>Change text across many pages. You approve every match first, and it can be undone from Activity.</SheetDescription>
          </SheetHeader>
          <div className="flex flex-col gap-4 px-4 pb-6">
            {page.data && page.data.route !== "/" && (
              <div className="flex items-center gap-2">
                <Label htmlFor="fr-scope" className="text-md">
                  Search
                </Label>
                <Select value={scope} onValueChange={(v: string) => setScope(v as "site" | "section")}>
                  <SelectTrigger id="fr-scope" className="h-8 w-72">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="site">The whole site</SelectItem>
                    <SelectItem value="section">{page.data.displayName} and the pages below it</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
            <ReplaceContent
              key={scope}
              api={api}
              scope={scope === "section" && page.data ? { kind: "section", route: page.data.route, name: page.data.displayName } : { kind: "site" }}
              onDone={() => setRev((r) => r + 1)}
            />
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

function BinDetail({ api, id, onRestored, onDeleted }: { api: SitecoreApi; id: string; onRestored: (id: string) => void; onDeleted: () => void }) {
  const bin = useAsync(() => api.listBin(), [api, id]);
  const entry = bin.data?.find((b) => b.id === id);
  const [removeRedirects, setRemoveRedirects] = useState(true);
  const [target, setTarget] = useState<PickTarget | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);

  if (bin.loading && !bin.data) return <Skeleton className="mx-auto h-40 w-full max-w-3xl" />;
  if (bin.error) return <ErrorNote error={bin.error} onRetry={bin.reload} />;
  if (!entry) return <p className="text-md text-subtle-text">This page is no longer in the bin.</p>;

  const restore = async () => {
    setBusy(true);
    try {
      const r = await restorePage(api, { id: entry.id, name: entry.displayName, parentId: target?.id || undefined, removeRedirects });
      toast.success(`Restored to ${r.route ?? "its place"}${r.removed ? `, ${r.removed} redirect${r.removed === 1 ? "" : "s"} removed` : ""}. Publish it to bring it back to the live site.`);
      onRestored(entry.id);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn’t restore");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5">
      <header className="flex flex-col gap-1 border-b pb-4">
        <h1 className="text-3xl font-semibold">{entry.displayName}</h1>
        <p className="text-md text-subtle-text">
          In the bin{entry.deletedAt ? ` since ${relativeTime(entry.deletedAt)}` : ""}
          {entry.deletedBy ? `, deleted by ${entry.deletedBy}` : ""}. It isn’t on the live site.
        </p>
      </header>
      <section className="flex flex-col gap-3">
        <h2 className="text-md font-semibold">Restore</h2>
        {entry.fromRoute ? (
          <p className="text-md">
            Back to <PathText>{entry.fromRoute}</PathText>
          </p>
        ) : (
          <p className="text-md text-subtle-text">Its original location wasn’t recorded. Choose where it goes.</p>
        )}
        {(!entry.fromParentId || target) && <PagePicker api={api} mode="page" selected={target?.id ?? null} onSelect={setTarget} className="h-64" />}
        <label className="flex items-start gap-2.5">
          <Checkbox checked={removeRedirects} onCheckedChange={(c: boolean | "indeterminate") => setRemoveRedirects(c === true)} className="mt-0.5" />
          <span className="flex flex-col">
            <Label className="text-md">Remove the redirects added when it was deleted</Label>
            <span className="text-sm text-subtle-text">So visitors reach the page again instead of being sent elsewhere.</span>
          </span>
        </label>
        <div className="flex gap-2">
          <Button onClick={restore} disabled={busy || (!entry.fromParentId && !target?.id) || (!!target && !target.id)}>
            <Icon path={mdiDeleteRestore} className="size-5" />
            Restore page
          </Button>
          {entry.fromParentId && !target && (
            <Button variant="ghost" onClick={() => setTarget({ id: "", name: "", route: "" })}>
              Restore somewhere else
            </Button>
          )}
        </div>
      </section>
      <section className="flex flex-col gap-2 border-t pt-5">
        <h2 className="text-md font-semibold">Delete for good</h2>
        <p className="text-sm text-subtle-text">Sends it to Sitecore’s recycle bin. Only an administrator can get it back from there.</p>
        <Button variant="outline" colorScheme="danger" className="self-start" onClick={() => setConfirm(true)}>
          <Icon path={mdiDeleteForeverOutline} className="size-5" />
          Delete for good
        </Button>
      </section>
      <AlertDialog open={confirm} onOpenChange={setConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {entry.displayName} for good?</AlertDialogTitle>
            <AlertDialogDescription>It leaves the Page Operations bin. Only an administrator can restore it from Sitecore’s recycle bin.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                try {
                  await api.deleteForever(entry.id);
                  toast.success("Deleted for good");
                  onDeleted();
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : "Couldn’t delete");
                }
              }}
            >
              Delete for good
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
