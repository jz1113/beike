import { jsonResponse } from '@server/core/http';
import { purgeSeedAssetsData, clearAllAssetsData, clearLocalDatabaseData } from '@server/repositories/assetMaintenance';

export async function purgeSeedAssets() {
  return jsonResponse(await purgeSeedAssetsData());
}

export async function clearAllAssets(targetType: string) {
  return jsonResponse(await clearAllAssetsData(targetType));
}

export async function clearLocalDatabase() {
  return jsonResponse(await clearLocalDatabaseData());
}
