import type { LivePage, RedirectIssue, RedirectMap, RedirectRule, RedirectType } from "./types";

/* ------------------------------------------------------------------ */
/* UrlMapping field (Sitecore Name Value List) <-> rules               */
/* ------------------------------------------------------------------ */

function decode(part: string) {
  try {
    return decodeURIComponent(part.replace(/\+/g, " "));
  } catch {
    return part;
  }
}

export function parseUrlMapping(value: string | null | undefined): { source: string; target: string }[] {
  if (!value) return [];
  return value
    .split("&")
    .filter(Boolean)
    .map((pair) => {
      const i = pair.indexOf("=");
      const source = decode(i === -1 ? pair : pair.slice(0, i));
      const target = decode(i === -1 ? "" : pair.slice(i + 1));
      return { source, target };
    })
    .filter((r) => r.source);
}

export function serializeUrlMapping(rules: { source: string; target: string }[]): string {
  return rules.map((r) => `${encodeURIComponent(r.source)}=${encodeURIComponent(r.target)}`).join("&");
}

export function normalizeRedirectType(value: string | null | undefined): RedirectType {
  const v = (value ?? "").toLowerCase();
  if (v.includes("302")) return "Redirect302";
  if (v.includes("transfer")) return "ServerTransfer";
  return "Redirect301";
}

export function flattenMaps(maps: RedirectMap[]): RedirectRule[] {
  return maps.flatMap((m) =>
    m.rules.map((r, i) => ({
      key: `${m.id}:${i}`,
      mapId: m.id,
      mapName: m.name,
      source: r.source,
      target: r.target,
      type: m.type,
      preserveQueryString: m.preserveQueryString,
      managed: m.managed,
    })),
  );
}

/* ------------------------------------------------------------------ */
/* Paths                                                               */
/* ------------------------------------------------------------------ */

export function isPattern(source: string) {
  return /[\^$()*+?[\]\\|]/.test(source);
}

export function isExternal(target: string) {
  return /^https?:\/\//i.test(target);
}

export function normalizePath(path: string): string {
  if (!path) return "/";
  if (isExternal(path) || isPattern(path)) return path.trim();
  let p = path.trim().split("#")[0].split("?")[0];
  if (!p.startsWith("/")) p = `/${p}`;
  if (p.length > 1 && p.endsWith("/")) p = p.slice(0, -1);
  return p;
}

export function samePath(a: string, b: string) {
  return normalizePath(a).toLowerCase() === normalizePath(b).toLowerCase();
}

function toRegex(source: string): RegExp | null {
  try {
    const body = source.startsWith("^") ? source : `^${source}`;
    return new RegExp(body.endsWith("$") ? body : `${body}$`, "i");
  } catch {
    return null;
  }
}

/** Does a redirect source match a URL path? Supports plain paths and regex patterns. */
export function matches(source: string, path: string): { hit: boolean; groups: string[] } {
  if (!isPattern(source)) return { hit: samePath(source, path), groups: [] };
  const re = toRegex(source);
  const m = re?.exec(normalizePath(path));
  return m ? { hit: true, groups: m.slice(1).map((g) => g ?? "") } : { hit: false, groups: [] };
}

function applyGroups(target: string, groups: string[]) {
  return target.replace(/\$(\d)/g, (_, n: string) => groups[Number(n) - 1] ?? "");
}

/* ------------------------------------------------------------------ */
/* Resolution: follow a URL through the rules                          */
/* ------------------------------------------------------------------ */

export interface Hop {
  from: string;
  to: string;
  rule: RedirectRule;
}

export interface Resolution {
  hops: Hop[];
  final: string;
  loop: boolean;
  /** The final URL is a live page (or external). */
  landsOnPage: boolean | null;
}

