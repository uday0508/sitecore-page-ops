"use client";

import { mdiApplicationOutline, mdiFullscreen, mdiDockRight } from "@mdi/js";
import { useEffect, useState } from "react";
import { AppMark } from "@/components/ops/app-mark";
import { Icon } from "@/lib/icon";
import { isMockMode } from "@/lib/marketplace/client";

const SURFACES = [
  { href: "/standalone", title: "Standalone", where: "Cloud Portal app list", what: "Every environment the app is installed on. Pick one, then work on its sites.", icon: mdiApplicationOutline },
  { href: "/fullscreen", title: "Full Screen", where: "Inside SitecoreAI", what: "Pages, Health, Redirects and Activity for the current environment.", icon: mdiFullscreen },
  { href: "/panel", title: "Pages context panel", where: "Next to the page in the Pages editor", what: "Everything for the page being edited.", icon: mdiDockRight },
];

/**
 * Root URL. Inside Sitecore it forwards to /fullscreen, so installs registered before the move keep
 * working. Locally it's a launcher for the three extension points, with a live preview of the panel.
 */
export default function Root() {
  const [launcher, setLauncher] = useState(false);
  useEffect(() => {
    if (isMockMode()) setLauncher(true);
    else window.location.replace(`/fullscreen${window.location.search}${window.location.hash}`);
  }, []);
  if (!launcher) return null;

  return (
    <main className="mx-auto flex min-h-dvh max-w-6xl flex-col gap-8 px-8 py-10">
      <header className="flex items-center gap-3">
        <AppMark className="size-10" />
        <div>
          <h1 className="text-2xl font-semibold">Page Operations</h1>
          <p className="text-md text-subtle-text">Local preview with sample data. Each extension point opens as it would in Sitecore.</p>
        </div>
      </header>
      <div className="grid gap-8 lg:grid-cols-[1fr_380px]">
        <ul className="flex flex-col gap-3">
          {SURFACES.map((s) => (
            <li key={s.href}>
              <a href={`${s.href}?mock`} className="flex items-start gap-4 rounded-xl border p-4 hover:border-primary/50 hover:shadow-sm focus-visible:ring-[3px] focus-visible:ring-primary/40 focus-visible:outline-none">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary-bg text-primary-fg">
                  <Icon path={s.icon} className="size-5" />
                </span>
                <span className="flex flex-col">
                  <span className="text-md font-semibold">
                    {s.title} <span className="font-path text-sm font-normal text-subtle-text">{s.href}</span>
                  </span>
                  <span className="text-sm text-subtle-text">{s.where}</span>
                  <span className="mt-1 text-md">{s.what}</span>
                </span>
              </a>
            </li>
          ))}
        </ul>
        <figure className="flex flex-col gap-2">
          <figcaption className="text-sm font-semibold text-subtle-text">Pages context panel at its real width</figcaption>
          <iframe src="/panel?mock" title="Pages context panel preview" className="h-[680px] w-full rounded-xl border" />
        </figure>
      </div>
      <footer className="flex gap-5 text-sm text-subtle-text">
        <a href="/support" className="hover:text-primary-fg">Support</a>
        <a href="/privacy" className="hover:text-primary-fg">Privacy</a>
        <a href="/terms" className="hover:text-primary-fg">Terms</a>
      </footer>
    </main>
  );
}
