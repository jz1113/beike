import { uploadStudioFile } from '@client/shared/api/uploadStudioFile';

/** Preserve successful uploads and input order when another upload fails. */
export async function uploadSalesImages(files: File[], signal?: AbortSignal): Promise<{ urls: string[]; failed: number }> {
  const results: (string | null)[] = Array.from({ length: files.length }, () => null);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(3, files.length) }, async () => {
    while (next < files.length && !signal?.aborted) {
      const index = next++;
      try { results[index] = await uploadStudioFile(files[index], 'video-sales', signal); } catch { /* Retain other successful uploads. */ }
    }
  }));
  return { urls: results.filter((url): url is string => Boolean(url)), failed: results.filter((url) => !url).length };
}
