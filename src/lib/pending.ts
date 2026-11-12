/**
 * "Not live yet": everything saved through the app that still needs publishing.
 * Added by operations, removed when the item is published (SitecoreApi.publish calls markPublished).
 * Shared through the team store when available, otherwise kept in this browser.
 */
import { noteName, teamStoreForSite } from "./store/team";

export interface PendingInput {
  id: string;
  label: string;
  kind: "page" | "redirects" | "content";
  /** Publish the pages below too (after URL changes, moves, reorders) */
  subItems?: boolean;
}
export interface PendingItem extends PendingInput {
  site: string;
  since: string;
  by?: string;
  reason: string;
  /** Team store item, when stored there */
  noteId?: string;
}

const EVENT = "page-ops:pending";
const key = (site: string) => `page-ops:pending:v1:${site}`;
const sid = (id: string) => id.replace(/[{}-]/g, "").toLowerCase();
const remote = new Map<string, PendingItem[]>();

function readLocal(site: string): PendingItem[] {
  try {
    return JSON.parse(window.localStorage.getItem(key(site)) ?? "[]") as PendingItem[];
  } catch {
    return [];
  }
}
function writeLocal(site: string, list: PendingItem[]) {
  try {
    window.localStorage.setItem(key(site), JSON.stringify(list.slice(0, 500)));
  } catch {
    // ignore
  }
}
const emit = () => window.dispatchEvent(new CustomEvent(EVENT));

export function readPending(site: string): PendingItem[] {
  const merged = new Map<string, PendingItem>();
  for (const p of [...(remote.get(site) ?? []), ...readLocal(site)]) {
    const k = sid(p.id);
    const prev = merged.get(k);
    merged.set(k, prev ? { ...prev, subItems: prev.subItems || p.subItems, noteId: prev.noteId ?? p.noteId } : p);
  }
  return [...merged.values()].sort((a, b) => b.since.localeCompare(a.since));
}

export function addPending(site: string, items: PendingInput[], reason: string, by?: string) {
  if (!items.length) return;
  const now = new Date().toISOString();
  const local = readLocal(site);
  const store = teamStoreForSite(site);
  for (const it of items) {
    const existing = local.find((p) => sid(p.id) === sid(it.id));
    if (existing) {
      existing.subItems = existing.subItems || it.subItems;
      existing.reason = reason;
      continue;
    }
    const entry: PendingItem = { ...it, site, since: now, by, reason };
    local.push(entry);
    if (store?.available !== false) {
      void store
        ?.add("pending", noteName("p"), entry)
        .then((noteId) => {
          if (!noteId) return;
          const l = readLocal(site);
          const e = l.find((p) => sid(p.id) === sid(it.id));
          if (e) {
            e.noteId = noteId;
            writeLocal(site, l);
          }
        })
        .catch(() => {});
    }
  }
  writeLocal(site, local);
  emit();
}

export function markPublished(site: string, ids: string[]) {
  const done = new Set(ids.map(sid));
  const all = readPending(site);
  const gone = all.filter((p) => done.has(sid(p.id)));
  if (!gone.length) return;
  writeLocal(site, readLocal(site).filter((p) => !done.has(sid(p.id))));
  remote.set(site, (remote.get(site) ?? []).filter((p) => !done.has(sid(p.id))));
  const store = teamStoreForSite(site);
  for (const g of gone) if (g.noteId) void store?.remove(g.noteId);
  emit();
}

export function dismissPending(site: string, id: string) {
  markPublished(site, [id]);
}

/** Pull the team's list (called by the sync loop). */
export async function syncPending(site: string) {
  const store = teamStoreForSite(site);
  if (!store) return;
  const notes = await store.list<PendingItem>("pending");
  remote.set(site, notes.map((n) => ({ ...n.data, noteId: n.itemId })));
  emit();
}

export function onPendingChange(cb: () => void) {
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}
