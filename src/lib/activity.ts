import type { RedirectType } from "./sitecore/types";
import { addPending, type PendingInput } from "./pending";
import { noteName, teamStoreForSite } from "./store/team";

export type ActivityKind =
  | "rename"
  | "move"
  | "duplicate"
  | "delete"
  | "redirect.add"
  | "redirect.update"
  | "redirect.delete"
  | "redirect.import"
  | "publish"
  | "unpublish"
  | "schedule"
  | "restore"
  | "reorder"
  | "replace"
  | "localize"
  | "a11y";

/** Everything needed to reverse an operation. */
export type UndoPayload =
  | { kind: "rename"; pageId: string; previousName: string; previousDisplayName?: string; language: string }
  | { kind: "move"; pageId: string; previousParentId: string }
  | { kind: "duplicate"; pageId: string }
  | { kind: "redirects"; changes: RedirectChange[] }
  /** Put field values back (publishing settings, sort order, layout, content) */
  | { kind: "fields"; pageId: string; language: string; version?: number; values: Record<string, string> }
  /** Restore a page from the app's bin */
  | { kind: "bin"; pageId: string }
  /** Delete a version this change created */
  | { kind: "version"; pageId: string; language: string; version: number }
  /** Recycle items this change created (e.g. copied content) */
  | { kind: "items"; ids: string[] };

/** A reversible edit to one rule in one redirect map, matched by source on undo. */
export type RedirectChange =
  | { op: "add"; mapId: string; source: string; target: string }
  | { op: "retarget"; mapId: string; source: string; from: string; to: string }
  | { op: "remove"; mapId: string; source: string; target: string };

export interface ActivityEntry {
  id: string;
  at: string;
  kind: ActivityKind;
  site: string;
  title: string;
  detail?: string;
  pageId?: string;
  fromRoute?: string;
  toRoute?: string;
  redirectType?: RedirectType;
  /** Run in order to undo. Redirect restores run last. */
  undo?: UndoPayload[];
  undone?: boolean;
  user?: string;
  /** Team store item, when shared */
  noteId?: string;
}

const KEY = "page-ops:activity:v1";
const LIMIT = 200;
const EVENT = "page-ops:activity";
const remote = new Map<string, ActivityEntry[]>();
let memory: ActivityEntry[] = [];
let currentUser: string | undefined;

/** Who is signed in, recorded on every change so the team can see who did what. */
export function setCurrentUser(name?: string) {
  currentUser = name || undefined;
}
export function getCurrentUser() {
  return currentUser;
}

function readLocal(): ActivityEntry[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(window.localStorage.getItem(KEY) ?? "[]") as ActivityEntry[];
  } catch {
    return memory;
  }
}

/** This browser's entries merged with the team's (newest first). */
export function readActivity(): ActivityEntry[] {
  const merged = new Map<string, ActivityEntry>();
  for (const e of [...[...remote.values()].flat(), ...readLocal()]) {
    const prev = merged.get(e.id);
    merged.set(e.id, prev ? { ...prev, ...e, undone: prev.undone || e.undone, noteId: prev.noteId ?? e.noteId } : e);
  }
  return [...merged.values()].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 500);
}

function write(entries: ActivityEntry[]) {
  memory = entries.slice(0, LIMIT);
  try {
    window.localStorage.setItem(KEY, JSON.stringify(memory));
  } catch {
    // keep in-memory copy
  }
  window.dispatchEvent(new CustomEvent(EVENT));
}

export function logActivity(entry: Omit<ActivityEntry, "id" | "at"> & { publish?: PendingInput[] }): ActivityEntry {
  const { publish, ...rest } = entry;
  const full: ActivityEntry = { ...rest, user: rest.user ?? currentUser, id: crypto.randomUUID(), at: new Date().toISOString() };
  write([full, ...readLocal()]);
  if (publish?.length) addPending(full.site, publish, full.title, full.user);
  const store = teamStoreForSite(full.site);
  if (store && store.available !== false) {
    void store
      .add("activity", noteName("a"), full)
      .then((noteId) => {
        if (!noteId) return;
        write(readLocal().map((e) => (e.id === full.id ? { ...e, noteId } : e)));
      })
      .catch(() => {});
  }
  return full;
}

export function markUndone(id: string) {
  const all = readActivity();
  const entry = all.find((e) => e.id === id);
  const local = readLocal();
  write(local.some((e) => e.id === id) ? local.map((e) => (e.id === id ? { ...e, undone: true } : e)) : entry ? [{ ...entry, undone: true }, ...local] : local);
  for (const [site, list] of remote) remote.set(site, list.map((e) => (e.id === id ? { ...e, undone: true } : e)));
  if (entry?.noteId) void teamStoreForSite(entry.site)?.update(entry.noteId, { ...entry, undone: true, noteId: undefined });
}

export function clearActivity() {
  write([]);
}

/** Pull the team's history for a site (called by the sync loop). */
export async function syncActivity(site: string) {
  const store = teamStoreForSite(site);
  if (!store) return;
  const notes = await store.list<ActivityEntry>("activity");
  remote.set(site, notes.map((n) => ({ ...n.data, noteId: n.itemId })));
  void store.prune(notes).catch(() => {});
  window.dispatchEvent(new CustomEvent(EVENT));
}

export function onActivityChange(cb: () => void) {
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}
