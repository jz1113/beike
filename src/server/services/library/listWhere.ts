import { buildAssetCategoryWhere } from './categoryWhere';
import { organizationWhereForSearch } from '@server/repositories/assetOrganization';

export async function buildLibraryListWhere(assetType: string, searchParams: URLSearchParams, keywordFields: string[]) {
  const category = searchParams.get('category');
  const keyword = (searchParams.get('keyword') || '').trim();
  const isFavorite = searchParams.get('isFavorite') === 'true' ? true : undefined;
  const and: Record<string, unknown>[] = [];
  if (category && category !== 'all') {
    const categoryOr = buildAssetCategoryWhere(assetType === 'scene_bundle' ? 'scene' : assetType, category);
    if (categoryOr) and.push({ OR: categoryOr });
  }
  if (keyword) and.push({ OR: keywordFields.map((field) => ({ [field]: { contains: keyword } })) });
  if (isFavorite !== undefined) and.push({ isFavorite });
  and.push(...await organizationWhereForSearch(searchParams));
  return and.length ? { AND: and } : {};
}
