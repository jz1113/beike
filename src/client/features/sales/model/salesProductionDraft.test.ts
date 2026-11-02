import { describe, expect, it } from 'vitest';
import { parseSalesProductionPlan, planForSelectedScript } from './salesProductionDraft';

describe('supported production motion choices', () => {
  it.each(['source', 'none', 'manual', 'custom'])('loads legacy %s as script-only without losing edits or finished media', (scriptVideoReference) => {
    const saved = { scriptId: 'script', imitationMode: 'depth_imitation', scriptVideoReference,
      beatActionIds: { 0: 'saved-action' }, generatedVideoUrl: '/finished.mp4', mixedVideoUrl: '/mixed.mp4',
      adaptedBeats: [{ index: 0, subject: '商品', action: '用户编辑的动作', spokenLine: '台词', subtitle: '字幕' }] };
    const plan = parseSalesProductionPlan(saved);
    expect(plan).toMatchObject({ ...saved, imitationMode: 'script_only', scriptVideoReference: 'none' });
    expect(parseSalesProductionPlan(plan)).toEqual(plan);
  });

  it('retains explicit linked-depth selection and does not enable a previously inactive saved depth reference', () => {
    expect(parseSalesProductionPlan({ imitationMode: 'depth_imitation', scriptVideoReference: 'depth' }))
      .toMatchObject({ imitationMode: 'depth_imitation', scriptVideoReference: 'depth' });
    expect(parseSalesProductionPlan({ imitationMode: 'script_only', scriptVideoReference: 'depth' }))
      .toMatchObject({ imitationMode: 'script_only', scriptVideoReference: 'none' });
  });

  it('starts the next script without carrying over manual or linked motion selection', () => {
    const plan = parseSalesProductionPlan({ scriptId: 'old', imitationMode: 'depth_imitation', scriptVideoReference: 'depth', adaptedPromptVersion: 'plan-adapt:old' });
    expect(planForSelectedScript(plan, 'new')).toMatchObject({ scriptId: 'new', imitationMode: 'script_only', scriptVideoReference: 'none', adaptedPromptVersion: '' });
  });

  it('round trips the actual adaptation prompt version while leaving legacy drafts unverified', () => {
    const plan = parseSalesProductionPlan({ adaptedSourceKey: 'source', adaptedPromptVersion: 'plan-adapt:current' });
    expect(parseSalesProductionPlan(JSON.parse(JSON.stringify(plan))).adaptedPromptVersion).toBe('plan-adapt:current');
    expect(parseSalesProductionPlan({ adaptedSourceKey: 'legacy' }).adaptedPromptVersion).toBe('');
  });

  it('round trips independent expression and ending edits, including beats with only performance edits', () => {
    const saved = { adaptedBeats: [
      { index: 0, subject: '', action: '', expression: '抬眼看镜头后浅笑', transition: '笑意回落，保持末姿势', spokenLine: '', subtitle: '' },
      { index: 1, subject: '', action: '举手', expression: '', transition: '', spokenLine: '', subtitle: '' },
    ] };
    const parsed = parseSalesProductionPlan(saved);
    expect(parsed.adaptedBeats).toEqual(saved.adaptedBeats);
    expect(parseSalesProductionPlan(parsed)).toEqual(parsed);
  });
});
