import { z } from 'zod';
import { workshopSnapshotSchema } from './workshopWorkspace';
import { workshopBatchStatusSchema } from './workshopPipeline';

export { workshopBatchStatusSchema };
export type { WorkshopBatchStatus } from './workshopPipeline';

export const workshopBatchIdSchema = z.string().min(1).max(128).regex(/^[a-zA-Z0-9_-]+$/);

export const workshopBatchSchema = z.object({
  id: workshopBatchIdSchema,
  name: z.string().trim().min(1).max(120),
  status: workshopBatchStatusSchema,
  revision: z.number().int().min(1),
  snapshot: workshopSnapshotSchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  legacyRecovered: z.boolean().optional(),
});
export type WorkshopBatch = z.infer<typeof workshopBatchSchema>;

export const workshopBatchSummarySchema = workshopBatchSchema.omit({ snapshot: true }).extend({
  itemCount: z.number().int().min(0),
  readyCount: z.number().int().min(0),
  taskCount: z.number().int().min(0),
  hasInput: z.boolean().optional(),
  resultCount: z.number().int().min(0).optional(),
  failedCount: z.number().int().min(0).optional(),
  productTitles: z.array(z.string()).max(200).optional(),
  productIds: z.array(z.string()).max(200).optional(),
  previewImages: z.array(z.string()).max(4).optional(),
});
export type WorkshopBatchSummary = z.infer<typeof workshopBatchSummarySchema>;

export const workshopBatchWriteSchema = z.object({
  revision: z.number().int().min(1),
  snapshot: workshopSnapshotSchema,
});

export const workshopBatchCreateSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
});

export const workshopBatchRenameSchema = z.object({
  name: z.string().trim().min(1).max(120),
});
