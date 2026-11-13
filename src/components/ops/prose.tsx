import type { ReactNode } from "react";

/** Readable long-form text for the public pages. */
export function Prose({ children }: { children: ReactNode }) {
  return (
    <article className="flex max-w-3xl flex-col gap-4 text-md leading-relaxed [&_a]:text-primary-fg [&_a]:underline [&_h1]:text-3xl [&_h1]:font-semibold [&_h2]:mt-6 [&_h2]:text-xl [&_h2]:font-semibold [&_h3]:mt-2 [&_h3]:text-lg [&_h3]:font-semibold [&_li]:ml-5 [&_li]:list-disc [&_li]:pl-1 [&_p.lead]:text-lg [&_p.lead]:text-subtle-text [&_ul]:flex [&_ul]:flex-col [&_ul]:gap-1.5">
      {children}
    </article>
  );
}
