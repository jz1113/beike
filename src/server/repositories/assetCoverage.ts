import { db } from './access';

export async function listAssetCategoryIds(): Promise<string[]> {
  const categories = await db.assetProductCategory.findMany({ orderBy: [{ position: 'asc' }, { id: 'asc' }] });
  return categories.map((row) => row.id);
}
