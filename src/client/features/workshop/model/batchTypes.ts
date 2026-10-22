import type { OutputRating } from '@shared/contracts/categorySkills';
import { OFFICIAL_MASTER_RECIPES } from '@shared/domain/prompts/masterRecipes';
import { ShotPrompt } from '@shared/domain/prompts/vision';

export interface MasterRecipe {
  id: string;
  name: string;
  category?: string;
  tag?: string;
  promptSnippet?: string;
}

// 官方 8 段式高保真拍摄大架构（与配方库 / masterRecipes 保持一致，禁止删除）
export const SYSTEM_MASTER_RECIPES: MasterRecipe[] = OFFICIAL_MASTER_RECIPES.map((recipe) => ({
  id: recipe.id,
  name: recipe.name,
  category: recipe.category,
  tag: recipe.tag,
  promptSnippet: recipe.promptSnippet,
}));

export interface TypedProductImage {
  url: string;
  type: 'main' | 'sku' | 'detail';
}

export interface BatchTaskItem {
  id: string;
  shot_no: number;
  title: string;
  prompt: string;
  status: 'PENDING' | 'IN_PROGRESS' | 'SUCCESS' | 'FAILURE';
  resultUrl?: string;
  temporaryUrl?: boolean;
  error?: string;
  recoveryRequired?: boolean;
  revision?: number;
  resultStatus?: 'current' | 'superseded';
  idempotencyKey?: string;
  upstreamTaskId?: string;
  gridTaskKey?: string;
  gridSourceUrl?: string;
  gridSize?: string;
  /** Frozen expected delivery dimensions for this attempt (not a measurement of the product). */
  outputSize?: string;
  /** Upstream canvas size, which can differ from the final cropped delivery size. */
  generationSize?: string;
  attempt?: number;
  learningContext?: { scopeId: string; versionId: string; referenceFingerprint: string; baseRecipeVersion: string; groupId: string; productImages: string[]; referenceImage: string; model: string; aspectRatio: string; quality: string; strategy: string; anchorFaceUrl: string; replacements: string[] };
  outputRating?: OutputRating;
  outputReview?: 'unreviewed' | 'accepted' | 'retry_requested' | 'rejected';
}

export type GenerationStrategy = 'grid_first' | 'single_shot';

export interface BatchCopywriting {
  title: string;
  content: string;
  tags?: string[];
}

export interface BatchProductItem {
  id: string;
  itemId: string;
  platform: 'jd' | 'taobao' | 'tmall' | '1688';
  url?: string;
  title: string;
  price: number;
  category: string;
  brand: string;
  coverImage: string;
  mainImages: string[];
  skuImages: string[];
  detailImages: string[];
  props: Record<string, string>;
  status: 'pending' | 'collecting' | 'success' | 'failed';
  errorMsg?: string;
  fromCache?: boolean;
  apiUsed?: string;
  selected: boolean;

  // 全量分类图片池
  allTypedImages: TypedProductImage[];
  selectedProductImages: string[];

  // 原创生成专属（完全对接单个模式的多模态分析结构）
  isAnalyzing?: boolean;
  analyzedSuccess?: boolean;
  analysisError?: string;
  lookBible?: string;
  identityBible?: string;
  styleBible?: string;
  masterScene?: string;
  productRole?: any;
  productFingerprint?: string;
  lookParts?: any;
  prompts: ShotPrompt[];

  // 2x2 四宫格直出大图与提示词
  masterGridUrl?: string;
  gridPrompt?: string;

  // 装配原子资产元数据
  applied_scene?: string;
  applied_outfit?: string;
  applied_persona?: string;
  appliedFullPromptId?: string;
  appliedFullPromptTitle?: string;
  appliedFullPromptDisplayNumber?: number | null;
  appliedFullPromptGroupIndex?: number | null;
  appliedFullPromptAlbumName?: string | null;
  appliedFullPromptSelectionMode?: 'manual' | 'auto';
  appliedFullPromptAppearance?: 'human' | 'product' | 'unknown';
  appliedFullPromptEligibleCount?: number;
  appliedFullPromptInventoryCount?: number;
  appliedSkillSnapshot?: { id: string; name: string; promptSnippet: string; updatedAt?: string; libraryVersion?: string; learningScopeId?: string; learningVersionId?: string; learningReferenceFingerprint?: string; baseRecipeVersion?: string };

  // 生图任务队列专属
  tasks: BatchTaskItem[];

  // 配套 AI 种草文案
  copywriting?: BatchCopywriting;
  isCopywritingGenerating?: boolean;
  copywritingError?: string;
}

/** Use the collected category consistently in preview, preflight and analysis. */
export function productPropsWithCategory(item: Pick<BatchProductItem, 'props' | 'category'>): Record<string, string> {
  const props = item.props || {};
  const category = item.category?.trim();
  return category && !props['商品类目'] ? { ...props, 商品类目: category } : props;
}
