import type { ShotPrompt } from '@shared/domain/prompts/vision';
import type { OriginalLookParts, OriginalProductRole } from '@shared/domain/prompts/prompt-engine/productRoles';
import type { BatchProductItem } from '../batchTypes';

/** Wire fields from /api/generate/analyze, including persisted snake_case responses. */
export interface StoryboardAnalysis {
  prompts?: Array<Partial<ShotPrompt> & { description?: string }>;
  error?: string;
  paddedCount?: number;
  modelUsed?: string;
  usage?: unknown;
  lookParts?: OriginalLookParts | null;
  look_parts?: OriginalLookParts | null;
  lookBible?: string;
  look_bible?: string;
  identityBible?: string;
  identity_bible?: string;
  styleBible?: string;
  style_bible?: string;
  masterScene?: string;
  master_scene?: string;
  productRole?: OriginalProductRole | null;
  product_role?: OriginalProductRole | null;
  productFingerprint?: string;
  product_fingerprint?: string;
  applied_scene?: string;
  appliedScene?: string;
  applied_outfit?: string;
  appliedOutfit?: string;
  applied_persona?: string;
  appliedPersona?: string;
  usedActionIds?: string[];
  selectedSceneId?: string;
  assetTrace?: {
    fullPromptId?: string;
    fullPromptTitle?: string;
    fullPromptDisplayNumber?: number | null;
    fullPromptGroupIndex?: number | null;
    fullPromptAlbumName?: string | null;
    fullPromptSelectionMode?: 'manual' | 'auto';
    fullPromptAppearance?: 'human' | 'product' | 'unknown';
    fullPromptEligibleCount?: number;
    fullPromptInventoryCount?: number;
    skillSnapshot?: BatchProductItem['appliedSkillSnapshot'];
  };
}
