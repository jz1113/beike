import { JEWELRY_ALL_MASTER_SNIPPET } from './jewelryMasterSnippet';
import { ShotPrompt } from '@beike/domain/vision';

export interface MasterRecipe {
  id: string;
  name: string;
  category?: string;
  tag?: string;
  promptSnippet?: string;
}

// 官方唯一的 8 段式高保真拍摄大架构（与配方库保持 100% 一致）
export const SYSTEM_MASTER_RECIPES: MasterRecipe[] = [
  {
    id: 'recipe_jewelry_master',
    name: '珠宝首饰全品类 (V6.0)',
    category: 'jewelry_luxury',
    tag: '8段式高保真拍摄大架构 V6.0 (资产库联动版)',
    promptSnippet: JEWELRY_ALL_MASTER_SNIPPET
  }
];

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
  error?: string;
  recoveryRequired?: boolean;
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
  selected: boolean;

  // 全量分类图片池
  allTypedImages: TypedProductImage[];
  selectedProductImages: string[];

  // 爆款复刻专属
  referenceUrl?: string;
  availableReferenceImages: string[];
  selectedReferenceImages: string[];
  isRefParsing?: boolean;

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

  // 生图任务队列专属
  tasks: BatchTaskItem[];

  // 配套 AI 种草文案
  copywriting?: BatchCopywriting;
  isCopywritingGenerating?: boolean;
  copywritingError?: string;
}
