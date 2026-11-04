import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SalesPrompt } from '@shared/contracts/salesPrompts';
import { ensureSalesProductionPromptsCurrent } from './salesProductionPrompt';
import { listSalesPrompts } from './salesPrompts';

vi.mock('./salesPrompts', () => ({ listSalesPrompts: vi.fn() }));
afterEach(() => { vi.resetAllMocks(); });

const prompt = (id: string, version: string): SalesPrompt => ({
  id, title: id, description: '', prompt: '工作区已保存内容', defaultPrompt: '未保存的初始模板',
  version, configured: true, customized: true,
});
const final = prompt('final-video', 'final:reviewed');
const adapted = prompt('plan-adapt', 'plan:reviewed');
const spoken = prompt('spoken-copy', 'spoken:reviewed');
const plan = {
  adaptedBeats: [{ index: 0 }], adaptedSourceKey: 'reviewed-source', adaptedPromptVersion: adapted.version,
  spokenCopyPromptVersion: spoken.version,
};
const verify = (value = plan) => ensureSalesProductionPromptsCurrent(value, final.version, new AbortController().signal);

describe('spoken-copy prompt version before generation', () => {
  it('accepts the exact saved version used for timing adaptation', async () => {
    vi.mocked(listSalesPrompts).mockResolvedValue([final, adapted, spoken]);
    await expect(verify()).resolves.toBeUndefined();
    expect(listSalesPrompts).toHaveBeenCalledOnce();
  });

  it.each([
    { rows: [] },
    { rows: [{ ...spoken, configured: false, prompt: '' }] },
    { rows: [{ ...spoken, prompt: '  ' }] },
  ])('requires the configured spoken prompt rather than its initial template: %j', async ({ rows }) => {
    vi.mocked(listSalesPrompts).mockResolvedValue([final, adapted, ...rows]);
    await expect(verify()).rejects.toThrow('保存「口播时长适配」');
    expect(plan.spokenCopyPromptVersion).toBe('spoken:reviewed');
  });

  it('blocks a changed prompt version without discarding the reviewed draft', async () => {
    vi.mocked(listSalesPrompts).mockResolvedValue([final, adapted, { ...spoken, version: 'spoken:new' }]);
    await expect(verify()).rejects.toThrow('口播时长适配提示词已更新');
    expect(plan).toMatchObject({ spokenCopyPromptVersion: 'spoken:reviewed', adaptedSourceKey: 'reviewed-source' });
  });

  it('does not require timing provenance for legacy automatic or source-free manual drafts', async () => {
    vi.mocked(listSalesPrompts).mockResolvedValue([final, adapted]);
    await expect(verify({ ...plan, spokenCopyPromptVersion: '' })).resolves.toBeUndefined();
    await expect(verify({ ...plan, adaptedSourceKey: '', adaptedPromptVersion: '', spokenCopyPromptVersion: '' })).resolves.toBeUndefined();
  });

  it('does not require the spoken prompt after switching to pure visuals', async () => {
    vi.mocked(listSalesPrompts).mockResolvedValue([final, adapted]);
    await expect(ensureSalesProductionPromptsCurrent(plan, final.version, new AbortController().signal, 'none')).resolves.toBeUndefined();
  });

  it('rejects timing provenance missing its saved prompt version', async () => {
    vi.mocked(listSalesPrompts).mockResolvedValue([final, adapted, spoken]);
    await expect(ensureSalesProductionPromptsCurrent({ ...plan, spokenCopySourceKey: 'timing-source', spokenCopyPromptVersion: '' }, final.version, new AbortController().signal)).rejects.toThrow('口播适配未记录提示词版本');
  });
});

describe('mode-specific final prompt provenance', () => {
  const depth = prompt('final-video-depth', 'depth:reviewed');
  const verifyDepth = () => ensureSalesProductionPromptsCurrent(plan, depth.version, new AbortController().signal, 'none', 'final-video-depth');

  it('checks only the active depth prompt and ignores a changed script prompt', async () => {
    vi.mocked(listSalesPrompts).mockResolvedValue([{ ...final, version: 'script:new' }, depth, adapted]);
    await expect(verifyDepth()).resolves.toBeUndefined();
  });

  it.each([undefined, { ...depth, configured: false, prompt: '' }])('never falls back to script rules when depth rules are missing or unconfigured', async (saved) => {
    vi.mocked(listSalesPrompts).mockResolvedValue([final, adapted, ...(saved ? [saved] : [])]);
    await expect(verifyDepth()).rejects.toThrow('保存「最终视频生成 · 深度视频版」');
  });

  it('rejects an updated active depth prompt even when the script version matches the old depth version', async () => {
    vi.mocked(listSalesPrompts).mockResolvedValue([{ ...final, version: depth.version }, { ...depth, version: 'depth:new' }, adapted]);
    await expect(verifyDepth()).rejects.toThrow('提示词已更新');
  });
});

describe('semantic approval before speaking video submission', () => {
  const review = prompt('spoken-review', 'review:v1');
  const receipt = { ...plan, spokenReviewPromptVersion: review.version, spokenReviewSourceKey: 'current-draft-and-facts' };
  it.each(['speech', 'voiceover'] as const)('requires a saved current reviewer for %s', async (voiceMode) => {
    vi.mocked(listSalesPrompts).mockResolvedValue([final, adapted, spoken, review]);
    await expect(ensureSalesProductionPromptsCurrent(receipt, final.version, new AbortController().signal, voiceMode)).resolves.toBeUndefined();
    await expect(ensureSalesProductionPromptsCurrent(plan, final.version, new AbortController().signal, voiceMode)).rejects.toThrow('尚未通过语义验收');
    vi.mocked(listSalesPrompts).mockResolvedValue([final, adapted, spoken, { ...review, version: 'review:v2' }]);
    await expect(ensureSalesProductionPromptsCurrent(receipt, final.version, new AbortController().signal, voiceMode)).rejects.toThrow('语义验收提示词已更新');
  });
  it('does not assign semantic approval to a source-free manual draft', async () => {
    vi.mocked(listSalesPrompts).mockResolvedValue([final, review]);
    await expect(ensureSalesProductionPromptsCurrent({ adaptedBeats: [], adaptedSourceKey: '', adaptedPromptVersion: '' }, final.version,
      new AbortController().signal, 'speech')).rejects.toThrow('尚未通过语义验收');
  });
});
