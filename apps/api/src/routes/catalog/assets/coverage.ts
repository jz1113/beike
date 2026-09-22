import { jsonOk } from '../../../core/handler';
import { buildAssetCoverage } from '../../../services/promptAsset/coverage';
import { db } from '../../../repositories/access';

export async function COVERAGE() {
  const categories = await db.assetProductCategory.findMany({ orderBy: [{ position: 'asc' }, { id: 'asc' }] });
  const categoryIds = categories.map((row) => row.id);
  return jsonOk(await buildAssetCoverage(categoryIds.length ? categoryIds : ['jewelry']));
}
