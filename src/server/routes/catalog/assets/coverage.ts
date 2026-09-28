import { jsonOk } from '../../../core/handler';
import { buildAssetCoverage } from '../../../services/promptAsset/coverage';
import { listAssetCategoryIds } from '@server/repositories/assetCoverage';

export async function COVERAGE() {
  const categoryIds = await listAssetCategoryIds();
  return jsonOk(await buildAssetCoverage(categoryIds.length ? categoryIds : ['jewelry']));
}
