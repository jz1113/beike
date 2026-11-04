import { describe, expect, it } from 'vitest';
import { emptySalesProductionPlan } from './salesProductionDraft';
import { mergeSalesAdaptedWindow, salesManualPerformanceEdits, updateSalesManualPerformance } from './salesPerformanceEdits';

const automatic = { ...emptySalesProductionPlan(), adaptedSourceKey: 'old-source', adaptedPromptVersion: 'old-version' };
const beat = { index: 0, subject: '旧商品', action: '拉扯旧商品展示卖点', expression: '旧表情', transition: '旧收势', spokenLine: '', subtitle: '' };

describe('manual motion prompt provenance', () => {
  it('does not reuse old automatic product actions as manual edits', () => {
    expect(salesManualPerformanceEdits(automatic, beat)).toEqual({});
    const updated = updateSalesManualPerformance(automatic, beat, { expression: '用户精修表情' });
    expect(updated.manualPerformanceFields).toEqual(['expression']);
    expect(salesManualPerformanceEdits(automatic, updated)).toEqual({ expression: '用户精修表情' });
  });

  it('keeps legacy manual drafts with no automatic provenance, including explicit empty fields', () => {
    const plan = emptySalesProductionPlan();
    const manual = { ...beat, expression: '' };
    expect(salesManualPerformanceEdits(plan, manual)).toEqual({ action: beat.action, expression: '', transition: beat.transition });
    const marked = updateSalesManualPerformance(plan, manual, { subtitle: '新字幕' });
    expect(marked.manualPerformanceFields).toEqual(['action', 'expression', 'transition']);
    expect(salesManualPerformanceEdits(automatic, marked)).toEqual({ action: beat.action, expression: '', transition: beat.transition });
  });

  it('clearing an action restores the script while clearing expression remains explicit', () => {
    const edited = updateSalesManualPerformance(automatic, beat, { action: '手工动作', expression: '手工表情' });
    const cleared = updateSalesManualPerformance(automatic, edited, { action: '', expression: '' });
    expect(cleared.manualPerformanceFields).toEqual(['expression']);
    expect(salesManualPerformanceEdits(automatic, cleared)).toEqual({ expression: '' });
  });

  it('retains explicit subject edits after automatic adaptation, including intentionally clearing them', () => {
    const edited = updateSalesManualPerformance(automatic, beat, { subject: '手掌贴在当前商品正面' });
    expect(salesManualPerformanceEdits(automatic, edited)).toEqual({ subject: '手掌贴在当前商品正面' });
    const cleared = updateSalesManualPerformance(automatic, edited, { subject: '' });
    expect(cleared.manualPerformanceFields).toEqual(['subject']);
    expect(salesManualPerformanceEdits(automatic, cleared)).toEqual({ subject: '' });
    expect(salesManualPerformanceEdits(automatic, beat)).toEqual({});
  });

  it('does not infer a subject override from an inherited legacy subject or an empty first edit', () => {
    const plan = emptySalesProductionPlan();
    expect(salesManualPerformanceEdits(plan, beat)).not.toHaveProperty('subject');
    const edited = updateSalesManualPerformance(plan, { ...beat, subject: '' }, { subtitle: '手工字幕' });
    expect(edited.manualPerformanceFields).not.toContain('subject');
    const explicit = updateSalesManualPerformance(plan, edited, { subject: '' });
    expect(salesManualPerformanceEdits(plan, explicit)).toHaveProperty('subject', '');
  });

  it('replaces the active window while retaining edits on omitted later actions', () => {
    const tail = updateSalesManualPerformance(automatic, { ...beat, index: 2 }, { action: '手工结尾动作' });
    const current = [beat, { ...beat, index: 1 }, tail];
    const replacement = { ...beat, action: '改写当前动作' };
    const merged = mergeSalesAdaptedWindow(current, [replacement], 2);
    expect(merged).toEqual([replacement, tail]);
    expect(merged[1]).toBe(tail);
    expect(salesManualPerformanceEdits(automatic, merged[1])).toEqual({ action: '手工结尾动作' });
    expect(current).toEqual([beat, { ...beat, index: 1 }, tail]);
    expect(mergeSalesAdaptedWindow(merged, [{ ...replacement, index: 0 }, { ...replacement, index: 1 }, tail], 3))
      .toHaveLength(3);
  });
});
