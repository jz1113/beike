import { z } from 'zod';

export const PetIdSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
export const PetSpriteVersionSchema = z.union([z.literal(1), z.literal(2)]);

export const PetSummarySchema = z.object({
  id: PetIdSchema,
  displayName: z.string(),
  description: z.string(),
  spriteVersion: PetSpriteVersionSchema,
  origin: z.enum(['builtin', 'imported']),
  author: z.string().optional(),
  sourceUrl: z.string().optional(),
  revision: z.string().optional(),
  spritesheetUrl: z.string(),
});

export const PetListResponseSchema = z.object({
  success: z.literal(true),
  pets: z.array(PetSummarySchema),
});

export const PetImportRequestSchema = z.object({
  commands: z.string().min(1).max(16000),
});

export const PetImportItemSchema = z.object({
  input: z.string(),
  id: PetIdSchema.optional(),
  ok: z.boolean(),
  error: z.string().optional(),
  pet: PetSummarySchema.optional(),
});

export const PetImportResponseSchema = z.object({
  success: z.literal(true),
  results: z.array(PetImportItemSchema),
});

export type PetSummary = z.infer<typeof PetSummarySchema>;
export type PetImportItem = z.infer<typeof PetImportItemSchema>;
