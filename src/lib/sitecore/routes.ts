/** Route helpers. Sitecore builds URLs from item names; most XM Cloud setups lowercase them and use hyphens for spaces. */
export function segmentFor(name: string) {
  return name.trim().toLowerCase().replace(/\s+/g, "-");
}
export function parentRoute(route: string) {
  const i = route.lastIndexOf("/");
  return i <= 0 ? "/" : route.slice(0, i);
}
export function childRoute(parent: string, name: string) {
  return `${parent === "/" ? "" : parent}/${segmentFor(name)}`;
}
export function lastSegment(route: string) {
  return route.split("/").filter(Boolean).pop() ?? "";
}
