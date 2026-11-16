import type { ClientSDK } from "@sitecore-marketplace-sdk/client";
import type { AppSettings } from "../settings";
import {
  COPY_ITEM,
  CREATE_ITEM,
  DELETE_ITEM,
  GET_CHILDREN,
  UPDATE_VERSION_FIELDS,
  FIND_REFERRERS,
  GET_ITEM_ID_BY_PATH,
  GET_REDIRECT_FOLDER,
  GET_SIBLING_NAMES,
  MOVE_ITEM,
  PAGE_FIELDS,
  UPDATE_ITEM_FIELDS,
  opName,
} from "./queries";
import { normalizeRedirectType, parseUrlMapping, serializeUrlMapping } from "./redirects";
import type { BinEntry, Dependency, ItemInfo, PageFlags, Campaign, LivePage, LocaleStat, PageComponent, PageFieldSet, PageRef, PageVersion, RedirectMap, RedirectType, Reference, SiteRef, TemplateOption, TreeNode, WorkflowStat } from "./types";
import { fromSitecoreDate, toSitecoreDate } from "../util";
import { markPublished } from "../pending";
import { invalidateSiteData } from "./site-cache";

/* eslint-disable @typescript-eslint/no-explicit-any */

export class SitecoreError extends Error {
  constructor(message: string, readonly cause?: unknown) {
    super(message);
    this.name = "SitecoreError";
  }
}

function problem(err: any): string {
  if (!err) return "Unknown error";
  if (typeof err === "string") return err;
  return err.detail ?? err.title ?? err.message ?? JSON.stringify(err).slice(0, 200);
}

/** REST results from the XMC module come back as { data, error, response }. */
function unwrap<T>(result: any, what: string): T {
  if (result?.error) throw new SitecoreError(`${what}: ${problem(result.error)}`, result.error);
  return (result && "data" in result ? result.data : result) as T;
}

export const CAMPAIGN_PREFIX = "Campaign - ";

/* Shared live-state cache and queue (module level, so every view shares it). */
const LIVE_TTL = 2 * 60 * 1000;
const live = {
  cache: new Map<string, { at: number; value: boolean | null }>(),
  inflight: new Map<string, Promise<boolean | null>>(),
  active: 0,
  queue: [] as (() => void)[],
  failures: 0,
  disabled: false,
};
async function liveSlot<T>(fn: () => Promise<T>): Promise<T> {
  if (live.active >= 2) await new Promise<void>((r) => live.queue.push(r));
  live.active++;
  try {
    return await fn();
  } finally {
    live.active--;
    live.queue.shift()?.();
  }
}
/** Forget cached live state for items that were just published. */
export function forgetLiveState(ids: string[]) {
  const wanted = new Set(ids.map((i) => i.replace(/[{}-]/g, "").toLowerCase()));
  for (const k of [...live.cache.keys()]) if (wanted.has(k.split(":")[1])) live.cache.delete(k);
}
export function liveStateAvailable() {
  return !live.disabled;
}

export const shortId = (id: string) => id.replace(/[{}-]/g, "").toLowerCase();
export const sameId = (a?: string | null, b?: string | null) => !!a && !!b && shortId(a) === shortId(b);

interface RawRedirectItem {
  itemId: string;
  name: string;
  path: string;
  hasChildren?: boolean;
  template?: { templateId: string; name: string };
  urlMapping?: { value: string } | null;
  redirectType?: { value: string } | null;
  preserveQs?: { value: string } | null;
  publishFrom?: { value: string } | null;
  publishTo?: { value: string } | null;
  children?: { nodes: RawRedirectItem[] };
}

export class SitecoreApi {
  private paths: Promise<{ rootPath: string; homePath: string }> | null = null;
  private mapTemplateId: string | null = null;

  constructor(
    readonly client: ClientSDK,
    readonly contextId: string,
    readonly site: SiteRef,
    readonly settings: AppSettings,
  ) {}

  get language() {
    return this.site.language || "en";
  }

  /** Every language the site supports, always including the current one. */
  get publishLanguages(): string[] {
    return [...new Set([this.language, ...(this.site.languages ?? [])].filter(Boolean))];
  }

  /* ---------------------------------------------------------------- */
  /* Transport                                                         */
  /* ---------------------------------------------------------------- */

