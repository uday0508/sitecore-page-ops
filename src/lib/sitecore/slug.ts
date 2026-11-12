export interface SlugIssue {
  code: "empty" | "invalid-char" | "uppercase" | "space" | "underscore" | "hyphens" | "length" | "duplicate" | "reserved" | "numeric-start";
  message: string;
  severity: "error" | "warning";
}

const RESERVED = new Set(["sitecore", "api", "_next", "-", "layouts", "media", "graphql", "edge"]);
/** Characters Sitecore refuses in item names. */
const INVALID = /[\\/:?"<>|[\]*%&#{}~^`@!=+;,]/;

export function slugify(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60)
    .replace(/-$/, "");
}

export function lintSlug(name: string, opts: { siblings?: string[]; current?: string } = {}): SlugIssue[] {
  const issues: SlugIssue[] = [];
  const value = name.trim();
  if (!value) {
    return [{ code: "empty", message: "Enter a name for the URL.", severity: "error" }];
  }
  if (INVALID.test(value)) {
    issues.push({ code: "invalid-char", message: "Remove special characters. Use letters, numbers and hyphens.", severity: "error" });
  }
  if (RESERVED.has(value.toLowerCase())) {
    issues.push({ code: "reserved", message: `“${value}” is reserved by the platform. Pick another name.`, severity: "error" });
  }
  const siblings = (opts.siblings ?? []).map((s) => s.toLowerCase());
  const current = opts.current?.toLowerCase();
  if (siblings.includes(value.toLowerCase()) && value.toLowerCase() !== current) {
    issues.push({ code: "duplicate", message: "A page with this URL already exists here.", severity: "error" });
  }
  if (/\s/.test(value)) {
    issues.push({ code: "space", message: "Spaces become %20 or hyphens unpredictably. Use hyphens.", severity: "warning" });
  }
  if (/_/.test(value)) {
    issues.push({ code: "underscore", message: "Search engines read underscores as joiners. Use hyphens.", severity: "warning" });
  }
  if (/[A-Z]/.test(value)) {
    issues.push({ code: "uppercase", message: "Use lowercase so the URL has one canonical form.", severity: "warning" });
  }
  if (/--|^-|-$/.test(value)) {
    issues.push({ code: "hyphens", message: "Avoid double, leading or trailing hyphens.", severity: "warning" });
  }
  if (value.length > 60) {
    issues.push({ code: "length", message: `Keep it under 60 characters (now ${value.length}).`, severity: "warning" });
  }
  if (/^\d/.test(value)) {
    issues.push({ code: "numeric-start", message: "Sitecore item names can’t start with a number in some setups.", severity: "warning" });
  }
  return issues;
}

export function hasBlockingIssue(issues: SlugIssue[]) {
  return issues.some((i) => i.severity === "error");
}
