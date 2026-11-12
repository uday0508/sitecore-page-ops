"use client";

import {
  mdiAccountLockOutline,
  mdiArrowDecisionOutline,
  mdiCloudUploadOutline,
  mdiFileTreeOutline,
  mdiLinkVariant,
  mdiProgressClock,
  mdiSourceBranch,
  mdiTrashCanOutline,
  mdiUndoVariant,
} from "@mdi/js";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { RedirectPlan } from "@/lib/sitecore/redirects";
import { isPattern } from "@/lib/sitecore/redirects";
import type { PageRef, Reference } from "@/lib/sitecore/types";
import { ImpactRow, PathText } from "./primitives";

export function ReferenceList({ items, max = 6 }: { items: Reference[]; max?: number }) {
  const [all, setAll] = useState(false);
  const shown = all ? items : items.slice(0, max);
  return (
    <div className="mt-2 flex flex-col gap-1">
      <ul className="flex flex-col divide-y rounded-md border">
        {shown.map((r) => (
          <li key={r.id} className="flex items-center gap-2 px-2.5 py-1.5">
            <span className="min-w-0 flex-1">
              <span className="block truncate text-md text-body-text">{r.name}</span>
              <span className="font-path block truncate text-xs text-subtle-text" title={r.path}>
                {r.path.replace(/^\/sitecore\/content\/[^/]+\/[^/]+/i, "…")}
              </span>
            </span>
            <Badge size="sm" colorScheme={r.kind === "page" ? "blue" : "neutral"}>
              {r.kind === "page" ? "Page" : "Content"}
            </Badge>
          </li>
        ))}
      </ul>
      {items.length > max && (
        <Button variant="link" size="xs" className="self-start px-0" onClick={() => setAll(!all)}>
          {all ? "Show fewer" : `Show all ${items.length}`}
        </Button>
      )}
    </div>
  );
}

export function ReferencesRow({
  loading,
  error,
  items,
  verb = "change",
}: {
  loading: boolean;
  error: Error | null;
  items: Reference[] | undefined;
  verb?: "change" | "delete";
}) {
  const [open, setOpen] = useState(false);
  if (loading && !items) {
    return (
      <div className="flex items-center gap-3 py-2.5">
        <Skeleton className="size-7 rounded-md" />
        <div className="flex flex-1 flex-col gap-1.5">
          <Skeleton className="h-3.5 w-2/3" />
          <Skeleton className="h-3 w-1/2" />
        </div>
      </div>
    );
  }
  if (error) {
    return (
      <ImpactRow icon={mdiLinkVariant} tone="warning" title="Couldn’t check which pages link here">
        The search index didn’t answer ({error.message}). Check the reference field in Settings.
      </ImpactRow>
    );
  }
  const list = items ?? [];
  const pages = list.filter((r) => r.kind === "page").length;
  const content = list.length - pages;
  if (list.length === 0) {
    return (
      <ImpactRow icon={mdiLinkVariant} tone="success" title="No other pages link here">
        Nothing inside the site needs updating.
      </ImpactRow>
    );
  }
  const what = [pages && `${pages} page${pages === 1 ? "" : "s"}`, content && `${content} content item${content === 1 ? "" : "s"}`]
    .filter(Boolean)
    .join(" and ");
  return (
    <ImpactRow
      icon={mdiLinkVariant}
      tone={verb === "delete" ? "danger" : "warning"}
      title={`Linked from ${what}`}
      action={
        <Button variant="ghost" size="xs" onClick={() => setOpen(!open)} aria-expanded={open}>
          {open ? "Hide" : "View"}
        </Button>
      }
    >
      {verb === "delete"
        ? "These links will break. The redirect below sends their visitors somewhere useful; edit the links when you can."
        : "Their links follow the page automatically. Republish them so the live site shows the new URL."}
      {open && <ReferenceList items={list} />}
    </ImpactRow>
  );
}

/** What a URL change will do, before it happens. */
export function UrlChangeImpact({
  page,
  plan,
  redirectsOn,
  redirectsLoading,
  references,
}: {
  page: PageRef;
  plan: RedirectPlan | null;
  redirectsOn: boolean;
  redirectsLoading: boolean;
  references: { loading: boolean; error: Error | null; items: Reference[] | undefined };
}) {
  return (
    <div className="flex flex-col divide-y">
      {redirectsOn ? (
        redirectsLoading && !plan ? (
          <div className="py-2.5">
            <Skeleton className="h-10 w-full" />
          </div>
        ) : (
          plan &&
          plan.add.map((r) => (
            <ImpactRow
              key={r.source}
              icon={isPattern(r.source) ? mdiFileTreeOutline : mdiArrowDecisionOutline}
              tone="success"
              title={isPattern(r.source) ? "Pages below follow with one pattern redirect" : "Old URL redirects to the new one"}
            >
              <PathText>{r.source}</PathText> <span aria-hidden>→</span> <PathText>{r.target}</PathText>
            </ImpactRow>
          ))
        )
      ) : (
        <ImpactRow icon={mdiArrowDecisionOutline} tone="danger" title="No redirect">
          Bookmarks, search results and links from other sites to the old URL will show a 404 page.
        </ImpactRow>
      )}

      {redirectsOn && plan && plan.retarget.length > 0 && (
        <ImpactRow
          icon={mdiSourceBranch}
          tone="primary"
          title={`${plan.retarget.length} older redirect${plan.retarget.length === 1 ? "" : "s"} updated to skip a hop`}
        >
          {plan.retarget.slice(0, 3).map((r) => (
            <span key={r.rule.key} className="block">
              <PathText>{r.rule.source}</PathText> <span aria-hidden>→</span> <PathText>{r.newTarget}</PathText>
            </span>
          ))}
        </ImpactRow>
      )}

      {plan && plan.remove.length > 0 && (
        <ImpactRow
          icon={mdiTrashCanOutline}
          tone="warning"
          title={`${plan.remove.length} redirect${plan.remove.length === 1 ? "" : "s"} removed`}
        >
          {plan.remove.length === 1 ? "It" : "They"} would send visitors away from the new URL. From “{plan.remove[0].mapName}”.
        </ImpactRow>
      )}

      <ReferencesRow {...references} />

      {page.locked && !page.lockedByMe && (
        <ImpactRow icon={mdiAccountLockOutline} tone="warning" title="Another author has this page locked">
          The change may fail. Ask them to finish editing, or try anyway.
        </ImpactRow>
      )}
      {page.workflowState && (
        <ImpactRow icon={mdiProgressClock} tone="neutral" title={`Workflow: ${page.workflowState}`}>
          The URL changes for all versions. Content approval doesn’t change.
        </ImpactRow>
      )}
      <ImpactRow icon={mdiCloudUploadOutline} tone="neutral" title="Nothing goes live until you publish">
        You can publish the page and its redirects in one step afterwards.
      </ImpactRow>
      <ImpactRow icon={mdiUndoVariant} tone="neutral" title="You can undo this">
        From the confirmation screen, or later from Activity.
      </ImpactRow>
    </div>
  );
}
