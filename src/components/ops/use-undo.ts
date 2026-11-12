"use client";

import { useCallback, useState } from "react";
import { toast } from "sonner";
import type { ActivityEntry } from "@/lib/activity";
import { undo } from "@/lib/ops/operations";
import type { SitecoreApi } from "@/lib/sitecore/api";

export function useUndo(api: SitecoreApi, onUndone?: () => void) {
  const [busy, setBusy] = useState(false);
  const run = useCallback(
    async (entry: ActivityEntry) => {
      setBusy(true);
      const id = toast.loading("Undoing…");
      try {
        await undo(api, entry);
        toast.success("Undone. Publish again to update the live site.", { id });
        onUndone?.();
        return true;
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Couldn’t undo", { id });
        return false;
      } finally {
        setBusy(false);
      }
    },
    [api, onUndone],
  );
  return { undo: run, busy };
}
