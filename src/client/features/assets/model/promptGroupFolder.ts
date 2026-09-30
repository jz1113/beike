import type { AssetLibrarySlim } from '@shared/domain/assets/assetLibraryTypes';

export interface PromptGroupFolder {
  id: string;
  name: string;
  items: AssetLibrarySlim[];
  isVirtual?: boolean;
}
