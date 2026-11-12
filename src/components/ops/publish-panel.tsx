"use client";

import { mdiCheckCircle, mdiCloudUploadOutline } from "@mdi/js";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { logActivity } from "@/lib/activity";
import { Icon } from "@/lib/icon";
import type { SitecoreApi } from "@/lib/sitecore/api";
import { Spinner } from "./spinner";

export interface PublishItem {
  id: string;
  label: string;
  hint?: string;
  defaultChecked?: boolean;
  /** Publish child items too (pages below a moved page, or the parent of a deleted page). */
  subItems?: boolean;
}

/** Publish the page, its redirects and (optionally) the pages that link to it, in one step. */
export function PublishPanel({ api, items, canPublish = true }: { api: SitecoreApi; items: PublishItem[]; canPublish?: boolean }) {
  const [checked, setChecked] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(items.map((i) => [i.id, i.defaultChecked !== false])),
  );
  const [state, setState] = useState<"idle" | "running" | "done">("idle");
  const selected = items.filter((i) => checked[i.id]);

  if (!canPublish) {
    return <p className="text-sm text-subtle-text">You don’t have publishing rights for this site. Ask a publisher to publish these changes.</p>;
  }
  if (state === "done") {
    return (
      <div className="flex items-center gap-2 rounded-md bg-success-bg px-3 py-2 text-md text-success-fg">
        <Icon path={mdiCheckCircle} className="size-4" />
        Publishing started. Changes reach the live site in a minute or two.
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-3 rounded-lg border p-3">
      <div>
        <h3 className="text-md font-semibold">Publish now</h3>
        <p className="text-sm text-subtle-text">
          Publish the redirects with the page so the old URL never shows a 404.{" "}
          {api.publishLanguages.length > 1
            ? `Publishes all ${api.publishLanguages.length} languages (${api.publishLanguages.join(", ")}).`
            : ""}
        </p>
      </div>
      <ul className="flex flex-col gap-2">
        {items.map((i) => (
          <li key={i.id} className="flex items-start gap-2.5">
            <Checkbox
              id={`pub-${i.id}`}
              checked={!!checked[i.id]}
              onCheckedChange={(c: boolean | "indeterminate") => setChecked({ ...checked, [i.id]: c === true })}
            />
            <Label htmlFor={`pub-${i.id}`} className="flex flex-col items-start gap-0 font-normal">
              <span className="text-md">{i.label}</span>
              {i.hint && <span className="text-sm text-subtle-text">{i.hint}</span>}
            </Label>
          </li>
        ))}
      </ul>
      <Button
        className="self-start"
        disabled={selected.length === 0 || state === "running"}
        onClick={async () => {
          setState("running");
          try {
            const deep = selected.filter((s) => s.subItems).map((s) => s.id);
            const flat = selected.filter((s) => !s.subItems).map((s) => s.id);
            if (flat.length) await api.publish(flat);
            if (deep.length) await api.publish(deep, { subItems: true });
            logActivity({ kind: "publish", site: api.site.name, title: `Published ${selected.length} item${selected.length === 1 ? "" : "s"}`, detail: selected.map((s) => s.label).join(", ") });
            setState("done");
            toast.success("Publishing started");
          } catch (e) {
            setState("idle");
            toast.error(e instanceof Error ? e.message : "Publishing failed");
          }
        }}
      >
        {state === "running" ? <Spinner className="size-4 text-inverse-text" /> : <Icon path={mdiCloudUploadOutline} className="size-5" />}
        Publish {selected.length} item{selected.length === 1 ? "" : "s"}
      </Button>
    </div>
  );
}
