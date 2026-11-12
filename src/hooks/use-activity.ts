"use client";

import { useEffect, useState } from "react";
import { onActivityChange, readActivity, type ActivityEntry } from "@/lib/activity";

export function useActivity(filter?: (e: ActivityEntry) => boolean) {
  const [entries, setEntries] = useState<ActivityEntry[]>([]);
  useEffect(() => {
    const load = () => setEntries(readActivity());
    load();
    return onActivityChange(load);
  }, []);
  return filter ? entries.filter(filter) : entries;
}
