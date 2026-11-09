import { describe, expect, it } from 'vitest';
import { DEFAULT_SUBCATEGORIES_MAP } from '../../products/product-category/defs';
import { OFFICIAL_MASTER_RECIPES } from '../../prompts/masterRecipes';
import {
  OUTPUT_REVIEW_DECISIONS,
  PIPELINE_RUN_KINDS,
  PIPELINE_RUN_STATUSES,
  WORKSHOP_BATCH_STATUSES,
  isTerminalBatchStatus,
  normalizeBatchStatus,
} from './states';

describe('workshop batch status definitions', () => {
  it('normalizes legacy statuses and identifies terminal states', () => {
    expect(WORKSHOP_BATCH_STATUSES).toContain('generating');
    expect(PIPELINE_RUN_KINDS).toContain('generation');
    expect(PIPELINE_RUN_STATUSES).toContain('running');
    expect(OUTPUT_REVIEW_DECISIONS).toContain('accepted');
    expect(normalizeBatchStatus('review')).toBe('review_required');
    expect(isTerminalBatchStatus('completed')).toBe(true);
    expect(Object.keys(DEFAULT_SUBCATEGORIES_MAP).length).toBeGreaterThan(0);
    expect(Array.isArray(OFFICIAL_MASTER_RECIPES)).toBe(true);
  });
});
