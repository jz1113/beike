import { z } from 'zod';

export const sharedMaterialKindSchema = z.enum(['script', 'action', 'persona', 'scene', 'voice', 'bgm']);
export type SharedMaterialKind = z.infer<typeof sharedMaterialKindSchema>;
export const sharedMaterialsPageSchema = z.object({
  success: z.literal(true),
  items: z.array(z.object({ id: z.string(), name: z.string(), kind: sharedMaterialKindSchema, importedId: z.string().optional() })),
  more: z.boolean(),
});
export const sharedMaterialImportSchema = z.object({ success: z.literal(true), id: z.string().min(1) });

export const libraryPreferencesSchema = z.object({ showEntry: z.boolean(), sharingEnabled: z.boolean() });
export type LibraryPreferences = z.infer<typeof libraryPreferencesSchema>;
