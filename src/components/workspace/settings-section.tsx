"use client";

import { useEffect, useId, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useSettings } from "@/hooks/use-settings";
import { DEFAULT_SETTINGS, type AppSettings } from "@/lib/settings";
import { REDIRECT_TYPE_LABEL, type RedirectType } from "@/lib/sitecore/types";

function Field({ label, hint, children, id }: { label: string; hint?: string; children: ReactNode; id: string }) {
  return (
    <div className="grid gap-1.5 md:grid-cols-[16rem_1fr] md:gap-6">
      <div>
        <Label htmlFor={id} className="text-md font-medium">
          {label}
        </Label>
        {hint && <p className="text-sm text-subtle-text">{hint}</p>}
      </div>
      <div className="flex items-start">{children}</div>
    </div>
  );
}

export function SettingsSection({ siteName }: { siteName?: string }) {
  const [saved, save] = useSettings();
  const [s, set] = useState<AppSettings>(saved);
  const id = useId();
  useEffect(() => set(saved), [saved]);
  const dirty = JSON.stringify(s) !== JSON.stringify(saved);
  const up = <K extends keyof AppSettings>(k: K, v: AppSettings[K]) => set({ ...s, [k]: v });

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-8 px-8 py-8">
      <header>
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="text-md text-subtle-text">Shared with everyone working on {siteName ?? "this site"}. If the setup check says sharing isn’t available, they’re kept in this browser.</p>
      </header>

      <section className="flex flex-col gap-5">
        <h2 className="text-lg font-semibold">Redirects</h2>
        <Field id={`${id}-folder`} label="Redirects folder" hint="{site} is replaced with the site root, e.g. /sitecore/content/brand/site.">
          <Input id={`${id}-folder`} className="font-path" value={s.redirectFolderPath} onChange={(e) => up("redirectFolderPath", e.target.value)} />
        </Field>
        <Field id={`${id}-map`} label="Map name" hint="Page Operations writes new redirects to this map and creates it if needed.">
          <Input id={`${id}-map`} value={s.managedMapName} onChange={(e) => up("managedMapName", e.target.value)} />
        </Field>
        <Field id={`${id}-type`} label="Redirect type for new maps">
          <Select value={s.defaultRedirectType} onValueChange={(v: string) => up("defaultRedirectType", v as RedirectType)}>
            <SelectTrigger id={`${id}-type`} className="w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(REDIRECT_TYPE_LABEL) as RedirectType[]).map((t) => (
                <SelectItem key={t} value={t}>
                  {REDIRECT_TYPE_LABEL[t]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field id={`${id}-qs`} label="Keep query strings" hint="/old?ref=mail goes to /new?ref=mail.">
          <Switch id={`${id}-qs`} checked={s.preserveQueryString} onCheckedChange={(v: boolean) => up("preserveQueryString", v)} />
        </Field>
        <Field id={`${id}-chains`} label="Prevent redirect chains" hint="When a URL changes, older redirects to it are pointed at the new URL.">
          <Switch id={`${id}-chains`} checked={s.collapseChains} onCheckedChange={(v: boolean) => up("collapseChains", v)} />
        </Field>
        <Field id={`${id}-kids`} label="Cover child pages" hint="Add one pattern redirect for pages below a page whose URL changes.">
          <Switch id={`${id}-kids`} checked={s.redirectChildren} onCheckedChange={(v: boolean) => up("redirectChildren", v)} />
        </Field>
      </section>

      <section className="flex flex-col gap-5">
        <h2 className="text-lg font-semibold">Safety</h2>
        <Field id={`${id}-typed`} label="Type the name to delete" hint="Authors type the page name before deleting it.">
          <Switch id={`${id}-typed`} checked={s.requireTypedDeleteConfirm} onCheckedChange={(v: boolean) => up("requireTypedDeleteConfirm", v)} />
        </Field>
      </section>

      <section className="flex flex-col gap-5">
        <h2 className="text-lg font-semibold">Health</h2>
        <Field id={`${id}-stale`} label="Stale after (months)" hint="Pages not edited for this long show in the Stale content report.">
          <Input id={`${id}-stale`} type="number" min={1} max={60} className="w-28" value={s.staleMonths} onChange={(e) => up("staleMonths", Math.max(1, Number(e.target.value) || 12))} />
        </Field>
        <Field id={`${id}-gsc-id`} label="Google client ID" hint="An OAuth web client from Google Cloud with this app’s URL as an authorised JavaScript origin. Used only in your browser, read-only.">
          <Input id={`${id}-gsc-id`} className="font-path" placeholder="1234-abc.apps.googleusercontent.com" value={s.gscClientId} onChange={(e) => up("gscClientId", e.target.value.trim())} />
        </Field>
        <Field id={`${id}-gsc-prop`} label="Search Console property" hint="Exactly as in Search Console, e.g. sc-domain:example.com or https://www.example.com/">
          <Input id={`${id}-gsc-prop`} className="font-path" placeholder="sc-domain:example.com" value={s.gscProperty} onChange={(e) => up("gscProperty", e.target.value.trim())} />
        </Field>
      </section>

      <section className="flex flex-col gap-5">
        <h2 className="text-lg font-semibold">Page builder link</h2>
        <Field
          id={`${id}-pb`}
          label="Link pattern"
          hint="Used by “Edit in Page builder”. Tokens: {tenant} {organization} {itemId} {language} {site} {version}. Leave empty to hide the button."
        >
          <Input id={`${id}-pb`} className="font-path" value={s.pageBuilderUrl} onChange={(e) => up("pageBuilderUrl", e.target.value.trim())} />
        </Field>
      </section>

      <section className="flex flex-col gap-5">
        <h2 className="text-lg font-semibold">Advanced</h2>
        <Field id={`${id}-tpl`} label="Redirect Map template" hint="Used when the map has to be created.">
          <Input id={`${id}-tpl`} className="font-path" value={s.redirectMapTemplatePath} onChange={(e) => up("redirectMapTemplatePath", e.target.value)} />
        </Field>
        <Field id={`${id}-links`} label="Links index field" hint="Search field holding each item’s outgoing links. Default: _links.">
          <Input id={`${id}-links`} className="font-path w-56" value={s.referencesField} onChange={(e) => up("referencesField", e.target.value)} />
        </Field>
        <Field id={`${id}-target`} label="Publishing target">
          <Input id={`${id}-target`} className="font-path w-56" value={s.publishTarget} onChange={(e) => up("publishTarget", e.target.value)} />
        </Field>
      </section>

      <footer className="sticky bottom-0 -mx-8 flex justify-end gap-2 border-t bg-body-bg px-8 py-3">
        <Button variant="ghost" onClick={() => set(DEFAULT_SETTINGS)}>
          Reset to defaults
        </Button>
        <Button
          disabled={!dirty}
          onClick={() => {
            save(s);
            toast.success("Settings saved");
          }}
        >
          Save settings
        </Button>
      </footer>
    </div>
  );
}
