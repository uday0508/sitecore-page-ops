import { cn } from "@/lib/utils";

/** Page Ops logo: a page with an orange gear and check, "operations on pages, done right". Same artwork as public/app-icon.svg. */
export function AppMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 512 512" className={cn("size-8 shrink-0", className)} aria-hidden="true">
      <rect width="512" height="512" rx="112" fill="#5420E0" />
      <rect x="84" y="92" width="268" height="312" rx="34" fill="#fff" />
      <rect x="120" y="132" width="104" height="80" rx="14" fill="#C9BBFF" />
      <rect x="240" y="140" width="80" height="20" rx="10" fill="#DDD4FF" />
      <rect x="240" y="184" width="56" height="20" rx="10" fill="#DDD4FF" />
      <rect x="120" y="240" width="140" height="20" rx="10" fill="#DDD4FF" />
      <rect x="120" y="284" width="100" height="20" rx="10" fill="#DDD4FF" />
      <path d="M301.8 251.6 L320.5 245.9 L321.8 221.3 L358.2 221.3 L359.5 245.9 L378.4 251.7 L395.6 260.9 L413.9 244.4 L439.6 270.1 L423.1 288.4 L432.4 305.8 L438.1 324.5 L462.7 325.8 L462.7 362.2 L438.1 363.5 L432.3 382.4 L423.1 399.6 L439.6 417.9 L413.9 443.6 L395.6 427.1 L378.2 436.4 L359.5 442.1 L358.2 466.7 L321.8 466.7 L320.5 442.1 L301.6 436.3 L284.4 427.1 L266.1 443.6 L240.4 417.9 L256.9 399.6 L247.6 382.2 L241.9 363.5 L217.3 362.2 L217.3 325.8 L241.9 324.5 L247.7 305.6 L256.9 288.4 L240.4 270.1 L266.1 244.4 L284.4 260.9 Z" fill="#FF8A1F" stroke="#5420E0" strokeWidth="22" strokeLinejoin="round" paintOrder="stroke" />
      <circle cx="340" cy="344" r="64" fill="#fff" />
      <path d="M309 346l22 22 42-44" fill="none" stroke="#5420E0" strokeWidth="22" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
