import type { RedirectType } from "./sitecore/types";

export interface AppSettings {
  /** Where redirect maps live. `{site}` is replaced with the site root path. */
  redirectFolderPath: string;
  /** Name of the redirect map this app creates and writes to. */
  managedMapName: string;
  /** Template used when the managed redirect map must be created. */
  redirectMapTemplatePath: string;
  defaultRedirectType: RedirectType;
  preserveQueryString: boolean;
  /** Point older redirects at the new URL so visitors never hop twice. */
  collapseChains: boolean;
  /** When a page with children changes URL, add one pattern redirect for all of them. */
  redirectChildren: boolean;
  /** Search index field that stores outgoing links (used to find referring items). */
  referencesField: string;
  /** Publishing target database name. */
  publishTarget: string;
  /** Ask authors to type the page name before deleting. */
  requireTypedDeleteConfirm: boolean;
  /** Pages not edited for this many months count as stale. */
  staleMonths: number;
  /** Google OAuth client ID (web) for Search Console. */
  gscClientId: string;
  /** Search Console property, e.g. sc-domain:example.com or https://www.example.com/ */
  gscProperty: string;
  /**
   * Page builder link. Tokens: {tenant} {organization} {itemId} {language} {site} {version}.
   * Empty tokens are dropped from the query string.
   */
  pageBuilderUrl: string;
}

export const DEFAULT_SETTINGS: AppSettings = {
  redirectFolderPath: "{site}/Settings/Redirects",
  managedMapName: "Page Operations",
  redirectMapTemplatePath: "/sitecore/templates/Foundation/Experience Accelerator/Redirects/Redirect Map",
  defaultRedirectType: "Redirect301",
  preserveQueryString: true,
  collapseChains: true,
  redirectChildren: true,
  referencesField: "_links",
  publishTarget: "experienceedge",
  requireTypedDeleteConfirm: true,
  staleMonths: 12,
  gscClientId: "",
  gscProperty: "",
  pageBuilderUrl: "https://pages.sitecorecloud.io/editor?tenantName={tenant}&organization={organization}&sc_itemid={itemId}&sc_lang={language}&sc_site={site}&sc_version={version}",
};

/** Earlier defaults that should follow the new default instead of being kept as a choice. */
const OLD_DEFAULTS: Partial<Record<keyof AppSettings, string[]>> = {
  redirectMapTemplatePath: ["/sitecore/templates/Feature/JSS Experience Accelerator/Redirects/Redirect Map"],
};

/** Fill in new fields and move values still on an old default to the current default. */
export function normalizeSettings(s: Partial<AppSettings>): AppSettings {
  const out = { ...DEFAULT_SETTINGS, ...s } as AppSettings;
  for (const [k, olds] of Object.entries(OLD_DEFAULTS) as [keyof AppSettings, string[]][]) {
    if (olds.includes(String(out[k]))) (out as unknown as Record<string, unknown>)[k] = DEFAULT_SETTINGS[k];
  }
  return out;
}

const KEY = "page-ops:settings:v1";

export function loadSettings(): AppSettings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return DEFAULT_SETTINGS;
    return normalizeSettings(JSON.parse(raw) as Partial<AppSettings>);
  } catch {
    return DEFAULT_SETTINGS;
  }
}

let teamWriter: ((s: AppSettings) => Promise<void>) | null = null;
/** Set by the active site so saved settings are shared with the team. */
export function setSettingsWriter(fn: ((s: AppSettings) => Promise<void>) | null) {
  teamWriter = fn;
}

export function saveSettings(settings: AppSettings, opts: { share?: boolean } = { share: true }) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    // Storage can be unavailable in some sandboxed iframes; settings then last for the session.
  }
  window.dispatchEvent(new CustomEvent("page-ops:settings"));
  if (opts.share !== false) void teamWriter?.(settings).catch(() => {});
}
