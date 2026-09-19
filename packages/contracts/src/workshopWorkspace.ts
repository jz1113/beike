import { z } from 'zod';

export const workspaceIdSchema = z.enum(['original', 'replication']);
const strings = z.array(z.string()).max(2000);
const task = z.object({
  id: z.string(), shot_no: z.number().int(), title: z.string(), prompt: z.string(),
  status: z.enum(['PENDING', 'IN_PROGRESS', 'SUCCESS', 'FAILURE']),
  resultUrl: z.string().optional(), error: z.string().optional(), recoveryRequired: z.boolean().optional(),
});
// Product metadata is extensible; core fields needed to safely render a recovered draft are validated.
const product = z.object({
  id: z.string(), itemId: z.string(), platform: z.enum(['jd', 'taobao', 'tmall', '1688']),
  title: z.string(), price: z.number(), category: z.string(), brand: z.string(), coverImage: z.string(),
  mainImages: strings, skuImages: strings, detailImages: strings, props: z.record(z.string()),
  status: z.enum(['pending', 'collecting', 'success', 'failed']), selected: z.boolean(),
  allTypedImages: z.array(z.object({ url: z.string(), type: z.enum(['main', 'sku', 'detail']) })),
  selectedProductImages: strings, availableReferenceImages: strings, selectedReferenceImages: strings,
  prompts: z.array(z.object({ shot_no: z.number().int(), prompt: z.string(), title: z.string().optional() }).passthrough()),
  tasks: z.array(task),
}).passthrough();
export const workshopSnapshotSchema = z.object({
  version: z.literal(1), mode: workspaceIdSchema,
  currentStage: z.number().int().min(1).max(5), batchInputText: z.string().max(100000),
  items: z.array(product).max(200),
  settings: z.object({
    selectedVisionModel: z.string(), selectedImageGenModel: z.string(), selectedArchId: z.string(),
    hasHumanPersona: z.boolean(), selectedQuality: z.enum(['high', 'medium', 'low']),
    selectedAspect: z.enum(['3:4', '1:1', '9:16', '16:9']), selectedShotCount: z.number().int().min(1).max(100),
    useAssetLibrary: z.boolean(), lockedPersonaId: z.string(), lockedSceneId: z.string(), lockedOutfitId: z.string(), lockedActionId: z.string(),
    generationStrategy: z.enum(['grid_first', 'single_shot']),
    replicationInputMode: z.enum(['one_to_one', 'matrix']), matrixMasterRefUrl: z.string(), matrixMasterRefImages: strings,
  }),
});
export type WorkshopSnapshot = z.infer<typeof workshopSnapshotSchema>;
export const workspaceWriteSchema = z.object({ revision: z.number().int().min(0), snapshot: workshopSnapshotSchema });

export function snapshotFixture(): WorkshopSnapshot {
  return {
    version: 1, mode: 'original', currentStage: 3, batchInputText: '123456', items: [{
      id: 'one', itemId: '123456', platform: 'jd', title: '手机', price: 100, category: '手机', brand: '', coverImage: '/storage/one.png',
      mainImages: [], skuImages: [], detailImages: [], props: {}, status: 'success', selected: true,
      allTypedImages: [], selectedProductImages: ['/storage/one.png'], availableReferenceImages: [], selectedReferenceImages: [],
      prompts: [{ shot_no: 1, prompt: '原始提示词', selected: true }], tasks: [],
    }], settings: {
      selectedVisionModel: 'vision', selectedImageGenModel: 'image', selectedArchId: 'arch',
      hasHumanPersona: true, selectedQuality: 'high', selectedAspect: '3:4', selectedShotCount: 4,
      useAssetLibrary: true, lockedPersonaId: '', lockedSceneId: '', lockedOutfitId: '', lockedActionId: '',
      generationStrategy: 'single_shot', replicationInputMode: 'one_to_one', matrixMasterRefUrl: '', matrixMasterRefImages: [],
    },
  };
}
