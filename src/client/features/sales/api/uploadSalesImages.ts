import { uploadStudioFile } from '@client/shared/api/uploadStudioFile';
import { mapWithLimit } from '../model/salesAssetHelpers';

/** Preserve successful uploads and input order when another upload fails. */
export async function uploadSalesImages(files: File[], signal?: AbortSignal): Promise<{ urls: string[]; failed: number }> {
  const results = await mapWithLimit(files, 3, async (file) => {
    if (signal?.aborted) return null;
    try { return await uploadStudioFile(file, 'video-sales', signal); } catch { return null; }
  });
  return { urls: results.filter((url): url is string => Boolean(url)), failed: results.filter((url) => !url).length };
}
