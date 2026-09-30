interface SubmissionJob {
  id: string;
  run: (signal: AbortSignal) => Promise<void>;
}

/** One submission worker shared by every batch and engine render. */
export class GenerationSubmissionQueue {
  private pending = new Map<string, SubmissionJob>();
  private active: { id: string; controller: AbortController } | undefined;
  private running = false;
  private scheduled = false;

  enqueue(jobs: SubmissionJob[]): void {
    for (const job of jobs) {
      if (job.id !== this.active?.id) this.pending.set(job.id, job);
    }
    if (this.running || this.scheduled || this.pending.size === 0) return;
    // React's development mount/unmount check must finish before dispatching.
    this.scheduled = true;
    queueMicrotask(() => {
      this.scheduled = false;
      void this.drain();
    });
  }

  cancel(): void {
    this.pending.clear();
    this.active?.controller.abort();
    // Keep the worker occupied until the cancelled request actually settles.
    // A remount or a new batch must not overlap a still-finishing submission.
  }

  /** Removing a task must interrupt its preparation before a generation request is sent. */
  retain(taskIds: ReadonlySet<string>): void {
    for (const id of this.pending.keys()) if (!taskIds.has(id)) this.pending.delete(id);
    if (this.active && !taskIds.has(this.active.id)) this.active.controller.abort();
  }

  private async drain(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      while (this.pending.size > 0) {
        const job = this.pending.values().next().value as SubmissionJob;
        this.pending.delete(job.id);
        const controller = new AbortController();
        this.active = { id: job.id, controller };
        try {
          await job.run(controller.signal);
        } catch (error) {
          // Jobs normally report their own failures. An unexpected local error
          // must still release the worker and allow the next task to proceed.
          console.warn('[generationEngine] 提交队列异常:', error);
        } finally {
          this.active = undefined;
        }
      }
    } finally {
      this.running = false;
    }
  }
}
