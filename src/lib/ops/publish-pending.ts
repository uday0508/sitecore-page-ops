import { logActivity } from "../activity";
import { startJob } from "../jobs";
import type { PendingItem } from "../pending";
import type { SitecoreApi } from "../sitecore/api";

/** Publish everything on the not-live list as one background job. Pages go with their content and images. */
export function publishPending(api: SitecoreApi, items: PendingItem[]) {
  const pages = items.filter((i) => i.kind === "page" && !i.subItems).map((i) => i.id);
  const deep = items.filter((i) => i.kind === "page" && i.subItems).map((i) => i.id);
  const other = items.filter((i) => i.kind !== "page").map((i) => i.id);
  const groups = [pages, deep, other].filter((g) => g.length).length;
  return startJob(
    `Publishing ${items.length} item${items.length === 1 ? "" : "s"}`,
    async ({ progress }) => {
      let n = 0;
      progress(0, groups);
      if (pages.length) {
        await api.publish(pages, { related: true });
        progress(++n);
      }
      if (deep.length) {
        await api.publish(deep, { related: true, subItems: true });
        progress(++n);
      }
      if (other.length) {
        await api.publish(other);
        progress(++n);
      }
      logActivity({ kind: "publish", site: api.site.name, title: `Published ${items.length} pending item${items.length === 1 ? "" : "s"}`, detail: items.map((i) => i.label).slice(0, 6).join(", ") });
    },
    { key: `publish-pending:${api.site.name}` },
  );
}
