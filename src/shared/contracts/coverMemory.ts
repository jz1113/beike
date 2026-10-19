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
});

export const CoverMemoryUsageSchema = z.object({
  id: z.string(),
  batchId: z.string(),
  itemId: z.string(),
  itemTitle: z.string(),
  entryIds: z.array(z.string()),
  design: z.record(z.string(), z.string()),
  createdAt: z.string(),
});

export const CoverMemoryResponseSchema = z.object({
  success: z.boolean(),
  entries: z.array(CoverMemoryEntrySchema).default([]),
  samples: z.array(CoverMemorySampleSchema).default([]),
  usages: z.array(CoverMemoryUsageSchema).default([]),
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
