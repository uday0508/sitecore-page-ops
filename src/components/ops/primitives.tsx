"use client";

import {
  mdiAlertCircleOutline,
  mdiCheckCircle,
  mdiCircleOutline,
  mdiCloseCircle,
  mdiContentCopy,
  mdiMinusCircleOutline,
} from "@mdi/js";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ops/spinner";
import { Icon } from "@/lib/icon";
import type { Step } from "@/lib/ops/operations";
import { cn } from "@/lib/utils";

/** A URL path rendered as data: mono, breakable, never truncated mid-thought. */
export function PathText({ children, className }: { children: string; className?: string }) {
  return <span className={cn("font-path break-all text-[0.8125rem]", className)}>{children}</span>;
}

export function CopyButton({ value, label = "Copy" }: { value: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <Button
      variant="ghost"
      size="icon-xs"
      aria-label={label}
      title={label}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setDone(true);
          setTimeout(() => setDone(false), 1200);
        } catch {
          toast.error("Your browser blocked copying. Select the text and copy it instead.");
        }
      }}
    >
      <Icon path={done ? mdiCheckCircle : mdiContentCopy} className="size-4" />
    </Button>
  );
}

/** Live progress for a multi-step operation. */
export function StepList({ steps }: { steps: Step[] }) {
  return (
    <ol className="flex flex-col gap-2.5" aria-live="polite">
      {steps.map((s) => (
        <li key={s.id} className="flex items-start gap-2.5">
          <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center">
            {s.status === "running" ? (
              <Spinner className="size-4" />
            ) : (
              <Icon
                path={
                  s.status === "done"
                    ? mdiCheckCircle
                    : s.status === "error"
                      ? mdiCloseCircle
                      : s.status === "skipped"
                        ? mdiMinusCircleOutline
                        : mdiCircleOutline
                }
                className={cn(
                  "size-4",
                  s.status === "done" && "text-success-fg",
                  s.status === "error" && "text-danger-fg",
                  (s.status === "pending" || s.status === "skipped") && "text-subtle-text",
                )}
              />
            )}
          </span>
          <span className="min-w-0">
            <span className={cn("block text-md", s.status === "skipped" && "text-subtle-text", s.status === "pending" && "text-subtle-text")}>
              {s.label}
            </span>
            {s.detail && (
              <span className={cn("block text-sm", s.status === "error" ? "text-danger-fg" : "text-subtle-text")}>{s.detail}</span>
            )}
          </span>
        </li>
      ))}
    </ol>
  );
}

/** A row in an impact / consequence list. Tone is carried by icon AND text, never color alone. */
export function ImpactRow({
  icon,
  tone = "neutral",
  title,
  children,
  action,
}: {
  icon: string;
  tone?: "neutral" | "success" | "warning" | "danger" | "primary";
  title: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
}) {
  const toneCls = {
    neutral: "text-neutral-fg bg-neutral-bg",
    success: "text-success-fg bg-success-bg",
    warning: "text-warning-fg bg-warning-bg",
    danger: "text-danger-fg bg-danger-bg",
    primary: "text-primary-fg bg-primary-bg",
  }[tone];
  return (
    <div className="flex items-start gap-3 py-2.5">
      <span className={cn("mt-px flex size-7 shrink-0 items-center justify-center rounded-md", toneCls)}>
        <Icon path={icon} className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-md font-medium leading-snug">{title}</div>
        {children && <div className="mt-0.5 text-sm text-subtle-text">{children}</div>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

export function SectionLabel({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2 pb-1">
      <h3 className="text-sm font-semibold text-subtle-text">{children}</h3>
      {action}
    </div>
  );
}

export function ErrorNote({ error, onRetry }: { error: Error | string; onRetry?: () => void }) {
  return (
    <div className="flex items-start gap-2 rounded-md bg-danger-bg px-3 py-2 text-sm text-danger-fg" role="alert">
      <Icon path={mdiAlertCircleOutline} className="mt-px size-4 shrink-0" />
      <span className="flex-1">{typeof error === "string" ? error : error.message}</span>
      {onRetry && (
        <Button size="xs" variant="ghost" colorScheme="danger" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}

export function relativeTime(iso: string) {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 45) return "just now";
  if (diff < 3600) return `${Math.round(diff / 60)} min ago`;
  if (diff < 86400) return `${Math.round(diff / 3600)} h ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