  async gql<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
    const res: any = await (this.client as any).mutate("xmc.authoring.graphql", {
      params: {
        query: { sitecoreContextId: this.contextId },
        body: { query, variables, operationName: opName(query) },
      },
    });
    const body = unwrap<any>(res, opName(query));
    if (body?.errors?.length) throw new SitecoreError(body.errors[0].message, body.errors);
    return (body?.data ?? body) as T;
  }

  private async q<T>(key: string, params: Record<string, unknown>, what: string): Promise<T> {
    const res: any = await (this.client as any).query(key, { params });
    if (res?.isError) throw new SitecoreError(`${what}: ${problem(res.error)}`, res.error);
    return unwrap<T>(res?.data, what);
  }

  private async m<T>(key: string, params: Record<string, unknown>, what: string): Promise<T> {
    const res: any = await (this.client as any).mutate(key, { params });
    return unwrap<T>(res, what);
  }

  private ctx(extra: Record<string, unknown> = {}) {
    return { sitecoreContextId: this.contextId, ...extra };
  }

  /* ---------------------------------------------------------------- */
  /* Sites and pages                                                   */
  /* ---------------------------------------------------------------- */

  static async listSites(client: ClientSDK, contextId: string): Promise<SiteRef[]> {
    const res: any = await (client as any).query("xmc.sites.listSites", {
      params: { query: { sitecoreContextId: contextId } },
    });
    const sites = unwrap<any[]>(res?.data, "List sites") ?? [];
    return sites.map((s) => ({
      id: s.id,
      name: s.name,
      displayName: s.displayName || s.name,
      language: s.hosts?.[0]?.languageSettings?.defaultLanguage ?? s.languages?.[0] ?? "en",
      languages: s.languages ?? s.supportedLanguages ?? ["en"],
      startItemId:
        s.hosts?.find((h: any) => h?.homePageId)?.homePageId ?? s.startItemId ?? s.properties?.startItemId ?? s.properties?.StartItem ?? undefined,
      brandKitId: s.brandKitId ?? undefined,
    }));
  }

  async getPage(pageId: string, language = this.language): Promise<PageRef> {
    const p = await this.q<any>(
      "xmc.pages.retrievePage",
      { path: { pageId }, query: this.ctx({ site: this.site.name, language }) },
      "Load page",
    );
    return toPageRef(p, language);
  }

  async sitePaths() {
    if (!this.paths) {
      this.paths = (async () => {
        if (this.site.homePath && this.site.rootPath) return { rootPath: this.site.rootPath, homePath: this.site.homePath };
        const home = this.site.startItemId ? await this.getPage(this.site.startItemId).catch(() => null) : null;
        const homePath = home?.path ?? (await this.getTreeRoot()).path;
        if (!homePath) throw new SitecoreError("Couldn’t find this site’s home page.");
        return { homePath, rootPath: homePath.slice(0, homePath.lastIndexOf("/")) };
      })();
    }
    return this.paths;
  }

  private root: Promise<TreeNode> | null = null;

  /** The site's home page. Uses the site hierarchy, which works even when the site list has no home page ID. */
  async getTreeRoot(): Promise<TreeNode> {
    if (!this.root) {
      this.root = (async () => {
        const h = await this.q<any>(
          "xmc.sites.retrieveSiteHierarchy",
          { path: { siteId: this.site.id }, query: this.ctx({ language: this.language }) },
          "Load page tree",
        ).catch(async (e) => {
          if (!this.site.startItemId) throw e;
          return this.q<any>(
            "xmc.sites.retrievePageHierarchy",
            { path: { siteId: this.site.id, pageId: this.site.startItemId }, query: this.ctx({ language: this.language }) },
            "Load page tree",
          );
        });
        if (!h?.page) throw new SitecoreError("This site has no home page.");
        return toTreeNode(pickHome(h, this.site.startItemId));
      })();
      this.root.catch(() => (this.root = null));
    }
    return this.root;
  }

  async listChildren(pageId: string): Promise<TreeNode[]> {
    const items = await this.q<any[]>(
      "xmc.sites.listPageChildren",
      { path: { siteId: this.site.id, pageId }, query: this.ctx({ language: this.language }) },
      "Load child pages",
    );
    // Hide Data folders and leaf items with no layout: they're content, not pages.
    return (items ?? []).map(toTreeNode).filter((n) => !isDataFolder(n) && !(n.hasPresentation === false && !n.hasChildren));
  }

  /** Every routable page in the site (id + route), used to validate redirect targets. */
  private allPages: Promise<LivePage[]> | null = null;

  /**
   * Every real page in the site (id + route): items with a layout, never Data folders or datasources.
   * 1. Pages search with the "Pages" filter (only items that have presentation).
   * 2. Otherwise the agent route list, minus anything inside a Data folder.
   * 3. Otherwise a walk of the page tree.
   */
  async listAllPages(force = false): Promise<LivePage[]> {
    if (force) this.allPages = null;
    if (!this.allPages) {
      this.allPages = (async () => {
        const viaSearch = await this.searchAllPages().catch(() => null);
        if (viaSearch && viaSearch.length > 1) return viaSearch;
        try {
          const items = await this.q<any[]>(
            "xmc.agent.sitesGetAllPagesBySite",
            { path: { siteName: this.site.name }, query: this.ctx({ language: this.language }) },
            "List site pages",
          );
          if (Array.isArray(items) && items.length)
            return items
              .map((p) => ({ id: p.id ?? p.itemId, route: p.path ?? p.route ?? "/" }))
              .filter((p) => !isDataRoute(p.route));
        } catch {
          // fall through to the tree walk
        }
        return this.crawlPages();
      })();
      this.allPages.catch(() => (this.allPages = null));
    }
    return this.allPages;
  }

  private async searchAllPages(): Promise<LivePage[]> {
    const root = await this.getTreeRoot();
    const out = new Map<string, LivePage>([[shortId(root.id), { id: root.id, route: root.route }]]);
    const pageSize = 100;
    let continuationToken: string | undefined;
    for (let pageNumber = 1; pageNumber <= 50; pageNumber++) {
      const r = await this.q<any>(
        "xmc.pages.search",
        {
          query: this.ctx({
            rootIds: [root.id],
            filter: "Pages",
            language: this.language,
            pageSize,
            pageNumber,
            ...(continuationToken ? { continuationToken } : {}),
          }),
        },
        "Search pages",
      );
      const results: any[] = r?.results ?? [];
      for (const p of results) {
        if (p?.id && p.hasPresentation !== false && p.route != null && !isDataRoute(p.route)) {
          out.set(shortId(p.id), { id: p.id, route: p.route });
        }
      }
      continuationToken = r?.continuationToken ?? undefined;
      if (results.length < pageSize || (r?.totalCount != null && out.size >= r.totalCount)) break;
    }
    return [...out.values()];
  }

  private async crawlPages(limit = 3000): Promise<LivePage[]> {
    const root = await this.getTreeRoot();
    const out: LivePage[] = [{ id: root.id, route: root.route }];
    let level: TreeNode[] = [root];
    while (level.length && out.length < limit) {
      const next: TreeNode[] = [];
      for (let i = 0; i < level.length; i += 6) {
        const batch = level.slice(i, i + 6).filter((n) => n.hasChildren);
        const kids = await Promise.all(batch.map((n) => this.listChildren(n.id).catch(() => [] as TreeNode[])));
        for (const k of kids.flat()) {
          if (isDataFolder(k)) continue; // datasources live here, never pages
          if (k.hasPresentation !== false) out.push({ id: k.id, route: k.route });
          next.push(k);
        }
      }
      level = next;
    }
    return out;
  }

  async siblingNames(parentId: string): Promise<string[]> {
    const data = await this.gql<any>(GET_SIBLING_NAMES, { id: parentId });
    return (data?.item?.children?.nodes ?? []).map((n: any) => n.name as string);
  }

  /* ---------------------------------------------------------------- */
  /* Page operations                                                   */
  /* ---------------------------------------------------------------- */

  /** Forget cached tree/page lists after content changes. */
  invalidate() {
    this.allPages = null;
    this.root = null;
    invalidateSiteData();
  }

  async renamePage(pageId: string, newName: string) {
    this.invalidate();
    return this.m<any>(
      "xmc.pages.renamePage",
      { path: { pageId }, body: { newName }, query: this.ctx() },
      "Rename page",
    );
  }

  async setDisplayName(pageId: string, displayName: string, language = this.language) {
    return this.gql(UPDATE_ITEM_FIELDS, {
      id: pageId,
      language,
      fields: [{ name: "__Display name", value: displayName }],
    });
  }

  async movePage(pageId: string, targetParentId: string) {
    this.invalidate();
    return this.gql<any>(MOVE_ITEM, { id: pageId, targetParentId });
  }

  async duplicatePage(pageId: string, newName: string, displayName?: string) {
    this.invalidate();
    const r = await this.m<any>(
      "xmc.pages.duplicatePage",
      {
        path: { pageId },
        body: { newName, displayName: displayName || newName, site: this.site.name, language: this.language },
        query: this.ctx(),
      },
      "Duplicate page",
    );
    return { pageId: r?.pageId as string, path: r?.path as string };
  }

  async deletePage(pageId: string) {
    this.invalidate();
    return this.m<boolean>(
      "xmc.pages.deletePage",
      { path: { pageId }, body: { permanently: false, forceDelete: true }, query: this.ctx() },
      "Delete page",
    );
  }

  /** Moves an item to the recycle bin. Used to undo a duplicate this app created. */
  async deleteItem(id: string) {
    return this.gql(DELETE_ITEM, { id, permanently: false });
  }

  /* ---------------------------------------------------------------- */
  /* References                                                        */
  /* ---------------------------------------------------------------- */

  async findReferrers(itemId: string): Promise<{ total: number; items: Reference[] }> {
    const { homePath } = await this.sitePaths().catch(() => ({ homePath: "" }));
    const data = await this.gql<any>(FIND_REFERRERS, {
      field: this.settings.referencesField,
      value: shortId(itemId),
      pageSize: 100,
    });
    const seen = new Set<string>();
    const items: Reference[] = [];
    for (const r of data?.search?.results ?? []) {
      if (sameId(r.itemId, itemId) || seen.has(shortId(r.itemId))) continue;
      seen.add(shortId(r.itemId));
      const isPage = homePath ? String(r.path).toLowerCase().startsWith(homePath.toLowerCase()) : true;
      items.push({ id: r.itemId, name: r.name, path: r.path, language: r.language?.name, kind: isPage ? "page" : "content" });
    }
    return { total: items.length, items };
  }

  /* ---------------------------------------------------------------- */
  /* Redirect maps                                                     */
  /* ---------------------------------------------------------------- */

  async redirectFolderPath() {
    const { rootPath } = await this.sitePaths();
    return this.settings.redirectFolderPath.replace("{site}", rootPath);
  }

  async loadRedirectMaps(): Promise<{ folderId: string | null; maps: RedirectMap[] }> {
    const path = await this.redirectFolderPath();
    const data = await this.gql<any>(GET_REDIRECT_FOLDER, { path, language: this.language });
    const folder = data?.item;
    if (!folder) return { folderId: null, maps: [] };
    const maps: RedirectMap[] = [];
    const visit = (node: RawRedirectItem) => {
      if (node.urlMapping) {
        if (!this.mapTemplateId && node.template?.templateId) this.mapTemplateId = node.template.templateId;
        maps.push({
          id: node.itemId,
          name: node.name,
          path: node.path,
          type: normalizeRedirectType(node.redirectType?.value),
          preserveQueryString: node.preserveQs?.value === "1",
          managed: node.name === this.settings.managedMapName,
          rules: parseUrlMapping(node.urlMapping.value),
          startsAt: fromSitecoreDate(node.publishFrom?.value)?.toISOString(),
          endsAt: fromSitecoreDate(node.publishTo?.value)?.toISOString(),
          campaign: node.name.startsWith(CAMPAIGN_PREFIX),
        });
      }
      node.children?.nodes?.forEach(visit);
    };
    (folder.children?.nodes ?? []).forEach(visit);
    return { folderId: folder.itemId, maps };
  }

  async saveMapRules(mapId: string, rules: { source: string; target: string }[]) {
    invalidateSiteData();
    await this.gql(UPDATE_ITEM_FIELDS, {
      id: mapId,
      language: this.language,
      fields: [{ name: "UrlMapping", value: serializeUrlMapping(rules) }],
    });
  }

  /** Returns the map this app writes to, creating it on first use. */
  async ensureManagedMap(current?: { folderId: string | null; maps: RedirectMap[] }): Promise<RedirectMap> {
    const state = current ?? (await this.loadRedirectMaps());
    const existing = state.maps.find((m) => m.managed);
    if (existing) return existing;
    if (!state.folderId) {
      throw new SitecoreError(
        `No redirects folder at ${await this.redirectFolderPath()}. Create it, or change the folder in Settings.`,
      );
    }
    let templateId = this.mapTemplateId;
    if (!templateId) {
      const t = await this.gql<any>(GET_ITEM_ID_BY_PATH, { path: this.settings.redirectMapTemplatePath });
      templateId = t?.item?.itemId ?? null;
    }
    if (!templateId) {
      throw new SitecoreError("Couldn’t find the Redirect Map template. Set its path in Settings.");
    }
    const type = this.settings.defaultRedirectType;
    const created = await this.gql<any>(CREATE_ITEM, {
      name: this.settings.managedMapName,
      templateId,
      parent: state.folderId,
      language: this.language,
      fields: [
        { name: "RedirectType", value: type },
        { name: "PreserveQueryString", value: this.settings.preserveQueryString ? "1" : "" },
        { name: "UrlMapping", value: "" },
      ],
    });
    const item = created?.createItem?.item;
    return {
      id: item.itemId,
      name: item.name,
      path: item.path,
      type,
      preserveQueryString: this.settings.preserveQueryString,
      managed: true,
      rules: [],
    };
  }

  /* ---------------------------------------------------------------- */
  /* Campaign redirects: their own map with a publishing window         */
  /* ---------------------------------------------------------------- */

  async createCampaign(input: { name: string; startsAt?: Date | null; endsAt: Date; type: RedirectType; rules: { source: string; target: string }[] }) {
    const state = await this.loadRedirectMaps();
    if (!state.folderId) throw new SitecoreError(`No redirects folder at ${await this.redirectFolderPath()}. Set it in Settings.`);
    let templateId = this.mapTemplateId;
    if (!templateId) {
      const t = await this.gql<any>(GET_ITEM_ID_BY_PATH, { path: this.settings.redirectMapTemplatePath });
      templateId = t?.item?.itemId ?? null;
    }
    if (!templateId) throw new SitecoreError("Couldn’t find the Redirect Map template. Set its path in Settings.");
    invalidateSiteData();
    const itemName = `${CAMPAIGN_PREFIX}${input.name}`.replace(/[^\w\s\-]/g, "").trim().slice(0, 100);
    const r = await this.gql<any>(CREATE_ITEM, {
      name: itemName,
      templateId,
      parent: state.folderId,
      language: this.language,
      fields: [
        { name: "RedirectType", value: input.type },
        { name: "PreserveQueryString", value: "1" },
        { name: "UrlMapping", value: serializeUrlMapping(input.rules) },
        { name: "__Publish", value: input.startsAt ? toSitecoreDate(input.startsAt) : "" },
        { name: "__Unpublish", value: toSitecoreDate(input.endsAt) },
      ],
    });
    return r?.createItem?.item?.itemId as string;
  }

  async setCampaignWindow(mapId: string, startsAt: Date | null, endsAt: Date | null) {
    invalidateSiteData();
    await this.gql(UPDATE_ITEM_FIELDS, {
      id: mapId,
      language: this.language,
      fields: [
        { name: "__Publish", value: startsAt ? toSitecoreDate(startsAt) : "" },
        { name: "__Unpublish", value: endsAt ? toSitecoreDate(endsAt) : "" },
      ],
    });
  }

  /** Recycle a redirect map, then publish its folder so it leaves the live site. */
  async removeMap(mapId: string) {
    invalidateSiteData();
    const state = await this.loadRedirectMaps();
    await this.gql(DELETE_ITEM, { id: mapId, permanently: false });
    if (state.folderId) await this.publish([state.folderId], { subItems: true }).catch(() => {});
  }

  campaigns(maps: RedirectMap[]): Campaign[] {
    const now = Date.now();
    return maps
      .filter((m) => m.campaign)
      .map((m) => ({
        id: m.id,
        name: m.name.slice(CAMPAIGN_PREFIX.length),
        path: m.path,
        startsAt: m.startsAt,
        endsAt: m.endsAt,
        type: m.type,
        rules: m.rules,
        status: (m.endsAt && new Date(m.endsAt).getTime() < now ? "ended" : m.startsAt && new Date(m.startsAt).getTime() > now ? "scheduled" : "active") as Campaign["status"],
      }))
      .sort((a, b) => (a.endsAt ?? "").localeCompare(b.endsAt ?? ""));
  }

  /* ---------------------------------------------------------------- */
  /* Field content: version compare and link checks                    */
  /* ---------------------------------------------------------------- */

  async pageFields(pageId: string, language: string, version?: number): Promise<PageFieldSet> {
    const data = await this.gql<any>(PAGE_FIELDS, { id: pageId, language, version: version ?? null });
    const it = data?.item;
    if (!it) throw new SitecoreError("That version doesn’t exist.");
    return {
      version: Number(it.version ?? version ?? 0),
      fields: (it.fields?.nodes ?? []).filter((f: any) => f?.name && !String(f.name).startsWith("__")),
      layout: it.layout?.value ?? "",
      flags: {
        neverPublish: it.neverPublish?.value === "1",
        publishFrom: fromSitecoreDate(it.publishFrom?.value)?.toISOString(),
        publishTo: fromSitecoreDate(it.publishTo?.value)?.toISOString(),
      },
    };
  }

  /** Every item ID a page version points at: link fields, rich text links and component datasources. */
  static referencedIds(set: PageFieldSet): { id: string; field: string }[] {
    const out = new Map<string, { id: string; field: string }>();
    const add = (raw: string, field: string) => {
      const id = raw.replace(/[{}]/g, "").toLowerCase();
      const norm = id.length === 32 ? `${id.slice(0, 8)}-${id.slice(8, 12)}-${id.slice(12, 16)}-${id.slice(16, 20)}-${id.slice(20)}` : id;
      if (!out.has(norm)) out.set(norm, { id: `{${norm.toUpperCase()}}`, field });
    };
    const guid = /\{?([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\}?/gi;
    for (const f of set.fields) {
      for (const m of f.value.matchAll(guid)) add(m[1], f.name);
      for (const m of f.value.matchAll(/_id=([0-9a-f]{32})/gi)) add(m[1], f.name);
      for (const m of f.value.matchAll(/-\/media\/([0-9a-f]{32})/gi)) add(m[1], f.name);
    }
    // In the layout, only datasources point at content; other GUIDs are rendering definitions and UIDs.
    for (const m of set.layout.matchAll(/s:ds="\{?([0-9a-f-]{36})\}?"/gi)) add(m[1], "Component content");
    return [...out.values()];
  }

  /* ---------------------------------------------------------------- */
  /* Dependencies, publishing settings, layout, bin, order             */
  /* ---------------------------------------------------------------- */

  /** What the page needs to look right: component content, images, and pages it links to. */
  async dependencies(page: PageRef): Promise<Dependency[]> {
    const set = await this.pageFields(page.id, page.language);
    const refs = SitecoreApi.referencedIds(set);
    if (!refs.length) return [];
    const info = await this.itemInfo(refs.map((r) => r.id));
    const { homePath } = await this.sitePaths().catch(() => ({ homePath: "" }));
    const deps: Dependency[] = [];
    for (const r of refs) {
      const it = info.get(shortId(r.id));
      if (!it) continue;
      const p = it.path.toLowerCase();
      const kind: Dependency["kind"] = p.startsWith("/sitecore/media library") ? "media" : homePath && p.startsWith(homePath.toLowerCase()) && !/\/data(\/|$)/i.test(p.slice(homePath.length)) ? "page" : "content";
      deps.push({ id: it.id, name: it.name, path: it.path, kind, field: r.field });
    }
    await Promise.all(deps.filter((d) => d.kind === "page").map(async (d) => (d.live = await this.liveState(d.id, page.language))));
    return deps;
  }

  /** Item-level publishing settings only (works for any item, with or without a version). */
  async pageFlags(pageId: string): Promise<PageFlags> {
    const f = await this.rawFields(pageId, ["__Never publish", "__Publish", "__Unpublish"]);
    return {
      neverPublish: f["__Never publish"] === "1",
      publishFrom: fromSitecoreDate(f["__Publish"])?.toISOString(),
      publishTo: fromSitecoreDate(f["__Unpublish"])?.toISOString(),
    };
  }

  /** Item-level publishing settings. Empty string clears a value. */
  async setFlags(pageId: string, flags: { neverPublish?: boolean; publishFrom?: Date | null; publishTo?: Date | null }) {
    const fields: { name: string; value: string }[] = [];
    if (flags.neverPublish !== undefined) fields.push({ name: "__Never publish", value: flags.neverPublish ? "1" : "" });
    if (flags.publishFrom !== undefined) fields.push({ name: "__Publish", value: flags.publishFrom ? toSitecoreDate(flags.publishFrom) : "" });
    if (flags.publishTo !== undefined) fields.push({ name: "__Unpublish", value: flags.publishTo ? toSitecoreDate(flags.publishTo) : "" });
    if (fields.length) await this.gql(UPDATE_ITEM_FIELDS, { id: pageId, language: this.language, fields });
  }

  /** Raw field values, for undo. */
  async rawFields(pageId: string, names: string[], language = this.language, version?: number): Promise<Record<string, string>> {
    const sel = names.map((n, i) => `f${i}: field(name: ${JSON.stringify(n)}) { value }`).join(" ");
    const data = await this.gql<any>(`query RawFields($id: ID!, $language: String!, $version: Int) { item(where: { itemId: $id, language: $language, version: $version }) { itemId ${sel} } }`, {
      id: pageId,
      language,
      version: version ?? null,
    });
    const out: Record<string, string> = {};
    names.forEach((n, i) => (out[n] = data?.item?.[`f${i}`]?.value ?? ""));
    return out;
  }

  async updateFields(pageId: string, values: Record<string, string>, language = this.language, version?: number) {
    await this.gql(UPDATE_VERSION_FIELDS, {
      id: pageId,
      language,
      version: version ?? null,
      fields: Object.entries(values).map(([name, value]) => ({ name, value })),
    });
  }

  async children(opts: { path?: string; id?: string }): Promise<{ id: string; path: string; items: { id: string; name: string; path: string; template?: string; displayName?: string; note?: string; updated?: string }[] } | null> {
    // Send only the lookup that's set: some environments reject an explicit null itemId/path.
    const where = opts.id ? "itemId: $key" : "path: $key";
    const query = GET_CHILDREN.replace("query GetChildren($path: String, $id: ID)", `query GetChildren($key: ${opts.id ? "ID" : "String"}!)`).replace("item(where: { path: $path, itemId: $id })", `item(where: { ${where} })`);
    const data = await this.gql<any>(query, { key: opts.id ?? opts.path });
    const it = data?.item;
    if (!it) return null;
    return {
      id: it.itemId,
      path: it.path,
      items: (it.children?.nodes ?? []).map((n: any) => ({
        id: n.itemId,
        name: n.name,
        path: n.path,
        template: n.template?.name,
        displayName: n.displayName?.value || undefined,
        note: n.note?.value || undefined,
        updated: n.updated?.value || undefined,
      })),
    };
  }

  /** Find or create a folder (Common/Folder). `hidden` turns on Never publish so it can't reach the live site. */
  async ensureFolder(path: string, parentPath: string, hidden = false): Promise<string> {
    const existing = await this.itemIdByPath(path);
    if (existing) return existing;
    const parent = await this.itemIdByPath(parentPath);
    const templateId = await this.itemIdByPath("/sitecore/templates/Common/Folder");
    if (!parent || !templateId) throw new SitecoreError(`Couldn’t create ${path}.`);
    const r = await this.gql<any>(CREATE_ITEM, {
      name: path.split("/").pop(),
      templateId,
      parent,
      language: this.language,
      fields: hidden ? [{ name: "__Never publish", value: "1" }] : [],
    });
    const id = r?.createItem?.item?.itemId;
    if (!id) throw new SitecoreError(`Couldn’t create ${path}.`);
    return id;
  }

  /** A small item holding JSON in its note field (team store). */
  async createNote(parentId: string, name: string, json: string): Promise<string | null> {
    const templateId = await this.itemIdByPath("/sitecore/templates/Common/Folder");
    if (!templateId) return null;
    const r = await this.gql<any>(CREATE_ITEM, { name, templateId, parent: parentId, language: this.language, fields: [{ name: "__Long description", value: json }] });
    return r?.createItem?.item?.itemId ?? null;
  }

  async setNote(itemId: string, json: string) {
    await this.gql(UPDATE_ITEM_FIELDS, { id: itemId, language: this.language, fields: [{ name: "__Long description", value: json }] });
  }

  /** Mutation names the Authoring API offers (empty if introspection is off). */
  async mutationNames(): Promise<string[]> {
    const d = await this.gql<any>("query Introspect { __schema { mutationType { fields { name } } } }");
    return (d?.__schema?.mutationType?.fields ?? []).map((f: any) => f.name);
  }

  async itemIdByPath(path: string): Promise<string | null> {
    const t = await this.gql<any>(GET_ITEM_ID_BY_PATH, { path }).catch(() => null);
    return t?.item?.itemId ?? null;
  }

  async copyItem(id: string, targetParentId: string, name: string) {
    const r = await this.gql<any>(COPY_ITEM, { id, targetParentId, name });
    return r?.copyItem?.item as { itemId: string; name: string; path: string };
  }

  private async templateIdByPath(paths: string[]): Promise<string | null> {
    for (const path of paths) {
      const t = await this.gql<any>(GET_ITEM_ID_BY_PATH, { path }).catch(() => null);
      if (t?.item?.itemId) return t.item.itemId;
    }
    return null;
  }

  /** The page's own Data folder for local content, created if missing. */
  async ensureLocalData(page: PageRef): Promise<string> {
    const kids = await this.children({ id: page.id });
    const existing = kids?.items.find((c) => /^data$/i.test(c.name));
    if (existing) return existing.id;
    const templateId = await this.templateIdByPath([
      "/sitecore/templates/Foundation/Experience Accelerator/Local Datasources/Page Data",
      "/sitecore/templates/Foundation/JSS Experience Accelerator/Local Datasources/Page Data",
      "/sitecore/templates/Common/Folder",
    ]);
    if (!templateId) throw new SitecoreError("Couldn’t find a folder template for the page’s Data folder.");
    const r = await this.gql<any>(CREATE_ITEM, { name: "Data", templateId, parent: page.id, language: this.language, fields: [] });
    return r?.createItem?.item?.itemId;
  }

  /* ---------- App folders (team storage and bin) ---------- */

  private appBaseP: Promise<string> | null = null;

  /**
   * Where the app keeps its own items: the site's Settings item, which Page builder doesn't show
   * (next to Settings/Redirects). Earlier versions used the site root, where Page builder listed them
   * as folders next to Home; those are moved here once, with everything in them.
   */
  appBase(): Promise<string> {
    if (!this.appBaseP) {
      this.appBaseP = (async () => {
        const { rootPath } = await this.sitePaths();
        const settings = `${rootPath}/Settings`;
        const settingsId = await this.itemIdByPath(settings);
        if (!settingsId) return rootPath; // no Settings item: keep the old location
        for (const name of ["Page Operations", "Page Operations Bin"]) {
          const oldId = await this.itemIdByPath(`${rootPath}/${name}`);
          if (!oldId) continue;
          const newId = await this.itemIdByPath(`${settings}/${name}`);
          if (!newId) {
            await this.gql(MOVE_ITEM, { id: oldId, targetParentId: settingsId });
          } else {
            // Both exist: bring the contents across, then remove the empty old folder.
            const moveAll = async (fromId: string, toId: string) => {
              const toKids = (await this.children({ id: toId }))?.items ?? [];
              for (const k of (await this.children({ id: fromId }))?.items ?? []) {
                const same = toKids.find((t) => t.name.toLowerCase() === k.name.toLowerCase() && /folder/i.test(t.template ?? "") && /folder/i.test(k.template ?? ""));
                if (same) await moveAll(k.id, same.id);
                else await this.gql(MOVE_ITEM, { id: k.id, targetParentId: toId });
              }
            };
            await moveAll(oldId, newId);
            await this.gql(DELETE_ITEM, { id: oldId, permanently: false });
          }
        }
        this.invalidate();
        return settings;
      })();
      this.appBaseP.catch(() => (this.appBaseP = null));
    }
    return this.appBaseP;
  }

  async binPath() {
    return `${await this.appBase()}/Page Operations Bin`;
  }

  /** The bin is a folder in Settings with "Never publish" on, so nothing in it ever goes live. */
  async ensureBin(): Promise<string> {
    const path = await this.binPath();
    const found = await this.itemIdByPath(path);
    if (found) return found;
    const parentPath = path.slice(0, path.lastIndexOf("/"));
    const parent = await this.itemIdByPath(parentPath);
    const templateId = await this.templateIdByPath(["/sitecore/templates/Common/Folder"]);
    if (!parent || !templateId) throw new SitecoreError("Couldn’t create the Page Operations bin.");
    const r = await this.gql<any>(CREATE_ITEM, {
      name: "Page Operations Bin",
      templateId,
      parent,
      language: this.language,
      fields: [{ name: "__Never publish", value: "1" }],
    });
    return r?.createItem?.item?.itemId;
  }

  async moveToBin(page: PageRef, by?: string) {
    const bin = await this.ensureBin();
    const prev = await this.rawFields(page.id, ["__Long description", "__Never publish"]);
    const note = JSON.stringify({
      pageOps: { from: page.parentId, route: page.route, at: new Date().toISOString(), by, prev: prev["__Long description"], prevNever: prev["__Never publish"] },
    });
    // "Never publish" on the page itself guarantees the next publish removes it from the live site.
    await this.gql(UPDATE_ITEM_FIELDS, {
      id: page.id,
      language: this.language,
      fields: [
        { name: "__Long description", value: note },
        { name: "__Never publish", value: "1" },
      ],
    });
    await this.gql(MOVE_ITEM, { id: page.id, targetParentId: bin });
    this.invalidate();
  }

  async listBin(): Promise<BinEntry[]> {
    const binId = await this.itemIdByPath(await this.binPath());
    if (!binId) return []; // nothing deleted yet
    const kids = await this.children({ id: binId });
    return (kids?.items ?? []).map((k) => {
      let meta: any = null;
      try {
        meta = JSON.parse(k.note ?? "")?.pageOps ?? null;
      } catch {
        meta = null;
      }
      return { id: k.id, name: k.name, displayName: k.displayName ?? k.name, fromParentId: meta?.from, fromRoute: meta?.route, deletedAt: meta?.at, deletedBy: meta?.by };
    });
  }

  /** Move a page back where it came from (or to `parentId`) and restore its note field. */
  async restoreFromBin(id: string, parentId?: string) {
    const raw = (await this.rawFields(id, ["__Long description"]))["__Long description"];
    let meta: any = null;
    try {
      meta = JSON.parse(raw)?.pageOps ?? null;
    } catch {
      meta = null;
    }
    const target = parentId ?? meta?.from;
    if (!target) throw new SitecoreError("Don’t know where this page came from. Choose where to restore it.");
    await this.gql(MOVE_ITEM, { id, targetParentId: target });
    await this.gql(UPDATE_ITEM_FIELDS, {
      id,
      language: this.language,
      fields: [
        { name: "__Long description", value: meta?.prev ?? "" },
        { name: "__Never publish", value: meta?.prevNever ?? "" },
      ],
    });
    this.invalidate();
    return { route: meta?.route as string | undefined };
  }

  async deleteForever(id: string) {
    await this.gql(DELETE_ITEM, { id, permanently: false });
  }

  /* ---------- Order ---------- */

  async sortOrders(ids: string[]): Promise<Map<string, string>> {
    const out = new Map<string, string>();
    for (const id of ids) out.set(id, (await this.rawFields(id, ["__Sortorder"]))["__Sortorder"]);
    return out;
  }

  async setSortOrder(id: string, value: string) {
    await this.gql(UPDATE_ITEM_FIELDS, { id, language: this.language, fields: [{ name: "__Sortorder", value }] });
  }

  /** Pages with their edit history, for reports. Uses Pages search, else loads each page. */
  async listPagesDetailed(onProgress?: (done: number, total: number) => void): Promise<PageRef[]> {
    const pages = await this.listAllPages();
    const out: PageRef[] = [];
    let done = 0;
    const { pool } = await import("../util");
    await pool(pages, 6, async (p) => {
      try {
        out.push(await this.getPage(p.id));
      } catch {
        // skip pages that vanished mid-scan
      }
      onProgress?.(++done, pages.length);
    });
    return out;
  }

  /* ---------------------------------------------------------------- */
  /* Publishing                                                        */
  /* ---------------------------------------------------------------- */

  async publish(ids: string[], opts: { subItems?: boolean; languages?: string[]; related?: boolean } = {}) {
    forgetLiveState(ids);
    const result = await this.publishRaw(ids, opts);
    markPublished(this.site.name, ids);
    return result;
  }

  private async publishRaw(ids: string[], opts: { subItems?: boolean; languages?: string[]; related?: boolean }) {
    // A URL change affects every language version, so publish all of the site's languages by default.
    const languages = opts.languages ?? this.publishLanguages;
    const targets = this.settings.publishTarget.split(",").map((t) => t.trim()).filter(Boolean);
    const results: string[] = [];
    for (const id of ids) {
      // Values are written into the mutation as literals rather than variables: the list fields'
      // exact types ([String] vs [String!]!) differ between environments, and literals fit both.
      const query = `mutation PublishItem { publishItem(input: { rootItemId: ${JSON.stringify(id)}, languages: ${JSON.stringify(languages)}, targetDatabases: ${JSON.stringify(targets)}, publishItemMode: SMART, publishRelatedItems: ${opts.related ? "true" : "false"}, publishSubItems: ${opts.subItems ? "true" : "false"} }) { operationId } }`;
      const r = await this.gql<any>(query);
      if (r?.publishItem?.operationId) results.push(r.publishItem.operationId);
    }
    return results;
  }


  /* ---------------------------------------------------------------- */
  /* Create, versions, languages, components, live state               */
  /* ---------------------------------------------------------------- */

  async insertOptions(pageId: string, language = this.language): Promise<TemplateOption[]> {
    const opts = await this.q<any[]>(
      "xmc.pages.retrieveInsertOptions",
      { path: { pageId }, query: this.ctx({ site: this.site.name, language, insertOptionKind: "Page" }) },
      "Load page templates",
    );
    return (opts ?? []).map((o) => ({ id: o.id, name: o.displayName ?? o.name ?? "Page" }));
  }

  async createPage(input: { parentId: string; name: string; templateId: string; displayName?: string; language?: string }) {
    const r = await this.m<any>(
      "xmc.pages.createPage",
      {
        body: {
          parentId: input.parentId,
          pageName: input.name,
          templateId: input.templateId,
          language: input.language ?? this.language,
          displayName: input.displayName || input.name,
        },
        query: this.ctx(),
      },
      "Create page",
    );
    this.invalidate();
    return { pageId: r?.pageId as string, path: r?.path as string };
  }

  async pageVersions(pageId: string, language: string): Promise<PageVersion[]> {
    const list = await this.q<any[]>(
      "xmc.pages.retrievePageVersions",
      { path: { pageId }, query: this.ctx({ site: this.site.name, language }) },
      "Load versions",
    );
    return (list ?? [])
      .map((v) => ({
        version: Number(v.version ?? 0),
        name: v.versionName ?? undefined,
        language: v.language ?? language,
        updatedAt: v.updatedAt ?? undefined,
        updatedBy: v.updatedBy ?? undefined,
        workflowState: v.workflow?.displayName ?? undefined,
      }))
      .filter((v) => v.version > 0)
      .sort((a, b) => b.version - a.version);
  }

  async addVersion(pageId: string, language: string, baseVersion?: number, versionName?: string) {
    return this.m<any>(
      "xmc.pages.addPageVersion",
      { path: { pageId }, body: { language, site: this.site.name, baseVersion, versionName }, query: this.ctx() },
      "Add version",
    );
  }

  async deleteVersion(pageId: string, versionNumber: number, language: string) {
    return this.m<any>("xmc.pages.deletePageVersions", { path: { pageId, versionNumber, language }, query: this.ctx() }, "Delete version");
  }

  /** Create an empty version of the page in another language. */
  async addLanguage(pageId: string, language: string) {
    return this.m<any>("xmc.agent.pagesAddLanguageToPage", { path: { pageId }, body: { language }, query: this.ctx() }, "Add language");
  }

  /** AI translation of a page into another language. */
  async translatePage(pageId: string, sourceLanguage: string, targetLanguage: string, addVersion: boolean) {
    return this.m<any>(
      "xmc.pages.translatePage",
      {
        path: { pageId },
        body: { sourceLanguage, targetLanguage, translationStrategy: addVersion ? "AddVersion" : "SkipIfExists" },
        query: this.ctx({ siteId: this.site.id }),
      },
      "Translate page",
    );
  }

  /**
   * true = published to Edge, false = not published, null = couldn't tell (never guessed).
   * The endpoint is slow, so calls are cached, de-duplicated and limited to two at a time.
   * After repeated timeouts it's skipped for the session instead of flooding the host.
   */
  async liveState(pageId: string, language = this.language): Promise<boolean | null> {
    if (live.disabled) return null;
    const key = `${this.contextId}:${shortId(pageId)}:${language}`;
    const hit = live.cache.get(key);
    if (hit && Date.now() - hit.at < LIVE_TTL) return hit.value;
    const pending = live.inflight.get(key);
    if (pending) return pending;
    const p = liveSlot(async () => {
      if (live.disabled) return null; // gave up while this request was queued
      try {
        const r = await this.q<any>("xmc.pages.getLivePageState", { path: { pageId }, query: this.ctx({ language }) }, "Live state");
        live.failures = 0;
        const parsed = parseLiveState(r);
        if (parsed === null && typeof window !== "undefined") console.info("[Page Operations] Unrecognised live state response", r);
        live.cache.set(key, { at: Date.now(), value: parsed });
        return parsed;
      } catch (e) {
        if (/timed out|timeout/i.test(String((e as Error)?.message ?? e))) {
          live.failures++;
          if (live.failures >= 3 && !live.disabled) {
            live.disabled = true;
            if (typeof window !== "undefined") console.warn("[Page Operations] Live status keeps timing out; skipping it for this session.");
          }
        }
        return null;
      } finally {
        live.inflight.delete(key);
      }
    });
    live.inflight.set(key, p);
    return p;
  }

  async previewUrl(pageId: string, language = this.language): Promise<string | null> {
    const r = await this.q<any>("xmc.agent.pagesGetPagePreviewUrl", { path: { pageId }, query: this.ctx({ language }) }, "Preview URL");
    return r?.previewUrl ?? null;
  }

  async screenshot(pageId: string, version: number, language = this.language): Promise<string | null> {
    const r = await this.q<any>(
      "xmc.agent.pagesGetPageScreenshot",
      { path: { pageId }, query: this.ctx({ version, language, width: 1280, height: 800 }) },
      "Screenshot",
    );
    const data: string | undefined =
      r?.data ?? r?.image ?? r?.screenshot ?? r?.base64 ?? Object.values(r ?? {}).find((v) => typeof v === "string" && (v as string).length > 500);
    if (!data) return null;
    return data.startsWith("data:") ? data : `data:${r?.type?.includes("/") ? r.type : "image/png"};base64,${data}`;
  }

  /** Resolve item IDs to name, path, template and (for media) alt text, 50 at a time. */
  async itemInfo(ids: string[]): Promise<Map<string, ItemInfo>> {
    const unique = [...new Set(ids.map((i) => i.trim()))];
    const out = new Map<string, ItemInfo>();
    for (let start = 0; start < unique.length; start += 50) {
      const chunk = unique.slice(start, start + 50);
      const vars: Record<string, string> = {};
      const fields = chunk.map((id, i) => {
        vars[`i${i}`] = id;
        return `i${i}: item(where: { itemId: $i${i} }) { itemId name path template { name } alt: field(name: "Alt") { value } }`;
      });
      const query = `query ResolveItems(${chunk.map((_, i) => `$i${i}: ID!`).join(", ")}) { ${fields.join(" ")} }`;
      const data = await this.gql<any>(query, vars);
      chunk.forEach((id, i) => {
        const it = data?.[`i${i}`];
        if (it?.path) out.set(shortId(id), { id: it.itemId ?? id, name: it.name, path: it.path, template: it.template?.name, alt: it.alt?.value ?? undefined });
      });
    }
    return out;
  }

  async itemPaths(ids: string[]): Promise<Map<string, string>> {
    const info = await this.itemInfo(ids);
    return new Map([...info.entries()].map(([k, v]) => [k, v.path]));
  }

  async components(pageId: string, language = this.language, pagePath?: string): Promise<PageComponent[]> {
    const r = await this.q<any>("xmc.agent.pagesGetComponentsOnPage", { path: { pageId }, query: this.ctx({ language }) }, "Components");
    const raw: any[] = r?.components ?? [];
    const isGuid = (v: string) => /^[{(]?[0-9a-f]{8}(-?[0-9a-f]{4}){3}-?[0-9a-f]{12}[)}]?$/i.test(v.trim());
    const guids = raw.map((c) => c.dataSource).filter((d): d is string => typeof d === "string" && isGuid(d));
    const paths = guids.length ? await this.itemPaths(guids).catch(() => new Map<string, string>()) : new Map<string, string>();
    const base = (pagePath ?? r?.pagePath ?? "").toLowerCase();
    return raw.map((c: any) => {
      const ds: string = (c.dataSource ?? "").trim();
      const resolved = ds && isGuid(ds) ? paths.get(shortId(ds)) : ds.startsWith("local:") ? ds.replace(/^local:/, base ? `${pagePath ?? r?.pagePath}` : "") : ds || undefined;
      const scope: PageComponent["scope"] = !ds
        ? "none"
        : ds.startsWith("local:")
          ? "local"
          : !resolved
            ? "unknown"
            : base && resolved.toLowerCase().startsWith(`${base}/`)
              ? "local"
              : "shared";
      return { id: c.id, name: c.componentName ?? c.componentId, placeholder: c.placeholder ?? undefined, dataSource: ds || undefined, dataSourcePath: resolved, scope };
    });
  }

  async localizationStats(): Promise<LocaleStat[]> {
    const r = await this.q<any>("xmc.sites.retrieveLocalizationStatistics", { path: { siteId: this.site.id }, query: this.ctx() }, "Language stats");
    return (r?.locales ?? []).map((l: any, i: number) => {
      const code = l.data?.locale ?? l.locale ?? l.data?.iso ?? l.language ?? "";
      return {
        language: code || `language-${i}`,
        name: l.data?.displayName ?? l.data?.englishName ?? code ?? "Unknown language",
        pageCount: Number(l.pageCount ?? 0),
      };
    });
  }

  async workflowStats(): Promise<WorkflowStat[]> {
    const r = await this.q<any>("xmc.sites.retrieveWorkflowStatistics", { path: { siteId: this.site.id }, query: this.ctx() }, "Workflow stats");
    return (r?.workflows ?? []).map((w: any) => ({
      workflow: w.name ?? "Workflow",
      states: (w.states ?? []).map((st: any) => ({ name: st.name ?? "", pageCount: Number(st.pageCount ?? 0) })),
    }));
  }

  /* ---------------------------------------------------------------- */
  /* AI: brand review (Sitecore Stream)                                */
  /* ---------------------------------------------------------------- */

  async brandReview(text: string): Promise<BrandReview | null> {
    if (!this.site.brandKitId) return null;
    const res: any = await (this.client as any).mutate("ai.skills.generateBrandReview", {
      params: {
        body: { brandkitId: this.site.brandKitId, input: { text } },
        query: { sitecoreContextId: this.contextId },
      },
    });
    return parseBrandReview(unwrap<any>(res, "Brand review"));
  }
}

/* ------------------------------------------------------------------ */
/* Mappers                                                             */
/* ------------------------------------------------------------------ */

export function toPageRef(p: any, language: string): PageRef {
  const perms = p?.permissions ?? {};
  return {
    id: p.id,
    name: p.name,
    displayName: p.displayName || p.name,
    path: p.path,
    route: p.route ?? "/",
    language: p.language ?? language,
    parentId: p.parentId ?? p.parent?.id,
    templateId: p.templateId ?? p.template?.id,
    templateName: p.template?.displayName ?? p.template?.name,
    hasChildren: !!p.hasChildren,
    permissions: {
      canRename: perms.canRename !== false,
      canDelete: perms.canDelete !== false,
      canWrite: perms.canWrite !== false,
      canCreate: perms.canCreate !== false,
      canPublish: perms.canPublish !== false,
    },
    locked: !!p.locking?.isLocked,
    lockedByMe: !!p.locking?.lockedByCurrentUser,
    workflowState: p.workflow?.displayName ?? p.workflow?.state?.displayName ?? undefined,
    meta: {
      url: p.url ?? undefined,
      version: p.version ?? undefined,
      createdAt: p.createdAt ?? p.creationDate ?? undefined,
      updatedAt: p.updatedAt ?? p.updatedDate ?? undefined,
      createdBy: p.createdBy ?? undefined,
      updatedBy: p.updatedBy ?? undefined,
      isPublishable: p.publishing?.isPublishable,
      hasPublishableVersion: p.publishing?.hasPublishableVersion,
      validFrom: p.publishing?.validFromDate ?? undefined,
      validTo: p.publishing?.validToDate ?? undefined,
      workflowFinal: p.workflow?.finalState,
    },
  };
}

/**
 * Some environments return the hierarchy from the site item (no layout) with Home as a child.
 * Use the real home page: the start item, else the child at "/", else a child named Home.
 */
function pickHome(h: any, startItemId?: string): any {
  const page = h.page;
  const kids: any[] = h.children ?? [];
  if (startItemId && sameId(page.id, startItemId)) return page;
  const byStart = startItemId ? kids.find((c) => sameId(c.id, startItemId)) : null;
  if (byStart) return byStart;
  const isSiteItem = page.hasPresentation === false || kids.some((c) => c.route === "/" && !sameId(c.id, page.id));
  if (!isSiteItem) return page;
  return kids.find((c) => c.route === "/" && c.hasPresentation !== false) ?? kids.find((c) => /^home$/i.test(c.name ?? "")) ?? kids.find((c) => c.hasPresentation !== false) ?? page;
}

/** A route that points inside a page's local Data folder (datasources, not pages). */
export function isDataRoute(route: string) {
  return /(^|\/)data(\/|$)/i.test(route) || isAppRoute(route);
}

/** The app's own folders (bin, team storage) sit under the site root; they are never pages. */
export function isAppRoute(route: string) {
  return /^\/?page[-\s]operations([-\s]bin)?(\/|$)/i.test(route.trim());
}

/** Local datasource folders and other items with no layout that hold no pages. */
export function isDataFolder(n: { name: string; hasPresentation?: boolean }) {
  return n.hasPresentation === false && /^data$/i.test(n.name);
}

function toTreeNode(p: any): TreeNode {
  return {
    hasPresentation: p.hasPresentation ?? undefined,
    id: p.id,
    name: p.name,
    displayName: p.displayName || p.name,
    route: p.route ?? "/",
    path: p.path,
    hasChildren: !!p.hasChildren,
    templateId: p.templateId,
    insertOptionIds: (p.insertOptions ?? []).map((o: any) => o.id),
  };
}

/** The live-state endpoint is untyped; accept the shapes it's known to take and nothing else. */
export function parseLiveState(r: any): boolean | null {
  if (typeof r === "boolean") return r;
  if (typeof r === "string") {
    const v = r.trim().toLowerCase();
    if (v === "true" || v === "live" || v === "published") return true;
    if (v === "false" || v === "notlive" || v === "not live" || v === "unpublished" || v === "notpublished") return false;
    return null;
  }
  if (r && typeof r === "object") {
    for (const key of ["isLive", "live", "isPublished", "published", "exists", "isAvailable"]) {
      if (typeof r[key] === "boolean") return r[key];
    }
    for (const key of ["state", "status", "liveState"]) {
      if (typeof r[key] === "string") return parseLiveState(r[key]);
    }
    if ("data" in r) return parseLiveState(r.data);
  }
  return null;
}

export interface BrandReview {
  score: number | null;
  summary: string;
  suggestions: string[];
}

/** The brand review response is loosely typed; pull out what an author needs. */
export function parseBrandReview(raw: any): BrandReview {
  const sections: any[] = raw?.sections ?? raw?.results ?? raw?.review?.sections ?? [];
  const scores = sections.map((s) => Number(s.score ?? s.complianceScore)).filter((n) => !Number.isNaN(n));
  const score =
    typeof raw?.score === "number" ? raw.score : scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;
  const suggestions = sections
    .flatMap((s) => s.suggestions ?? s.fixSuggestions ?? (s.suggestion ? [s.suggestion] : []))
    .map((s: any) => (typeof s === "string" ? s : s?.text ?? s?.suggestion ?? ""))
    .filter(Boolean)
    .slice(0, 3);
  const summary = raw?.summary ?? raw?.explanation ?? sections[0]?.explanation ?? "";
  return { score, summary, suggestions };
}
