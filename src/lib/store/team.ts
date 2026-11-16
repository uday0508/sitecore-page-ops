/**
 * Team storage in Sitecore, so settings, activity and the "not live yet" list are the same for
 * everyone working on a site. Lives in {site}/Settings/Page Operations (Activity, Pending, Bin) (Never publish, so it never reaches
 * the live site). Each activity entry and pending item is its own item: no write races between authors.
 * If the folder can't be created (permissions), everything keeps working in this browser only.
 */
import type { SitecoreApi } from "../sitecore/api";

export interface Note<T> {
  itemId: string;
  name: string;
  data: T;
}

const stores = new Map<string, TeamStore>();

export class TeamStore {
  available: boolean | null = null;
  reason: string | null = null;
  private folders: Promise<{ root: string; activity: string; pending: string } | null> | null = null;

  constructor(public api: SitecoreApi) {}

  get key() {
    return `${this.api.contextId}|${this.api.site.id}`;
  }

  /** Create (once) and return the folder IDs. */
  ensure() {
    if (!this.folders) {
      this.folders = (async () => {
        try {
          const { path, id: root } = await this.api.appRoot();
          const activity = await this.api.ensureFolder(`${path}/Activity`, path);
          const pending = await this.api.ensureFolder(`${path}/Pending`, path);
          this.available = true;
          return { root, activity, pending };
        } catch (e) {
          this.available = false;
          this.reason = e instanceof Error ? e.message : String(e);
          return null;
        }
      })();
    }
    return this.folders;
  }

  async list<T>(kind: "activity" | "pending"): Promise<Note<T>[]> {
    const f = await this.ensure();
    if (!f) return [];
    const kids = await this.api.children({ id: f[kind] });
    const out: Note<T>[] = [];
    for (const k of kids?.items ?? []) {
      try {
        out.push({ itemId: k.id, name: k.name, data: JSON.parse(k.note ?? "") as T });
      } catch {
        // not ours
      }
    }
    return out;
  }

  /**
   * Keep activity from growing forever: entries older than `days` are recycled, but the newest
   * `keep` always stay. Runs at most once a day per site, in the background.
   */
  async prune<T extends { at?: string }>(notes: Note<T>[], days = 180, keep = 500) {
    const k = `page-ops:pruned:${this.key}`;
    try {
      if (Date.now() - Number(window.localStorage.getItem(k) ?? 0) < 86400000) return;
      window.localStorage.setItem(k, String(Date.now()));
    } catch {
      // storage blocked: prune anyway
    }
    const cutoff = new Date(Date.now() - days * 86400000).toISOString();
    const sorted = [...notes].sort((a, b) => String(b.data.at ?? "").localeCompare(String(a.data.at ?? "")));
    // Beyond the newest `keep`, anything older than the cutoff goes.
    for (const n of sorted.slice(keep)) if (!n.data.at || n.data.at < cutoff) await this.remove(n.itemId);
  }

  async add<T>(kind: "activity" | "pending", name: string, data: T) {
    const f = await this.ensure();
    if (!f) return null;
    return this.api.createNote(f[kind], name, JSON.stringify(data));
  }

  async update<T>(itemId: string, data: T) {
    await this.api.setNote(itemId, JSON.stringify(data));
  }

  async remove(itemId: string) {
    await this.api.deleteForever(itemId).catch(() => {});
  }

  async getSettings<T>(): Promise<T | null> {
    const f = await this.ensure();
    if (!f) return null;
    const raw = (await this.api.rawFields(f.root, ["__Long description"]))["__Long description"];
    try {
      return raw ? (JSON.parse(raw) as T) : null;
    } catch {
      return null;
    }
  }

  async setSettings<T>(data: T) {
    const f = await this.ensure();
    if (f) await this.api.setNote(f.root, JSON.stringify(data));
  }
}

export function teamStoreFor(api: SitecoreApi): TeamStore {
  const key = `${api.contextId}|${api.site.id}`;
  let s = stores.get(key);
  if (!s) {
    s = new TeamStore(api);
    stores.set(key, s);
  } else s.api = api;
  return s;
}

/** The store for a site name, if one is active (used by code that only knows the site). */
export function teamStoreForSite(site: string): TeamStore | null {
  for (const s of stores.values()) if (s.api.site.name === site) return s;
  return null;
}

export const noteName = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
