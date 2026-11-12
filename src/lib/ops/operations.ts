import { logActivity, markUndone, type ActivityEntry, type RedirectChange, type UndoPayload } from "../activity";
import type { PendingInput } from "../pending";

/** What a change needs published: the page (with its subpages when URLs below it moved) and any redirect maps. */
const pub = (page: { id: string; displayName: string; hasChildren?: boolean } | null, mapIds: string[] = [], subItems = false): PendingInput[] => [
  ...(page ? [{ id: page.id, label: page.displayName, kind: "page" as const, subItems: subItems || undefined }] : []),
  ...mapIds.map((id) => ({ id, label: "Redirects", kind: "redirects" as const })),
];
import type { SitecoreApi } from "../sitecore/api";
import { applyPlan, flattenMaps, planIsEmpty, planUrlChange, samePath, type RedirectPlan } from "../sitecore/redirects";
import type { PageRef, RedirectMap } from "../sitecore/types";

export type StepStatus = "pending" | "running" | "done" | "error" | "skipped";
export interface Step {
  id: string;
  label: string;
  status: StepStatus;
  detail?: string;
}
export type OnSteps = (steps: Step[]) => void;

/** Tiny runner that reports progress for each step so the UI can show what is happening. */
function runner(labels: [string, string][], onSteps: OnSteps) {
  const steps: Step[] = labels.map(([id, label]) => ({ id, label, status: "pending" }));
  const emit = () => onSteps(steps.map((s) => ({ ...s })));
  emit();
  return {
    async run<T>(id: string, fn: () => Promise<T>, detail?: (r: T) => string | undefined): Promise<T> {
      const s = steps.find((x) => x.id === id)!;
      s.status = "running";
      emit();
      try {
        const r = await fn();
        s.status = "done";
        s.detail = detail?.(r);
        emit();
        return r;
      } catch (e) {
        s.status = "error";
        s.detail = e instanceof Error ? e.message : String(e);
        emit();
        throw e;
      }
    },
    skip(id: string, detail?: string) {
      const s = steps.find((x) => x.id === id);
      if (s) {
        s.status = "skipped";
        s.detail = detail;
        emit();
      }
    },
  };
}

/* ------------------------------------------------------------------ */
/* Redirect plan execution                                             */
/* ------------------------------------------------------------------ */

export async function executePlan(api: SitecoreApi, plan: RedirectPlan): Promise<{ changes: RedirectChange[]; mapIds: string[] }> {
  if (planIsEmpty(plan)) return { changes: [], mapIds: [] };
  const state = await api.loadRedirectMaps();
  const managed = plan.add.length ? await api.ensureManagedMap(state) : state.maps.find((m) => m.managed);
  const maps: RedirectMap[] = managed && !state.maps.some((m) => m.id === managed.id) ? [...state.maps, managed] : state.maps;

  // Re-key the plan against fresh data so indexes are current.
  const fresh = flattenMaps(maps);
  const rekey = (r: { mapId: string; source: string }) => fresh.find((f) => f.mapId === r.mapId && f.source === r.source);
  const livePlan: RedirectPlan = {
    add: plan.add,
    retarget: plan.retarget.map((x) => ({ ...x, rule: rekey(x.rule)! })).filter((x) => x.rule),
    remove: plan.remove.map((r) => rekey(r)!).filter(Boolean),
  };
  const changed = applyPlan(maps, managed?.id ?? "", livePlan);
  for (const m of changed) await api.saveMapRules(m.id, m.rules);

  const changes: RedirectChange[] = [
    ...plan.add.map((a) => {
      const before = managed?.rules.find((r) => r.source === a.source);
      return before
        ? ({ op: "retarget", mapId: managed!.id, source: a.source, from: before.target, to: a.target } as RedirectChange)
        : ({ op: "add", mapId: managed!.id, source: a.source, target: a.target } as RedirectChange);
    }),
    ...livePlan.retarget.map((r) => ({ op: "retarget", mapId: r.rule.mapId, source: r.rule.source, from: r.rule.target, to: r.newTarget }) as RedirectChange),
    ...livePlan.remove.map((r) => ({ op: "remove", mapId: r.mapId, source: r.source, target: r.target }) as RedirectChange),
  ];
  return { changes, mapIds: changed.map((m) => m.id) };
}

