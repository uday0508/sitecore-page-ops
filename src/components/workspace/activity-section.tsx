"use client";

import {
  mdiArrowDecisionOutline,
  mdiCalendarClock,
  mdiCloudOffOutline,
  mdiCloudUploadOutline,
  mdiContentCopy,
  mdiDeleteRestore,
  mdiFindReplace,
  mdiHumanWheelchair,
  mdiSortVariant,
  mdiContentDuplicate,
  mdiFolderMoveOutline,
  mdiFormTextboxPassword,
  mdiTrashCanOutline,
  mdiTrayArrowUp,
  mdiUndoVariant,
} from "@mdi/js";
import { useState } from "react";
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
import { PathText } from "@/components/ops/primitives";
import { useUndo } from "@/components/ops/use-undo";
import { useActivity } from "@/hooks/use-activity";
import { clearActivity, type ActivityKind } from "@/lib/activity";
import { Icon } from "@/lib/icon";
import type { SitecoreApi } from "@/lib/sitecore/api";
import { cn } from "@/lib/utils";

const ICON: Record<ActivityKind, string> = {
  rename: mdiFormTextboxPassword,
  move: mdiFolderMoveOutline,
  duplicate: mdiContentDuplicate,
  delete: mdiTrashCanOutline,
  "redirect.add": mdiArrowDecisionOutline,
  "redirect.update": mdiArrowDecisionOutline,
  "redirect.delete": mdiArrowDecisionOutline,
  "redirect.import": mdiTrayArrowUp,
  publish: mdiCloudUploadOutline,
  unpublish: mdiCloudOffOutline,
  schedule: mdiCalendarClock,
  restore: mdiDeleteRestore,
  reorder: mdiSortVariant,
  replace: mdiFindReplace,
  localize: mdiContentCopy,
  a11y: mdiHumanWheelchair,
};

export function ActivitySection({ api, onUndone }: { api: SitecoreApi; onUndone: () => void }) {
  const entries = useActivity((e) => e.site === api.site.name);
  const { undo, busy } = useUndo(api, onUndone);
  const [confirmClear, setConfirmClear] = useState(false);
  const groups = entries.reduce<Record<string, typeof entries>>((acc, e) => {
    const day = new Date(e.at).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
    (acc[day] ??= []).push(e);
    return acc;
  }, {});

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-8 py-8">
      <header className="flex items-center justify-between gap-4">
        <p className="text-md text-subtle-text">Changes made with Page Operations by everyone on this site. Undo restores the page and its redirects.</p>
        {entries.length > 0 && (
          <Button variant="ghost" onClick={() => setConfirmClear(true)}>
            Clear history
          </Button>
        )}
      </header>
      {entries.length === 0 ? (
        <p className="rounded-lg border px-4 py-8 text-center text-md text-subtle-text">
          Nothing yet. Change a page’s URL or edit a redirect and it shows up here.
        </p>
      ) : (
        Object.entries(groups).map(([day, list]) => (
          <section key={day} className="flex flex-col gap-2">
            <h2 className="text-sm font-semibold text-subtle-text">{day}</h2>
            <ul className="flex flex-col divide-y rounded-lg border">
              {list.map((e) => (
                <li key={e.id} className="flex items-start gap-3 px-4 py-3">
                  <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md bg-neutral-bg text-neutral-fg">
                    <Icon path={ICON[e.kind]} className="size-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className={cn("text-md font-medium", e.undone && "text-subtle-text line-through")}>{e.title}</p>
                    {e.fromRoute && (
                      <p className="flex flex-wrap items-baseline gap-x-1.5 text-sm text-subtle-text">
                        <PathText>{e.fromRoute}</PathText>
                        {e.toRoute && (
                          <>
                            <span aria-hidden>→</span>
                            <PathText>{e.toRoute}</PathText>
                          </>
                        )}
                      </p>
                    )}
                    {e.detail && <p className="text-sm text-subtle-text">{e.detail}</p>}
                    {e.user && <p className="text-xs text-subtle-text">By {e.user}</p>}
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <span className="text-sm text-subtle-text tabular-nums">{new Date(e.at).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}</span>
                    {e.undone ? (
                      <Badge size="sm">Undone</Badge>
                    ) : e.undo?.length ? (
                      <Button size="xs" variant="ghost" disabled={busy} onClick={() => void undo(e)}>
                        <Icon path={mdiUndoVariant} className="size-4" />
                        Undo
                      </Button>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
      <AlertDialog open={confirmClear} onOpenChange={setConfirmClear}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear history?</AlertDialogTitle>
            <AlertDialogDescription>You won’t be able to undo these changes from here. Content in Sitecore isn’t affected.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => clearActivity()}>Clear history</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
