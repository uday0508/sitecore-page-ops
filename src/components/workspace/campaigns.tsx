"use client";

import { mdiCalendarRange, mdiCloudUploadOutline, mdiPlus, mdiTrashCanOutline } from "@mdi/js";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ErrorNote, PathText, relativeTime } from "@/components/ops/primitives";
import { Spinner } from "@/components/ops/spinner";
import type { AsyncState } from "@/hooks/use-async";
import type { RedirectState } from "@/hooks/use-sitecore";
import { logActivity } from "@/lib/activity";
import { Icon } from "@/lib/icon";
import type { SitecoreApi } from "@/lib/sitecore/api";
import { isExternal, isPattern, normalizePath, samePath } from "@/lib/sitecore/redirects";
import type { Campaign, RedirectType } from "@/lib/sitecore/types";

const fmt = (iso?: string) => (iso ? new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "now");
const dateInput = (iso?: string) => (iso ? iso.slice(0, 10) : "");

function parseRules(text: string) {
  const rows: { source: string; target: string }[] = [];
  const errors: string[] = [];
  text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .forEach((l, i) => {
      const [a, b] = l.split(/[\s,→>]+/).filter(Boolean);
      if (!a || !b) errors.push(`Line ${i + 1}: needs a from and a to URL.`);
      else rows.push({ source: isPattern(a) ? a : normalizePath(a), target: isExternal(b) ? b : normalizePath(b) });
    });
  return { rows, errors };
}

const STATUS = {
  scheduled: { label: "Scheduled", tone: "primary" },
  active: { label: "Running", tone: "success" },
  ended: { label: "Ended", tone: "warning" },
} as const;

