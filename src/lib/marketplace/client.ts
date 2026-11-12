import { ClientSDK } from "@sitecore-marketplace-sdk/client";
import { XMC } from "@sitecore-marketplace-sdk/xmc";
import { AI } from "@sitecore-marketplace-sdk/ai";
import { createMockClient } from "./mock";

let instance: Promise<ClientSDK> | null = null;

/** Sample-data mode: forced by env/query string, or automatic when not embedded in Sitecore. */
export function isMockMode(): boolean {
  if (typeof window === "undefined") return false;
  if (process.env.NEXT_PUBLIC_MOCK === "1") return true;
  if (new URLSearchParams(window.location.search).has("mock")) return true;
  try {
    return window.self === window.top;
  } catch {
    return false; // cross-origin parent: we are embedded
  }
}

export function getMarketplaceClient(): Promise<ClientSDK> {
  if (!instance) {
    instance = isMockMode()
      ? Promise.resolve(createMockClient() as unknown as ClientSDK)
      : ClientSDK.init({ target: window.parent, modules: [XMC, AI], timeout: 15000 });
    instance.catch(() => {
      instance = null; // allow a retry
    });
  }
  return instance;
}
