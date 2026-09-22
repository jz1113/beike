import type { OutputReviewDecision, ProductPreparationStatus } from './states';

export interface GateBlocker {
  code: string;
  message: string;
}

export interface GateResult {
  passed: boolean;
  blockers: GateBlocker[];
}

export interface Stage1ProductInput {
  id: string;
  selected: boolean;
  preparationStatus: ProductPreparationStatus;
  hasAnchorImage: boolean;
  categoryId?: string;
}

export interface Stage1GateInput {
  products: Stage1ProductInput[];
  mixedCategoryAcknowledged?: boolean;
}

export interface Stage2ProductInput {
  id: string;
  selected: boolean;
  selectedImageCount: number;
  hasCompatibleArchitecture: boolean;
}

export interface Stage2LockedAsset {
  assetId: string;
  published: boolean;
  conflicts: string[];
}

export interface Stage2GateInput {
  products: Stage2ProductInput[];
  lockedAssets: Stage2LockedAsset[];
  estimatedTaskCount: number;
  planConfirmed: boolean;
}

export interface Stage3ProductInput {
  id: string;
  selected: boolean;
  hasStructuredStoryboard: boolean;
  blockingIssues: number;
  warningsConfirmed: boolean;
}

export interface Stage3GateInput {
  products: Stage3ProductInput[];
  storyboardApproved: boolean;
}

export interface Stage4ProductInput {
  id: string;
  selected: boolean;
  skipped: boolean;
  acceptedCount: number;
  reviewDecisions: OutputReviewDecision[];
}

export interface Stage4TaskInput {
  id: string;
  terminal: boolean;
  recoveryRequired?: boolean;
}

export interface Stage4GateInput {
  products: Stage4ProductInput[];
  tasks: Stage4TaskInput[];
  copywritingReady: boolean;
  userCompleted: boolean;
}

function result(blockers: GateBlocker[]): GateResult {
  return { passed: blockers.length === 0, blockers };
}

export function evaluateStage1Gate(input: Stage1GateInput): GateResult {
  const blockers: GateBlocker[] = [];
  const continuing = input.products.filter((product) => product.selected && product.preparationStatus !== 'skipped');
  const ready = continuing.filter((product) => product.preparationStatus === 'ready');

  if (ready.length === 0) {
    blockers.push({ code: 'NO_READY_PRODUCT', message: '至少需要一款可生产商品才能进入制作方案' });
  }

  for (const product of continuing) {
    if (product.preparationStatus === 'ready' && !product.hasAnchorImage) {
      blockers.push({ code: 'MISSING_ANCHOR', message: `商品 ${product.id} 缺少可用的商品锚点图` });
    }
    if (product.preparationStatus === 'failed' || product.preparationStatus === 'needs_attention') {
      blockers.push({
        code: 'UNRESOLVED_PRODUCT',
        message: `商品 ${product.id} 仍待修复或明确跳过`,
      });
    }
    if (product.preparationStatus === 'pending' || product.preparationStatus === 'collecting') {
      blockers.push({
        code: 'COLLECTION_INCOMPLETE',
        message: `商品 ${product.id} 尚未完成采集`,
      });
    }
  }

  const categories = new Set(
    ready.map((product) => product.categoryId).filter((id): id is string => Boolean(id)),
  );
  if (categories.size > 1 && !input.mixedCategoryAcknowledged) {
    blockers.push({ code: 'MIXED_CATEGORY', message: '本批包含不兼容类目，请确认拆批建议或明确继续' });
  }

  return result(blockers);
}

export function evaluateStage2Gate(input: Stage2GateInput): GateResult {
  const blockers: GateBlocker[] = [];
  const products = input.products.filter((product) => product.selected);

  if (products.length === 0) {
    blockers.push({ code: 'NO_SELECTED_PRODUCT', message: '请至少选择一款商品确认制作方案' });
  }

  for (const product of products) {
    if (product.selectedImageCount < 1) {
      blockers.push({ code: 'NO_PRODUCT_IMAGE', message: `商品 ${product.id} 至少需要一张已确认商品图` });
    }
    if (!product.hasCompatibleArchitecture) {
      blockers.push({ code: 'NO_ARCHITECTURE', message: `商品 ${product.id} 缺少适配拍摄架构，请拆入合适分组` });
    }
  }

  for (const asset of input.lockedAssets) {
    if (!asset.published) {
      blockers.push({ code: 'LOCKED_ASSET_UNPUBLISHED', message: `锁定资产 ${asset.assetId} 尚未发布，不能用于生产` });
    }
    for (const conflict of asset.conflicts) {
      blockers.push({ code: 'ASSET_CONFLICT', message: conflict });
    }
  }

  if (input.estimatedTaskCount <= 0) {
    blockers.push({ code: 'TASK_COUNT_UNKNOWN', message: '任务数尚未可计算，请确认分镜数量与生成策略' });
  }

  if (!input.planConfirmed) {
    blockers.push({ code: 'PLAN_UNCONFIRMED', message: '请确认本批制作方案后再进入分析' });
  }

  return result(blockers);
}

export function evaluateStage3Gate(input: Stage3GateInput): GateResult {
  const blockers: GateBlocker[] = [];
  const products = input.products.filter((product) => product.selected);

  for (const product of products) {
    if (!product.hasStructuredStoryboard) {
      blockers.push({ code: 'MISSING_STORYBOARD', message: `商品 ${product.id} 还没有结构化分镜` });
    }
    if (product.blockingIssues > 0) {
      blockers.push({
        code: 'BLOCKING_QUALITY',
        message: `商品 ${product.id} 仍有 ${product.blockingIssues} 项阻断检查`,
      });
    }
    if (!product.warningsConfirmed) {
      blockers.push({ code: 'WARNINGS_UNCONFIRMED', message: `商品 ${product.id} 的警告项尚未确认` });
    }
  }

  if (!input.storyboardApproved) {
    blockers.push({ code: 'STORYBOARD_UNAPPROVED', message: '请批准分镜后再启动生图' });
  }

  return result(blockers);
}

export function evaluateStage4Gate(input: Stage4GateInput): GateResult {
  const blockers: GateBlocker[] = [];

  const unfinished = input.tasks.filter((task) => !task.terminal);
  if (unfinished.length > 0) {
    blockers.push({ code: 'TASKS_RUNNING', message: `还有 ${unfinished.length} 个任务未进入终态` });
  }

  const recovery = input.tasks.filter((task) => task.recoveryRequired);
  if (recovery.length > 0) {
    blockers.push({ code: 'RECOVERY_REQUIRED', message: `有 ${recovery.length} 个任务状态未知，需确认后再完成批次` });
  }

  const products = input.products.filter((product) => product.selected);
  for (const product of products) {
    if (!product.skipped && product.acceptedCount < 1) {
      blockers.push({ code: 'NO_ACCEPTED_OUTPUT', message: `商品 ${product.id} 至少需要一个采用结果，或明确跳过` });
    }
  }

  if (!input.copywritingReady) {
    blockers.push({ code: 'COPYWRITING_PENDING', message: '文案尚未生成，请完成或明确关闭自动文案' });
  }

  if (!input.userCompleted) {
    blockers.push({ code: 'USER_COMPLETE_REQUIRED', message: '请确认交付结果后再完成本批次' });
  }

  return result(blockers);
}
