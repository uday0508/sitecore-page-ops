/** Accessibility checks on page field content. Pure functions: no API calls. */

export type A11yKind = "img-alt" | "image-field-alt" | "empty-link" | "vague-link" | "heading-skip" | "extra-h1" | "table-headers";

export interface A11yIssue {
  key: string;
  field: string;
  kind: A11yKind;
  severity: "error" | "warning";
  message: string;
  snippet?: string;
  /** Present when the issue can be fixed by adding alt text */
  alt?: { occurrence: number; image?: string };
}

const VAGUE = /^(click here|here|read more|more|learn more|link|this link|go|details|continue)$/i;
const strip = (s: string) => s.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
const attr = (tag: string, name: string) => new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, "i").exec(tag);

/**
 * @param mediaAlt alt text stored on media items, keyed by lower-case ID without braces/dashes,
 *                 so an image field with an empty alt but a media item with Alt isn't flagged.
 */
export function checkFields(fields: { name: string; value: string }[], mediaAlt?: Map<string, string>): A11yIssue[] {
  const issues: A11yIssue[] = [];
  for (const f of fields) {
    const v = f.value ?? "";
    if (!v) continue;

    // Image field: <image mediaid="{...}" alt="..." />
    if (/^\s*<image\b/i.test(v)) {
      const alt = attr(v, "alt");
      const media = /mediaid\s*=\s*"\{?([0-9a-f-]{32,36})\}?"/i.exec(v)?.[1]?.replace(/-/g, "").toLowerCase();
      const fromMedia = media ? mediaAlt?.get(media) : undefined;
      if (media && !(alt?.[2] ?? alt?.[3])?.trim() && !fromMedia?.trim()) {
        issues.push({ key: `${f.name}:imgf`, field: f.name, kind: "image-field-alt", severity: "error", message: "Image has no alt text, here or on the media item.", alt: { occurrence: 0 } });
      }
      continue;
    }
    if (!/[<]/.test(v)) continue;

    let n = 0;
    for (const m of v.matchAll(/<img\b[^>]*>/gi)) {
      if (!attr(m[0], "alt")) {
        const src = attr(m[0], "src");
        issues.push({
          key: `${f.name}:img:${n}`,
          field: f.name,
          kind: "img-alt",
          severity: "error",
          message: "Image in the text has no alt text. Screen readers announce the file name instead.",
          snippet: (src?.[2] ?? src?.[3] ?? "").split("/").pop()?.slice(0, 60),
          alt: { occurrence: n, image: src?.[2] ?? src?.[3] },
        });
      }
      n++;
    }

    let li = 0;
    for (const m of v.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
      const text = strip(m[2]);
      const hasImgAlt = /<img\b[^>]*\balt\s*=\s*"[^"]+"/i.test(m[2]);
      const label = attr(m[1], "aria-label") ?? attr(m[1], "title");
      if (!text && !hasImgAlt && !label) {
        issues.push({ key: `${f.name}:a:${li}`, field: f.name, kind: "empty-link", severity: "error", message: "Link has no text, so screen readers can’t say where it goes." });
      } else if (VAGUE.test(text) && !label) {
        issues.push({ key: `${f.name}:a:${li}`, field: f.name, kind: "vague-link", severity: "warning", message: `“${text}” doesn’t say where the link goes. Describe the destination.`, snippet: text });
      }
      li++;
    }

    let prev = 0;
    let hi = 0;
    for (const m of v.matchAll(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi)) {
      const level = Number(m[1]);
      const text = strip(m[2]).slice(0, 60);
      if (level === 1) {
        issues.push({ key: `${f.name}:h1:${hi}`, field: f.name, kind: "extra-h1", severity: "warning", message: "Heading 1 inside the content. The page title is usually the only Heading 1.", snippet: text });
      } else if (prev && level > prev + 1) {
        issues.push({ key: `${f.name}:h:${hi}`, field: f.name, kind: "heading-skip", severity: "warning", message: `Jumps from Heading ${prev} to Heading ${level}. Don’t skip levels.`, snippet: text });
      }
      prev = level;
      hi++;
    }

    let ti = 0;
    for (const m of v.matchAll(/<table\b[\s\S]*?<\/table>/gi)) {
      if (!/<th\b/i.test(m[0])) issues.push({ key: `${f.name}:t:${ti}`, field: f.name, kind: "table-headers", severity: "warning", message: "Table has no header cells, so its columns aren’t announced." });
      ti++;
    }
  }
  return issues;
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

/** Return the field value with alt text added to the image the issue points at. */
export function withAlt(value: string, issue: A11yIssue, alt: string): string {
  if (issue.kind === "image-field-alt") {
    return attr(value, "alt") ? value.replace(/\balt\s*=\s*("[^"]*"|'[^']*')/i, `alt="${esc(alt)}"`) : value.replace(/<image\b/i, `<image alt="${esc(alt)}"`);
  }
  let n = -1;
  return value.replace(/<img\b[^>]*>/gi, (tag) => {
    n++;
    if (n !== issue.alt?.occurrence || attr(tag, "alt")) return tag;
    return tag.replace(/<img\b/i, `<img alt="${esc(alt)}"`);
  });
}

export function a11yCounts(issues: A11yIssue[]) {
  return { errors: issues.filter((i) => i.severity === "error").length, warnings: issues.filter((i) => i.severity === "warning").length };
}
