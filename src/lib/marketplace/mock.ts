/**
 * A small in-memory stand-in for the Sitecore host, used when the app runs outside an iframe
 * (or with NEXT_PUBLIC_MOCK=1). It answers the same query/mutation keys the real SDK does,
 * so every code path in the app runs unchanged against realistic, editable sample data.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { opName } from "../sitecore/queries";
import { serializeUrlMapping } from "../sitecore/redirects";

type Kind = "root" | "page" | "folder" | "redirect" | "content" | "template";

interface MockItem {
  id: string;
  name: string;
  displayName?: string;
  parentId: string | null;
  kind: Kind;
  templateId: string;
  fields: Record<string, string>;
  links: string[];
  workflow?: string;
  locked?: boolean;
  versions?: Record<string, { version: number; name?: string; updatedAt: string; updatedBy: string }[]>;
}

const T_PAGE = "{1105B8F8-1E00-426B-BF1F-C840742D827B}";
const T_FOLDER = "{A87A00B1-E6DB-45AB-8B54-636FEC3B5523}";
const T_REDIRECT_MAP = "{19E8B6C2-4F3B-4C62-B4DD-6A1F0E5C9A21}";
const T_CONTENT = "{3C1715FE-6A13-4FCF-845F-DE308BA9741D}";

let seq = 1000;
const guid = () => {
  const hex = (seq++).toString(16).padStart(12, "0");
  return `{6F1D2A3B-0000-4000-8000-${hex.toUpperCase()}}`;
};
const short = (id: string) => id.replace(/[{}-]/g, "").toLowerCase();
const wait = (ms = 250 + Math.random() * 350) => new Promise((r) => setTimeout(r, ms));

const items = new Map<string, MockItem>();
const now = Date.now();
const iso = (daysAgo: number) => new Date(now - daysAgo * 86400000).toISOString();
const published = new Set<string>();

function add(name: string, parent: MockItem | null, kind: Kind, extra: Partial<MockItem> = {}) {
  const item: MockItem = {
    id: guid(),
    name,
    parentId: parent?.id ?? null,
    kind,
    templateId: kind === "redirect" ? T_REDIRECT_MAP : kind === "page" ? T_PAGE : kind === "content" ? T_CONTENT : T_FOLDER,
    fields: {},
    links: [],
    ...extra,
  };
  if (kind === "page" && !item.versions) item.versions = { en: [{ version: 1, updatedAt: iso(30), updatedBy: "maya.k" }] };
  items.set(item.id, item);
  return item;
}

/* ---------------- sample content: an outdoor gear brand ---------------- */
const sitecore = add("sitecore", null, "root");
const templates = add("templates", sitecore, "folder");
const foundation = add("Foundation", templates, "folder");
const sxa = add("Experience Accelerator", foundation, "folder");
const redirTpl = add("Redirects", sxa, "folder");
add("Redirect Map", redirTpl, "template", { id: T_REDIRECT_MAP });
const common = add("Common", templates, "folder");
add("Folder", common, "template", { id: T_FOLDER });
const mediaLib = add("media library", sitecore, "folder");
const mediaImages = add("Images", mediaLib, "folder");
const heroNoAlt = add("tent-hero", mediaImages, "content", { fields: { Alt: "" } });
const heroWithAlt = add("trail-shoe-closeup", mediaImages, "content", { fields: { Alt: "Close-up of a trail shoe sole" } });

const content = add("content", sitecore, "folder");
const collection = add("Brands", content, "folder");
const siteRoot = add("Northwind", collection, "folder");
const home = add("Home", siteRoot, "page", { displayName: "Northwind Outdoors" });
const about = add("about", home, "page", { displayName: "About us" });
const team = add("team", about, "page", { displayName: "Our team" });
const careers = add("careers", about, "page", { displayName: "Careers", workflow: "Awaiting approval" });
const press = add("Press_Kit", about, "page", { displayName: "Press kit" });
const products = add("products", home, "page", { displayName: "Products" });
const tents = add("tents", products, "page", { displayName: "Tents" });
const bags = add("Sleeping Bags", products, "page", { displayName: "Sleeping bags" });
const shoes = add("trail-shoes", products, "page", { displayName: "Trail shoes" });
const journal = add("journal", home, "page", { displayName: "Journal" });
const guide = add("Summer-Gear-Guide-2025", journal, "page", { displayName: "Summer gear guide 2025" });
const checklist = add("packing-checklist", journal, "page", { displayName: "The packing checklist" });
const support = add("support", home, "page", { displayName: "Support" });
const contact = add("contact", support, "page", { displayName: "Contact us", locked: true });
const returns = add("returns", support, "page", { displayName: "Returns" });
add("Gift_Cards", support, "page", { displayName: "Gift cards" });
for (const owner of [about, products, guide]) {
  const local = add("Data", owner, "folder");
  add("Cards", local, "content");
  add("Hero", local, "content");
}

