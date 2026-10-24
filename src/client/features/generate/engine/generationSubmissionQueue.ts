import { GENERATION_BATCH_LIMIT } from '@shared/domain/assistant/generationPrompts';

export type GenerationSubmissionLane = 'media' | 'agent' | 'serial';

interface SubmissionJob {
  id: string;
  lane: GenerationSubmissionLane;
  run: (signal: AbortSignal) => Promise<void>;
}

interface ActiveSubmission {
  lane: GenerationSubmissionLane;
  controller: AbortController;
}

export function getGenerationSubmissionLane(mediaType?: string): GenerationSubmissionLane {
  if (mediaType === 'agent') return 'agent';
  // Older image tasks have no mediaType. Unknown/new task types stay conservative.
  if (!mediaType || mediaType === 'image' || mediaType === 'video') return 'media';
  return 'serial';
}

/** Shared by every batch and engine render; each lane has its own capacity. */
export class GenerationSubmissionQueue {
  private pending = new Map<string, SubmissionJob>();
  private active = new Map<string, ActiveSubmission>();
  private scheduled = false;
  private mediaConcurrency = GENERATION_BATCH_LIMIT;

  getMediaConcurrency(): number {
    return this.mediaConcurrency;
  }

  /** Lowering capacity never interrupts requests already in flight. */
  setMediaConcurrency(value: number): number {
    this.mediaConcurrency = Number.isFinite(value)
      ? Math.min(GENERATION_BATCH_LIMIT, Math.max(1, Math.trunc(value)))
      : GENERATION_BATCH_LIMIT;
    this.schedule();
    return this.mediaConcurrency;
  }

  enqueue(jobs: SubmissionJob[]): void {
    for (const job of jobs) {
      if (!this.active.has(job.id)) this.pending.set(job.id, job);
    }
    this.schedule();
  }

  cancel(): void {
    this.pending.clear();
    for (const { controller } of this.active.values()) controller.abort();
    // Aborting does not free a slot or an ID until the original run actually settles.
    // Remounts/new batches must not overlap a still-finishing submission.
  }

  /** Removing a task must interrupt its preparation before a generation request is sent. */
  retain(taskIds: ReadonlySet<string>): void {
    for (const id of this.pending.keys()) if (!taskIds.has(id)) this.pending.delete(id);
    for (const [id, { controller }] of this.active) {
      if (!taskIds.has(id)) controller.abort();
    }
  }

  private schedule(): void {
    if (this.scheduled || this.pending.size === 0) return;
    // React's development mount/unmount check must finish before dispatching.
    this.scheduled = true;
    queueMicrotask(() => {
      this.scheduled = false;
      this.drain();
    });
  }

  private drain(): void {
    const counts: Record<GenerationSubmissionLane, number> = { media: 0, agent: 0, serial: 0 };
    for (const { lane } of this.active.values()) counts[lane] += 1;
    for (const [id, job] of this.pending) {
      const capacity = job.lane === 'media' ? this.mediaConcurrency : 1;
      if (counts[job.lane] >= capacity) continue;
      this.pending.delete(id);
      const controller = new AbortController();
      this.active.set(id, { lane: job.lane, controller });
      counts[job.lane] += 1;
      void this.run(job, controller.signal);
    }
  }

  private async run(job: SubmissionJob, signal: AbortSignal): Promise<void> {
    try {
      await job.run(signal);
    } catch (error) {
      // Jobs normally report their own failures; unexpected errors still release their slot.
      console.warn('[generationEngine] 提交队列异常:', error);
    } finally {
      this.active.delete(job.id);
      this.schedule();
    }
  }
}
