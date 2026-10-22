import { z } from 'zod';

const version = z.string().min(1);
const assistantContent = z.object({
  id: z.string().min(1), name: z.string().min(1), description: z.string().default(''), prompt: z.string().min(1),
  libraryVersion: version, isFavorite: z.boolean().optional(),
  files: z.array(z.object({ path: z.string(), content: z.string() })).optional(),
  tools: z.array(z.string()).optional(),
}).passthrough();

const workshopContent = z.object({
  id: z.string().min(1), name: z.string(), category: z.string(), promptSnippet: z.string(),
  libraryVersion: version, isFavorite: z.boolean().optional(), isOfficial: z.boolean().optional(),
  desc: z.string().nullable().optional(), coverUrl: z.string().nullable().optional(),
  sampleImages: z.union([z.string(), z.array(z.string())]).nullable().optional(),
}).passthrough();

export const skillLibraryResponseSchema = z.object({
  success: z.literal(true),
  skills: z.array(z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('assistant'), content: assistantContent }),
    z.object({ kind: z.literal('workshop'), content: workshopContent }),
  ])),
  hiddenOfficialRecipes: z.array(z.object({ id: z.string(), name: z.string() })),
});

export const savedSkillResponseSchema = z.object({ success: z.literal(true), skill: assistantContent });