const data = add("Data", siteRoot, "folder");
const footer = add("Footer links", data, "content");
const promo = add("Spring promo banner", data, "content");
const settingsFolder = add("Settings", siteRoot, "folder");
const redirects = add("Redirects", settingsFolder, "folder");

for (const [it, fr, extra] of [
  [home, true, 2],
  [about, true, 1],
  [products, true, 1],
  [tents, false, 3],
  [guide, false, 2],
] as const) {
  for (let v = 2; v <= extra; v++) it.versions!.en.push({ version: v, updatedAt: iso(10 - v), updatedBy: "sam.r", name: v === extra ? "Spring refresh" : undefined });
  if (fr) it.versions!["fr-FR"] = [{ version: 1, updatedAt: iso(20), updatedBy: "claire.d" }];
}
[home, about, team, products, tents, bags, shoes, journal, guide, support, contact, returns].forEach((p) => published.add(p.id));
checklist.fields.__Unpublish = "20270131T235959Z";
// Stale content: last edited long ago
for (const [it, days, who] of [[press, 520, "jo.w"], [returns, 410, "jo.w"], [shoes, 230, "sam.r"], [checklist, 700, "maya.k"]] as const) {
  it.versions!.en = [{ version: 1, updatedAt: iso(days), updatedBy: who }];
}

home.links = [about.id, products.id, tents.id, journal.id];
team.links = [careers.id, contact.id];
careers.links = [team.id];
guide.links = [tents.id, bags.id, shoes.id, checklist.id];
checklist.links = [bags.id, tents.id];
tents.links = [returns.id];
footer.links = [contact.id, returns.id, about.id, press.id];
promo.links = [tents.id, guide.id];

add("Legacy site", redirects, "redirect", {
  fields: {
    RedirectType: "Redirect301",
    PreserveQueryString: "1",
    UrlMapping: serializeUrlMapping([
      { source: "/about-us", target: "/about" },
      { source: "/our-team", target: "/about/team" },
      { source: "/shop", target: "/products" },
      { source: "/shop/tents", target: "/products/tents" },
      { source: "/products/tents", target: "/shop/tents" },
      { source: "/contact-us", target: "/support/contact" },
      { source: "/summer", target: "/journal/summer-guide" },
      { source: "/promo", target: "/summer" },
      { source: "/press", target: "/about/press_kit" },
    ]),
  },
});
add("Campaign - Spring sale", redirects, "redirect", {
  fields: {
    RedirectType: "Redirect302",
    UrlMapping: serializeUrlMapping([{ source: "/spring", target: "/products" }]),
    __Publish: "20260301T000000Z",
    __Unpublish: "20260531T235959Z",
  },
});
add("Campaign - Winter gear", redirects, "redirect", {
  fields: {
    RedirectType: "Redirect302",
    UrlMapping: serializeUrlMapping([{ source: "/winter", target: "/products/sleeping-bags" }, { source: "/snow", target: "/products/tents" }]),
    __Publish: "20261101T000000Z",
    __Unpublish: "20270228T235959Z",
  },
});
add("Campaigns", redirects, "redirect", {
  fields: {
    RedirectType: "Redirect302",
    PreserveQueryString: "",
    UrlMapping: serializeUrlMapping([
      { source: "/sale", target: "/products" },
      { source: "/holiday", target: "/journal/packing-checklist" },
      { source: "/team", target: "/our-team" },
      { source: "/shop", target: "/products/tents" },
    ]),
  },
});

/* ---------------- helpers ---------------- */
const children = (id: string) =>
  [...items.values()]
    .map((it, n) => ({ it, n }))
    .filter(({ it }) => it.parentId === id)
    .sort((a, b) => (Number(a.it.fields.__Sortorder ?? a.n * 10) || 0) - (Number(b.it.fields.__Sortorder ?? b.n * 10) || 0) || a.n - b.n)
    .map(({ it }) => it);
function pathOf(item: MockItem): string {
  const parts: string[] = [];
  let cur: MockItem | undefined = item;
  while (cur) {
    parts.unshift(cur.name);
    cur = cur.parentId ? items.get(cur.parentId) : undefined;
  }
  return `/${parts.join("/")}`;
}
function routeOf(item: MockItem): string {
  if (item.id === home.id) return "/";
  const parts: string[] = [];
  let cur: MockItem | undefined = item;
  while (cur && cur.id !== home.id) {
    parts.unshift(cur.name.toLowerCase().replace(/\s+/g, "-"));
    cur = cur.parentId ? items.get(cur.parentId) : undefined;
  }
  return `/${parts.join("/")}`;
}
const byPath = (p: string) => [...items.values()].find((i) => pathOf(i).toLowerCase() === p.toLowerCase());
const isUnderHome = (i: MockItem) => pathOf(i).toLowerCase().startsWith(pathOf(home).toLowerCase());
const byId = (id: string) => [...items.values()].find((i) => short(i.id) === short(id));
const pagesInSite = () => [...items.values()].filter((i) => i.kind === "page" && isUnderHome(i));

