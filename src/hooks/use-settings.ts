"use client";

import { useCallback, useEffect, useState } from "react";
import { DEFAULT_SETTINGS, loadSettings, saveSettings, type AppSettings } from "@/lib/settings";

export function useSettings(): [AppSettings, (s: AppSettings) => void] {
  const [settings, set] = useState<AppSettings>(DEFAULT_SETTINGS);
  useEffect(() => {
    set(loadSettings());
    const on = () => set(loadSettings());
    window.addEventListener("page-ops:settings", on);
    return () => window.removeEventListener("page-ops:settings", on);
  }, []);
  const update = useCallback((s: AppSettings) => {
    saveSettings(s);
    set(s);
  }, []);
  return [settings, update];
}
