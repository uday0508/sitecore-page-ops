import type { AppSettings } from "./settings";
import type { PageRef } from "./sitecore/types";

/**
 * Link to a page in SitecoreAI Page builder. The SDK can't open the editor at a page, so this
 * builds Page builder's own URL (sc_itemid, sc_lang, sc_site, sc_version, tenantName, organization).
 * The pattern is a setting, so it can be adjusted if Sitecore changes it.
 */
export function pageBuilderUrl(
  page: Pick<PageRef, "id" | "language"> & { version?: number },
  ctx: { site: string; tenant?: string; organization?: string },
  settings: Pick<AppSettings, "pageBuilderUrl">,
): string | null {
  const pattern = settings.pageBuilderUrl?.trim();
  if (!pattern) return null;
  const values: Record<string, string> = {
    tenant: ctx.tenant ?? "",
    organization: ctx.organization ?? "",
    itemId: page.id.replace(/[{}]/g, "").toLowerCase(),
    language: page.language,
    site: ctx.site,
    version: page.version ? String(page.version) : "",
  };
  const filled = pattern.replace(/\{(\w+)\}/g, (_, k: string) => encodeURIComponent(values[k] ?? ""));
  try {
    const url = new URL(filled);
    // Drop parameters whose token had no value (e.g. no organization), rather than sending them empty.
    for (const [k, v] of [...url.searchParams.entries()]) if (!v) url.searchParams.delete(k);
    return url.toString();
  } catch {
    return null;
  }
}