function pageDto(i: MockItem) {
  return {
    id: i.id,
    name: i.name,
    displayName: i.displayName ?? i.name,
    path: pathOf(i),
    route: routeOf(i),
    url: `https://www.northwind.example${routeOf(i)}`,
    language: "en",
    parentId: i.parentId,
    templateId: i.templateId,
    template: { id: i.templateId, name: "Page", displayName: "Page" },
    hasChildren: children(i.id).length > 0,
    hasPresentation: i.kind === "page",
    insertOptions: [{ id: T_PAGE, displayName: "Page" }],
    version: Math.max(...(i.versions?.en ?? [{ version: 1 }]).map((v) => v.version)),
    createdAt: i.versions?.en?.[0]?.updatedAt ?? iso(60),
    updatedAt: i.versions?.en?.at(-1)?.updatedAt ?? iso(5),
    createdBy: "maya.k",
    updatedBy: i.versions?.en?.at(-1)?.updatedBy ?? "maya.k",
    publishing: { isPublishable: i.fields["__Never publish"] !== "1", hasPublishableVersion: true, isAvailableToPublish: true },
    permissions: { canRename: i.id !== home.id, canDelete: i.id !== home.id, canWrite: true, canCreate: true, canPublish: true },
    locking: { isLocked: !!i.locked, lockedByCurrentUser: false, lockedBy: i.locked ? "maya.k@northwind.example" : null },
    workflow: i.workflow ? { displayName: i.workflow } : null,
  };
}

function gqlItem(i: MockItem, depth = 0): any {
  const field = (n: string) => (n in i.fields ? { value: i.fields[n] } : null);
  return {
    itemId: i.id,
    name: i.name,
    path: pathOf(i),
    hasChildren: children(i.id).length > 0,
    template: { templateId: i.templateId, name: i.kind === "redirect" ? "Redirect Map" : "Folder" },
    urlMapping: i.kind === "redirect" ? field("UrlMapping") ?? { value: "" } : null,
    redirectType: field("RedirectType"),
    preserveQs: field("PreserveQueryString"),
    publishFrom: field("__Publish"),
    publishTo: field("__Unpublish"),
    children: depth < 2 ? { nodes: children(i.id).map((c) => gqlItem(c, depth + 1)) } : { nodes: [] },
  };
}

/* ---------------- versioned content ---------------- */
const versionStore = new Map<string, Record<string, string>>();
const CONTENT_FIELDS = new Set(["Title", "Content", "NavigationTitle", "MetaDescription", "PromoLink", "HeroImage", "__Final Renderings"]);
const latestVersion = (it: MockItem, lang: string) => Math.max(0, ...(it.versions?.[lang] ?? []).map((x) => x.version));

function generate(it: MockItem, lang: string, ver: number): Record<string, string> {
  const title = it.displayName ?? it.name;
  const links = it.links.map((l) => `<a href="~/link.aspx?_id=${short(l).toUpperCase()}&amp;_z=z">${items.get(l)?.displayName ?? "link"}</a>`).join(", ");
  const brokenLink = it.id === guide.id ? ` <a href="~/link.aspx?_id=0BADC0DE0000400080000000DEADBEEF">old product</a>` : "";
  const extras =
    it.id === guide.id
      ? `<h2>What to pack</h2><h4>Shelter</h4><p><img src="-/media/${short(heroNoAlt.id)}.ashx" /> Our tents are rated for three seasons. Call 0800 123 456 for advice. <a href="/products">click here</a></p>`
      : it.id === tents.id
        ? `<h1>Tents</h1><table><tr><td>Model</td><td>Weight</td></tr></table><p>Questions? Call 0800 123 456.</p>`
        : it.id === contact.id
          ? `<p>Call us on 0800 123 456, weekdays 9 to 5.</p><a href="/support"></a>`
          : "";
  const body =
    ver === 1
      ? `<p>Welcome to ${title}. Everything you need for your next trip, tested by our team.</p>${extras}<p>${links}${brokenLink}</p>`
      : `<p>Welcome to ${title}. Everything you need for your next adventure, tested by our guides in real weather.</p><p>New this season: lighter gear and longer warranties.</p>${extras}<p>${links}${brokenLink}</p>`;
  const localData = children(it.id).find((c) => c.name === "Data");
  const localHero = localData ? children(localData.id).find((c) => c.name === "Hero") : undefined;
  return {
    Title: ver === 1 ? title : `${title}${ver > 2 ? " | Northwind" : ""}`,
    Content: lang === "en" ? body : `<p>[${lang}] ${title}</p>`,
    NavigationTitle: title,
    MetaDescription: ver === 1 ? "" : `Shop ${title.toLowerCase()} at Northwind Outdoors.`,
    PromoLink: it.id === tents.id ? '<link linktype="internal" id="{0BADC0DE-0000-4000-8000-0000DEADBEEF}" />' : "",
    HeroImage: it.id === tents.id ? `<image mediaid="${heroNoAlt.id}" alt="" />` : it.id === shoes.id ? `<image mediaid="${heroWithAlt.id}" />` : "",
    "__Final Renderings": `<r><d id="{FE5D7FDF-89C0-4D99-9AA3-B5FBD009C9F3}"><r uid="{11111111-2222-3333-4444-555555555555}" s:id="{9C6D6A4D-2B6C-4A4F-8C2E-1F1E1E1E1E1E}" s:ds="${footer.id}" s:ph="headless-footer" /><r uid="{22222222-2222-3333-4444-555555555555}" s:id="{9C6D6A4D-2B6C-4A4F-8C2E-2F2E2E2E2E2E}" s:ds="${promo.id}" s:ph="headless-main" />${localHero ? `<r uid="{33333333-2222-3333-4444-555555555555}" s:id="{9C6D6A4D-2B6C-4A4F-8C2E-3F3E3E3E3E3E}" s:ds="${localHero.id}" s:ph="headless-main" />` : ""}</d></r>`,
  };
}
function versionContent(it: MockItem, lang: string, ver?: number | null) {
  const v = ver ?? latestVersion(it, lang);
  if (!(it.versions?.[lang] ?? []).some((x) => x.version === v)) return null;
  const key = `${it.id}|${lang}|${v}`;
  if (!versionStore.has(key)) versionStore.set(key, generate(it, lang, v));
  return { v, data: versionStore.get(key)! };
}
function readField(it: MockItem, name: string, lang: string, ver?: number | null) {
  if (CONTENT_FIELDS.has(name)) return versionContent(it, lang, ver)?.data[name] ?? "";
  if (name === "__Display name") return it.displayName ?? "";
  return it.fields[name] ?? "";
}
function writeFields(it: MockItem, fields: { name: string; value: string }[], lang: string, ver?: number | null) {
  for (const f of fields) {
    if (CONTENT_FIELDS.has(f.name)) {
      const vc = versionContent(it, lang, ver);
      if (vc) vc.data[f.name] = f.value;
    } else if (f.name === "__Display name") it.displayName = f.value;
    else it.fields[f.name] = f.value;
  }
}
const neverPublished = (it: MockItem | undefined): boolean => !!it && (it.fields["__Never publish"] === "1" || neverPublished(it.parentId ? items.get(it.parentId) : undefined));

