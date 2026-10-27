import { z } from 'zod';

export const CoverMemoryBranchSchema = z.enum(['layout', 'typography', 'color', 'background', 'subject', 'correction']);
export const CoverMemoryStatusSchema = z.enum(['pending', 'adopted', 'trashed']);

export const CoverMemoryEntrySchema = z.object({
  id: z.string(),
  branch: CoverMemoryBranchSchema,
  rule: z.string(),
  evidence: z.string(),
  sampleId: z.string(),
  status: CoverMemoryStatusSchema,
  source: z.enum(['sample', 'correction']),
  useCount: z.number(),
  createdAt: z.string(),
});

export const CoverMemorySampleSchema = z.object({
  id: z.string(),
  title: z.string(),
  imageUrls: z.array(z.string()),
  model: z.string(),
  status: z.enum(['running', 'completed', 'failed']),
  error: z.string(),
  createdAt: z.string(),
  requestKey: z.string().optional(),
});

export const CoverMemoryUsageSchema = z.object({
  id: z.string(),
  batchId: z.string(),
  itemId: z.string(),
  itemTitle: z.string(),
  entryIds: z.array(z.string()),
  design: z.record(z.string(), z.string()),
  rating: z.enum(['', 'good', 'bad']).optional(),
  note: z.string().optional(),
  createdAt: z.string(),
});

export const CoverMemoryRevisionSchema = z.object({
  id: z.string(), reason: z.string(), fingerprint: z.string(),
  entryCount: z.number(), sampleCount: z.number(), createdAt: z.string(),
  markdown: z.string().optional(),
});

export const CoverMemoryResponseSchema = z.object({
  success: z.boolean(),
  entries: z.array(CoverMemoryEntrySchema).default([]),
  samples: z.array(CoverMemorySampleSchema).default([]),
  usages: z.array(CoverMemoryUsageSchema).default([]),
  revisions: z.array(CoverMemoryRevisionSchema).default([]),
  nextOffset: z.number().int().nonnegative().nullable().optional(),
  error: z.string().optional(),
});

export const COVER_MEMORY_BRANCHES = [
  { id: 'layout', label: '构图' },
  { id: 'typography', label: '字体' },
  { id: 'color', label: '字色' },
  { id: 'background', label: '背景' },
  { id: 'subject', label: '主体' },
  { id: 'correction', label: '纠正' },
] as const;

export type CoverMemoryStatus = z.infer<typeof CoverMemoryStatusSchema>;
export type CoverMemoryBranch = z.infer<typeof CoverMemoryBranchSchema>;
export type CoverMemoryEntry = z.infer<typeof CoverMemoryEntrySchema>;
export type CoverMemorySample = z.infer<typeof CoverMemorySampleSchema>;
export type CoverMemoryUsage = z.infer<typeof CoverMemoryUsageSchema>;
export type CoverMemoryResponse = z.infer<typeof CoverMemoryResponseSchema>;

export type CoverMemoryRevision = z.infer<typeof CoverMemoryRevisionSchema>;
