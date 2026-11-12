/** Find and replace in field values. By default only visible text changes, never tags, attributes or links. */

export interface ReplaceOptions {
  caseSensitive: boolean;
  wholeWord: boolean;
  /** Also match inside tags and attributes (e.g. link URLs, image paths) */
  inMarkup: boolean;
}

export interface Match {
  start: number;
  end: number;
  before: string;
  text: string;
  after: string;
}

const strip = (s: string) => s.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ");

function pattern(query: string, o: ReplaceOptions) {
  const body = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const word = o.wholeWord ? `(?<![\\p{L}\\p{N}_])${body}(?![\\p{L}\\p{N}_])` : body;
  return new RegExp(word, `gu${o.caseSensitive ? "" : "i"}`);
}

export function findMatches(value: string, query: string, o: ReplaceOptions): Match[] {
  if (!query || !value) return [];
  const re = pattern(query, o);
  const out: Match[] = [];
  const push = (start: number, len: number) => {
    out.push({
      start,
      end: start + len,
      text: value.slice(start, start + len),
      before: strip(value.slice(Math.max(0, start - 120), start)).slice(-50).trimStart(),
      after: strip(value.slice(start + len, start + len + 120)).slice(0, 50).trimEnd(),
    });
  };
  if (o.inMarkup || !/[<]/.test(value)) {
    for (const m of value.matchAll(re)) push(m.index!, m[0].length);
    return out;
  }
  // Text nodes only: walk around tags.
  let offset = 0;
  for (const part of value.split(/(<[^>]*>)/)) {
    if (!part.startsWith("<")) for (const m of part.matchAll(re)) push(offset + m.index!, m[0].length);
    offset += part.length;
  }
  return out;
}

/** Replace the given matches (from findMatches on this exact value). */
export function applyMatches(value: string, matches: Match[], replacement: string): string {
  let out = value;
  for (const m of [...matches].sort((a, b) => b.start - a.start)) out = out.slice(0, m.start) + replacement + out.slice(m.end);
  return out;
}

/** Fields worth searching: text-like values, not IDs, dates or numbers. */
export function searchable(name: string, value: string) {
  if (!value || name.startsWith("__")) return false;
  if (/^\s*\{?[0-9a-f-]{36}\}?(\|\{?[0-9a-f-]{36}\}?)*\s*$/i.test(value)) return false;
  if (/^\d{8}T\d{6}/.test(value) || /^-?\d+(\.\d+)?$/.test(value) || value === "1") return false;
  return true;
}
