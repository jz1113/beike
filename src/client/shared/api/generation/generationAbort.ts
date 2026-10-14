import { imageGenBusinessError } from '@client/shared/api/generation/generationErrors';

export const GENERATION_CANCELLED_MESSAGE = '已取消生图任务';

export function throwIfGenerationAborted(isAborted: () => boolean): void {
  if (isAborted()) {
    throw imageGenBusinessError(GENERATION_CANCELLED_MESSAGE);
  }
}

export function isGenerationCancelled(error: unknown, signal?: AbortSignal): boolean {
  if (signal?.aborted) return true;
  if (!error) return false;
  if (typeof error === 'object' && error !== null && 'name' in error && (error as { name?: string }).name === 'AbortError') {
    return true;
  }
  return error instanceof Error && error.message === GENERATION_CANCELLED_MESSAGE;
}

export async function sleepWhilePolling(
  ms: number,
  isAborted: () => boolean,
  isPaused?: () => boolean,
): Promise<void> {
  const step = 200;
  let elapsed = 0;
  while (elapsed < ms) {
    throwIfGenerationAborted(isAborted);
    while (isPaused?.()) {
      throwIfGenerationAborted(isAborted);
      await new Promise<void>((resolve) => {
        setTimeout(resolve, step);
      });
    }
    const chunk = Math.min(step, ms - elapsed);
    await new Promise<void>((resolve) => {
      setTimeout(resolve, chunk);
    });
    elapsed += chunk;
  }
  throwIfGenerationAborted(isAborted);
}

export async function waitWhilePaused(isPaused: () => boolean, isAborted: () => boolean): Promise<void> {
  while (isPaused()) {
    throwIfGenerationAborted(isAborted);
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 200);
    });
  }
}
