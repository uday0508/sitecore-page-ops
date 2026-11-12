"use client";

import { mdiArrowRight, mdiServerNetwork } from "@mdi/js";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { AppMark } from "@/components/ops/app-mark";
import { ErrorNote } from "@/components/ops/primitives";
import { useAsync } from "@/hooks/use-async";
import { Icon } from "@/lib/icon";
import { useMarketplace, type Environment } from "@/lib/marketplace/provider";
import { SitecoreApi } from "@/lib/sitecore/api";

function EnvironmentCard({ env, onOpen }: { env: Environment; onOpen: () => void }) {
  const { client } = useMarketplace();
  const sites = useAsync(client ? () => SitecoreApi.listSites(client, env.contextId) : null, [client, env.contextId]);
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        className="group flex h-full w-full flex-col gap-3 rounded-xl border bg-body-bg p-5 text-left transition-[border-color,box-shadow] hover:border-primary/50 hover:shadow-sm focus-visible:ring-[3px] focus-visible:ring-primary/40 focus-visible:outline-none"
      >
        <div className="flex items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary-bg text-primary-fg">
            <Icon path={mdiServerNetwork} className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-semibold">{env.name}</h2>
            {env.tenant && env.tenant !== env.name && <p className="font-path truncate text-sm text-subtle-text">{env.tenant}</p>}
          </div>
          <Icon path={mdiArrowRight} className="size-5 text-subtle-text transition-transform group-hover:translate-x-0.5" />
        </div>
        {sites.loading && !sites.data ? (
          <Skeleton className="h-5 w-40" />
        ) : sites.error ? (
          <p className="text-sm text-danger-fg">Couldn’t list sites: {sites.error.message}</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {(sites.data ?? []).slice(0, 6).map((s) => (
              <Badge key={s.id}>{s.displayName}</Badge>
            ))}
            {(sites.data?.length ?? 0) > 6 && <span className="text-sm text-subtle-text">and {sites.data!.length - 6} more</span>}
            {sites.data?.length === 0 && <span className="text-sm text-subtle-text">No sites yet</span>}
          </div>
        )}
      </button>
    </li>
  );
}

/** Standalone home: every environment this installation can reach. */
export function EnvironmentsHome() {
  const mp = useMarketplace();
  return (
    <div className="flex min-h-dvh flex-col bg-subtle-bg">
      <header className="flex h-14 items-center gap-2 border-b bg-body-bg px-6">
        <AppMark className="size-7" />
        <span className="text-md font-semibold">Page Operations</span>
      </header>
      <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-6 py-10">
        <div>
          <h1 className="text-2xl font-semibold">Choose an environment</h1>
          <p className="text-md text-subtle-text">Page Operations is installed on {mp.environments.length} environments. You can switch any time from the top bar.</p>
        </div>
        {mp.error && <ErrorNote error={mp.error} onRetry={mp.retry} />}
        <ul className="grid gap-4 md:grid-cols-2">
          {mp.environments.map((env) => (
            <EnvironmentCard key={env.id} env={env} onOpen={() => mp.selectEnvironment(env.id)} />
          ))}
        </ul>
      </main>
    </div>
  );
}
