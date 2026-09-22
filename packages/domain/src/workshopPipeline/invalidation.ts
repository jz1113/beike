export const INVALIDATION_CHANGE_TYPES = [
  'product_images',
  'product_semantics',
  'architecture',
  'locked_assets',
  'shot_count',
  'shot_prompt',
  'generation_params',
  'copywriting_rules',
  'concurrency',
] as const;

export type InvalidationChangeType = (typeof INVALIDATION_CHANGE_TYPES)[number];

export type InvalidationScope = 'keep' | 'all' | 'shot' | 'ungenerated';

export interface InvalidationChange {
  type: InvalidationChangeType;
  productId?: string;
  shotNo?: number;
}

export interface InvalidationEffect {
  collection: 'keep' | 'update';
  plan: 'keep' | 'update' | 'rerecommend';
  storyboard: InvalidationScope;
  tasks: InvalidationScope;
  copywriting: InvalidationScope;
  reason: string;
}

const MATRIX: Record<InvalidationChangeType, InvalidationEffect> = {
  product_images: {
    collection: 'keep',
    plan: 'keep',
    storyboard: 'all',
    tasks: 'all',
    copywriting: 'all',
    reason: '商品事实源改变',
  },
  product_semantics: {
    collection: 'update',
    plan: 'rerecommend',
    storyboard: 'all',
    tasks: 'all',
    copywriting: 'all',
    reason: '商品语义改变',
  },
  architecture: {
    collection: 'keep',
    plan: 'update',
    storyboard: 'all',
    tasks: 'all',
    copywriting: 'all',
    reason: '分镜骨架改变',
  },
  locked_assets: {
    collection: 'keep',
    plan: 'update',
    storyboard: 'all',
    tasks: 'all',
    copywriting: 'all',
    reason: '提示词输入改变',
  },
  shot_count: {
    collection: 'keep',
    plan: 'update',
    storyboard: 'all',
    tasks: 'all',
    copywriting: 'all',
    reason: '任务结构改变',
  },
  shot_prompt: {
    collection: 'keep',
    plan: 'keep',
    storyboard: 'shot',
    tasks: 'shot',
    copywriting: 'shot',
    reason: '最小化重做范围',
  },
  generation_params: {
    collection: 'keep',
    plan: 'update',
    storyboard: 'keep',
    tasks: 'ungenerated',
    copywriting: 'keep',
    reason: '不重复视觉分析',
  },
  copywriting_rules: {
    collection: 'keep',
    plan: 'keep',
    storyboard: 'keep',
    tasks: 'keep',
    copywriting: 'all',
    reason: '独立生产支路',
  },
  concurrency: {
    collection: 'keep',
    plan: 'keep',
    storyboard: 'keep',
    tasks: 'keep',
    copywriting: 'keep',
    reason: '只影响调度',
  },
};

export function computeInvalidation(change: InvalidationChange): InvalidationEffect {
  return { ...MATRIX[change.type] };
}

export function shouldInvalidateTarget(
  scope: InvalidationScope,
  target: { shotNo?: number; generated?: boolean },
  change: InvalidationChange,
): boolean {
  if (scope === 'keep') return false;
  if (scope === 'all') return true;
  if (scope === 'ungenerated') return !target.generated;
  if (scope === 'shot') {
    return typeof change.shotNo === 'number' && target.shotNo === change.shotNo;
  }
  return false;
}
