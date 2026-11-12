import { pathSimilarity } from "../diff";
import { isExternal, normalizePath, resolve } from "../sitecore/redirects";
import type { LivePage, RedirectRule } from "../sitecore/types";

export interface NotFoundUrl {
  path: string;
  /** Clicks (Search Console) or hits (log/CSV), when known */
  hits?: number;
  source: "csv" | "search-console";
}

export function toPath(url: string): string | null {
  const v = url.trim().replace(/^"|"$/g, "");
  if (!v) return null;
  try {
    const u = /^https?:\/\//i.test(v) ? new URL(v) : new URL(v.startsWith("/") ? v : `/${v}`, "https://x.invalid");
    return normalizePath(decodeURIComponent(u.pathname));
  } catch {
    return null;
  }
}

/** Accepts Search Console's "Not found (404)" export, server logs as CSV, or a plain list of URLs. */
export function parseNotFoundCsv(text: string): NotFoundUrl[] {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return [];
  const split = (l: string) => l.match(/("([^"]|"")*"|[^,\t;]+)/g)?.map((c) => c.replace(/^"|"$/g, "").replace(/""/g, '"').trim()) ?? [];
  const head = split(lines[0]).map((h) => h.toLowerCase());
  const hasHeader = head.some((h) => /url|page|path|address/.test(h));
  const ui = hasHeader ? Math.max(0, head.findIndex((h) => /url|page|path|address/.test(h))) : 0;
  const hi = hasHeader ? head.findIndex((h) => /click|hit|count|visit|request/.test(h)) : -1;
  const out = new Map<string, NotFoundUrl>();
  for (const l of lines.slice(hasHeader ? 1 : 0)) {
    const cells = split(l);
    const path = toPath(cells[ui] ?? "");
    if (!path || path === "/") continue;
    const hits = hi >= 0 ? Number(String(cells[hi]).replace(/[^\d.]/g, "")) : undefined;
    const prev = out.get(path.toLowerCase());
    out.set(path.toLowerCase(), { path, hits: (prev?.hits ?? 0) + (hits && !Number.isNaN(hits) ? hits : 0) || undefined, source: "csv" });
  }
  return [...out.values()];
}

/** Keep only URLs that aren't live pages and that no redirect already handles. */
export function stillMissing(urls: NotFoundUrl[], livePages: LivePage[] | null, rules: RedirectRule[]): NotFoundUrl[] {
  const live = new Set((livePages ?? []).map((p) => p.route.toLowerCase()));
  return urls.filter((u) => !live.has(u.path.toLowerCase()) && resolve(u.path, rules).hops.length === 0);
}

/** Best live page to send a missing URL to: closest match, else the nearest live parent, else home. */
export function suggestTarget(path: string, livePages: LivePage[] | null): { route: string; reason: string } {
  const routes = (livePages ?? []).map((p) => p.route).filter((r) => r !== path);
  let best = { route: "/", score: 0 };
  for (const r of routes) {
    const s = pathSimilarity(path, r);
    if (s > best.score) best = { route: r, score: s };
  }
  if (best.score >= 0.45) return { route: best.route, reason: "Closest match" };
  const parts = path.split("/").filter(Boolean);
  const lower = new Set(routes.map((r) => r.toLowerCase()));
  for (let i = parts.length - 1; i > 0; i--) {
    const parent = `/${parts.slice(0, i).join("/")}`;
    if (lower.has(parent.toLowerCase())) return { route: parent, reason: "Nearest parent" };
  }
  return { route: "/", reason: "Home page" };
}

const key = (site: string) => `page-ops:404:v1:${site}`;
export function loadNotFound(site: string): NotFoundUrl[] {
  try {
    return JSON.parse(window.localStorage.getItem(key(site)) ?? "[]") as NotFoundUrl[];
  } catch {
    return [];
  }
}
export function saveNotFound(site: string, rows: NotFoundUrl[]) {
  try {
    window.localStorage.setItem(key(site), JSON.stringify(rows.slice(0, 5000)));
  } catch {
    // ignore
  }
}

/* ------------------------------------------------------------------ */
/* Google Search Console (browser OAuth, read-only)                    */
/* ------------------------------------------------------------------ */

/* eslint-disable @typescript-eslint/no-explicit-any */
let gis: Promise<any> | null = null;
function loadGis(): Promise<any> {
  if (!gis) {
    gis = new Promise((res, rej) => {
      const w = window as any;
      if (w.google?.accounts?.oauth2) return res(w.google);
      const s = document.createElement("script");
      s.src = "https://accounts.google.com/gsi/client";
      s.async = true;
      s.onload = () => res(w.google);
      s.onerror = () => {
        gis = null;
        rej(new Error("Couldn’t load Google sign-in."));
      };
      document.head.appendChild(s);
    });
  }
  return gis;
}

function getToken(clientId: string): Promise<string> {
  return loadGis().then(
    (google) =>
      new Promise<string>((res, rej) => {
        const client = google.accounts.oauth2.initTokenClient({
          client_id: clientId,
          scope: "https://www.googleapis.com/auth/webmasters.readonly",
          callback: (r: any) => (r?.access_token ? res(r.access_token) : rej(new Error(r?.error_description ?? "Google sign-in was cancelled."))),
          error_callback: (e: any) => rej(new Error(e?.message ?? "Google sign-in was blocked. Allow pop-ups and try again.")),
        });
        client.requestAccessToken({ prompt: "" });
      }),
  );
}

/**
 * URLs on the site that Google sent visitors to in the last `days` days.
 * The Search Console API has no 404 report, so callers compare these with live pages and redirects.
 */
export async function fetchSearchConsolePages(clientId: string, property: string, days = 28): Promise<NotFoundUrl[]> {
  if (!clientId || !property) throw new Error("Add your Google client ID and Search Console property in Settings first.");
  const token = await getToken(clientId);
  const end = new Date();
  const start = new Date(Date.now() - days * 86400000);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  const res = await fetch(`https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(property)}/searchAnalytics/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ startDate: fmt(start), endDate: fmt(end), dimensions: ["page"], rowLimit: 25000 }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error?.message ?? `Search Console returned ${res.status}`);
  }
  const data = await res.json();
  const out: NotFoundUrl[] = [];
  for (const r of (data.rows ?? []) as any[]) {
    const path = toPath(r.keys?.[0] ?? "");
    if (path && !isExternal(path)) out.push({ path, hits: Number(r.clicks ?? 0), source: "search-console" });
  }
  return out;
}
