/**
 * One shared copy of a site's redirect maps and page list for every screen that needs them.
 * Any change that affects them calls invalidateSiteData(); every subscriber then reloads once.
 */
const cache = new Map<string, { at: number; p: Promise<unknown> }>();
const subs = new Set<() => void>();
let version = 0;
const TTL = 60_000;

export function getVersion() {
  return version;
}
export function subscribeSiteData(cb: () => void) {
  subs.add(cb);
  return () => subs.delete(cb);
}
export function invalidateSiteData() {
  cache.clear();
  version++;
  subs.forEach((f) => f());
}
export function shared<T>(key: string, load: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return hit.p as Promise<T>;
  const p = load();
  cache.set(key, { at: Date.now(), p });
  p.catch(() => cache.delete(key));
  return p;
}
