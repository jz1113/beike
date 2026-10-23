import { describe, expect, it } from 'vitest';
import type { VideoSalesScript } from '@shared/domain/sales';
import { initialSalesNavigation, restoreSalesNavigation, navigateSalesWorkspace, salesHasQueryableTask, salesHasRenderActivity, salesSingleResultStatus, salesStageActions, type SalesStageContext, type SalesWorkflowStep } from './salesWorkspaceView';

const ready: SalesStageContext = {
  step: 'video', busy: false, hasScript: true, planCurrent: true, planReason: null, assetsReady: true,
  assetCount: 1, imageReady: true, finalized: true, videoError: null, submitError: null,
  rendering: false, canQuery: false, hasResult: false, submissionUncertain: false,
};

describe('sales workspace navigation', () => {
  it('restores the saved creative stage and ignores it after product reset', () => {
    const saved = { step: 'video' as const, lastCreativeStep: 'video' as const };
    expect(restoreSalesNavigation(saved, true, false)).toEqual(saved);
    expect(restoreSalesNavigation(saved, false, false).step).toBe('product');
  });
  it('starts at the available content without treating an empty draft as a result', () => {
    expect(initialSalesNavigation(false, false).step).toBe('product');
    expect(initialSalesNavigation(true, false).step).toBe('plan');
    expect(initialSalesNavigation(true, true).step).toBe('result');
  });
  it.each<SalesWorkflowStep>(['plan', 'assets', 'video', 'result'])('remembers %s when returning to edit product data', (step) => {
    const original = navigateSalesWorkspace(initialSalesNavigation(true, false), step);
    const product = navigateSalesWorkspace(original, 'product');
    expect(product.step).toBe('product');
    expect(product.lastCreativeStep).toBe(step);
    expect(navigateSalesWorkspace(product, product.lastCreativeStep).step).toBe(step);
  });
});

describe('sales stage primary actions', () => {
  it.each<SalesWorkflowStep>(['product', 'plan', 'assets', 'video', 'result'])('keeps video stopping available from %s', (step) => {
    const actions = salesStageActions({ ...ready, step, busy: true, rendering: true });
    expect(actions.primary.disabled).toBe(true);
    expect(actions.secondary).toMatchObject({ intent: 'stop', disabled: false });
    expect(actions.reason).toBeUndefined();
  });
  it('prioritizes receipt queries even for stale plans and missing image models', () => {
    const actions = salesStageActions({ ...ready, step: 'assets', planCurrent: false, imageReady: false, assetsQueryable: true });
    expect(actions.primary).toMatchObject({ intent: 'queryAssets', disabled: false });
    expect(actions.note).toContain('不重新生图');
  });
  it('blocks unknown picture submissions without offering paid retries', () => {
    expect(salesStageActions({ ...ready, step: 'assets', assetsUnresolved: true }).primary.disabled).toBe(true);
  });
  it('offers human confirmation for completed pictures without requiring an image model', () => {
    const actions = salesStageActions({ ...ready, step: 'assets', assetsReady: false, assetsGenerated: true, imageReady: false });
    expect(actions.primary).toMatchObject({ intent: 'confirmAssets', disabled: false });
  });
  it('offers stopping during script and image generation instead of stale repair instructions', () => {
    const actions = salesStageActions({ ...ready, step: 'video', busy: true, progress: '正在生成视频提示词', videoError: '旧原因' });
    expect(actions.secondary).toMatchObject({ intent: 'stop', disabled: false });
    expect(actions.reason).toBeUndefined();
  });
  it('offers an enabled product entry from an empty creative stage', () => {
    const actions = salesStageActions({ ...ready, step: 'assets', hasScript: false });
    expect(actions.primary).toMatchObject({ intent: 'product', disabled: false });
    expect(actions.reason).not.toContain('左侧');
  });
  it('keeps product generation disabled until required inputs and model are supplied', () => {
    const actions = salesStageActions({ ...ready, step: 'product', planReason: '请先确认商品颜色' });
    expect(actions.primary).toMatchObject({ intent: 'write', disabled: true });
    expect(actions.reason).toBe('请先确认商品颜色');
    expect(actions.secondary?.intent).toBe('resume');
  });
  it('promotes paid generation only after a valid finalization', () => {
    const before = salesStageActions({ ...ready, finalized: false, submitError: '图片、视频参数或定稿模型已变化，请先定稿视频提示词' });
    expect(before.primary.intent).toBe('finalize');
    expect(before.secondary).toBeUndefined();
    const after = salesStageActions(ready);
    expect(after.primary).toMatchObject({ intent: 'render', disabled: false });
    expect(after.primary.label).toContain('可能计费');
    expect(after.secondary?.intent).toBe('finalize');
    expect(after.note).toContain('不会自动提交');
  });
  it('shows submission-only errors even if the finalization itself is valid', () => {
    const actions = salesStageActions({ ...ready, submitError: '上次提交未确认，请核对记录' });
    expect(actions.primary).toMatchObject({ intent: 'render', disabled: true });
    expect(actions.reason).toBe('上次提交未确认，请核对记录');
  });
  it('blocks stale plans and missing assets using repair navigation rather than paid calls', () => {
    expect(salesStageActions({ ...ready, planCurrent: false }).primary.intent).toBe('plan');
    expect(salesStageActions({ ...ready, assetsReady: false }).primary.intent).toBe('assets');
    expect(salesStageActions({ ...ready, step: 'assets', assetsReady: true }).primary.intent).toBe('video');
  });
  it('does not require an image model when the script needs no additional images', () => {
    expect(salesStageActions({ ...ready, step: 'assets', assetsReady: false, assetCount: 0, imageReady: false }).primary).toMatchObject({ intent: 'prepare', disabled: false });
    expect(salesStageActions({ ...ready, step: 'assets', assetsReady: false, assetCount: 1, imageReady: false }).primary.disabled).toBe(true);
  });
  it('offers query-only recovery for an existing receipt and never relabels it as a new submission', () => {
    const actions = salesStageActions({ ...ready, step: 'result', canQuery: true, submissionUncertain: true });
    expect(actions.primary.intent).toBe('query');
    expect(actions.note).toContain('不重新提交');
    expect(salesStageActions({ ...ready, step: 'result', canQuery: false, submissionUncertain: true }).primary.intent).toBe('video');
  });
  it('keeps receipt recovery available alongside a preserved historical result', () => {
    const actions = salesStageActions({ ...ready, step: 'result', hasResult: true, canQuery: true, submissionUncertain: true });
    expect(actions.primary.intent).toBe('download');
    expect(actions.primary.label).toContain('已有成片');
    expect(actions.secondary?.intent).toBe('query');
  });
  it('labels preserved output as existing when a later submission fails', () => {
    expect(salesStageActions({ ...ready, step: 'result', hasResult: true, renderFailed: true }).primary.label).toBe('下载已有成片');
  });
  it('keeps stopping available while other actions are busy and discloses its limits', () => {
    const actions = salesStageActions({ ...ready, step: 'result', busy: true, rendering: true });
    expect(actions.primary.disabled).toBe(true);
    expect(actions.secondary).toMatchObject({ intent: 'stop', disabled: false });
    expect(actions.note).toContain('仍可能生成并计费');
  });
});

