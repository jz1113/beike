import { z } from 'zod';

const salesPromptSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  description: z.string(),
  prompt: z.string().min(1),
  defaultPrompt: z.string().min(1),
  version: z.string().min(1),
  customized: z.boolean(),
});

export const salesPromptListSchema = z.object({
  success: z.literal(true), prompts: z.array(salesPromptSchema),
});
export const salesPromptResultSchema = z.object({
  success: z.literal(true), prompt: salesPromptSchema,
});
export type SalesPrompt = z.infer<typeof salesPromptSchema>;
