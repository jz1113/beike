export class KeywordReviewOwnershipError extends Error {
  readonly code = 'ownership';
  constructor(message: string) {
    super(message);
    this.name = 'KeywordReviewOwnershipError';
  }
}

/** Hold one workspace's task exclusively until the caller has finished saving its progress. */
export function createKeywordReviewSessionOwnership(scope: string) {
  let held = false;
  let releaseLock: (() => void) | null = null;
  let acquiring: Promise<void> | null = null;
  let lockLifetime: Promise<unknown> | null = null;

  const acquire = (): Promise<void> => {
    if (held) return Promise.resolve();
    if (acquiring) return acquiring;
    if (typeof navigator === 'undefined' || !navigator.locks?.request) {
      return Promise.reject(new KeywordReviewOwnershipError('当前浏览器不支持安全的多页面任务保护，请使用支持 Web Locks 的浏览器'));
    }
    acquiring = new Promise<void>((resolve, reject) => {
      lockLifetime = navigator.locks.request(`beike-keyword-review:${scope}`, { ifAvailable: true }, async (lock) => {
        if (!lock) {
          reject(new KeywordReviewOwnershipError('此工作区的词包审核已在另一页面打开，请关闭该页面后重试'));
          return;
        }
        held = true;
        resolve();
        await new Promise<void>((done) => { releaseLock = done; });
        held = false;
        releaseLock = null;
      });
      void lockLifetime.catch((error) => {
        held = false;
        releaseLock = null;
        reject(error instanceof Error ? error : new KeywordReviewOwnershipError('无法取得词包审核任务的页面保护锁'));
      });
    }).finally(() => { acquiring = null; });
    return acquiring;
  };

  const release = async (): Promise<void> => {
    if (acquiring) await acquiring.catch(() => {});
    releaseLock?.();
    await lockLifetime?.catch(() => {});
  };

  const assertHeld = () => {
    if (!held) throw new KeywordReviewOwnershipError('尚未取得此工作区的任务保护锁，本地进度未被读取或修改');
  };
  return { acquire, release, assertHeld };
}
