/** 资产库列表项（slim API 与前端缓存） */
export interface AssetLibrarySlim {
  id: string;
  title?: string | null;
  name?: string | null;
  tags?: string | null;
  category?: string | null;
  isFavorite?: boolean;
  usageCount?: number;
  createdAt?: string | Date;
  updatedAt?: string | Date;
  code?: string;
  coverUrl?: string | null;
  suitableAnatomy?: string | null;
  shotType?: string | null;
  albumName?: string | null;
  action?: string | null;
  camera?: string | null;
  description?: string | null;
  sceneSummary?: string | null;
  outfitSummary?: string | null;
  shotCount?: number;
  spatialType?: string | null;
  lighting?: string | null;
}

/** 资产库详情（含长文本与 sourceImages） */
export interface AssetLibraryItem extends AssetLibrarySlim {
  reversePrompt?: string | null;
  reversePromptZh?: string | null;
  reversePromptEn?: string | null;
  sourceImages?: string | null;
  dimensions?: string | null;
  [key: string]: unknown;
}
