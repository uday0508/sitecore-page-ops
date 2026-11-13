import type { ReactNode } from "react";
import { Providers } from "./providers";

/** Everything that runs inside Sitecore: connects through the Marketplace SDK. */
export default function AppLayout({ children }: { children: ReactNode }) {
  return <Providers>{children}</Providers>;
}
