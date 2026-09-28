import { z } from 'zod';

export const localCategoryReportSchema = z.object({
  parentId: z.enum(['jewelry', 'digital_3c', 'apparel', 'bag', 'shoes', 'beauty', 'eyewear', 'universal']),
  categories: z.array(z.object({
    id: z.string(),
    parentId: z.string(),
    label: z.string(),
    shortLabel: z.string().optional(),
    keywords: z.array(z.string()).default([]),
    anatomy: z.string().optional(),
    isCustom: z.boolean().optional(),
  })).default([]),
});

export const categoryMigrationPreviewRequestSchema = z.object({
  local: z.array(localCategoryReportSchema).default([]),
});

export const categoryMigrationApplyRequestSchema = z.object({
  items: z.array(z.object({
    id: z.string(),
    parentId: z.string(),
    label: z.string(),
    keywords: z.array(z.string()).default([]),
    anatomy: z.string().optional(),
  })).min(1),
});
