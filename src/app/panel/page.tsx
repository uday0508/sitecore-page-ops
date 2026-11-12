"use client";

import { PanelApp } from "@/components/panel/panel-app";

/** Pages context panel extension point. Register /panel as the app's Pages Context Panel URL. */
export default function PanelPage() {
  return <PanelApp />;
}
