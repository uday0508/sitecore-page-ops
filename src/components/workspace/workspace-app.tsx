"use client";

import { mdiArrowDecisionOutline, mdiCogOutline, mdiFileTreeOutline, mdiFlaskOutline, mdiHistory, mdiHomeOutline, mdiMagnify, mdiPlus, mdiRadar } from "@mdi/js";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { HomeSection } from "./home-section";
import { JobsIndicator, PendingTray } from "./tray";
import { SetupCheck } from "./setup-check";
import { AppMark } from "@/components/ops/app-mark";
import { HealthSection } from "./health-section";
import { EnvironmentsHome } from "./environments";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from "@/components/ui/command";
import { Kbd } from "@/components/ui/kbd";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { ConnectionError, SampleDataBanner } from "@/components/ops/states";
import { ErrorNote } from "@/components/ops/primitives";
import { useAsync } from "@/hooks/use-async";
import { useRedirectState, useSitecoreApi } from "@/hooks/use-sitecore";
import { Icon } from "@/lib/icon";
import { useMarketplace } from "@/lib/marketplace/provider";
import { SitecoreApi } from "@/lib/sitecore/api";
import { cn } from "@/lib/utils";
import { ActivitySection } from "./activity-section";
import type { BrowseView } from "./page-browser";
import { PagesSection } from "./pages-section";
import { RedirectsSection, TesterDialog } from "./redirects-section";
import { SettingsSection } from "./settings-section";

export type Section = "home" | "pages" | "health" | "redirects" | "activity";
export interface NavState {
  section: Section;
  /** Redirects: issue filter */
  filter?: string;
  /** Redirects: rule key to edit, or "new" */
  edit?: string;
  /** Pages: open page */
  pageId?: string;
  /** Pages: browser view */
  view?: BrowseView;
}
export type Nav = (s: NavState) => void;

const SECTIONS: { id: Section; label: string; icon: string }[] = [
  { id: "home", label: "Home", icon: mdiHomeOutline },
  { id: "pages", label: "Pages", icon: mdiFileTreeOutline },
  { id: "health", label: "Health", icon: mdiRadar },
  { id: "redirects", label: "Redirects", icon: mdiArrowDecisionOutline },
  { id: "activity", label: "Activity", icon: mdiHistory },
];

/**
 * The workspace shared by Full Screen (one environment, inside SitecoreAI) and Standalone
 * (Cloud Portal: pick an environment first, switch from the top bar).
 */
