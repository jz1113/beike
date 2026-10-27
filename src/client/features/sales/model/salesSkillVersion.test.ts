import { beforeEach, expect, it, vi } from 'vitest';
import type { VideoSalesScript } from '@shared/domain/sales';
import { assertSalesPlanCurrent, salesAnalysisInputRevision, salesFinalInputRevision, salesPlanInputRevision } from './salesStageRules';
import { defaultSalesStudioState } from './salesStudioDraft';

const selection = vi.hoisted(() => ({ revision: 'initial-rules' }));
vi.mock('@shared/domain/sales/skill', () => ({ salesSkillBinding: () => ({ skillId: 'fashion-video-sales', skillRevision: selection.revision }) }));
beforeEach(() => { selection.revision = 'initial-rules'; });

it('invalidates cached analysis, script and final prompt when the installed skill changes', () => {
  const state = structuredClone(defaultSalesStudioState);
  const script = { deliveryMode: 'single', shots: [], assets: [], planRevision: salesPlanInputRevision(state) } as unknown as VideoSalesScript;
  const analysis = salesAnalysisInputRevision(state);
  const final = salesFinalInputRevision(state, script);
  selection.revision = 'updated-rules';
  expect(salesAnalysisInputRevision(state)).not.toBe(analysis);
  expect(salesPlanInputRevision(state)).not.toBe(script.planRevision);
  expect(salesFinalInputRevision(state, script)).not.toBe(final);
  expect(() => assertSalesPlanCurrent(state, script)).toThrow('更新创作方案');
});
