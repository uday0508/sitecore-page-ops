import { toast } from "sonner";

/**
 * Long-running work (site scan, bulk fixes, find and replace) runs here instead of inside a screen,
 * so it keeps going while authors move around the app. A top-bar indicator shows progress.
 */
export interface Job {
  id: string;
  label: string;
  phase?: string;
  done: number;
  total: number;
  status: "running" | "done" | "failed" | "cancelled";
  failed: string[];
  error?: string;
  startedAt: number;
}

type Ctx = { signal: AbortSignal; progress: (done: number, total?: number, phase?: string) => void; fail: (name: string) => void };

const jobs = new Map<string, Job>();
const controllers = new Map<string, AbortController>();
const subs = new Set<() => void>();
let snapshot: Job[] = [];
const emit = () => {
  snapshot = [...jobs.values()].sort((a, b) => b.startedAt - a.startedAt);
  subs.forEach((f) => f());
};

export function subscribeJobs(cb: () => void) {
  subs.add(cb);
  return () => subs.delete(cb);
}
export const getJobs = () => snapshot;

/** Start a job. Returns its result; the job stays listed until dismissed. `key` keeps one job of a kind at a time. */
export async function startJob<T>(label: string, run: (ctx: Ctx) => Promise<T>, opts: { key?: string; onDone?: (job: Job, result: T) => void } = {}): Promise<T | undefined> {
  const id = opts.key ?? `job-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  if (jobs.get(id)?.status === "running") return undefined;
  const ctrl = new AbortController();
  controllers.set(id, ctrl);
  const job: Job = { id, label, done: 0, total: 0, status: "running", failed: [], startedAt: Date.now() };
  jobs.set(id, job);
  emit();
  try {
    const result = await run({
      signal: ctrl.signal,
      progress: (done, total, phase) => {
        job.done = done;
        if (total !== undefined) job.total = total;
        if (phase !== undefined) job.phase = phase;
        emit();
      },
      fail: (name) => {
        job.failed.push(name);
        emit();
      },
    });
    job.status = ctrl.signal.aborted ? "cancelled" : "done";
    emit();
    if (job.status === "done" && !job.failed.length) {
      setTimeout(() => {
        if (jobs.get(id) === job) {
          jobs.delete(id);
          emit();
        }
      }, 6000);
    }
    if (job.status === "done") {
      if (job.failed.length) toast.error(`${label}: ${job.failed.length} of ${job.total || job.failed.length} didn’t work`, { description: job.failed.slice(0, 5).join(", ") });
      else toast.success(`${label}: done`);
    }
    opts.onDone?.(job, result);
    return result;
  } catch (e) {
    job.status = ctrl.signal.aborted || (e as Error)?.name === "AbortError" ? "cancelled" : "failed";
    job.error = e instanceof Error ? e.message : String(e);
    emit();
    if (job.status === "failed") toast.error(`${label} failed`, { description: job.error });
    return undefined;
  } finally {
    controllers.delete(id);
  }
}

/** Run fn over a list as one job. Items that throw are recorded as failed; the rest carry on. */
export function runListJob<T>(label: string, list: T[], name: (t: T) => string, fn: (t: T) => Promise<unknown>, opts: { key?: string; onDone?: (job: Job) => void } = {}) {
  return startJob(
    label,
    async ({ progress, fail, signal }) => {
      progress(0, list.length);
      let done = 0;
      for (const t of list) {
        if (signal.aborted) break;
        try {
          await fn(t);
        } catch {
          fail(name(t));
        }
        progress(++done);
      }
    },
    { key: opts.key, onDone: (j) => opts.onDone?.(j) },
  );
}

export function cancelJob(id: string) {
  controllers.get(id)?.abort();
}
export function dismissJob(id: string) {
  if (jobs.get(id)?.status === "running") return;
  jobs.delete(id);
  emit();
}
