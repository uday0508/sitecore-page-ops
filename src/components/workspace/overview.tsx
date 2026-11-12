"use client";

import { mdiAlertCircleOutline, mdiCheckCircle, mdiFormTextboxPassword, mdiSourceBranch } from "@mdi/js";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorNote, PathText, relativeTime } from "@/components/ops/primitives";
import { Spinner } from "@/components/ops/spinner";
import { useActivity } from "@/hooks/use-activity";
import { useAsync } from "@/hooks/use-async";
import type { AsyncState } from "@/hooks/use-async";
import type { RedirectState } from "@/hooks/use-sitecore";
import { Icon } from "@/lib/icon";
import { editRedirects } from "@/lib/ops/operations";
import type { SitecoreApi } from "@/lib/sitecore/api";
import { lastSegment } from "@/lib/sitecore/routes";
import { lintSlug } from "@/lib/sitecore/slug";
import type { RedirectIssueCode } from "@/lib/sitecore/types";
import { cn } from "@/lib/utils";
import { ISSUE_LABEL, ISSUE_ORDER, countIssues, quickFix } from "./redirect-health";
import type { Nav } from "./workspace-app";

export function Overview({ api, redirects, nav }: { api: SitecoreApi; redirects: AsyncState<RedirectState>; nav: Nav }) {
  const state = redirects.data;
  const activity = useActivity((e) => e.site === api.site.name).slice(0, 5);
  const [fixing, setFixing] = useState<string | null>(null);
  const locales = useAsync(() => api.localizationStats(), [api]);
  const workflows = useAsync(() => api.workflowStats(), [api]);

  const problems = useMemo(() => {
    if (!state) return [];
    return state.rules
      .flatMap((rule) => (state.issues.get(rule.key) ?? []).map((issue) => ({ rule, issue })))
      .sort((a, b) => ISSUE_ORDER.indexOf(a.issue.code) - ISSUE_ORDER.indexOf(b.issue.code));
  }, [state]);
  const counts = state ? countIssues(state) : null;
  const total = problems.length;
  const badUrls = useMemo(
    () => (state?.livePages ?? []).filter((p) => p.route !== "/" && lintSlug(lastSegment(p.route)).length > 0).length,
    [state],
  );
  const chainFixes = state ? problems.filter((p) => p.issue.code === "chain").map((p) => quickFix(p.rule, "chain", state)).filter(Boolean) : [];

  const apply = async (key: string, changes: Parameters<typeof editRedirects>[1], title: string) => {
    setFixing(key);
    try {
      await editRedirects(api, changes, title);
      toast.success("Fixed. Publish the redirect maps to update the live site.");
      await redirects.reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn’t apply the fix");
    } finally {
      setFixing(null);
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-8 py-8">
      <header className="flex flex-col gap-1">
        <h1 className="text-3xl font-semibold">Link health</h1>
        <p className="text-md text-subtle-text">
          {state
            ? `${state.rules.length} redirects across ${state.maps.length} map${state.maps.length === 1 ? "" : "s"}${state.livePages ? `, ${state.livePages.length} live pages` : ""}.`
            : "Checking redirects and pages…"}
        </p>
      </header>

      {redirects.error && <ErrorNote error={redirects.error} onRetry={redirects.reload} />}

      {!state && !redirects.error ? (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-20 rounded-lg" />
          ))}
        </div>
      ) : (
        state &&
        counts && (
          <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border bg-border-color md:grid-cols-4">
            {(["loop", "broken", "shadowed", "chain"] as RedirectIssueCode[]).map((code) => (
              <button
                key={code}
                type="button"
                onClick={() => nav({ section: "redirects", filter: code })}
                className="flex flex-col items-start gap-1 bg-body-bg px-4 py-3 text-left hover:bg-subtle-bg focus-visible:z-10 focus-visible:ring-[3px] focus-visible:ring-primary/40 focus-visible:outline-none"
              >
                <span className={cn("text-2xl font-semibold tabular-nums", counts[code] > 0 ? (code === "chain" ? "text-warning-fg" : "text-danger-fg") : "text-subtle-text")}>
                  {counts[code]}
                </span>
                <span className="text-sm text-subtle-text">{ISSUE_LABEL[code]}{counts[code] === 1 ? "" : "s"}</span>
              </button>
            ))}
          </div>
        )
      )}

      {state && (
        <section className="flex flex-col gap-3">
          <div className="flex items-end justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold">{total ? "Fix these first" : "No redirect problems"}</h2>
              <p className="text-md text-subtle-text">
                {total
                  ? "Loops and broken targets send visitors to error pages. Chains slow every visit and leak search ranking."
                  : "Every redirect lands on a live page in one hop."}
              </p>
            </div>
            {chainFixes.length > 1 && (
              <Button
                variant="outline"
                disabled={!!fixing}
                onClick={() => apply("all-chains", chainFixes.map((f) => f!.change), `Collapsed ${chainFixes.length} redirect chains`)}
              >
                {fixing === "all-chains" ? <Spinner /> : <Icon path={mdiSourceBranch} className="size-5" />}
                Fix all {chainFixes.length} chains
              </Button>
            )}
          </div>
          {total === 0 ? (
            <div className="flex items-center gap-3 rounded-lg bg-success-bg px-4 py-3 text-success-fg">
              <Icon path={mdiCheckCircle} className="size-5" />
              <span className="text-md">All clear.</span>
            </div>
          ) : (
            <ul className="flex flex-col divide-y rounded-lg border">
              {problems.slice(0, 12).map(({ rule, issue }) => {
                const fix = quickFix(rule, issue.code, state);
                const key = `${rule.key}:${issue.code}`;
                return (
                  <li key={key} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
                    <Badge colorScheme={issue.severity === "error" ? "danger" : "warning"} className="w-28 justify-center">
                      {ISSUE_LABEL[issue.code]}
                    </Badge>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-baseline gap-x-2">
                        <PathText>{rule.source}</PathText>
                        <span aria-hidden className="text-subtle-text">→</span>
                        <PathText>{rule.target}</PathText>
                      </div>
                      <p className="text-sm text-subtle-text">
                        {issue.message} <span className="whitespace-nowrap">In “{rule.mapName}”.</span>
                      </p>
                    </div>
                    {fix ? (
                      <Button size="sm" variant="outline" colorScheme="primary" disabled={!!fixing} onClick={() => apply(key, [fix.change], `${fix.label}: ${rule.source}`)}>
                        {fixing === key && <Spinner />}
                        {fix.label}
                      </Button>
                    ) : (
                      <Button size="sm" variant="ghost" onClick={() => nav({ section: "redirects", edit: rule.key })}>
                        Edit
                      </Button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          {total > 12 && (
            <Button variant="link" className="self-start px-0" onClick={() => nav({ section: "redirects", filter: "issues" })}>
              See all {total} problems
            </Button>
          )}
        </section>
      )}

      {(locales.data?.length || workflows.data?.some((w) => w.states.length)) && (
        <section className="grid gap-8 md:grid-cols-2">
          {locales.data && locales.data.length > 0 && (
            <div className="flex flex-col gap-2">
              <h2 className="text-lg font-semibold">Languages</h2>
              <ul className="flex flex-col divide-y rounded-lg border">
                {locales.data.map((l, i) => {
                  const max = Math.max(...locales.data!.map((x) => x.pageCount), 1);
                  return (
                    <li key={`${l.language}-${i}`} className="flex items-center gap-3 px-4 py-2.5">
                      <span className="w-36 truncate text-md">{l.name || l.language}</span>
                      <span className="h-2 flex-1 overflow-hidden rounded-full bg-neutral-bg">
                        <span className="block h-full rounded-full bg-primary" style={{ width: `${(l.pageCount / max) * 100}%` }} />
                      </span>
                      <span className="w-16 text-right text-sm text-subtle-text tabular-nums">{l.pageCount} pages</span>
                    </li>
                  );
                })}
              </ul>
              <p className="text-sm text-subtle-text">Translate missing pages from Pages → a page → Languages and versions.</p>
            </div>
          )}
          {workflows.data && workflows.data.some((w) => w.states.length) && (
            <div className="flex flex-col gap-2">
              <h2 className="text-lg font-semibold">Workflow</h2>
              {workflows.data.map((w, i) => (
                <ul key={`${w.workflow}-${i}`} className="flex flex-col divide-y rounded-lg border">
                  {w.states.map((st, i) => (
                    <li key={`${st.name}-${i}`} className="flex items-center justify-between px-4 py-2.5">
                      <span className="text-md">{st.name}</span>
                      <span className="text-sm text-subtle-text tabular-nums">{st.pageCount} pages</span>
                    </li>
                  ))}
                </ul>
              ))}
            </div>
          )}
        </section>
      )}

      <div className="grid gap-8 md:grid-cols-2">
        {state?.livePages && (
          <section className="flex flex-col gap-2">
            <h2 className="text-lg font-semibold">Page URLs</h2>
            <div className="flex items-start gap-3 rounded-lg border px-4 py-3">
              <Icon path={badUrls ? mdiAlertCircleOutline : mdiCheckCircle} className={cn("mt-0.5 size-5", badUrls ? "text-warning-fg" : "text-success-fg")} />
              <div className="flex-1">
                <p className="text-md font-medium">{badUrls ? `${badUrls} page${badUrls === 1 ? " has" : "s have"} messy URLs` : "All page URLs are clean"}</p>
                <p className="text-sm text-subtle-text">Underscores, special characters or reserved words.</p>
              </div>
              {badUrls > 0 && (
                <Button size="sm" variant="outline" onClick={() => nav({ section: "pages", tab: "audit" })}>
                  <Icon path={mdiFormTextboxPassword} className="size-4" />
                  Review
                </Button>
              )}
            </div>
          </section>
        )}
        <section className="flex flex-col gap-2">
          <h2 className="text-lg font-semibold">Recent changes</h2>
          {activity.length === 0 ? (
            <p className="text-md text-subtle-text">Changes made with Page Operations appear here, with undo.</p>
          ) : (
            <ul className="flex flex-col divide-y rounded-lg border">
              {activity.map((e) => (
                <li key={e.id} className="flex items-center gap-3 px-4 py-2.5">
                  <span className={cn("min-w-0 flex-1 truncate text-md", e.undone && "text-subtle-text line-through")}>{e.title}</span>
                  <span className="shrink-0 text-sm text-subtle-text">{relativeTime(e.at)}</span>
                </li>
              ))}
            </ul>
          )}
          {activity.length > 0 && (
            <Button variant="link" className="self-start px-0" onClick={() => nav({ section: "activity" })}>
              All activity
            </Button>
          )}
        </section>
      </div>
    </div>
  );
}
