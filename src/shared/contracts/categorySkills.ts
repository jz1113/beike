import { z } from 'zod';

export const outputReviewScoresSchema = z.object({ productFidelity: z.number().int().min(0).max(100), composition: z.number().int().min(0).max(100), aesthetic: z.number().int().min(0).max(100), consistency: z.number().int().min(0).max(100) });
export type OutputReviewScores = z.infer<typeof outputReviewScoresSchema>;
export interface OutputRating { scores: OutputReviewScores; note?: string }

const sample = z.object({ id: z.string(), title: z.string(), fingerprint: z.string(), role: z.enum(['training', 'holdout']) });
export const categorySkillStateSchema = z.object({
  success: z.literal(true),
  scope: z.object({ folderId: z.string(), autoAnalyze: z.boolean(), autoPublish: z.boolean(), minSamples: z.number(), activeVersionId: z.string(), trialVersionId: z.string(), comparisonVersionId: z.string(), revision: z.number(), runningToken: z.string(), runningAt: z.string(), progress: z.number(), lastAttempt: z.string(), error: z.string() }),
  dataset: z.object({ folder: z.object({ id: z.string(), name: z.string(), majorId: z.string(), majorName: z.string() }), total: z.number(), excluded: z.number(), duplicates: z.number(), fingerprint: z.string(), samples: z.array(sample) }),
  versions: z.array(z.object({ id: z.string(), folderId: z.string(), parentVersionId: z.string(), sourceFingerprint: z.string(), promptSnippet: z.string(), summary: z.string(), model: z.string(), createdAt: z.string(), manifest: z.object({ samples: z.array(sample), feedbackFingerprint: z.string(), ruleEvidence: z.array(z.object({ groupId: z.string(), rule: z.string(), condition: z.string() })).nullable() }) })),
  events: z.array(z.object({ id: z.string(), versionId: z.string(), type: z.string(), detail: z.string(), createdAt: z.string() })),
  validations: z.record(z.object({ passed: z.boolean(), pairs: z.number(), products: z.number(), reason: z.string() })),
  pendingSamples: z.number(), feedbackCount: z.number(), feedbackChanged: z.boolean(), attemptFingerprint: z.string(),
});
export type CategorySkillState = z.infer<typeof categorySkillStateSchema>;
export type CategorySkillVersion = CategorySkillState['versions'][number];

export const learningContextSchema = z.object({
  scopeId: z.string(), versionId: z.string(), referenceFingerprint: z.string(), baseRecipeVersion: z.string(),
  groupId: z.string(), productImages: z.array(z.string()).min(1).max(4), referenceImage: z.string(),
  model: z.string(), aspectRatio: z.string(), quality: z.string(), strategy: z.enum(['single_shot', 'grid_first']),
  anchorFaceUrl: z.string(), replacements: z.array(z.string()).max(3),
});