/** Apply individual rule changes (used by the redirects editor and by undo). */
export async function applyChanges(api: SitecoreApi, changes: RedirectChange[], reverse = false) {
  const state = await api.loadRedirectMaps();
  const byMap = new Map<string, { source: string; target: string }[]>();
  const rulesOf = (id: string) => {
    if (!byMap.has(id)) {
      const m = state.maps.find((x) => x.id === id);
      if (!m) throw new Error("A redirect map in this change no longer exists.");
      byMap.set(id, m.rules.map((r) => ({ ...r })));
    }
    return byMap.get(id)!;
  };
  const list = reverse ? [...changes].reverse() : changes;
  for (const c of list) {
    const rules = rulesOf(c.mapId);
    const idx = rules.findIndex((r) => r.source === c.source);
    const op = reverse ? ({ add: "remove", remove: "add", retarget: "retarget" } as const)[c.op] : c.op;
    if (op === "add") {
      const target = c.op === "remove" || c.op === "add" ? c.target : c.to;
      if (idx >= 0) rules[idx].target = target;
      else rules.push({ source: c.source, target });
    } else if (op === "remove") {
      if (idx >= 0) rules.splice(idx, 1);
    } else if (c.op === "retarget") {
      const to = reverse ? c.from : c.to;
      if (idx >= 0) rules[idx].target = to;
    }
  }
  for (const [id, rules] of byMap) await api.saveMapRules(id, rules);
  return [...byMap.keys()];
}

/* ------------------------------------------------------------------ */
/* Page operations                                                     */
/* ------------------------------------------------------------------ */

export interface RedirectOptions {
  enabled: boolean;
  includeChildren: boolean;
  collapseChains: boolean;
}

export interface OpResult {
  entry: ActivityEntry;
  newRoute?: string;
  newPageId?: string;
  /** Items worth publishing afterwards */
  publishIds: string[];
}

async function plannedRedirects(api: SitecoreApi, from: string, to: string, opts: RedirectOptions, hasChildren: boolean) {
  const state = await api.loadRedirectMaps();
  return planUrlChange({
    from,
    to,
    rules: flattenMaps(state.maps),
    includeChildren: opts.includeChildren && hasChildren,
    collapseChains: opts.collapseChains,
  });
}

export async function changeUrl(
  api: SitecoreApi,
  input: { page: PageRef; newName: string; newDisplayName?: string; redirect: RedirectOptions },
  onSteps: OnSteps,
): Promise<OpResult> {
  const { page, newName, newDisplayName, redirect } = input;
  const nameChanges = newName !== page.name;
  const r = runner(
    [
      ["rename", "Change the page URL"],
      ["display", "Update the display name"],
      ["route", "Confirm the new URL"],
      ["redirects", "Keep old links working"],
    ],
    onSteps,
  );
  if (nameChanges) await r.run("rename", () => api.renamePage(page.id, newName));
  else r.skip("rename", "URL unchanged");
  if (newDisplayName && newDisplayName !== page.displayName) await r.run("display", () => api.setDisplayName(page.id, newDisplayName, page.language));
  else r.skip("display");
  const after = await r.run("route", () => api.getPage(page.id, page.language), (p) => p.route);

  let changes: RedirectChange[] = [];
  let mapIds: string[] = [];
  if (redirect.enabled && !samePath(page.route, after.route)) {
    const res = await r.run(
      "redirects",
      async () => executePlan(api, await plannedRedirects(api, page.route, after.route, redirect, page.hasChildren)),
      (x) => `${x.changes.length} redirect change${x.changes.length === 1 ? "" : "s"}`,
    );
    changes = res.changes;
    mapIds = res.mapIds;
  } else r.skip("redirects", redirect.enabled ? "URL unchanged" : "Turned off");

  const undo: UndoPayload[] = [];
  if (nameChanges || newDisplayName) undo.push({ kind: "rename", pageId: page.id, previousName: page.name, previousDisplayName: page.displayName, language: page.language });
  if (changes.length) undo.push({ kind: "redirects", changes });
  const entry = logActivity({
    kind: "rename",
    site: api.site.name,
    title: `Changed URL of ${page.displayName}`,
    detail: changes.length ? `${changes.length} redirect change${changes.length === 1 ? "" : "s"}` : undefined,
    pageId: page.id,
    fromRoute: page.route,
    toRoute: after.route,
    undo,
    publish: pub(page, mapIds, page.hasChildren),
  });
  return { entry, newRoute: after.route, publishIds: [page.id, ...mapIds] };
}

