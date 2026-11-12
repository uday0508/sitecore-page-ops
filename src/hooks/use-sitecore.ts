"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { setCurrentUser, syncActivity } from "@/lib/activity";
import { syncPending } from "@/lib/pending";
import { DEFAULT_SETTINGS, saveSettings, setSettingsWriter, type AppSettings } from "@/lib/settings";
import { teamStoreFor } from "@/lib/store/team";
import { getVersion, shared, subscribeSiteData } from "@/lib/sitecore/site-cache";
import { useMarketplace } from "@/lib/marketplace/provider";
import { SitecoreApi, toPageRef } from "@/lib/sitecore/api";
import { analyze, flattenMaps } from "@/lib/sitecore/redirects";
import type { LivePage, PageRef, RedirectIssue, RedirectMap, RedirectRule, SiteRef } from "@/lib/sitecore/types";
import { useAsync } from "./use-async";
import { useSettings } from "./use-settings";

export function useSitecoreApi(site: SiteRef | null): SitecoreApi | null {
  const { client, contextId, user } = useMarketplace();
  const [settings] = useSettings();
  const api = useMemo(
    () => (client && site ? new SitecoreApi(client, contextId, site, settings) : null),
    [client, contextId, site, settings],
  );

  useEffect(() => setCurrentUser(user?.name ?? user?.email), [user]);

  // Team store: shared settings, activity and the not-live list. Synced on load, on focus and every minute.
  const storeKey = api ? `${api.contextId}|${api.site.id}` : null;
  useEffect(() => {
    if (!api) return;
    const store = teamStoreFor(api);
    let cancelled = false;
    setSettingsWriter((s) => store.setSettings(s));
    const sync = async () => {
      await store.ensure();
      if (cancelled || !store.available) return;
      await Promise.all([syncActivity(api.site.name).catch(() => {}), syncPending(api.site.name).catch(() => {})]);
    };
    void (async () => {
      await store.ensure();
      const team = await store.getSettings<Partial<AppSettings>>().catch(() => null);
      if (!cancelled && team) saveSettings({ ...DEFAULT_SETTINGS, ...team }, { share: false });
      await sync();
    })();
    const onFocus = () => void sync();
    window.addEventListener("focus", onFocus);
    const t = window.setInterval(() => void sync(), 60_000);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", onFocus);
      window.clearInterval(t);
      setSettingsWriter(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeKey]);

  return api;
}

/** Live page + site from the Pages editor (context panel). */
export function usePagesContext() {
  const { client } = useMarketplace();
  const [state, setState] = useState<{ site: SiteRef | null; page: PageRef | null }>({ site: null, page: null });

  useEffect(() => {
    if (!client) return;
    let unsub: (() => void) | undefined;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const apply = (ctx: any) => {
      const s = ctx?.siteInfo;
      const p = ctx?.pageInfo;
      if (!s || !p?.id) return;
      setState((prev) => {
        const site: SiteRef =
          prev.site && prev.site.id === s.id
            ? prev.site
            : {
                id: s.id,
                name: s.name,
                displayName: s.displayName || s.name,
                language: p.language || s.language || "en",
                languages: s.supportedLanguages ?? s.languages ?? [s.language ?? "en"],
                startItemId: s.startItemId,
                brandKitId: s.brandKitId,
              };
        return { site, page: toPageRef(p, site.language) };
      });
    };
    client
      .query("pages.context", { subscribe: true, onSuccess: apply })
      .then((r) => {
        apply(r.data);
        unsub = r.unsubscribe;
      })
      .catch(() => {});
    return () => unsub?.();
  }, [client]);

  return state;
}

export interface RedirectState {
  /** Set when redirect maps couldn't be loaded; pages and other checks still work. */
  mapsError?: string;
  folderPath?: string;
  maps: RedirectMap[];
  folderId: string | null;
  rules: RedirectRule[];
  livePages: LivePage[] | null;
  issues: Map<string, RedirectIssue[]>;
}

/** Redirect maps + live pages + health analysis for a site. */
/** Shared across every screen: one load per site until something changes it. */
export function useRedirectState(api: SitecoreApi | null) {
  const ver = useSyncExternalStore(subscribeSiteData, getVersion, getVersion);
  const key = api ? `${api.contextId}|${api.site.id}|${api.settings.redirectFolderPath}|${api.settings.managedMapName}` : "";
  const state = useAsync<RedirectState>(api ? () => shared(key, () => loadRedirectState(api)) : null, [api, ver]);
  return { ...state, reload: async () => (await import("@/lib/sitecore/site-cache")).invalidateSiteData() };
}

function loadRedirectState(api: SitecoreApi): Promise<RedirectState> {
  return (async () => {
          const [state, livePages, folderPath] = await Promise.all([
            api.loadRedirectMaps().catch((e: unknown) => ({
              folderId: null,
              maps: [] as RedirectMap[],
              mapsError: e instanceof Error ? e.message : String(e),
            })),
            api.listAllPages().catch(() => null),
            api.redirectFolderPath().catch(() => undefined),
          ]);
          const rules = flattenMaps(state.maps);
          return { ...state, folderPath, rules, livePages, issues: analyze(rules, livePages) };
  })();
}

export const EMPTY_REDIRECT_STATE: RedirectState = { maps: [], folderId: null, rules: [], livePages: null, issues: new Map() };

/* ---------- not-live list and jobs ---------- */
import { onPendingChange, readPending, type PendingItem } from "@/lib/pending";
import { getJobs, subscribeJobs } from "@/lib/jobs";

export function usePending(site: string | null): PendingItem[] {
  const [list, setList] = useState<PendingItem[]>([]);
  useEffect(() => {
    if (!site) return;
    const load = () => setList(readPending(site));
    load();
    return onPendingChange(load);
  }, [site]);
  return list;
}

export function useJobs() {
  return useSyncExternalStore(subscribeJobs, getJobs, getJobs);
}
