"use client";

import { WorkspaceApp } from "@/components/workspace/workspace-app";

/** Standalone extension point (Cloud Portal, every environment the app is installed on). Register /standalone. */
export default function StandalonePage() {
  return <WorkspaceApp surface="standalone" />;
}