export async function movePage(
  api: SitecoreApi,
  input: { page: PageRef; targetParentId: string; targetName: string; redirect: RedirectOptions },
  onSteps: OnSteps,
): Promise<OpResult> {
  const { page, targetParentId, targetName, redirect } = input;
  const r = runner(
    [
      ["move", `Move under ${targetName}`],
      ["route", "Confirm the new URL"],
      ["redirects", "Keep old links working"],
    ],
    onSteps,
  );
  await r.run("move", () => api.movePage(page.id, targetParentId));
  const after = await r.run("route", () => api.getPage(page.id, page.language), (p) => p.route);
  let changes: RedirectChange[] = [];
  let mapIds: string[] = [];
  if (redirect.enabled) {
    const res = await r.run(
      "redirects",
      async () => executePlan(api, await plannedRedirects(api, page.route, after.route, redirect, page.hasChildren)),
      (x) => `${x.changes.length} redirect change${x.changes.length === 1 ? "" : "s"}`,
    );
    changes = res.changes;
    mapIds = res.mapIds;
  } else r.skip("redirects", "Turned off");

  const undo: UndoPayload[] = [{ kind: "move", pageId: page.id, previousParentId: page.parentId! }];
  if (changes.length) undo.push({ kind: "redirects", changes });
  const entry = logActivity({
    kind: "move",
    site: api.site.name,
    title: `Moved ${page.displayName} under ${targetName}`,
    detail: changes.length ? `${changes.length} redirect change${changes.length === 1 ? "" : "s"}` : undefined,
    pageId: page.id,
    fromRoute: page.route,
    toRoute: after.route,
    undo,
    publish: pub(page, mapIds, page.hasChildren),
  });
  return { entry, newRoute: after.route, publishIds: [page.id, ...mapIds] };
}

export async function duplicatePage(
  api: SitecoreApi,
  input: { page: PageRef; newName: string; displayName: string },
  onSteps: OnSteps,
): Promise<OpResult> {
  const { page, newName, displayName } = input;
  const r = runner(
    [
      ["duplicate", "Duplicate the page"],
      ["route", "Confirm the new URL"],
    ],
    onSteps,
  );
  const created = await r.run("duplicate", () => api.duplicatePage(page.id, newName, displayName));
  const copy = await r.run("route", () => api.getPage(created.pageId, page.language), (p) => p.route);
  const entry = logActivity({
    kind: "duplicate",
    site: api.site.name,
    title: `Duplicated ${page.displayName} as ${displayName}`,
    pageId: copy.id,
    fromRoute: page.route,
    toRoute: copy.route,
    undo: [{ kind: "duplicate", pageId: copy.id }],
  });
  return { entry, newRoute: copy.route, newPageId: copy.id, publishIds: [copy.id] };
}

export async function deletePage(
  api: SitecoreApi,
  input: { page: PageRef; redirectTo: string | null; redirect: RedirectOptions; by?: string },
  onSteps: OnSteps,
): Promise<OpResult> {
  const { page, redirectTo, redirect } = input;
  const r = runner(
    [
      ["redirects", redirectTo ? `Send visitors to ${redirectTo}` : "Send visitors elsewhere"],
      ["delete", "Move the page to the bin"],
    ],
    onSteps,
  );
  let changes: RedirectChange[] = [];
  let mapIds: string[] = [];
  if (redirectTo) {
    const res = await r.run("redirects", async () =>
      executePlan(api, await plannedRedirects(api, page.route, redirectTo, { ...redirect, enabled: true }, page.hasChildren)),
    );
    changes = res.changes;
    mapIds = res.mapIds;
  } else r.skip("redirects", "No redirect: visitors get a 404 page");
  await r.run("delete", () => api.moveToBin(page, input.by));
  const undo: UndoPayload[] = [{ kind: "bin", pageId: page.id }];
  if (changes.length) undo.push({ kind: "redirects", changes });
  const entry = logActivity({
    kind: "delete",
    site: api.site.name,
    title: `Deleted ${page.displayName}`,
    detail: redirectTo ? `In the bin. Redirects to ${redirectTo}` : "In the bin",
    pageId: page.id,
    fromRoute: page.route,
    toRoute: redirectTo ?? undefined,
    undo,
    publish: pub(page, mapIds, page.hasChildren),
  });
  // Publishing the page now removes it from the live site ("Never publish" is on).
  return { entry, publishIds: [page.id, ...mapIds] };
}

