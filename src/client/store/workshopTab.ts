import type { WorkshopTab } from './types';

/** Older bookmarks and restored view state used a separate category manager. */
export function normalizeWorkshopTab(value: unknown): WorkshopTab {
  if (value === 'categories' || value === 'prompt_assets' || value === 'recipes') return 'prompt_assets';
  return 'studio';
}
