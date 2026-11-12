import { SitecoreApi, sameId, shortId } from "../sitecore/api";
import { pool } from "../util";
import { checkFields } from "../a11y";

export interface PageHealth {
  id: string;
  route: string;
  name: string;
  displayName: string;
  updatedAt?: string;
  updatedBy?: string;
  /** true live, false not published, null unknown */
  live: boolean | null;
  referrers: number | null;
  referrerNames: string[];
  /** Item IDs this page points at that no longer exist */
  broken: { id: string; field: string }[];
  neverPublish?: boolean;
  publishFrom?: string;
  publishTo?: string;
  /** Accessibility problems in text fields (image fields are checked per page) */
  a11y?: { errors: number; warnings: number };
}

export interface SiteScan {
  site: string;
  at: string;
  pages: PageHealth[];
  /** Link checks need field access; false if the API refused it */
  linksChecked: boolean;
}

export type ScanPhase = { label: string; done: number; total: number };

/**
 * One pass over the site that feeds every Health report: live state, who links in,
 * and references to items that no longer exist.
 */
export async function scanSite(api: SitecoreApi, opts: { signal?: AbortSignal; onPhase?: (p: ScanPhase) => void } = {}): Promise<SiteScan> {
  const { signal, onPhase } = opts;
  onPhase?.({ label: "Loading pages", done: 0, total: 1 });
  const pages = await api.listPagesDetailed((done, total) => onPhase?.({ label: "Loading pages", done, total }));
  if (signal?.aborted) throw new DOMException("Scan cancelled", "AbortError");

  let linksChecked = true;
  const refsOut = new Map<string, { id: string; field: string }[]>();
  const health: PageHealth[] = [];
  let done = 0;
  await pool(
    pages,
    3,
    async (p) => {
      const [live, refs, fields] = await Promise.all([
        api.liveState(p.id, p.language),
        api.findReferrers(p.id).catch(() => null),
        api.pageFields(p.id, p.language).catch(() => {
          linksChecked = false;
          return null;
        }),
      ]);
      if (fields) refsOut.set(p.id, SitecoreApi.referencedIds(fields).filter((r) => !sameId(r.id, p.id)));
      health.push({
        id: p.id,
        route: p.route,
        name: p.name,
        displayName: p.displayName,
        updatedAt: p.meta?.updatedAt,
        updatedBy: p.meta?.updatedBy,
        live,
        referrers: refs ? refs.items.length : null,
        referrerNames: refs ? refs.items.slice(0, 5).map((r) => r.name) : [],
        broken: [],
        neverPublish: fields?.flags.neverPublish,
        publishFrom: fields?.flags.publishFrom,
        publishTo: fields?.flags.publishTo,
        a11y: fields
          ? (() => {
              const issues = checkFields(fields.fields.filter((f) => !/^\s*<image\b/i.test(f.value)));
              return { errors: issues.filter((x) => x.severity === "error").length, warnings: issues.filter((x) => x.severity === "warning").length };
            })()
          : undefined,
      });
      onPhase?.({ label: "Checking pages", done: ++done, total: pages.length });
    },
    signal,
  );
  if (signal?.aborted) throw new DOMException("Scan cancelled", "AbortError");

  // Resolve every referenced ID once; anything that doesn't resolve is a broken reference.
  const all = [...new Set([...refsOut.values()].flat().map((r) => r.id))];
  const found = new Set<string>();
  for (let i = 0; i < all.length; i += 50) {
    if (signal?.aborted) throw new DOMException("Scan cancelled", "AbortError");
    onPhase?.({ label: "Checking links", done: i, total: all.length });
    const paths = await api.itemPaths(all.slice(i, i + 50)).catch(() => null);
    if (!paths) {
      linksChecked = false;
      break;
    }
    for (const k of paths.keys()) found.add(k);
  }
  if (linksChecked) {
    for (const h of health) h.broken = (refsOut.get(h.id) ?? []).filter((r) => !found.has(shortId(r.id)));
  }
  health.sort((a, b) => a.route.localeCompare(b.route));
  return { site: api.site.name, at: new Date().toISOString(), pages: health, linksChecked };
}

const key = (site: string) => `page-ops:scan:v1:${site}`;

export function loadScan(site: string): SiteScan | null {
  try {
    const raw = window.localStorage.getItem(key(site));
    return raw ? (JSON.parse(raw) as SiteScan) : null;
  } catch {
    return null;
  }
}

export function saveScan(scan: SiteScan) {
  try {
    window.localStorage.setItem(key(scan.site), JSON.stringify(scan));
  } catch {
    // too large or storage blocked: keep it for this session only
  }
}
