export type DiffPart = { type: "same" | "add" | "del"; text: string };

/** Plain text from a field value (strips HTML so rich text diffs read like prose). */
export function toText(v: string | null | undefined): string {
  return (v ?? "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h\d)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Word-level diff (LCS). Falls back to a whole-value replace for very long texts. */
export function wordDiff(a: string, b: string): DiffPart[] {
  const A = a.split(/(\s+)/).filter(Boolean);
  const B = b.split(/(\s+)/).filter(Boolean);
  if (A.length * B.length > 4_000_000) return [{ type: "del", text: a }, { type: "add", text: b }];
  const dp: Uint32Array[] = Array.from({ length: A.length + 1 }, () => new Uint32Array(B.length + 1));
  for (let i = A.length - 1; i >= 0; i--)
    for (let j = B.length - 1; j >= 0; j--) dp[i][j] = A[i] === B[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const out: DiffPart[] = [];
  const push = (type: DiffPart["type"], text: string) => {
    const last = out[out.length - 1];
    if (last && last.type === type) last.text += text;
    else out.push({ type, text });
  };
  let i = 0;
  let j = 0;
  while (i < A.length && j < B.length) {
    if (A[i] === B[j]) {
      push("same", A[i]);
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) push("del", A[i++]);
    else push("add", B[j++]);
  }
  while (i < A.length) push("del", A[i++]);
  while (j < B.length) push("add", B[j++]);
  return out;
}

/** 0..1 similarity of two URL paths, by shared words and edit distance of the last segment. */
export function pathSimilarity(a: string, b: string): number {
  const stem = (w: string) => (w.length > 3 && w.endsWith("s") ? w.slice(0, -1) : w);
  const words = (s: string) => new Set(s.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 1).map(stem));
  const wa = words(a);
  const wb = words(b);
  const inter = [...wa].filter((w) => wb.has(w)).length;
  const jaccard = wa.size + wb.size ? inter / (wa.size + wb.size - inter) : 0;
  const la = a.toLowerCase().split("/").filter(Boolean).pop() ?? "";
  const lb = b.toLowerCase().split("/").filter(Boolean).pop() ?? "";
  const lev = (x: string, y: string) => {
    const d = Array.from({ length: x.length + 1 }, (_, i) => [i, ...new Array(y.length).fill(0)]);
    for (let j = 1; j <= y.length; j++) d[0][j] = j;
    for (let i = 1; i <= x.length; i++)
      for (let j = 1; j <= y.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (x[i - 1] === y[j - 1] ? 0 : 1));
    return d[x.length][y.length];
  };
  const segSim = la || lb ? 1 - lev(la, lb) / Math.max(la.length, lb.length) : 0;
  return 0.6 * jaccard + 0.4 * segSim;
}
