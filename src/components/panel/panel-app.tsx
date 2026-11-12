"use client";

import { useCallback, useEffect, useState } from "react";
import { PageWorkbench } from "@/components/ops/page-workbench";
import { ConnectionError, SampleDataBanner, WorkbenchSkeleton } from "@/components/ops/states";
import type { ChangeKind } from "@/components/ops/flows";
import { useJobs, usePagesContext, usePending, useSitecoreApi } from "@/hooks/use-sitecore";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ops/spinner";
import { publishPending } from "@/lib/ops/publish-pending";
import { useMarketplace } from "@/lib/marketplace/provider";
import type { PageRef } from "@/lib/sitecore/types";

/** The Pages context panel: everything for the page open in the editor. */
export function PanelApp() {
  const mp = useMarketplace();
  const { site, page: ctxPage } = usePagesContext();
  const api = useSitecoreApi(site);
  const [fresh, setFresh] = useState<PageRef | null>(null);
  const page = fresh && ctxPage && fresh.id === ctxPage.id ? fresh : ctxPage;
  const pending = usePending(site?.name ?? null);
  const jobs = useJobs();
  const publishing = jobs.some((j) => j.id === `publish-pending:${site?.name}` && j.status === "running");

  useEffect(() => setFresh(null), [ctxPage?.id]);

  const openPage = useCallback(
    (id: string) => {
      void mp.client?.mutate("pages.context", { params: { itemId: id } });
    },
    [mp.client],
  );

  const onChanged = useCallback(
    async (kind: ChangeKind, info?: { pageId?: string; parentId?: string }) => {
      if (!api || !page) return;
      if (kind === "deleted") {
        if (info?.parentId) openPage(info.parentId);
        return;
      }
      if (kind === "duplicated") return;
      try {
        setFresh(await api.getPage(page.id, page.language));
      } catch {
        // context subscription will catch up
      }
      void mp.client?.mutate("pages.reloadCanvas").catch(() => {});
    },
    [api, page, mp.client, openPage],
  );

  if (mp.status === "error" && mp.error) return <ConnectionError error={mp.error} onRetry={mp.retry} />;

  return (
    <div className="flex h-dvh flex-col">
      {mp.mode === "sample" && <SampleDataBanner />}
      {api && pending.length > 0 && (
        <div className="flex items-center gap-2 border-b bg-warning-bg px-4 py-2 text-warning-fg">
          <span className="min-w-0 flex-1 text-sm">
            <span className="font-semibold">{pending.length} change{pending.length === 1 ? "" : "s"} not live yet</span>
            <span className="block truncate text-xs">{pending.slice(0, 3).map((p) => p.label).join(", ")}{pending.length > 3 ? "…" : ""}</span>
          </span>
          <Button size="xs" disabled={publishing} onClick={() => void publishPending(api, pending)}>
            {publishing && <Spinner className="size-3.5 text-inverse-text" />}
            Publish all
          </Button>
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {!api || !page ? (
          <WorkbenchSkeleton />
        ) : (
          <PageWorkbench key={page.id} api={api} page={page} onChanged={onChanged} onOpenPage={openPage} />
        )}
      </div>
    </div>
  );
}
