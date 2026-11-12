"use client";

import { useId } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import type { RedirectOptions } from "@/lib/ops/operations";

export function RedirectControls({
  value,
  onChange,
  hasChildren,
}: {
  value: RedirectOptions;
  onChange: (v: RedirectOptions) => void;
  hasChildren: boolean;
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-3 rounded-lg border p-3">
      <div className="flex items-start gap-3">
        <div className="flex-1">
          <Label htmlFor={`${id}-on`} className="text-md font-medium">
            Keep old links working
          </Label>
          <p className="text-sm text-subtle-text">Adds a permanent redirect from the current URL to the new one.</p>
        </div>
        <Switch id={`${id}-on`} checked={value.enabled} onCheckedChange={(enabled: boolean) => onChange({ ...value, enabled })} />
      </div>
      {value.enabled && hasChildren && (
        <div className="flex items-start gap-2.5 border-t pt-3">
          <Checkbox
            id={`${id}-kids`}
            checked={value.includeChildren}
            onCheckedChange={(c: boolean | "indeterminate") => onChange({ ...value, includeChildren: c === true })}
          />
          <div>
            <Label htmlFor={`${id}-kids`} className="text-md">
              Include pages below this one
            </Label>
            <p className="text-sm text-subtle-text">Their URLs change too. One pattern redirect covers all of them.</p>
          </div>
        </div>
      )}
    </div>
  );
}