/* ---------------- GraphQL ---------------- */
function graphql(query: string, v: any): any {
  const op = opName(query);
  switch (op) {
    case "GetRedirectFolder": {
      const f = byPath(v.path);
      return { item: f ? gqlItem(f) : null };
    }
    case "ResolveItems": {
      const out: Record<string, unknown> = {};
      for (const [k, id] of Object.entries(v)) {
        const it = byId(id as string);
        out[k] = it ? { itemId: it.id, name: it.name, path: pathOf(it), template: { name: it.kind === "page" ? "Page" : "Content" }, alt: "Alt" in it.fields ? { value: it.fields.Alt } : null } : null;
      }
      return out;
    }
    case "PageFields": {
      const it = byId(v.id);
      if (!it) return { item: null };
      const vc = versionContent(it, v.language ?? "en", v.version);
      if (!vc) return { item: null };
      return {
        item: {
          itemId: it.id,
          version: vc.v,
          fields: { nodes: Object.entries(vc.data).filter(([k]) => !k.startsWith("__")).map(([name, value]) => ({ name, value })) },
          layout: { value: vc.data["__Final Renderings"] },
          neverPublish: { value: it.fields["__Never publish"] ?? "" },
          publishFrom: { value: it.fields["__Publish"] ?? "" },
          publishTo: { value: it.fields["__Unpublish"] ?? "" },
        },
      };
    }
    case "RawFields": {
      const it = byId(v.id);
      if (!it) return { item: null };
      const out: Record<string, unknown> = { itemId: it.id };
      for (const m of query.matchAll(/f(\d+): field\(name: "([^"]+)"\)/g)) out[`f${m[1]}`] = { value: readField(it, m[2], v.language ?? "en", v.version) };
      return { item: out };
    }
    case "UpdateVersionFields": {
      const it = byId(v.id);
      if (!it) throw new Error("Item not found");
      writeFields(it, v.fields, v.language ?? "en", v.version);
      return { updateItem: { item: { itemId: it.id } } };
    }
    case "GetChildren": {
      const byIdLookup = /itemId: \$key/.test(query);
      const it = byIdLookup ? byId(v.key) : byPath(v.key);
      if (!it) return { item: null };
      return {
        item: {
          itemId: it.id,
          path: pathOf(it),
          children: {
            nodes: children(it.id).map((c) => ({
              itemId: c.id,
              name: c.name,
              path: pathOf(c),
              template: { templateId: c.templateId, name: c.kind === "page" ? "Page" : c.kind === "folder" ? "Folder" : "Content" },
              displayName: { value: c.displayName ?? "" },
              note: { value: c.fields["__Long description"] ?? "" },
              updated: { value: "" },
            })),
          },
        },
      };
    }
    case "CopyItem": {
      const src = byId(v.id);
      const target = byId(v.targetParentId);
      if (!src || !target) throw new Error("Item not found");
      const copy = add(v.name, target, src.kind === "page" ? "page" : "content", { fields: { ...src.fields }, links: [...src.links] });
      return { copyItem: { item: { itemId: copy.id, name: copy.name, path: pathOf(copy) } } };
    }
    case "Introspect":
      return { __schema: { mutationType: { fields: ["createItem", "updateItem", "deleteItem", "moveItem", "copyItem", "renameItem", "publishItem"].map((name) => ({ name })) } } };
    case "GetItemIdByPath": {
      const f = byPath(v.path);
      return { item: f ? { itemId: f.id, path: pathOf(f) } : null };
    }
    case "GetSiblingNames": {
      const p = byId(v.id);
      return { item: p ? { itemId: p.id, children: { nodes: children(p.id).map((c) => ({ itemId: c.id, name: c.name })) } } : null };
    }
    case "FindReferrers": {
      const results = [...items.values()]
        .filter((i) => i.links.some((l) => short(l) === v.value))
        .map((i) => ({ itemId: i.id, name: i.displayName ?? i.name, path: pathOf(i), language: { name: "en" } }));
      return { search: { totalCount: results.length, results } };
    }
    case "CreateItem": {
      const parent = byId(v.parent);
      if (!parent) throw new Error("Parent not found");
      const kind: Kind = short(v.templateId) === short(T_REDIRECT_MAP) ? "redirect" : short(v.templateId) === short(T_FOLDER) ? "folder" : "content";
      const fields: Record<string, string> = {};
      (v.fields ?? []).forEach((f: any) => (fields[f.name] = f.value));
      const created = add(v.name, parent, kind, { fields });
      return { createItem: { item: { itemId: created.id, name: created.name, path: pathOf(created) } } };
    }
    case "UpdateItemFields": {
      const it = byId(v.id);
      if (!it) throw new Error("Item not found");
      writeFields(it, v.fields, v.language ?? "en", null);
      return { updateItem: { item: { itemId: it.id } } };
    }
    case "MoveItem": {
      const it = byId(v.id);
      const target = byId(v.targetParentId);
      if (!it || !target) throw new Error("Item not found");
      if (children(target.id).some((c) => c.name.toLowerCase() === it.name.toLowerCase() && c.id !== it.id)) {
        throw new Error(`An item named “${it.name}” already exists under ${target.displayName ?? target.name}.`);
      }
      it.parentId = target.id;
      return { moveItem: { item: { itemId: it.id, path: pathOf(it) } } };
    }
    case "DeleteItem": {
      const it = byId(v.id);
      if (it) removeTree(it.id);
      return { deleteItem: { successful: true } };
    }
    case "PublishItem": {
      const lit = (k: string) => new RegExp(`${k}:\\s*("[^"]*"|\\[[^\\]]*\\]|true|false)`).exec(query)?.[1];
      const langs = JSON.parse(lit("languages") ?? "[]");
      if (!Array.isArray(langs) || langs.some((l) => typeof l !== "string")) throw new Error("The specified value type of field `languages` does not match the field type.");
      v = { id: JSON.parse(lit("rootItemId") ?? '""'), subItems: lit("publishSubItems") === "true" };
      const root = byId(v.id);
      if (root) {
        const mark = (it: MockItem) => {
          if (it.kind === "page") {
            if (neverPublished(it)) published.delete(it.id);
            else published.add(it.id);
          }
          if (v.subItems || neverPublished(it)) children(it.id).forEach(mark);
        };
        mark(root);
      }
      return { publishItem: { operationId: crypto.randomUUID() } };
    }
    default:
      throw new Error(`Mock host doesn’t implement GraphQL operation ${op}`);
  }
}

function removeTree(id: string) {
  children(id).forEach((c) => removeTree(c.id));
  items.delete(id);
}

/* ---------------- client ---------------- */
let currentPageId = team.id;
const pageSubscribers = new Set<(d: any) => void>();
let urlState: any = null;

function pagesContext() {
  const page = items.get(currentPageId) ?? home;
  return {
    siteInfo: {
      id: "site-northwind",
      name: "northwind",
      displayName: "Northwind Outdoors",
      language: "en",
      startItemId: home.id,
      supportedLanguages: ["en", "fr-FR"],
      brandKitId: "brandkit-northwind",
    },
    pageInfo: { ...pageDto(page), parent: { id: page.parentId } },
  };
}

const ok = (data: any) => ({ data, error: undefined });

export function createMockClient() {
  return {
    __mock: true,
    async query(key: string, opts: any = {}) {
      await wait(key.startsWith("application") || key.startsWith("host") ? 30 : undefined);
      const p = opts.params ?? {};
      let data: any;
      switch (key) {
        case "application.context":
          data = {
            id: "page-operations",
            name: "Page Operations",
            url: window.location.origin,
            installationId: "sample-install",
            organizationId: "org_sample",
            resourceAccess: [
              { resourceId: "xmcloud", tenantId: "t-prod", tenantName: "northwind-prod", tenantDisplayName: "Northwind Production (sample)", context: { live: "live-prod", preview: "preview-prod" } },
              { resourceId: "xmcloud", tenantId: "t-dev", tenantName: "northwind-dev", tenantDisplayName: "Northwind Development (sample)", context: { live: "live-dev", preview: "preview-dev" } },
            ],
          };
          break;
        case "host.user":
          data = { id: "u1", name: "Sample author", email: "author@northwind.example" };
          break;
        case "host.state":
          data = { environment: "sample", language: "en" };
          break;
        case "pages.context":
          data = pagesContext();
          if (opts.subscribe && opts.onSuccess) {
            pageSubscribers.add(opts.onSuccess);
          }
          break;
        case "application.urlState":
          data = { state: urlState };
          break;
        case "xmc.sites.listSites":
          data = ok([
            {
              id: "site-northwind",
              name: "northwind",
              displayName: "Northwind Outdoors",
              languages: ["en", "fr-FR"],
              hosts: [{ name: "northwind", languageSettings: { defaultLanguage: "en" } }],
              brandKitId: "brandkit-northwind",
            },
            {
              id: "site-northwind-outlet",
              name: "northwind-outlet",
              displayName: "Northwind Outlet (empty)",
              languages: ["en"],
              hosts: [],
            },
          ]);
          break;
        case "xmc.pages.retrievePage": {
          const it = byId(p.path.pageId);
          data = it ? ok(pageDto(it)) : { data: undefined, error: { title: "Page not found" } };
          break;
        }
        case "xmc.sites.retrievePageHierarchy": {
          const it = byId(p.path.pageId)!;
          data = ok({ page: pageDto(it), children: children(it.id).filter((c) => c.kind === "page").map(pageDto) });
          break;
        }
        case "xmc.sites.listPageChildren": {
          // Like the real API, this returns local Data folders too.
          data = ok(children(byId(p.path.pageId)!.id).filter((c) => c.kind === "page" || c.name === "Data").map(pageDto));
          break;
        }
        case "xmc.sites.retrieveSiteHierarchy": {
          if (p.path.siteId !== "site-northwind") {
            data = { data: undefined, error: { title: "This site has no pages yet." } };
            break;
          }
          // Like the real API on many environments: starts at the site item, with Home as its child.
          data = ok({
            page: { id: siteRoot.id, name: siteRoot.name, displayName: siteRoot.name, path: pathOf(siteRoot), route: "/", hasChildren: true, hasPresentation: false },
            children: [pageDto(home)],
          });
          break;
        }
        case "xmc.pages.retrieveInsertOptions":
          data = ok([
            { id: T_PAGE, displayName: "Page" },
            { id: "{8B1F0A2C-1111-4C1D-9E00-0000000000A1}", displayName: "Article" },
            { id: "{8B1F0A2C-1111-4C1D-9E00-0000000000A2}", displayName: "Landing page" },
          ]);
          break;
        case "xmc.pages.retrievePageVersions": {
          const it = byId(p.path.pageId)!;
          const lang = p.query.language ?? "en";
          data = ok(
            (it.versions?.[lang] ?? []).map((v) => ({
              ...pageDto(it),
              version: v.version,
              versionName: v.name,
              language: lang,
              updatedAt: v.updatedAt,
              updatedBy: v.updatedBy,
            })),
          );
          break;
        }
        case "xmc.pages.getLivePageState":
          data = ok({ pageId: p.path.pageId, state: published.has(byId(p.path.pageId)?.id ?? "") ? "Live" : "NotLive" });
          break;
        case "xmc.agent.pagesGetPagePreviewUrl": {
          const it = byId(p.path.pageId)!;
          data = ok({ pageId: it.id, previewUrl: `https://preview.northwind.example${routeOf(it)}?sc_lang=${p.query?.language ?? "en"}` });
          break;
        }
        case "xmc.agent.pagesGetPageScreenshot": {
          const it = byId(p.path.pageId)!;
          const title = (it.displayName ?? it.name).replace(/[<&>]/g, "");
          const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="800" viewBox="0 0 1280 800"><rect width="1280" height="800" fill="#f4f7ff"/><rect width="1280" height="72" fill="#16215f"/><text x="48" y="46" font-family="sans-serif" font-size="24" fill="#fff">Northwind Outdoors</text><text x="48" y="220" font-family="sans-serif" font-size="64" font-weight="700" fill="#16215f">${title}</text><rect x="48" y="280" width="720" height="18" rx="9" fill="#c9d8ff"/><rect x="48" y="316" width="600" height="18" rx="9" fill="#c9d8ff"/><rect x="48" y="400" width="360" height="240" rx="16" fill="#9cb3fd"/><rect x="440" y="400" width="360" height="240" rx="16" fill="#9cb3fd"/><rect x="832" y="400" width="360" height="240" rx="16" fill="#9cb3fd"/></svg>`;
          data = ok({ type: "image/svg+xml", fullPage: false, encoding: "base64", timestamp: new Date().toISOString(), data: btoa(svg) });
          break;
        }
        case "xmc.agent.pagesGetComponentsOnPage": {
          const it = byId(p.path.pageId)!;
          const local = `${pathOf(it)}/Data`;
          data = ok({
            pageId: it.id,
            pageName: it.name,
            pagePath: pathOf(it),
            version: 1,
            language: "en",
            components: [
              { id: "c1", componentId: "header", componentName: "Header", placeholder: "headless-header", dataSource: footer.id },
              { id: "c1b", componentId: "menu", componentName: "Menu", placeholder: "/headless-header/header-navigation-4", dataSource: "" },
              { id: "c2", componentId: "hero", componentName: "Hero banner", placeholder: "headless-main", dataSource: `${local}/Hero` },
              { id: "c3", componentId: "richtext", componentName: "Rich text", placeholder: "headless-main", dataSource: "local:/Data/Intro text" },
              { id: "c4", componentId: "promo", componentName: "Promo", placeholder: "headless-main", dataSource: pathOf(promo) },
              { id: "c5", componentId: "footer", componentName: "Footer", placeholder: "headless-footer", dataSource: pathOf(footer) },
            ],
          });
          break;
        }
        case "xmc.sites.retrieveLocalizationStatistics": {
          const pages = pagesInSite();
          data = ok({
            totalPageCount: pages.length,
            locales: [
              { data: { locale: "en", displayName: "English", englishName: "English" }, pageCount: pages.filter((x) => x.versions?.en?.length).length },
              { data: { locale: "fr-FR", displayName: "French (France)", englishName: "French (France)" }, pageCount: pages.filter((x) => x.versions?.["fr-FR"]?.length).length },
            ],
          });
          break;
        }
        case "xmc.sites.retrieveWorkflowStatistics": {
          const pages = pagesInSite();
          const awaiting = pages.filter((x) => x.workflow === "Awaiting approval").length;
          data = ok({
            workflows: [
              {
                name: "Content approval",
                states: [
                  { name: "Draft", pageCount: 2 },
                  { name: "Awaiting approval", pageCount: awaiting },
                  { name: "Approved", pageCount: pages.length - 2 - awaiting },
                ],
              },
            ],
          });
          break;
        }
        case "xmc.pages.search": {
          const q = (p.query?.searchText ?? "").toLowerCase();
          const all = pagesInSite().filter((i) => !q || i.name.toLowerCase().includes(q) || (i.displayName ?? "").toLowerCase().includes(q));
          const size = Number(p.query?.pageSize ?? 20);
          const n = Number(p.query?.pageNumber ?? 1);
          data = ok({ totalCount: all.length, results: all.slice((n - 1) * size, n * size).map(pageDto) });
          break;
        }
        case "xmc.agent.sitesGetAllPagesBySite":
          // Like the real API: id + path for everything under Home, Data folders and datasources included.
          data = ok(
            [...items.values()]
              .filter((i) => isUnderHome(i) || pathOf(i).toLowerCase().startsWith(`${pathOf(siteRoot).toLowerCase()}/page operations`))
              .map((i) => ({ id: i.id, path: i.id === home.id ? "/" : isUnderHome(i) ? routeOf(i) : pathOf(i).slice(pathOf(siteRoot).length).replace(/ /g, "-") })),
          );
          break;
        default:
          throw new Error(`Mock host doesn’t implement query ${key}`);
      }
      const result = { data, error: undefined, status: "success", isLoading: false, isError: false, isSuccess: true, refetch: async () => result };
      if (opts.onSuccess && key !== "pages.context") opts.onSuccess(data);
      if (key === "pages.context" && opts.onSuccess && !opts.subscribe) opts.onSuccess(data);
      if (key === "pages.context" && opts.subscribe) setTimeout(() => opts.onSuccess?.(data), 0);
      return result;
    },

    async mutate(key: string, opts: any = {}) {
      const p = opts.params ?? {};
      if (key === "pages.reloadCanvas") return undefined;
      if (key === "application.urlState") {
        urlState = p.state ?? null;
        return { state: urlState };
      }
      if (key === "pages.context") {
        const it = byId(p.itemId);
        if (it) {
          currentPageId = it.id;
          const ctx = pagesContext();
          pageSubscribers.forEach((cb) => cb(ctx));
        }
        return undefined;
      }
      await wait(key === "ai.skills.generateBrandReview" ? 1400 : undefined);
      switch (key) {
        case "xmc.authoring.graphql":
          try {
            return ok({ data: graphql(p.body.query, p.body.variables ?? {}) });
          } catch (e) {
            return ok({ data: null, errors: [{ message: (e as Error).message }] });
          }
        case "xmc.pages.renamePage": {
          const it = byId(p.path.pageId);
          if (!it) return { error: { title: "Page not found" } };
          if (children(it.parentId!).some((c) => c.id !== it.id && c.name.toLowerCase() === p.body.newName.toLowerCase())) {
            return { error: { title: "A page with this name already exists here." } };
          }
          it.name = p.body.newName;
          notifyIfCurrent(it.id);
          return ok({ pageId: it.id, name: it.name, path: pathOf(it) });
        }
        case "xmc.pages.duplicatePage": {
          const it = byId(p.path.pageId)!;
          const parent = items.get(it.parentId!)!;
          const copy = add(p.body.newName, parent, "page", { displayName: p.body.displayName, links: [...it.links] });
          return ok({ pageId: copy.id, name: copy.name, displayName: copy.displayName, path: pathOf(copy) });
        }
        case "xmc.pages.deletePage": {
          const it = byId(p.path.pageId);
          if (it) removeTree(it.id);
          if (short(currentPageId) === short(p.path.pageId)) {
            currentPageId = home.id;
            notifyIfCurrent(home.id);
          }
          return ok(true);
        }
        case "xmc.pages.createPage": {
          const parent = byId(p.body.parentId);
          if (!parent) return { error: { title: "Parent page not found" } };
          if (children(parent.id).some((c) => c.name.toLowerCase() === p.body.pageName.toLowerCase())) {
            return { error: { title: `A page named “${p.body.pageName}” already exists here.` } };
          }
          const created = add(p.body.pageName, parent, "page", {
            displayName: p.body.displayName,
            versions: { [p.body.language ?? "en"]: [{ version: 1, updatedAt: new Date().toISOString(), updatedBy: "you" }] },
          });
          return ok({ pageId: created.id, name: created.name, displayName: created.displayName, path: pathOf(created) });
        }
        case "xmc.pages.addPageVersion": {
          const it = byId(p.path.pageId)!;
          const lang = p.body.language ?? "en";
          const list = (it.versions![lang] ??= []);
          const next = Math.max(0, ...list.map((x) => x.version)) + 1;
          list.push({ version: next, name: p.body.versionName ?? undefined, updatedAt: new Date().toISOString(), updatedBy: "you" });
          return ok({ ...pageDto(it), version: next });
        }
        case "xmc.pages.deletePageVersions": {
          const it = byId(p.path.pageId)!;
          const list = it.versions?.[p.path.language] ?? [];
          if (list.length <= 1 && p.path.language === "en") return { error: { title: "A page needs at least one version in its default language." } };
          it.versions![p.path.language] = list.filter((x) => x.version !== Number(p.path.versionNumber));
          if (!it.versions![p.path.language].length) delete it.versions![p.path.language];
          return ok(true);
        }
        case "xmc.agent.pagesAddLanguageToPage": {
          const it = byId(p.path.pageId)!;
          if (it.versions![p.body.language]?.length) return { error: { title: `The page already has a ${p.body.language} version.` } };
          it.versions![p.body.language] = [{ version: 1, updatedAt: new Date().toISOString(), updatedBy: "you" }];
          return ok({ success: true, language: p.body.language });
        }
        case "xmc.pages.translatePage": {
          await wait(1200);
          const it = byId(p.path.pageId)!;
          const lang = p.body.targetLanguage;
          const list = (it.versions![lang] ??= []);
          if (list.length && p.body.translationStrategy === "SkipIfExists") return ok({ skipped: true });
          list.push({ version: Math.max(0, ...list.map((x) => x.version)) + 1, name: "AI translation", updatedAt: new Date().toISOString(), updatedBy: "Sitecore AI" });
          return ok({ success: true });
        }
        case "ai.skills.generateBrandReview": {
          const text: string = p.body?.input?.text ?? "";
          const shouty = /[A-Z]{3,}|!{2,}/.test(text);
          return ok({
            sections: [
              {
                sectionId: "voice",
                score: shouty ? 54 : text.length > 40 ? 76 : 91,
                explanation: shouty
                  ? "Northwind’s voice is calm and practical. All caps and exclamation marks read as pushy."
                  : text.length > 40
                    ? "Clear, but longer than Northwind titles usually run."
                    : "Plain, friendly and specific, in line with the Northwind voice.",
                suggestions: shouty ? [text.replace(/!+/g, "").replace(/\b([A-Z]{3,})\b/g, (w) => w[0] + w.slice(1).toLowerCase())] : [],
              },
            ],
          });
        }
        default:
          throw new Error(`Mock host doesn’t implement mutation ${key}`);
      }
    },

    subscribe() {
      return () => {};
    },
    destroy() {},
    async navigateToExternalUrl(url: string, newTab = true) {
      window.open(url, newTab ? "_blank" : "_self", "noopener");
    },
  };
}

function notifyIfCurrent(id: string) {
  if (short(id) === short(currentPageId)) {
    const ctx = pagesContext();
    pageSubscribers.forEach((cb) => cb(ctx));
  }
}

/** Let the sample host pretend to be any page (used by the workspace "Open in panel" demo). */
export function mockSetCurrentPage(id: string) {
  currentPageId = id;
  notifyIfCurrent(id);
}