export async function restorePage(api: SitecoreApi, input: { id: string; name: string; parentId?: string; removeRedirects: boolean }) {
  const { route } = await api.restoreFromBin(input.id, input.parentId);
  let changes: RedirectChange[] = [];
  let mapIds: string[] = [];
  if (input.removeRedirects && route) {
    const st = await api.loadRedirectMaps();
    changes = flattenMaps(st.maps)
      .filter((r) => samePath(r.source, route) || r.source === `^${route.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/(.*)$`)
      .map((r) => ({ op: "remove" as const, mapId: r.mapId, source: r.source, target: r.target }));
    if (changes.length) mapIds = await applyChanges(api, changes);
  }
  const entry = logActivity({
    publish: pub({ id: input.id, displayName: input.name }, mapIds, true),
    kind: "restore",
    site: api.site.name,
    title: `Restored ${input.name}`,
    detail: changes.length ? `Removed ${changes.length} redirect${changes.length === 1 ? "" : "s"}` : undefined,
    pageId: input.id,
    toRoute: route,
  });
  return { entry, route, removed: changes.length };
}

/* ------------------------------------------------------------------ */
/* Publishing, unpublishing, scheduling                                */
/* ------------------------------------------------------------------ */

export async function publishWithDependencies(api: SitecoreApi, input: { page: PageRef; related: boolean; subItems: boolean; pageIds: string[] }) {
  await api.publish([input.page.id], { related: input.related, subItems: input.subItems });
  if (input.pageIds.length) await api.publish(input.pageIds, { related: input.related });
  return logActivity({
    kind: "publish",
    site: api.site.name,
    title: `Published ${input.page.displayName}`,
    detail: [input.related && "with its content and images", input.subItems && "and the pages below it", input.pageIds.length && `plus ${input.pageIds.length} linked page${input.pageIds.length === 1 ? "" : "s"}`]
      .filter(Boolean)
      .join(", "),
    pageId: input.page.id,
  });
}

export async function unpublishPage(api: SitecoreApi, input: { page: PageRef; redirectTo: string | null; redirect: RedirectOptions }, onSteps: OnSteps): Promise<OpResult> {
  const { page, redirectTo, redirect } = input;
  const r = runner(
    [
      ["flag", "Stop publishing this page"],
      ["redirects", redirectTo ? `Send visitors to ${redirectTo}` : "Send visitors elsewhere"],
      ["publish", "Take it off the live site"],
    ],
    onSteps,
  );
  const prev = await api.rawFields(page.id, ["__Never publish"]);
  await r.run("flag", () => api.setFlags(page.id, { neverPublish: true }));
  let changes: RedirectChange[] = [];
  let mapIds: string[] = [];
  if (redirectTo) {
    const res = await r.run("redirects", async () => executePlan(api, await plannedRedirects(api, page.route, redirectTo, { ...redirect, enabled: true }, page.hasChildren)));
    changes = res.changes;
    mapIds = res.mapIds;
  } else r.skip("redirects", "No redirect: visitors get a 404 page");
  await r.run("publish", () => api.publish([page.id, ...mapIds], { subItems: page.hasChildren }));
  const undo: UndoPayload[] = [{ kind: "fields", pageId: page.id, language: api.language, values: prev }];
  if (changes.length) undo.push({ kind: "redirects", changes });
  const entry = logActivity({
    kind: "unpublish",
    site: api.site.name,
    title: `Took ${page.displayName} offline`,
    detail: redirectTo ? `Redirects to ${redirectTo}` : "No redirect",
    pageId: page.id,
    fromRoute: page.route,
    toRoute: redirectTo ?? undefined,
    undo,
  });
  return { entry, publishIds: [] };
}

export async function putBackOnline(api: SitecoreApi, input: { page: PageRef; removeRedirects: boolean }) {
  const { page } = input;
  await api.setFlags(page.id, { neverPublish: false });
  let mapIds: string[] = [];
  if (input.removeRedirects) {
    const st = await api.loadRedirectMaps();
    const changes = flattenMaps(st.maps)
      .filter((r) => samePath(r.source, page.route))
      .map((r) => ({ op: "remove" as const, mapId: r.mapId, source: r.source, target: r.target }));
    if (changes.length) mapIds = await applyChanges(api, changes);
  }
  await api.publish([page.id, ...mapIds], { subItems: page.hasChildren, related: true });
  return logActivity({ kind: "publish", site: api.site.name, title: `Put ${page.displayName} back online`, pageId: page.id, toRoute: page.route });
}

