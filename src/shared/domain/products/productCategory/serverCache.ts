import type { ActionCategoryId, SubCategoryDef } from './defs';

const hydrated = new Map<ActionCategoryId, SubCategoryDef[]>();

export function hydrateSubCategoriesFromServer(map: Partial<Record<ActionCategoryId, SubCategoryDef[]>>): void {
  hydrated.clear();
  for (const [id, list] of Object.entries(map)) {
    if (Array.isArray(list) && list.length > 0) {
      hydrated.set(id as ActionCategoryId, list);
    }
  }
}

export function getHydratedSubCategories(categoryId: ActionCategoryId): SubCategoryDef[] | undefined {
  return hydrated.get(categoryId);
}

export function clearHydratedSubCategories(): void {
  hydrated.clear();
}