describe('render activity and historical receipts', () => {
  const script: VideoSalesScript = { id: 's', title: '', totalDuration: 15, deliveryMode: 'single', shots: [], seo: { title: '', hashtags: [], coverText: '', interactionGuide: '', description: '' }, renderStatus: 'pending' };
  it('leaves pending scripts in the script stage', () => {
    expect(salesHasRenderActivity(script, null, false)).toBe(false);
    expect(salesHasQueryableTask(script)).toBe(false);
    expect(salesHasRenderActivity(script, null, true)).toBe(true);
  });
  it('exposes historical shot receipts as query-only recovery', () => {
    const historical: VideoSalesScript = { ...script, deliveryMode: undefined, shots: [{ shotId: 1, type: 'hook', duration: 15, description: '', camera: '', voiceover: '', visualSource: 'product_image', transition: 'direct_concat', taskId: 'receipt', status: 'generating' }] };
    expect(salesHasRenderActivity(historical, null, false)).toBe(true);
    expect(salesHasQueryableTask(historical)).toBe(true);
    expect(salesStageActions({ ...ready, step: 'result', canQuery: salesHasQueryableTask(historical) }).primary.intent).toBe('query');
    expect(salesHasQueryableTask({ ...historical, deliveryMode: 'single' })).toBe(false);
  });
});

describe('single video result summary', () => {
  it.each([
    [{ rendering: true, hasReceipt: false, hasResult: false }, '正在提交视频任务'],
    [{ rendering: true, hasReceipt: true, hasResult: false }, '正在查询视频任务'],
    [{ rendering: false, hasReceipt: false, hasResult: false, status: 'uncertain' }, '提交结果待确认'],
    [{ rendering: false, hasReceipt: true, hasResult: false, status: 'failed' }, '视频生成失败'],
    [{ rendering: false, hasReceipt: true, hasResult: true, status: 'done' }, '成片已生成'],
    [{ rendering: false, hasReceipt: true, hasResult: false, status: 'generating' }, '任务已提交，可继续查询'],
  ])('distinguishes task states: %j', (input, expected) => {
    expect(salesSingleResultStatus(input)).toBe(expected);
  });
});