export function WorkspaceApp({ surface = "fullscreen" }: { surface?: "fullscreen" | "standalone" }) {
  const mp = useMarketplace();
  const standalone = surface === "standalone";
  const [navState, setNavState] = useState<NavState>({ section: "home" });
  const [siteId, setSiteId] = useState<string | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [testerOpen, setTesterOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<"setup" | "settings">("setup");
  const openSettings = (tab: "setup" | "settings" = "setup") => {
    setSettingsTab(tab);
    setSettingsOpen(true);
  };

  const sites = useAsync(mp.client && mp.contextId ? () => SitecoreApi.listSites(mp.client!, mp.contextId) : null, [mp.client, mp.contextId]);
  useEffect(() => {
    setSiteId(null);
    setNavState({ section: "home" });
  }, [mp.contextId]);
  const site = useMemo(() => sites.data?.find((s) => s.id === siteId) ?? sites.data?.[0] ?? null, [sites.data, siteId]);
  const api = useSitecoreApi(site);
  const redirects = useRedirectState(api);

  // Restore the view from the host URL, so links and reloads reopen the same place.
  useEffect(() => {
    if (!mp.client) return;
    mp.client
      .query("application.urlState")
      .then((r) => {
        const st = (r.data as { state?: Record<string, unknown> } | undefined)?.state;
        if (!st) return;
        if (standalone && typeof st.env === "string" && mp.environments.some((e) => e.id === st.env)) mp.selectEnvironment(st.env);
        if (typeof st.site === "string") setSiteId(st.site);
        const section = st.s === "redirects" || st.s === "activity" || st.s === "health" || st.s === "pages" ? st.s : "home";
        setNavState({
          section,
          pageId: typeof st.p === "string" ? st.p : undefined,
          view: st.v === "all" || st.v === "bin" ? st.v : undefined,
          filter: typeof st.f === "string" ? st.f : undefined,
        });
      })
      .catch(() => {});
  }, [mp.client]);

  const nav: Nav = useCallback(
    (s) => {
      setNavState(s);
      const state: Record<string, string> = { s: s.section };
      if (site) state.site = site.id;
      if (standalone && mp.environmentId) state.env = mp.environmentId;
      if (s.pageId) state.p = s.pageId;
      if (s.view) state.v = s.view;
      if (s.filter) state.f = s.filter;
      void mp.client?.mutate("application.urlState", { params: { state } }).catch(() => {});
    },
    [mp.client, site, standalone, mp.environmentId],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (mp.status === "error" && mp.error) return <ConnectionError error={mp.error} onRetry={mp.retry} />;
  if (standalone && mp.status === "ready" && mp.environments.length > 1 && !mp.environmentChosen) return <EnvironmentsHome />;

  const errorCount = redirects.data ? [...redirects.data.issues.values()].filter((l) => l.some((i) => i.severity === "error")).length : 0;
  const go = (s: NavState) => {
    setPaletteOpen(false);
    nav(s);
  };

  return (
    <div className="flex h-dvh flex-col bg-body-bg">
      {mp.mode === "sample" && <SampleDataBanner />}
      <header className="flex h-14 shrink-0 items-center gap-6 border-b px-6">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-2">
            <AppMark className="size-7" />
            <span className="text-md font-semibold whitespace-nowrap">Page Operations</span>
          </span>
          {standalone && mp.environments.length > 1 && (
            <Select
              value={mp.environmentId ?? undefined}
              onValueChange={(v: string) => (v === "__all" ? mp.selectEnvironment(null) : mp.selectEnvironment(v))}
            >
              <SelectTrigger aria-label="Environment" className="h-8 w-56">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {mp.environments.map((e) => (
                  <SelectItem key={e.id} value={e.id}>
                    {e.name}
                  </SelectItem>
                ))}
                <SelectItem value="__all">All environments…</SelectItem>
              </SelectContent>
            </Select>
          )}
          {sites.data && sites.data.length > 0 ? (
            <Select value={site?.id} onValueChange={(v: string) => setSiteId(v)}>
              <SelectTrigger aria-label="Site" className="h-8 w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {sites.data.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.displayName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <Skeleton className="h-8 w-48 rounded-md" />
          )}
        </div>

        <nav aria-label="Sections" className="flex h-full items-stretch gap-1">
          {SECTIONS.map((s) => {
            const active = navState.section === s.id;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => nav({ section: s.id })}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "-mb-px flex items-center gap-2 border-b-2 px-3 text-md outline-none focus-visible:ring-[3px] focus-visible:ring-primary/40 focus-visible:ring-inset",
                  active ? "border-primary font-semibold text-primary-fg" : "border-transparent text-neutral-fg hover:text-body-text",
                )}
              >
                {s.label}
                {s.id === "redirects" && errorCount > 0 && (
                  <Badge size="sm" colorScheme="danger" aria-label={`${errorCount} broken redirects`}>
                    {errorCount}
                  </Badge>
                )}
              </button>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <JobsIndicator />
          {api && <PendingTray api={api} redirects={redirects.data} />}
          <button
            type="button"
            onClick={() => setPaletteOpen(true)}
            className="flex h-8 w-60 items-center gap-2 rounded-md border px-2.5 text-left text-md text-subtle-text hover:border-border-color-a11y focus-visible:ring-[3px] focus-visible:ring-primary/40 focus-visible:outline-none"
          >
            <Icon path={mdiMagnify} className="size-4" />
            <span className="flex-1">Find a page</span>
            <Kbd>⌘K</Kbd>
          </button>
          <Button variant="ghost" size="icon-sm" aria-label="Settings and setup check" title="Settings and setup check" onClick={() => openSettings("setup")}>
            <Icon path={mdiCogOutline} className="size-5" />
          </Button>
        </div>
      </header>

      <main className="min-h-0 min-w-0 flex-1 overflow-y-auto">
        {sites.error ? (
          <div className="p-8">
            <ErrorNote error={`Couldn’t load sites: ${sites.error.message}`} onRetry={sites.reload} />
          </div>
        ) : sites.data && sites.data.length === 0 ? (
          <div className="mx-auto flex max-w-md flex-col items-center gap-2 py-24 text-center">
            <h2 className="text-lg font-semibold">No sites in this environment</h2>
            <p className="text-md text-subtle-text">Create a site in SitecoreAI, or install the app on an environment that has one.</p>
          </div>
        ) : !api ? (
          <div className="flex flex-col gap-4 p-8">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : navState.section === "home" ? (
          <HomeSection api={api} redirects={redirects} nav={nav} openSettings={() => openSettings("setup")} />
        ) : navState.section === "pages" ? (
          <PagesSection api={api} redirects={redirects} navState={navState} nav={nav} />
        ) : navState.section === "health" ? (
          <HealthSection api={api} redirects={redirects} nav={nav} initialReport={navState.filter} />
        ) : navState.section === "redirects" ? (
          <RedirectsSection
            api={api}
            redirects={redirects}
            navState={navState}
            nav={nav}
            openTester={() => setTesterOpen(true)}
            openSettings={() => openSettings("settings")}
          />
        ) : (
          <ActivitySection api={api} onUndone={() => void redirects.reload()} />
        )}
      </main>

      <TesterDialog state={redirects.data} open={testerOpen} onOpenChange={setTesterOpen} />

      <Sheet open={settingsOpen} onOpenChange={setSettingsOpen}>
        <SheetContent className="flex w-full flex-col gap-0 overflow-y-auto p-0 sm:max-w-2xl">
          <SheetHeader className="sr-only">
            <SheetTitle>Settings and setup check</SheetTitle>
            <SheetDescription>Page Operations settings</SheetDescription>
          </SheetHeader>
          <Tabs value={settingsTab} onValueChange={(v: string) => setSettingsTab(v as "setup" | "settings")} className="gap-0">
            <TabsList className="mx-8 mt-6">
              <TabsTrigger value="setup">Setup check</TabsTrigger>
              <TabsTrigger value="settings">Settings</TabsTrigger>
            </TabsList>
            <TabsContent value="setup">{api ? <SetupCheck api={api} onOpenSettings={() => setSettingsTab("settings")} /> : null}</TabsContent>
            <TabsContent value="settings">
              <SettingsSection siteName={site?.displayName} />
            </TabsContent>
          </Tabs>
        </SheetContent>
      </Sheet>

      <CommandDialog open={paletteOpen} onOpenChange={setPaletteOpen} title="Find a page" description="Jump to a page or run an action">
        <CommandInput placeholder="Type a URL or an action" />
        <CommandList>
          <CommandEmpty>No matches.</CommandEmpty>
          {redirects.data?.livePages && (
            <CommandGroup heading="Pages">
              {redirects.data.livePages.slice(0, 300).map((p) => (
                <CommandItem key={p.id} value={`page ${p.route}`} onSelect={() => go({ section: "pages", pageId: p.id })}>
                  <Icon path={mdiFileTreeOutline} />
                  <span className="font-path">{p.route}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}
          <CommandSeparator />
          <CommandGroup heading="Actions">
            <CommandItem onSelect={() => go({ section: "health" })}>
              <Icon path={mdiRadar} />
              Check site health
            </CommandItem>
            <CommandItem onSelect={() => go({ section: "redirects", edit: "new" })}>
              <Icon path={mdiPlus} />
              Add a redirect
            </CommandItem>
            <CommandItem
              onSelect={() => {
                setPaletteOpen(false);
                setTesterOpen(true);
              }}
            >
              <Icon path={mdiFlaskOutline} />
              Test a URL
            </CommandItem>
            <CommandItem onSelect={() => go({ section: "redirects", filter: "issues" })}>
              <Icon path={mdiArrowDecisionOutline} />
              Show broken redirects
            </CommandItem>
            <CommandItem
              onSelect={() => {
                setPaletteOpen(false);
                openSettings("settings");
              }}
            >
              <Icon path={mdiCogOutline} />
              Settings
            </CommandItem>
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </div>
  );
}
