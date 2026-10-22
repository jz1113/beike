import { isWorkshopAssetEligible } from '@shared/domain/workshop/workshop-pipeline';
import { hasActivePromptGroupFolders } from '@shared/domain/assets/promptGroupFolders';
import type { AssetProductCategory } from '@shared/domain/assets/assetOrganization';
import type { AssetLibrarySlim } from '@shared/domain/assets/assetLibraryTypes';

export interface WorkshopRecipeSummary {
  id: string;
  name: string;
  category: string;
  tag: string;
  promptSnippet: string;
  libraryVersion?: string;
}

export function nextWorkshopRecipeSelection(recipes: WorkshopRecipeSummary[], selectedId: string): string | null {
  if (selectedId !== 'auto' && !recipes.some((recipe) => recipe.id === selectedId)) return recipes.length ? 'auto' : '';
  if (selectedId === 'auto' && recipes.length === 0) return '';
  return null;
}

export function filterWorkshopLibrary(store: {
  personas: AssetLibrarySlim[];
  scenes: AssetLibrarySlim[];
  outfits: AssetLibrarySlim[];
  actions: AssetLibrarySlim[];
  fullPrompts: AssetLibrarySlim[];
  productCategories: AssetProductCategory[];
}) {
  return {
    personas: store.personas.filter((row) => isWorkshopAssetEligible(row, 'persona')),
    scenes: store.scenes.filter((row) => isWorkshopAssetEligible(row, 'scene')),
    outfits: store.outfits.filter((row) => isWorkshopAssetEligible(row, 'outfit')),
    actions: store.actions.filter((row) => isWorkshopAssetEligible(row, 'action')),
    fullPrompts: store.fullPrompts.filter((row) => isWorkshopAssetEligible(row, 'full_prompt') && hasActivePromptGroupFolders(row, store.productCategories)),
    productCategories: store.productCategories,
  };
}
