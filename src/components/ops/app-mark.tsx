import { cn } from "@/lib/utils";

/** Page Ops logo (public/app-icon-512.png): page, gear with check, and orbit. */
export function AppMark({ className }: { className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src="/app-icon-512.png" alt="" aria-hidden="true" width={32} height={32} className={cn("size-8 shrink-0 select-none", className)} draggable={false} />
  );
}
