import { cn } from "@/lib/utils";

/** Page Operations logo: a site's page structure with the page you're working on highlighted. Same artwork as public/app-icon.svg. */
export function AppMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 512 512" className={cn("size-8 shrink-0", className)} aria-hidden="true">
      <rect width="512" height="512" rx="112" fill="#6E3FFF" />
      <g fill="none" stroke="#fff" strokeWidth="32" strokeLinecap="round" strokeLinejoin="round">
        <rect x="186" y="88" width="140" height="104" rx="26" />
        <path d="M256 192v60" />
        <path d="M152 300v-48h208v48" />
        <rect x="88" y="300" width="128" height="124" rx="26" />
      </g>
      <path d="M322 300h56l46 46v54a24 24 0 0 1-24 24H322a24 24 0 0 1-24-24v-76a24 24 0 0 1 24-24z" fill="#fff" />
      <path d="M378 300v30a16 16 0 0 0 16 16h30" fill="none" stroke="#6E3FFF" strokeWidth="18" strokeLinejoin="round" />
    </svg>
  );
}
