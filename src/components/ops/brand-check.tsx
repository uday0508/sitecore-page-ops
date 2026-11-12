"use client";

import { mdiCreation } from "@mdi/js";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Icon } from "@/lib/icon";
import type { BrandReview, SitecoreApi } from "@/lib/sitecore/api";
import { Spinner } from "./spinner";

/** Optional AI brand-voice check (Sitecore Stream brand kit). Hidden when the site has no brand kit. */
export function BrandCheck({ api, text, onApply }: { api: SitecoreApi; text: string; onApply: (t: string) => void }) {
  const [state, setState] = useState<{ loading: boolean; review: BrandReview | null; error: string | null; for: string }>({
    loading: false,
    review: null,
    error: null,
    for: "",
  });
  if (!api.site.brandKitId) return null;
  const stale = state.review && state.for !== text;

  const run = async () => {
    setState({ loading: true, review: null, error: null, for: text });
    try {
      setState({ loading: false, review: await api.brandReview(text), error: null, for: text });
    } catch (e) {
      setState({ loading: false, review: null, error: e instanceof Error ? e.message : "Brand check failed", for: text });
    }
  };

  const score = state.review?.score;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <Button variant="outline" colorScheme="primary" size="xs" onClick={run} disabled={!text.trim() || state.loading}>
          {state.loading ? <Spinner className="size-3.5" /> : <Icon path={mdiCreation} className="size-4" />}
          {state.review && !stale ? "Check again" : "Check brand voice"}
        </Button>
        {score != null && !stale && (
          <Badge colorScheme={score >= 80 ? "success" : score >= 60 ? "warning" : "danger"}>Brand fit {score}/100</Badge>
        )}
      </div>
      {state.error && <p className="text-sm text-danger-fg">{state.error}</p>}
      {state.review && !stale && (
        <div className="rounded-md bg-primary-bg px-3 py-2 text-sm">
          {state.review.summary && <p>{state.review.summary}</p>}
          {state.review.suggestions.map((s) => (
            <div key={s} className="mt-1.5 flex items-center gap-2">
              <span className="flex-1 font-medium">“{s}”</span>
              <Button size="xs" variant="ghost" colorScheme="primary" onClick={() => onApply(s)}>
                Use this
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
