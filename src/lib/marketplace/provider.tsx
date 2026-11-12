"use client";

import type { ApplicationContext, ClientSDK } from "@sitecore-marketplace-sdk/client";

export interface Environment {
  id: string;
  name: string;
  tenant?: string;
  /** Preview context ID: used for Authoring/Pages/Sites APIs */
  contextId: string;
}
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { getMarketplaceClient, isMockMode } from "./client";

export interface MarketplaceState {
  status: "connecting" | "ready" | "error";
  error: Error | null;
  client: ClientSDK | null;
  mode: "live" | "sample";
  /** Preview context ID of the selected environment */
  contextId: string;
  tenantName?: string;
  /** Every environment this installation can reach (Standalone can switch between them) */
  environments: Environment[];
  environmentId: string | null;
  /** True when the user (or storage) has picked an environment */
  environmentChosen: boolean;
  selectEnvironment: (id: string | null) => void;
  appContext: ApplicationContext | null;
  user: { name?: string; email?: string } | null;
  retry: () => void;
}

const Ctx = createContext<MarketplaceState | null>(null);

const envKey = (installation?: string) => `page-ops:env:${installation ?? "default"}`;

export function MarketplaceProvider({ children }: { children: ReactNode }) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<Omit<MarketplaceState, "retry" | "contextId" | "tenantName" | "environmentId" | "environmentChosen" | "selectEnvironment">>({
    status: "connecting",
    error: null,
    client: null,
    mode: "live",
    environments: [],
    appContext: null,
    user: null,
  });
  const [envId, setEnvId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setState((s) => ({ ...s, status: "connecting", error: null }));
      try {
        const client = await getMarketplaceClient();
        const ctxRes = await client.query("application.context");
        const appContext = (ctxRes.data ?? null) as ApplicationContext | null;
        const resources = appContext?.resourceAccess ?? appContext?.resources ?? [];
        // resourceId names the product (e.g. "xmcloud") and repeats across environments.
        // tenantId is the environment; the preview context ID is the fallback. Both are unique.
        const seen = new Set<string>();
        const environments: Environment[] = resources
          .filter((r) => r?.context?.preview)
          .map((r) => {
            let id = String(r.tenantId || r.context.preview);
            if (seen.has(id)) id = r.context.preview;
            seen.add(id);
            return {
              id,
              name: r.tenantDisplayName ?? r.tenantName ?? "Environment",
              tenant: r.tenantName,
              contextId: r.context.preview,
            };
          });
        if (!environments.length) throw new Error("This installation has no access to a SitecoreAI environment. Reinstall the app and grant access to an environment.");
        // Only Standalone chooses its environment. Full Screen and the Pages panel always use the
        // environment SitecoreAI opened them in, never one remembered from Standalone.
        const chooses = window.location.pathname.startsWith("/standalone");
        let stored: string | null = null;
        try {
          stored = chooses ? window.localStorage.getItem(envKey(appContext?.installationId)) : null;
        } catch {
          stored = null;
        }
        let user: MarketplaceState["user"] = null;
        try {
          user = ((await client.query("host.user")).data as MarketplaceState["user"]) ?? null;
        } catch {
          // user info is optional
        }
        if (!cancelled) {
          setEnvId(stored && environments.some((e) => e.id === stored) ? stored : null);
          setState({ status: "ready", error: null, client, mode: isMockMode() ? "sample" : "live", environments, appContext, user });
        }
      } catch (e) {
        if (!cancelled) setState((s) => ({ ...s, status: "error", error: e instanceof Error ? e : new Error(String(e)) }));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const retry = useCallback(() => setAttempt((a) => a + 1), []);
  const selectEnvironment = useCallback(
    (id: string | null) => {
      setEnvId(id);
      try {
        const k = envKey(state.appContext?.installationId);
        if (id) window.localStorage.setItem(k, id);
        else window.localStorage.removeItem(k);
      } catch {
        // storage blocked: choice lasts for this session
      }
    },
    [state.appContext?.installationId],
  );
  const value = useMemo(() => {
    const env = state.environments.find((e) => e.id === envId) ?? state.environments[0];
    return {
      ...state,
      retry,
      contextId: env?.contextId ?? "",
      tenantName: env?.name,
      environmentId: env?.id ?? null,
      environmentChosen: !!envId,
      selectEnvironment,
    };
  }, [state, retry, envId, selectEnvironment]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useMarketplace(): MarketplaceState {
  const v = useContext(Ctx);
  if (!v) throw new Error("useMarketplace must be used inside <MarketplaceProvider>");
  return v;
}
