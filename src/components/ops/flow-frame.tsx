"use client";

import { mdiArrowLeft, mdiCheck } from "@mdi/js";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Icon } from "@/lib/icon";
import { cn } from "@/lib/utils";

/**
 * Frame for every page operation: back button, the steps of the flow, scrolling body,
 * and a footer pinned to the bottom so the primary action is always in reach.
 */
export function FlowFrame({
  title,
  stages,
  stage,
  onBack,
  backLabel = "Back",
  children,
  footer,
}: {
  title: string;
  stages: string[];
  stage: number;
  onBack?: () => void;
  backLabel?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex flex-col gap-3 border-b px-4 pt-3 pb-3">
        <div className="flex items-center gap-1.5">
          {onBack && (
            <Button variant="ghost" size="icon-sm" aria-label={backLabel} onClick={onBack} className="-ml-1.5">
              <Icon path={mdiArrowLeft} className="size-5" />
            </Button>
          )}
          <h2 className="text-lg font-semibold">{title}</h2>
        </div>
        {stages.length > 0 && (
        <ol className="flex items-center gap-1.5" aria-label="Progress">
          {stages.map((s, i) => (
            <li key={s} className="flex items-center gap-1.5" aria-current={i === stage ? "step" : undefined}>
              <span
                className={cn(
                  "flex size-5 items-center justify-center rounded-full text-2xs font-semibold",
                  i < stage && "bg-success-bg text-success-fg",
                  i === stage && "bg-primary text-inverse-text",
                  i > stage && "bg-neutral-bg text-subtle-text",
                )}
              >
                {i < stage ? <Icon path={mdiCheck} className="size-3" /> : i + 1}
              </span>
              <span className={cn("text-sm", i === stage ? "font-medium" : "text-subtle-text")}>{s}</span>
              {i < stages.length - 1 && <span aria-hidden className="mx-0.5 h-px w-4 bg-border-color-a11y" />}
            </li>
          ))}
        </ol>
        )}
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">{children}</div>
      {footer && <footer className="flex flex-wrap items-center justify-end gap-2 border-t bg-body-bg px-4 py-3">{footer}</footer>}
    </div>
  );
}
