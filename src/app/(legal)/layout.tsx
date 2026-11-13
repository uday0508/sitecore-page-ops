import Link from "next/link";
import type { ReactNode } from "react";
import { AppMark } from "@/components/ops/app-mark";
import { COMPANY } from "@/lib/company";

/** Public pages for the Marketplace listing. No Sitecore connection, so they load anywhere. */
export default function LegalLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-body-bg">
      <header className="border-b">
        <div className="mx-auto flex h-16 max-w-4xl items-center gap-6 px-6">
          <Link href="/support" className="flex items-center gap-2.5">
            <AppMark className="size-8" />
            <span className="text-lg font-semibold">{COMPANY.product}</span>
          </Link>
          <nav aria-label="Pages" className="ml-auto flex gap-5 text-md">
            <Link href="/support" className="hover:text-primary-fg">
              Support
            </Link>
            <Link href="/privacy" className="hover:text-primary-fg">
              Privacy
            </Link>
            <Link href="/terms" className="hover:text-primary-fg">
              Terms
            </Link>
          </nav>
        </div>
      </header>
      <main className="mx-auto w-full max-w-4xl flex-1 px-6 py-12">{children}</main>
      <footer className="border-t">
        <div className="mx-auto max-w-4xl px-6 py-6 text-sm text-subtle-text">
          © {new Date().getFullYear()} {COMPANY.name}. {COMPANY.product} is an app for Sitecore. Sitecore is a trademark of Sitecore Corporation A/S.
        </div>
      </footer>
    </div>
  );
}