export function resolve(url: string, rules: RedirectRule[], livePages?: Set<string>): Resolution {
  const hops: Hop[] = [];
  const seen = new Set<string>();
  let current = normalizePath(url);
  let loop = false;
  for (let i = 0; i < 10; i++) {
    const key = current.toLowerCase();
    if (seen.has(key)) {
      loop = true;
      break;
    }
    seen.add(key);
    if (isExternal(current)) break;
    let next: { to: string; rule: RedirectRule } | null = null;
    for (const rule of rules) {
      const m = matches(rule.source, current);
      if (m.hit) {
        next = { to: normalizePath(applyGroups(rule.target, m.groups)), rule };
        break;
      }
    }
    if (!next) break;
    hops.push({ from: current, to: next.to, rule: next.rule });
    current = next.to;
  }
  const landsOnPage = livePages
    ? isExternal(current) || livePages.has(current.toLowerCase())
    : null;
  return { hops, final: current, loop, landsOnPage };
}

/* ------------------------------------------------------------------ */
/* Health analysis                                                     */
/* ------------------------------------------------------------------ */

export function analyze(rules: RedirectRule[], livePages: LivePage[] | null): Map<string, RedirectIssue[]> {
  const live = livePages ? new Set(livePages.map((p) => normalizePath(p.route).toLowerCase())) : null;
  const issues = new Map<string, RedirectIssue[]>();
  const add = (key: string, issue: RedirectIssue) => issues.set(key, [...(issues.get(key) ?? []), issue]);

  const bySource = new Map<string, RedirectRule[]>();
  for (const r of rules) {
    if (isPattern(r.source)) continue;
    const k = normalizePath(r.source).toLowerCase();
    bySource.set(k, [...(bySource.get(k) ?? []), r]);
  }

  for (const rule of rules) {
    const source = normalizePath(rule.source);
    const target = normalizePath(rule.target);

    if (!isPattern(source) && samePath(source, target)) {
      add(rule.key, { code: "self", severity: "error", message: "Redirects to itself." });
      continue;
    }
    const dupes = bySource.get(source.toLowerCase());
    if (dupes && dupes.length > 1 && dupes[0].key !== rule.key) {
      add(rule.key, { code: "duplicate", severity: "warning", message: `Same source as a rule in “${dupes[0].mapName}”. Only the first one runs.` });
    }
    if (live && !isPattern(source) && live.has(source.toLowerCase())) {
      add(rule.key, { code: "shadowed", severity: "warning", message: "A live page has this URL. Visitors never reach the page." });
    }
    if (!isExternal(target) && !/\$\d/.test(target)) {
      const res = resolve(target, rules, live ?? undefined);
      if (res.loop) {
        add(rule.key, { code: "loop", severity: "error", message: "Creates a redirect loop. Visitors get an error." });
      } else if (res.hops.length > 0) {
        add(rule.key, {
          code: "chain",
          severity: "warning",
          message: `Chains through ${res.hops.length} more redirect${res.hops.length > 1 ? "s" : ""} to ${res.final}.`,
        });
      } else if (live && !live.has(target.toLowerCase())) {
        add(rule.key, { code: "broken", severity: "error", message: "Target page doesn’t exist." });
      }
    }
  }
  return issues;
}

/* ------------------------------------------------------------------ */
/* Planning: what to change when a page URL changes                    */
/* ------------------------------------------------------------------ */

export interface RedirectPlan {
  /** New rules to add to the managed map */
  add: { source: string; target: string }[];
  /** Existing rules whose target should move to the new URL (chain collapse) */
  retarget: { rule: RedirectRule; newTarget: string }[];
  /** Existing rules that would hide the page at its new URL */
  remove: RedirectRule[];
}

