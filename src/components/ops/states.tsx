"use client";

import { mdiLanConnect } from "@mdi/js";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Icon } from "@/lib/icon";

export function WorkbenchSkeleton() {
  return (
    <div className="flex flex-col gap-5 px-4 py-4" aria-busy="true" aria-label="Loading page">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-6 w-2/3" />
        <Skeleton className="h-4 w-1/2" />
      </div>
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="flex items-center gap-3">
          <Skeleton className="size-9 rounded-lg" />
          <div className="flex flex-1 flex-col gap-1.5">
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-3 w-2/3" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function ConnectionError({ error, onRetry }: { error: Error; onRetry: () => void }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
      <span className="flex size-12 items-center justify-center rounded-full bg-danger-bg text-danger-fg">
        <Icon path={mdiLanConnect} className="size-6" />
      </span>
      <h2 className="text-lg font-semibold">Couldn’t connect to Sitecore</h2>
      <p className="max-w-sm text-md text-subtle-text">{error.message}</p>
      <Button onClick={onRetry}>Try again</Button>
    </div>
  );
}

export function SampleDataBanner() {
  return (
    <div className="border-b bg-warning-bg px-4 py-1.5 text-sm text-warning-fg">
      Sample data. Open this app from SitecoreAI to work on your own site.
    </div>
  );
}
