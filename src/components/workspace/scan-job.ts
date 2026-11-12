import { startJob } from "@/lib/jobs";
import { saveScan, scanSite } from "@/lib/ops/scan";
import type { SitecoreApi } from "@/lib/sitecore/api";

export const SCAN_EVENT = "page-ops:scan";

/** The site scan as a background job: survives tab switches; screens listen for SCAN_EVENT. */
export function startScan(api: SitecoreApi) {
  return startJob(
    `Site scan: ${api.site.displayName}`,
    async ({ signal, progress }) => {
      const s = await scanSite(api, { signal, onPhase: (p) => progress(p.done, p.total, p.label) });
      saveScan(s);
      window.dispatchEvent(new CustomEvent(SCAN_EVENT));
      return s;
    },
    { key: `scan:${api.site.name}` },
  );
}