export async function schedulePage(api: SitecoreApi, input: { page: PageRef; from: Date | null; to: Date | null }) {
  const prev = await api.rawFields(input.page.id, ["__Publish", "__Unpublish"]);
  await api.setFlags(input.page.id, { publishFrom: input.from, publishTo: input.to });
  const fmt = (d: Date | null) => (d ? d.toLocaleDateString(undefined, { dateStyle: "medium" }) : null);
  return logActivity({
    kind: "schedule",
    site: api.site.name,
    title: input.from || input.to ? `Scheduled ${input.page.displayName}` : `Cleared the schedule of ${input.page.displayName}`,
    detail: [input.from && `live from ${fmt(input.from)}`, input.to && `until ${fmt(input.to)}`].filter(Boolean).join(", ") || undefined,
    pageId: input.page.id,
    undo: [{ kind: "fields", pageId: input.page.id, language: api.language, values: prev }],
    publish: pub(input.page),
  });
}

/* ------------------------------------------------------------------ */
/* Order, local content, content edits                                 */
/* ------------------------------------------------------------------ */

export async function reorderChildren(api: SitecoreApi, input: { parent: PageRef; ordered: { id: string; name: string }[] }) {
  const ids = input.ordered.map((o) => o.id);
  const previous = await api.sortOrders(ids);
  const undo: UndoPayload[] = [];
  for (let i = 0; i < ids.length; i++) {
    const value = String((i + 1) * 100);
    if (previous.get(ids[i]) === value) continue;
    await api.setSortOrder(ids[i], value);
    undo.push({ kind: "fields", pageId: ids[i], language: api.language, values: { __Sortorder: previous.get(ids[i]) ?? "" } });
  }
  return logActivity({ kind: "reorder", site: api.site.name, title: `Reordered the pages below ${input.parent.displayName}`, pageId: input.parent.id, undo, publish: pub(input.parent, [], true) });
}

const guidForms = (id: string) => {
  const bare = id.replace(/[{}]/g, "");
  return [`{${bare.toUpperCase()}}`, `{${bare.toLowerCase()}}`, bare.toUpperCase(), bare.toLowerCase()];
};

/**
 * Copy shared component content into the page's own Data folder and point the components at the copies.
 * Components whose content is set in the page design (not on the page) are skipped and reported.
 */
export async function makeContentLocal(api: SitecoreApi, input: { page: PageRef; components: { name: string; dataSource: string; dataSourcePath?: string }[] }) {
  const { page } = input;
  const before = await api.rawFields(page.id, ["__Final Renderings"], page.language);
  let layout = before["__Final Renderings"];
  const dataId = await api.ensureLocalData(page);
  const existing = new Set(((await api.children({ id: dataId }))?.items ?? []).map((c) => c.name.toLowerCase()));
  const created: string[] = [];
  const made: string[] = [];
  const skipped: string[] = [];
  const copies = new Map<string, string>(); // source id -> copy id, so shared content is copied once
  const isGuid = (v: string) => /^[{(]?[0-9a-f-]{32,36}[)}]?$/i.test(v);
  for (const c of input.components) {
    const sourceId = isGuid(c.dataSource) ? c.dataSource : await api.itemIdByPath(c.dataSourcePath ?? c.dataSource);
    if (!sourceId) {
      skipped.push(c.name);
      continue;
    }
    const key = sourceId.replace(/[{}-]/g, "").toLowerCase();
    const forms = [...guidForms(sourceId), c.dataSource, ...(c.dataSourcePath ? [c.dataSourcePath] : [])].filter(Boolean);
    const already = copies.get(key);
    if (!already && !forms.some((f) => layout.includes(`s:ds="${f}"`))) {
      skipped.push(c.name); // set in the page design, not on this page
      continue;
    }
    let target = already;
    if (!target) {
      const base = (c.dataSourcePath?.split("/").pop() ?? c.name).replace(/[^\w\s-]/g, "").trim() || "Content";
      let name = base;
      for (let n = 2; existing.has(name.toLowerCase()); n++) name = `${base} ${n}`;
      existing.add(name.toLowerCase());
      const copy = await api.copyItem(sourceId, dataId, name);
      created.push(copy.itemId);
      target = `{${copy.itemId.replace(/[{}]/g, "").toUpperCase()}}`;
      copies.set(key, target);
    }
    for (const f of forms) layout = layout.split(`s:ds="${f}"`).join(`s:ds="${target}"`);
    made.push(c.name);
  }
  if (made.length) await api.updateFields(page.id, { "__Final Renderings": layout }, page.language);
  const entry = made.length
    ? logActivity({
        kind: "localize",
        site: api.site.name,
        title: `Gave ${page.displayName} its own copy of ${made.length} component${made.length === 1 ? "" : "s"}`,
        detail: made.join(", "),
        pageId: page.id,
        undo: [
          { kind: "fields", pageId: page.id, language: page.language, values: before },
          { kind: "items", ids: created },
        ],
        publish: [...pub(page), ...created.map((id) => ({ id, label: `${page.displayName}: local content`, kind: "content" as const }))],
      })
    : null;
  return { made, skipped, entry };
}

