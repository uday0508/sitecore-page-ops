"use client";

import { WorkspaceApp } from "@/components/workspace/workspace-app";

/** Full Screen extension point (inside SitecoreAI, one environment). Register /fullscreen. */
export default function FullScreenPage() {
  return <WorkspaceApp surface="fullscreen" />;
}
