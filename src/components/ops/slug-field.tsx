"use client";

import { mdiAlertCircleOutline, mdiAutoFix, mdiInformationOutline } from "@mdi/js";
import { useId, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Icon } from "@/lib/icon";
import { lintSlug, slugify } from "@/lib/sitecore/slug";
import { cn } from "@/lib/utils";

export function SlugField({
  parentRoute,
  value,
  onChange,
  siblings,
  current,
  autoFocus,
  label = "URL name",
}: {
  parentRoute: string;
  value: string;
  onChange: (v: string) => void;
  siblings?: string[];
  current?: string;
  autoFocus?: boolean;
  label?: string;
}) {
  const id = useId();
  const issues = useMemo(() => lintSlug(value, { siblings, current }), [value, siblings, current]);
  const suggestion = slugify(value);
  const hasError = issues.some((i) => i.severity === "error");
  const prefix = parentRoute === "/" ? "/" : `${parentRoute}/`;

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <div
        className={cn(
          "flex items-stretch overflow-hidden rounded-md border bg-body-bg focus-within:ring-[3px] focus-within:ring-primary/40",
          hasError && "border-danger",
        )}
      >
        <span className="font-path flex max-w-[45%] items-center truncate border-r bg-subtle-bg px-2 text-[0.8125rem] text-subtle-text" title={prefix}>
          {prefix}
        </span>
        <Input
          id={id}
          value={value}
          autoFocus={autoFocus}
          spellCheck={false}
          autoComplete="off"
          aria-invalid={hasError}
          aria-describedby={`${id}-hint`}
          onChange={(e) => onChange(e.target.value)}
          className="font-path min-w-0 flex-1 rounded-none border-0 shadow-none focus-visible:ring-0"
        />
      </div>
      <div id={`${id}-hint`} className="flex flex-col gap-1">
        {issues.slice(0, 3).map((i) => (
          <p key={i.code} className={cn("flex items-start gap-1.5 text-sm", i.severity === "error" ? "text-danger-fg" : "text-warning-fg")}>
            <Icon path={i.severity === "error" ? mdiAlertCircleOutline : mdiInformationOutline} className="mt-px size-3.5 shrink-0" />
            {i.message}
          </p>
        ))}
        {issues.some((i) => i.code !== "empty" && i.code !== "duplicate" && i.code !== "reserved") && suggestion && suggestion !== value && (
          <Button variant="ghost" colorScheme="primary" size="xs" className="self-start" onClick={() => onChange(suggestion)}>
            <Icon path={mdiAutoFix} className="size-4" />
            Use “{suggestion}”
          </Button>
        )}
      </div>
    </div>
  );
}
