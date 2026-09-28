import { jsonResponse } from '@server/core/http';
import { deduplicateAssetLibrary } from '@server/repositories/assetDeduplication';

export async function executeLibraryDeduplication() {
  return jsonResponse(await deduplicateAssetLibrary());
}
