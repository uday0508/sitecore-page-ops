"use client";

import { mdiAlertCircle, mdiCheckCircle, mdiCloseCircle, mdiMinusCircleOutline, mdiRefresh } from "@mdi/js";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { relativeTime } from "@/components/ops/primitives";
import { Spinner } from "@/components/ops/spinner";
import { useSettings } from "@/hooks/use-settings";
import { useMarketplace } from "@/lib/marketplace/provider";
import { Icon } from "@/lib/icon";
import { loadSetup, runSetupCheck, saveSetup, type SetupResult } from "@/lib/setup";
import type { SitecoreApi } from "@/lib/sitecore/api";
import { cn } from "@/lib/utils";

const ICON = { pass: mdiCheckCircle, warn: mdiAlertCircle, fail: mdiCloseCircle, skip: mdiMinusCircleOutline };
const TONE = { pass: "text-success-fg", warn: "text-warning-fg", fail: "text-danger-fg", skip: "text-subtle-text" };

export function useSetupResult(api: SitecoreApi | null) {
  const [settings] = useSettings();
  const mp = useMarketplace();
  const [result, setResult] = useState<SetupResult | null>(null);
  const [running, setRunning] = useState(false);
  const run = async () => {
    if (!api) return;
    setRunning(true);
    try {
      const r = await runSetupCheck(api, settings, { tenant: mp.environment?.tenant, organization: mp.environment?.organization });
      saveSetup(r);
      setResult(r);
    } finally {
      setRunning(false);
    }
  };
  useEffect(() => {
    if (!api) return;
    const saved = loadSetup(api.site.name);
    setResult(saved);
    // First visit for this site: check automatically so problems show before they bite.
    if (!saved) void run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api?.site.name, api?.contextId]);
  return { result, running, run };
}

export function SetupCheck({ api, onOpenSettings }: { api: SitecoreApi; onOpenSettings?: () => void }) {
  const { result, running, run } = useSetupResult(api);
  return (
    <div className="flex flex-col gap-4 px-8 py-8">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold">Setup check</h2>
          <p className="text-md text-subtle-text">
            Checks what Page Operations relies on in this environment, for {api.site.displayName}.{result ? ` Last run ${relativeTime(result.at)}.` : ""}
          </p>
        </div>
        <Button variant="outline" onClick={run} disabled={running}>
          {running ? <Spinner /> : <Icon path={mdiRefresh} className="size-5" />}
          Run again
        </Button>
      </header>
      {!result ? (
        <p className="text-md text-subtle-text">{running ? "Checking…" : "Not checked yet."}</p>
      ) : (
        <ul className="flex flex-col divide-y rounded-lg border">
          {result.checks.map((c) => (
            <li key={c.id} className="flex items-start gap-3 px-4 py-3">
              <Icon path={ICON[c.status]} className={cn("mt-0.5 size-5 shrink-0", TONE[c.status])} />
              <div className="min-w-0 flex-1">
                <p className="text-md font-medium">{c.label}</p>
                <p className="text-sm break-words text-subtle-text">{c.detail}</p>
                {c.status !== "pass" && c.affects !== "—" && <p className="text-xs text-subtle-text">Affects: {c.affects}</p>}
              </div>
              {c.fix === "settings" && c.status !== "pass" && onOpenSettings && (
                <Button size="xs" variant="ghost" colorScheme="primary" onClick={onOpenSettings}>
                  Fix in settings
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