/** Temporary redirects with a start and end date: each campaign is its own redirect map with a publishing window. */
export function CampaignsView({ api, redirects }: { api: SitecoreApi; redirects: AsyncState<RedirectState> }) {
  const campaigns = useMemo(() => api.campaigns(redirects.data?.maps ?? []), [api, redirects.data]);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Campaign | null>(null);
  const [removing, setRemoving] = useState<Campaign | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const act = async (key: string, fn: () => Promise<unknown>, ok: string) => {
    setBusy(key);
    try {
      await fn();
      toast.success(ok);
      await redirects.reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "That didn’t work");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex flex-col gap-4 px-8 py-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-md text-subtle-text">
          Short-lived redirects for promotions and events. Each one has an end date, so old campaign URLs don’t pile up.
        </p>
        <Button onClick={() => setCreating(true)}>
          <Icon path={mdiPlus} className="size-5" />
          New campaign
        </Button>
      </div>

      {redirects.error && <ErrorNote error={redirects.error} onRetry={redirects.reload} />}
      {campaigns.length === 0 ? (
        <p className="rounded-lg border px-4 py-10 text-center text-md text-subtle-text">No campaigns yet.</p>
      ) : (
        <ul className="flex flex-col divide-y rounded-lg border">
          {campaigns.map((c) => (
            <li key={c.id} className="flex flex-wrap items-start gap-x-6 gap-y-3 px-4 py-4">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-md font-semibold">{c.name}</h3>
                  <Badge size="sm" colorScheme={STATUS[c.status].tone}>
                    {STATUS[c.status].label}
                  </Badge>
                  <span className="text-sm text-subtle-text">{c.type === "Redirect301" ? "301" : "302"}</span>
                </div>
                <p className="text-sm text-subtle-text">
                  {fmt(c.startsAt)} to {fmt(c.endsAt)}
                  {c.status === "ended" && c.endsAt ? `. Ended ${relativeTime(c.endsAt)}; Sitecore takes it off the live site at the next publish. Remove it to tidy up.` : ""}
                  {c.status === "scheduled" && c.startsAt ? ". Goes live with the first publish after it starts." : ""}
                </p>
                <ul className="mt-2 flex flex-wrap gap-1.5">
                  {c.rules.slice(0, 6).map((r) => (
                    <li key={r.source} className="rounded-md bg-subtle-bg px-2 py-0.5">
                      <PathText>{r.source}</PathText> <span className="text-subtle-text">→</span> <PathText>{r.target}</PathText>
                    </li>
                  ))}
                  {c.rules.length > 6 && <li className="text-sm text-subtle-text">and {c.rules.length - 6} more</li>}
                </ul>
              </div>
              <div className="flex flex-wrap gap-1.5">
                <Button size="sm" variant="ghost" onClick={() => setEditing(c)}>
                  <Icon path={mdiCalendarRange} className="size-4" />
                  Dates
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={!!busy}
                  onClick={() => act(`pub-${c.id}`, () => api.publish([c.id]), "Publishing started")}
                >
                  {busy === `pub-${c.id}` ? <Spinner /> : <Icon path={mdiCloudUploadOutline} className="size-4" />}
                  Publish
                </Button>
                <Button size="sm" variant={c.status === "ended" ? "outline" : "ghost"} colorScheme="danger" disabled={!!busy} onClick={() => setRemoving(c)}>
                  <Icon path={mdiTrashCanOutline} className="size-4" />
                  Remove
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <CampaignDialog api={api} redirects={redirects} open={creating} onOpenChange={setCreating} />

      <DatesDialog
        campaign={editing}
        onClose={() => setEditing(null)}
        onSave={(start, end) =>
          act(
            `dates-${editing!.id}`,
            async () => {
              await api.setCampaignWindow(editing!.id, start, end);
              logActivity({ kind: "schedule", site: api.site.name, title: `Changed the dates of campaign ${editing!.name}`, publish: [{ id: editing!.id, label: `Campaign: ${editing!.name}`, kind: "redirects" }] });
            },
            "Dates saved. Publish the campaign to apply them.",
          ).then(() => setEditing(null))
        }
      />

      <AlertDialog open={!!removing} onOpenChange={(o: boolean) => !o && setRemoving(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove “{removing?.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              Its {removing?.rules.length} redirect{removing?.rules.length === 1 ? "" : "s"} stop working once the redirects folder is published, which happens now. The map goes to the recycle bin.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const c = removing!;
                setRemoving(null);
                void act(`rm-${c.id}`, async () => {
                  await api.removeMap(c.id);
                  logActivity({ kind: "redirect.delete", site: api.site.name, title: `Removed campaign ${c.name}`, detail: `${c.rules.length} redirects` });
                }, "Campaign removed");
              }}
            >
              Remove campaign
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function CampaignDialog({ api, redirects, open, onOpenChange }: { api: SitecoreApi; redirects: AsyncState<RedirectState>; open: boolean; onOpenChange: (o: boolean) => void }) {
  const [name, setName] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [type, setType] = useState<RedirectType>("Redirect302");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const { rows, errors } = parseRules(text);
  const live = new Set((redirects.data?.livePages ?? []).map((p) => p.route.toLowerCase()));
  const clashes = rows.filter((r) => !isPattern(r.source) && live.has(r.source.toLowerCase()));
  const missing = rows.filter((r) => !isExternal(r.target) && live.size && !live.has(r.target.toLowerCase()));
  const taken = rows.filter((r) => (redirects.data?.rules ?? []).some((x) => samePath(x.source, r.source)));
  const endDate = end ? new Date(`${end}T23:59:59`) : null;
  const valid = name.trim() && endDate && endDate.getTime() > Date.now() && rows.length > 0 && errors.length === 0 && (!start || new Date(start) < endDate!);

  const reset = () => {
    setName("");
    setStart("");
    setEnd("");
    setText("");
    setType("Redirect302");
  };

  const create = async () => {
    setBusy(true);
    try {
      const id = await api.createCampaign({ name: name.trim(), startsAt: start ? new Date(`${start}T00:00:00`) : null, endsAt: endDate!, type, rules: rows });
      logActivity({ kind: "redirect.add", site: api.site.name, title: `Created campaign ${name.trim()}`, detail: `${rows.length} redirects, ends ${end}`, publish: [{ id, label: `Campaign: ${name.trim()}`, kind: "redirects" }] });
      toast.success("Campaign created", { action: { label: "Publish now", onClick: () => void api.publish([id]).then(() => toast.success("Publishing started")) } });
      reset();
      onOpenChange(false);
      await redirects.reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn’t create the campaign");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New campaign</DialogTitle>
          <DialogDescription>Redirects that only work between two dates.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="cmp-name">Name</Label>
            <Input id="cmp-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Winter sale" autoFocus />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cmp-start">Starts</Label>
              <Input id="cmp-start" type="date" value={start} onChange={(e) => setStart(e.target.value)} />
              <span className="text-xs text-subtle-text">Leave empty to start now</span>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cmp-end">Ends</Label>
              <Input id="cmp-end" type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="cmp-type">Type</Label>
            <Select value={type} onValueChange={(v: string) => setType(v as RedirectType)}>
              <SelectTrigger id="cmp-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Redirect302">302 temporary (recommended)</SelectItem>
                <SelectItem value="Redirect301">301 permanent</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="cmp-rules">Redirects</Label>
            <Textarea id="cmp-rules" rows={4} className="font-path" value={text} onChange={(e) => setText(e.target.value)} placeholder={"/winter /products/sleeping-bags\n/snow /products/tents"} />
            <span className="text-xs text-subtle-text">One per line: from URL, then to URL.</span>
            {errors.map((e) => (
              <span key={e} className="text-sm text-danger-fg">
                {e}
              </span>
            ))}
            {clashes.length > 0 && <span className="text-sm text-warning-fg">{clashes.map((c) => c.source).join(", ")} is a live page. The campaign would hide it.</span>}
            {taken.length > 0 && <span className="text-sm text-warning-fg">{taken.map((c) => c.source).join(", ")} already redirects somewhere. Only the first matching rule runs.</span>}
            {missing.length > 0 && <span className="text-sm text-warning-fg">{missing.map((c) => c.target).join(", ")} isn’t a live page.</span>}
          </div>
          {end && endDate && endDate.getTime() <= Date.now() && <p className="text-sm text-danger-fg">The end date has to be in the future.</p>}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={!valid || busy} onClick={create}>
            {busy && <Spinner className="text-inverse-text" />}
            Create campaign
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DatesDialog({ campaign, onClose, onSave }: { campaign: Campaign | null; onClose: () => void; onSave: (start: Date | null, end: Date | null) => void }) {
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [seen, setSeen] = useState<string | null>(null);
  if (campaign && seen !== campaign.id) {
    setSeen(campaign.id);
    setStart(dateInput(campaign.startsAt));
    setEnd(dateInput(campaign.endsAt));
  }
  return (
    <Dialog open={!!campaign} onOpenChange={(o: boolean) => !o && (setSeen(null), onClose())}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Dates for {campaign?.name}</DialogTitle>
          <DialogDescription>Extend a campaign by moving its end date.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="d-start">Starts</Label>
            <Input id="d-start" type="date" value={start} onChange={(e) => setStart(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="d-end">Ends</Label>
            <Input id="d-end" type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={!end} onClick={() => onSave(start ? new Date(`${start}T00:00:00`) : null, end ? new Date(`${end}T23:59:59`) : null)}>
            Save dates
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