export async function saveFieldEdit(api: SitecoreApi, input: { page: PageRef; field: string; value: string; title: string; kind?: ActivityEntry["kind"] }) {
  const before = await api.rawFields(input.page.id, [input.field], input.page.language);
  await api.updateFields(input.page.id, { [input.field]: input.value }, input.page.language);
  return logActivity({
    kind: input.kind ?? "a11y",
    site: api.site.name,
    title: input.title,
    pageId: input.page.id,
    undo: [{ kind: "fields", pageId: input.page.id, language: input.page.language, values: before }],
    publish: pub(input.page),
  });
}

/* ------------------------------------------------------------------ */
/* Undo                                                                */
/* ------------------------------------------------------------------ */

export async function undo(api: SitecoreApi, entry: ActivityEntry) {
  if (!entry.undo?.length) throw new Error("This change can’t be undone here.");
  const ordered = [...entry.undo.filter((u) => u.kind !== "redirects"), ...entry.undo.filter((u) => u.kind === "redirects")];
  const publishIds: string[] = [];
  for (const u of ordered) {
    switch (u.kind) {
      case "rename": {
        const current = await api.getPage(u.pageId, u.language);
        if (current.name !== u.previousName) await api.renamePage(u.pageId, u.previousName);
        if (u.previousDisplayName && current.displayName !== u.previousDisplayName) await api.setDisplayName(u.pageId, u.previousDisplayName, u.language);
        publishIds.push(u.pageId);
        break;
      }
      case "move":
        await api.movePage(u.pageId, u.previousParentId);
        publishIds.push(u.pageId);
        break;
      case "duplicate":
        await api.deletePage(u.pageId);
        break;
      case "redirects":
        publishIds.push(...(await applyChanges(api, u.changes, true)));
        break;
      case "fields":
        await api.updateFields(u.pageId, u.values, u.language, u.version);
        publishIds.push(u.pageId);
        break;
      case "bin":
        await api.restoreFromBin(u.pageId);
        publishIds.push(u.pageId);
        break;
      case "version":
        await api.deleteVersion(u.pageId, u.version, u.language);
        break;
      case "items":
        for (const id of u.ids) await api.deleteForever(id).catch(() => {});
        break;
    }
  }
  markUndone(entry.id);
  return { publishIds };
}

/** Apply redirect edits made by hand (editor, health fixes, import) and log them so they can be undone. */
export async function editRedirects(api: SitecoreApi, changes: RedirectChange[], title: string, kind: ActivityEntry["kind"] = "redirect.update") {
  if (!changes.length) return null;
  const mapIds = await applyChanges(api, changes);
  const entry = logActivity({
    kind,
    site: api.site.name,
    title,
    detail: `${changes.length} rule${changes.length === 1 ? "" : "s"}`,
    undo: [{ kind: "redirects", changes }],
    publish: pub(null, mapIds),
  });
  return { entry, mapIds };
}

/** Add rules to the app's own map (creating it if needed). */
export async function addRedirects(api: SitecoreApi, rules: { source: string; target: string }[], title: string, kind: ActivityEntry["kind"] = "redirect.add") {
  const state = await api.loadRedirectMaps();
  const managed = await api.ensureManagedMap(state);
  const changes: RedirectChange[] = rules.map((r) => {
    const existing = managed.rules.find((x) => x.source === r.source);
    return existing
      ? { op: "retarget", mapId: managed.id, source: r.source, from: existing.target, to: r.target }
      : { op: "add", mapId: managed.id, source: r.source, target: r.target };
  });
  return editRedirects(api, changes, title, kind);
}
