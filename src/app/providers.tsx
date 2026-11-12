"use client";

import type { ReactNode } from "react";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { MarketplaceProvider } from "@/lib/marketplace/provider";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <MarketplaceProvider>
      <TooltipProvider delayDuration={300}>
        {children}
        <Toaster position="bottom-center" />
      </TooltipProvider>
    </MarketplaceProvider>
  );
}
