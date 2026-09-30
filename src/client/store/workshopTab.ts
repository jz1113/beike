import type { WorkshopTab } from './types';

/** Older bookmarks and restored view state used a separate category manager. */
export function normalizeWorkshopTab(value: unknown): WorkshopTab {
  if (value === 'categories' || value === 'prompt_assets') return 'prompt_assets';
  if (value === 'recipes') return 'recipes';
  return 'studio';
}
