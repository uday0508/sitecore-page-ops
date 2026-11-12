import type { RedirectChange } from "@/lib/activity";
import { resolve } from "@/lib/sitecore/redirects";
import type { RedirectIssueCode, RedirectRule } from "@/lib/sitecore/types";
import type { RedirectState } from "@/hooks/use-sitecore";

export const ISSUE_LABEL: Record<RedirectIssueCode, string> = {
  loop: "Loop",
  chain: "Chain",
  shadowed: "Hides a page",
  broken: "Broken target",
  duplicate: "Duplicate",
  self: "Points to itself",
};

export const ISSUE_ORDER: RedirectIssueCode[] = ["loop", "broken", "self", "shadowed", "duplicate", "chain"];

/** The one-click fix for a rule, if there is a safe one. */
export function quickFix(rule: RedirectRule, code: RedirectIssueCode, state: RedirectState): { label: string; change: RedirectChange } | null {
  const remove = { op: "remove" as const, mapId: rule.mapId, source: rule.source, target: rule.target };
  switch (code) {
    case "shadowed":
      return { label: "Remove redirect", change: remove };
    case "duplicate":
      return { label: "Remove duplicate", change: remove };
    case "self":
      return { label: "Remove", change: remove };
    case "chain": {
      const live = state.livePages ? new Set(state.livePages.map((p) => p.route.toLowerCase())) : undefined;
      const res = resolve(rule.target, state.rules, live);
      if (res.loop || res.landsOnPage === false) return null;
      return { label: `Point straight to ${res.final}`, change: { op: "retarget", mapId: rule.mapId, source: rule.source, from: rule.target, to: res.final } };
    }
    default:
      return null;
  }
}

export function countIssues(state: RedirectState) {
  const counts: Record<RedirectIssueCode, number> = { loop: 0, chain: 0, shadowed: 0, broken: 0, duplicate: 0, self: 0 };
  for (const list of state.issues.values()) for (const i of list) counts[i.code]++;
  return counts;
}
