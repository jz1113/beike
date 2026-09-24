import { z } from 'zod';
import {
  workshopBatchStatusSchema,
  workshopPipelineStateSchema,
  type WorkshopPipelineState,
} from './workshopPipeline';

export const workspaceIdSchema = z.literal('original');
const strings = z.array(z.string()).max(2000);
const resultRevisionStatus = z.enum(['current', 'superseded']);
const lockedId = z.string().transform((value) => (value === '' ? 'auto' : value));

const task = z.object({
  id: z.string(),
  shot_no: z.number().int(),
  title: z.string(),
  prompt: z.string(),
  status: z.enum(['PENDING', 'IN_PROGRESS', 'SUCCESS', 'FAILURE']),
  resultUrl: z.string().optional(),
  temporaryUrl: z.boolean().optional(),
  error: z.string().optional(),
  recoveryRequired: z.boolean().optional(),
  revision: z.number().int().min(0).default(0),
  resultStatus: resultRevisionStatus.default('current'),
  idempotencyKey: z.string().optional(),
  upstreamTaskId: z.string().optional(),
  attempt: z.number().int().min(0).optional(),
  outputReview: z.enum(['unreviewed', 'accepted', 'retry_requested', 'rejected']).default('unreviewed'),
});

const prompt = z.object({
  shot_no: z.number().int(),
  prompt: z.string(),
  title: z.string().optional(),
  revision: z.number().int().min(0).default(0),
  resultStatus: resultRevisionStatus.default('current'),
}).passthrough();

const product = z.object({
  id: z.string(), itemId: z.string(), platform: z.enum(['jd', 'taobao', 'tmall', '1688']),
  title: z.string(), price: z.number(), category: z.string(), brand: z.string(), coverImage: z.string(),
  mainImages: strings, skuImages: strings, detailImages: strings, props: z.record(z.string()),
  status: z.enum(['pending', 'collecting', 'success', 'failed']), selected: z.boolean(),
  allTypedImages: z.array(z.object({ url: z.string(), type: z.enum(['main', 'sku', 'detail']) })),
  selectedProductImages: strings,
  prompts: z.array(prompt),
  tasks: z.array(task),
  skipped: z.boolean().optional(),
  preparationStatus: z.enum(['pending', 'collecting', 'ready', 'needs_attention', 'failed', 'skipped']).optional(),
}).passthrough();

const settingsSchema = z.object({
  selectedVisionModel: z.string(),
  selectedImageGenModel: z.string(),
  selectedArchId: z.string(),
  /** @deprecated 人物出镜由 personaMode 决定；保留仅为解析旧快照 */
  hasHumanPersona: z.boolean().default(true),
  personaMode: z.enum(['asset_driven', 'none']).default('asset_driven'),
  selectedQuality: z.enum(['high', 'medium', 'low']),
  selectedAspect: z.enum(['3:4', '1:1', '9:16', '16:9']),
  selectedShotCount: z.number().int().min(1).max(100),
  useAssetLibrary: z.boolean(),
  lockedPersonaId: lockedId,
  lockedSceneId: lockedId,
  lockedOutfitId: lockedId,
  lockedActionId: lockedId,
  lockedFullPromptId: z.string().optional().transform((value) => (!value || value === '' ? 'auto' : value)),
  generationStrategy: z.enum(['grid_first', 'single_shot']),
  autoGenerateCopywriting: z.boolean().default(true),
});

const snapshotBase = {
  mode: workspaceIdSchema,
  currentStage: z.number().int().min(1).max(4),
  batchInputText: z.string().max(100000),
  items: z.array(product).max(200),
  settings: settingsSchema,
};

export const workshopSnapshotV1Schema = z.object({
  version: z.literal(1),
  ...snapshotBase,
});

export const workshopSnapshotV2Schema = z.object({
  version: z.literal(2),
  ...snapshotBase,
  pipeline: workshopPipelineStateSchema,
});

export type WorkshopSnapshotV1 = z.infer<typeof workshopSnapshotV1Schema>;
export type WorkshopSnapshotV2 = z.infer<typeof workshopSnapshotV2Schema>;
export type WorkshopSnapshot = WorkshopSnapshotV2;

function deriveLegacyPipelineStatus(snapshot: WorkshopSnapshotV1): WorkshopPipelineState['status'] {
  if (snapshot.items.length === 0) return 'draft';
  const stage = snapshot.currentStage;
  if (stage === 1) return 'collecting';
  if (stage === 2) return 'plan_ready';
  if (stage === 3) {
    const hasStoryboard = snapshot.items.some((item) => Array.isArray(item.prompts) && item.prompts.length > 0);
    return hasStoryboard ? 'review_required' : 'analyzing';
  }
  const tasks = snapshot.items.flatMap((item) => item.tasks);
  const hasFailed = tasks.some((task) => task.status === 'FAILURE');
  const allSucceeded = tasks.length > 0 && tasks.every((task) => task.status === 'SUCCESS');
  const running = tasks.some((task) => task.status === 'PENDING' || task.status === 'IN_PROGRESS');
  if (running) return 'generating';
  if (hasFailed) return 'partial_failed';
  if (allSucceeded) return 'qc_required';
  return 'generating';
}

export function emptyPipelineState(status: WorkshopPipelineState['status'] = 'draft'): WorkshopPipelineState {
  return {
    status,
    planRevision: 0,
    storyboardRevision: 0,
    diversityContext: { groupSignatures: [], actionIds: [], sceneIds: [] },
    runs: [],
  };
}

export function upgradeSnapshot(snapshot: WorkshopSnapshotV1 | WorkshopSnapshotV2): WorkshopSnapshotV2 {
  if (snapshot.version === 2) return snapshot;
  return {
    ...snapshot,
    version: 2,
    pipeline: emptyPipelineState(deriveLegacyPipelineStatus(snapshot)),
  };
}

export const workshopSnapshotSchema = z
  .union([workshopSnapshotV2Schema, workshopSnapshotV1Schema])
  .transform(upgradeSnapshot);

export const workspaceWriteSchema = z.object({
  revision: z.number().int().min(0),
  snapshot: workshopSnapshotSchema,
});

export function snapshotFixture(): WorkshopSnapshot {
  return upgradeSnapshot(workshopSnapshotV1Schema.parse({
    version: 1, mode: 'original', currentStage: 3, batchInputText: '123456', items: [{
      id: 'one', itemId: '123456', platform: 'jd', title: '手机', price: 100, category: '手机', brand: '', coverImage: '/storage/one.png',
      mainImages: [], skuImages: [], detailImages: [], props: {}, status: 'success', selected: true,
      allTypedImages: [], selectedProductImages: ['/storage/one.png'],
      prompts: [{ shot_no: 1, prompt: '原始提示词', selected: true }], tasks: [],
    }], settings: {
      selectedVisionModel: 'vision', selectedImageGenModel: 'image', selectedArchId: 'arch',
      hasHumanPersona: true, selectedQuality: 'high', selectedAspect: '3:4', selectedShotCount: 4,
      useAssetLibrary: true, lockedPersonaId: '', lockedSceneId: '', lockedOutfitId: '', lockedActionId: '', lockedFullPromptId: '',
      generationStrategy: 'single_shot',
      autoGenerateCopywriting: true,
    },
  }));
}
