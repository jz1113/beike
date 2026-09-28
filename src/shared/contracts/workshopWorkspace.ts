import { z } from 'zod';
import { workshopPipelineStateSchema } from './workshopPipeline';

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
  gridTaskKey: z.string().optional(),
  gridSourceUrl: z.string().optional(),
  gridSize: z.string().optional(),
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

/** Transport accepts both historical formats; the application adapter upgrades v1. */
export const workshopSnapshotSchema = z.union([workshopSnapshotV2Schema, workshopSnapshotV1Schema]);

export const workspaceWriteSchema = z.object({
  revision: z.number().int().min(0),
  snapshot: workshopSnapshotSchema,
});
