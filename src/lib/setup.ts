/** Checks the environment-specific things the app depends on, so problems show up here, not mid-task. */
import type { AppSettings } from "./settings";
import type { SitecoreApi } from "./sitecore/api";
import { teamStoreFor } from "./store/team";

export interface Check {
  id: string;
  label: string;
  status: "pass" | "warn" | "fail" | "skip";
  detail: string;
  affects: string;
  fix?: "settings";
}

export interface SetupResult {
  at: string;
  site: string;
  checks: Check[];
}

const NEEDED_MUTATIONS = ["createItem", "updateItem", "deleteItem", "moveItem", "copyItem", "publishItem"];

async function attempt<T>(fn: () => Promise<T>): Promise<{ ok: true; value: T } | { ok: false; error: string }> {
  try {
    return { ok: true, value: await fn() };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function runSetupCheck(api: SitecoreApi, settings: AppSettings): Promise<SetupResult> {
  const checks: Check[] = [];
  const add = (c: Check) => checks.push(c);

  const root = await attempt(() => api.getTreeRoot());
  add(
    root.ok
      ? { id: "home", label: "Home page found", status: "pass", detail: `${root.value.displayName} at ${root.value.path}`, affects: "Everything" }
      : { id: "home", label: "Home page found", status: "fail", detail: root.error, affects: "Everything" },
  );
  if (!root.ok) return { at: new Date().toISOString(), site: api.site.name, checks };

  const schema = await attempt(() => api.mutationNames());
  if (schema.ok && schema.value.length) {
    const missing = NEEDED_MUTATIONS.filter((m) => !schema.value.includes(m));
    add({
      id: "schema",
      label: "Authoring API supports the app’s changes",
      status: missing.length ? "fail" : "pass",
      detail: missing.length ? `Missing: ${missing.join(", ")}` : NEEDED_MUTATIONS.join(", "),
      affects: missing.includes("copyItem") && missing.length === 1 ? "Make content local" : "Moves, redirects, publishing, bin",
    });
  } else {
    add({ id: "schema", label: "Authoring API supports the app’s changes", status: "skip", detail: "This environment doesn’t allow schema introspection, so it couldn’t be confirmed ahead of time.", affects: "—" });
  }

  const maps = await attempt(() => api.loadRedirectMaps());
  const folder = await api.redirectFolderPath().catch(() => settings.redirectFolderPath);
  add(
    maps.ok && maps.value.folderId
      ? { id: "redirects", label: "Redirects folder", status: "pass", detail: `${folder}, ${maps.value.maps.length} map${maps.value.maps.length === 1 ? "" : "s"}`, affects: "Redirects" }
      : { id: "redirects", label: "Redirects folder", status: "fail", detail: maps.ok ? `Nothing at ${folder}` : maps.error, affects: "Redirects, URL changes, moves, deletes", fix: "settings" },
  );

  const tpl = await attempt(() => api.itemIdByPath(settings.redirectMapTemplatePath));
  const tplOk = (tpl.ok && !!tpl.value) || (maps.ok && maps.value.maps.length > 0);
  add({
    id: "template",
    label: "Redirect Map template",
    status: tplOk ? "pass" : "fail",
    detail: tplOk ? (tpl.ok && tpl.value ? settings.redirectMapTemplatePath : "Taken from existing redirect maps") : `Not found at ${settings.redirectMapTemplatePath}`,
    affects: "Creating the app’s redirect map and campaigns",
    fix: tplOk ? undefined : "settings",
  });

  const refs = await attempt(() => api.findReferrers(root.value.id));
  add(
    refs.ok
      ? { id: "links", label: "Incoming links search", status: "pass", detail: `Search field ${settings.referencesField} works`, affects: "Link health, impact reviews, orphans" }
      : { id: "links", label: "Incoming links search", status: "warn", detail: refs.error, affects: "Link health, impact reviews, orphans", fix: "settings" },
  );

  const fields = await attempt(() => api.pageFields(root.value.id, api.language));
  add(
    fields.ok
      ? { id: "fields", label: "Page content readable", status: "pass", detail: `${fields.value.fields.length} fields on the home page`, affects: "Versions, broken links, accessibility, find and replace" }
      : { id: "fields", label: "Page content readable", status: "fail", detail: fields.error, affects: "Versions, broken links, accessibility, find and replace" },
  );

  const live = await api.liveState(root.value.id);
  add({
    id: "live",
    label: "Live status",
    status: live === null ? "warn" : "pass",
    detail: live === null ? "The live-status endpoint didn’t give a clear answer or timed out. Live badges are hidden." : `Home page is ${live ? "live" : "not published"}`,
    affects: "Live badges, publish checks",
  });

  const agent = await attempt(() => api.components(root.value.id, api.language, root.value.path));
  add(
    agent.ok
      ? { id: "agent", label: "Components and screenshots", status: "pass", detail: `${agent.value.length} components on the home page`, affects: "Components, make local, screenshots" }
      : { id: "agent", label: "Components and screenshots", status: "warn", detail: agent.error, affects: "Components, make local, screenshots" },
  );

  const store = teamStoreFor(api);
  await store.ensure();
  add(
    store.available
      ? { id: "team", label: "Shared with your team", status: "pass", detail: "Settings, activity and the not-live list are stored in Sitecore for everyone on this site.", affects: "Activity, undo, settings" }
      : { id: "team", label: "Shared with your team", status: "warn", detail: `Kept in this browser only: ${store.reason ?? "couldn’t create the Page Operations folder"}`, affects: "Activity, undo, settings" },
  );

  add(
    settings.gscClientId && settings.gscProperty
      ? { id: "gsc", label: "Search Console", status: "pass", detail: settings.gscProperty, affects: "Not found (404) report" }
      : { id: "gsc", label: "Search Console", status: "skip", detail: "Not set up. Optional: CSV import works without it.", affects: "Not found (404) report", fix: "settings" },
  );

  return { at: new Date().toISOString(), site: api.site.name, checks };
}

const key = (site: string) => `page-ops:setup:v1:${site}`;
export function loadSetup(site: string): SetupResult | null {
  try {
    return JSON.parse(window.localStorage.getItem(key(site)) ?? "null") as SetupResult | null;
  } catch {
    return null;
  }
}
export function saveSetup(r: SetupResult) {
  try {
    window.localStorage.setItem(key(r.site), JSON.stringify(r));
  } catch {
    // ignore
  }
}