function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function planUrlChange(opts: {
  from: string;
  to: string;
  rules: RedirectRule[];
  includeChildren: boolean;
  collapseChains: boolean;
}): RedirectPlan {
  const from = normalizePath(opts.from);
  const to = normalizePath(opts.to);
  const plan: RedirectPlan = { add: [], retarget: [], remove: [] };
  if (samePath(from, to)) return plan;

  plan.add.push({ source: from, target: to });
  if (opts.includeChildren) {
    plan.add.push({ source: `^${escapeRegex(from)}/(.*)$`, target: `${to}/$1` });
  }

  if (opts.collapseChains) {
    for (const rule of opts.rules) {
      const t = normalizePath(rule.target);
      if (samePath(t, from)) {
        plan.retarget.push({ rule, newTarget: to });
      } else if (opts.includeChildren && t.toLowerCase().startsWith(`${from.toLowerCase()}/`)) {
        plan.retarget.push({ rule, newTarget: to + t.slice(from.length) });
      }
    }
  }

  for (const rule of opts.rules) {
    if (!isPattern(rule.source) && samePath(rule.source, to)) plan.remove.push(rule);
  }
  return plan;
}

export function planIsEmpty(plan: RedirectPlan) {
  return plan.add.length === 0 && plan.retarget.length === 0 && plan.remove.length === 0;
}

/** Apply a plan to a set of maps and return the maps that changed. */
export function applyPlan(maps: RedirectMap[], managedMapId: string, plan: RedirectPlan): RedirectMap[] {
  const changed = new Map<string, RedirectMap>();
  const get = (id: string) => {
    if (!changed.has(id)) {
      const m = maps.find((x) => x.id === id);
      if (!m) throw new Error(`Redirect map ${id} not found`);
      changed.set(id, { ...m, rules: m.rules.map((r) => ({ ...r })) });
    }
    return changed.get(id)!;
  };

  // Retarget and remove by original index (rule.key = mapId:index). Process removals last, highest index first.
  for (const { rule, newTarget } of plan.retarget) {
    const m = get(rule.mapId);
    const idx = Number(rule.key.split(":").pop());
    if (m.rules[idx]) m.rules[idx].target = newTarget;
  }
  const removals = [...plan.remove].sort((a, b) => Number(b.key.split(":").pop()) - Number(a.key.split(":").pop()));
  for (const rule of removals) {
    const m = get(rule.mapId);
    m.rules.splice(Number(rule.key.split(":").pop()), 1);
  }
  if (plan.add.length) {
    const managed = get(managedMapId);
    for (const r of plan.add) {
      const existing = managed.rules.findIndex((x) => samePath(x.source, r.source) || x.source === r.source);
      if (existing >= 0) managed.rules[existing] = r;
      else managed.rules.push(r);
    }
  }
  return [...changed.values()];
}

/* ------------------------------------------------------------------ */
/* CSV                                                                 */
/* ------------------------------------------------------------------ */

export function toCsv(rules: RedirectRule[]): string {
  const esc = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const lines = [["source", "target", "type", "map"].join(",")];
  for (const r of rules) lines.push([r.source, r.target, r.type, r.mapName].map(esc).join(","));
  return lines.join("\n");
}

export interface CsvRow {
  line: number;
  source: string;
  target: string;
  error?: string;
}

export function parseCsv(text: string): CsvRow[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(cell);
      cell = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  const body = rows.filter((r) => r.some((c) => c.trim()));
  const header = body[0]?.map((h) => h.trim().toLowerCase()) ?? [];
  const hasHeader = header.includes("source") || header.includes("from");
  const si = hasHeader ? Math.max(header.indexOf("source"), header.indexOf("from")) : 0;
  const ti = hasHeader ? Math.max(header.indexOf("target"), header.indexOf("to")) : 1;
  return body.slice(hasHeader ? 1 : 0).map((r, i) => {
    const source = (r[si] ?? "").trim();
    const target = (r[ti] ?? "").trim();
    const line = i + (hasHeader ? 2 : 1);
    if (!source || !target) return { line, source, target, error: "Needs both a source and a target." };
    if (isPattern(source) && !toRegex(source)) return { line, source, target, error: "Source pattern isn’t valid." };
    if (!isPattern(source) && samePath(source, target)) return { line, source, target, error: "Source and target are the same." };
    return { line, source: isPattern(source) ? source : normalizePath(source), target: isExternal(target) ? target : normalizePath(target) };
  });
}
