import { workshopBatchSchema, type WorkshopBatch } from '@beike/contracts/workshopBatches';
import { workshopSnapshotSchema, type WorkshopSnapshot } from '@beike/contracts/workshopWorkspace';

export function serializeWorkspaceSnapshot(snapshot: WorkshopSnapshot): string {
  return JSON.stringify(workshopSnapshotSchema.parse(snapshot));
}

class SaveConflict extends Error {}
type SaveOptions = {
  fetch: (url: string, init?: RequestInit) => Promise<Response>;
  keepalive?: boolean;
  force?: boolean;
  now?: () => number;
};
type PendingSave = { revision: number; json: string };

/** One session per adopted batch. Call save serially; never replace local edits on recovery. */
export class WorkspaceSaveSession {
  readonly batchId: string;
  revision: number;
  savedJson: string;
  updatedAt: string;
  blocked = false;
  retryAt = 0;
  private failures = 0;
  private pending: PendingSave | null = null;

  constructor(batch: WorkshopBatch) {
    this.batchId = batch.id;
    this.revision = batch.revision;
    this.savedJson = serializeWorkspaceSnapshot(batch.snapshot);
    this.updatedAt = batch.updatedAt;
  }

  get hasPendingSave(): boolean { return this.pending !== null; }

  private confirm(attempt: PendingSave, updatedAt: string): void {
    this.revision = attempt.revision + 1;
    this.savedJson = attempt.json;
    this.updatedAt = updatedAt;
    this.pending = null;
  }

  private async reconcile(options: SaveOptions): Promise<void> {
    const attempt = this.pending;
    if (!attempt) return;
    const response = await options.fetch(`/api/catalog/workshop-batches/${this.batchId}`, { cache: 'no-store', signal: AbortSignal.timeout(15_000) });
    if (response.status === 404) throw new SaveConflict('批次已不存在，请先下载本地草稿再重新加载');
    if (!response.ok) throw new Error('暂时无法核对服务器版本，已保留本地修改，稍后重试');
    const batch = workshopBatchSchema.parse((await response.json()).batch);
    if (batch.id !== this.batchId || batch.status === 'archived') throw new SaveConflict('批次已切换或归档，请先下载本地草稿再重新加载');
    const remote = serializeWorkspaceSnapshot(batch.snapshot);
    if (batch.revision === attempt.revision + 1 && remote === attempt.json) {
      this.confirm(attempt, batch.updatedAt);
    } else if (batch.revision === attempt.revision && remote === this.savedJson) {
      // The prior request did not commit. Reusing this revision is protected by
      // the server's conditional UPDATE, even if that request is still in flight.
      this.pending = null;
    } else {
      throw new SaveConflict('服务器版本已被其他窗口修改，未覆盖本地内容。请先下载本地草稿再重新加载');
    }
  }

  async save(json: string, options: SaveOptions): Promise<boolean> {
    if (this.blocked && !options.force) return false;
    this.blocked = false;
    if (!this.pending && json === this.savedJson) return true;
    const now = options.now || Date.now;
    if (!options.force && now() < this.retryAt) return false;
    try {
      await this.reconcile(options);
      if (json !== this.savedJson) {
        const attempt = { revision: this.revision, json };
        this.pending = attempt;
        const response = await options.fetch(`/api/catalog/workshop-batches/${this.batchId}`, {
          method: 'PUT', keepalive: options.keepalive, signal: AbortSignal.timeout(15_000),
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ revision: attempt.revision, snapshot: JSON.parse(json) }),
        });
        if (response.status === 409) {
          // A delayed original request may have committed between GET and PUT.
          // Only accept that exact snapshot; never overwrite a different version.
          await this.reconcile(options);
          if (this.revision !== attempt.revision + 1 || this.savedJson !== attempt.json) {
            throw new SaveConflict('当前批次不能继续保存，请先下载本地草稿再重新加载');
          }
        } else if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          const message = data.error || '当前批次保存失败，已保留本地修改';
          if ([400, 401, 403, 404, 422].includes(response.status)) {
            this.pending = null;
            throw new SaveConflict(message);
          }
          throw new Error(message);
        } else {
          const data = await response.json();
          if (data.revision !== attempt.revision + 1 || typeof data.updatedAt !== 'string') {
            throw new Error('保存结果尚未确认，将自动核对服务器版本');
          }
          this.confirm(attempt, data.updatedAt);
        }
      }
      this.failures = 0;
      this.retryAt = 0;
      return true;
    } catch (error) {
      if (error instanceof SaveConflict) this.blocked = true;
      else this.retryAt = now() + Math.min(30_000, 1200 * 2 ** Math.min(this.failures++, 5));
      throw error;
    }
  }
}
