import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { SalesPrompt } from '@shared/contracts/salesAssetViews';
import type { useSalesPrompts } from '../hooks/useSalesPrompts';
import type { SalesScriptImportItem } from '../model/salesScriptImport';
import { SalesLibrarySelect } from './SalesLibrarySelect';
import { SalesPromptWorkspace } from './SalesPromptWorkspace';
import { SalesScriptBatchImportDialog } from './SalesScriptBatchImportDialog';

vi.mock('../hooks/useSalesAssetViews', () => ({
  useSalesSummaryModels: () => ({ options: [], model: 'vision-model' }),
}));
vi.mock('@client/shared/models/ConfiguredModelPicker', () => ({
  ConfiguredModelPicker: ({ ariaLabel, disabled }: { ariaLabel: string; disabled: boolean }) => createElement('button', { 'aria-label': ariaLabel, disabled }),
}));

const initial: SalesPrompt = { id: 'final-video', title: '最终视频生成', description: '完整视频规则', prompt: '', defaultPrompt: '初始模板 {{referenceFacts}}', configured: false, customized: false, version: 'v1' };
const manager = (selected: SalesPrompt): ReturnType<typeof useSalesPrompts> => ({
  items: [selected], selected, selectedId: selected.id, text: selected.configured ? selected.prompt : selected.defaultPrompt,
  loading: false, saving: false, verified: true, error: '', conflict: false, notice: '', hasUnsaved: false,
  dirty: (item) => !item.configured, select: () => {}, refresh: async () => {}, updateDraft: () => {}, discardDraft: () => {}, save: async () => {},
});

describe('managed final video prompt editor', () => {
  it('shows the final stage and distinguishes an initial template from an executable saved prompt', () => {
    const html = renderToStaticMarkup(createElement(SalesPromptWorkspace, { manager: manager(initial) }));
    for (const text of ['视频生成', '最终视频生成', '未配置', '待保存的初始模板', '不会回退内置规则', '不额外追加创作指令']) expect(html).toContain(text);
    expect(html).not.toContain('当前内容已生效');
    expect(html).not.toContain('对照当前已保存内容');
    expect(html).not.toMatch(/<button[^>]*disabled=""[^>]*>[\s\S]*?保存提示词<\/button>/);
  });

  it('reads one voice opening and displays the selected storyboard below the material sections', () => {
    const prompt = ['【画面质感与参数】', '【仅无口播】要音乐，不要台词。', '【仅有口播】口播清晰。',
      '【人物说明】', '{{personaFacts}}', '【画面内容及视频动线及场景说明】', '{{timelineFacts}}'].join('\n');
    const selected = { ...initial, configured: true, prompt };
    const html = renderToStaticMarkup(createElement(SalesPromptWorkspace, { manager: manager(selected), storyboard: '镜01｜影棚空镜' }));
    expect(html).toContain('要音乐，不要台词。');
    expect(html).toContain('镜01｜影棚空镜');
    expect(html).not.toMatch(/\{\{|【仅无口播】|口播清晰。/);
    expect(html.indexOf('【人物说明】')).toBeLessThan(html.indexOf('镜01｜影棚空镜'));
  });

  it('shows exactly the workspace saved rules as effective', () => {
    const saved = { ...initial, configured: true, customized: true, prompt: '用户保存的完整视频规则' };
    const html = renderToStaticMarkup(createElement(SalesPromptWorkspace, { manager: manager(saved) }));
    expect(html).toContain(saved.prompt);
    expect(html).toContain('当前内容已生效');
    expect(html).toContain('aria-label="提示词正文"');
    expect(html).toContain('编辑原文');
    expect(html).not.toContain('载入最新模板');
  });

  it('exposes both final templates and explains the action-only scope of depth video', () => {
    const script = { ...initial, title: '最终视频生成 · 纯分镜版' };
    const depth = { ...initial, id: 'final-video-depth', title: '最终视频生成 · 深度视频版' };
    const html = renderToStaticMarkup(createElement(SalesPromptWorkspace, { manager: { ...manager(depth), items: [script, depth] } }));
    for (const text of ['aria-label="最终视频生成，未配置"', '纯分镜版 · 未配置', depth.title, '深度视频只参考动作', '运镜、景别、构图和表情按分镜文字', '两套模板独立保存', '不额外追加创作指令']) expect(html).toContain(text);
    const scriptHtml = renderToStaticMarkup(createElement(SalesPromptWorkspace, { manager: manager(script) }));
    expect(scriptHtml).toContain('不引用动作视频或姿态图');
  });

  it('groups the spoken copy prompt with storyboards and explains when it executes', () => {
    const spoken = { ...initial, id: 'spoken-copy', title: '口播时长适配', description: '将商品推荐文案分配到分镜台词。', defaultPrompt: '按视频时长改写口播' };
    const html = renderToStaticMarkup(createElement(SalesPromptWorkspace, { manager: manager(spoken) }));
    for (const text of ['aria-label="分镜脚本"', '口播时长适配', '真人口播或画外旁白', '纯画面展示跳过', '对应环节尚不能执行']) expect(html).toContain(text);
  });

  it('shows either selected spoken rule under a single active sidebar entry', () => {
    const writer = { ...initial, id: 'spoken-copy', title: '口播时长适配' };
    const review = { ...initial, id: 'spoken-review', title: '口播语义验收', configured: true, prompt: '独立审稿规则' };
    for (const selected of [writer, review]) {
      const html = renderToStaticMarkup(createElement(SalesPromptWorkspace, {
        manager: { ...manager(selected), items: [writer, review] },
      }));
      const nav = html.slice(html.indexOf('<nav'), html.indexOf('</nav>'));
      expect(nav.match(/<button /g)).toHaveLength(1);
      expect(nav).toContain('aria-label="口播设置，未配置" aria-current="true"');
      expect(html).toContain('编写规则 · 未配置');
      expect(html).toContain('验收规则');
      expect(html).toContain(selected === writer ? writer.defaultPrompt : review.prompt);
    }
  });

  it('makes both asset design prompts available alongside their view prompts', () => {
    const items = [
      { ...initial, id: 'persona-design', title: '人物绘图提示词' },
      { ...initial, id: 'scene-design', title: '场景绘图提示词' },
      { ...initial, id: 'persona-grid', title: '人物视角' },
      { ...initial, id: 'scene-grid', title: '场景视角' },
    ];
    const html = renderToStaticMarkup(createElement(SalesPromptWorkspace, { manager: { ...manager(items[0]), items } }));
    expect(html).toContain('aria-label="资产生成"');
    expect(html).toContain('aria-label="人物生成，未配置"');
    expect(html).toContain('人物绘图 · 未配置');
    expect(html).toContain('三视图补图 · 未配置');
    expect(html).toContain('aria-label="场景生成，未配置"');
    for (const selected of [items[1], items[3]]) {
      const scene = renderToStaticMarkup(createElement(SalesPromptWorkspace, { manager: { ...manager(selected), items } }));
      expect(scene).toContain('aria-label="场景生成，未配置" aria-current="true"');
      expect(scene).toContain('场景绘图 · 未配置');
      expect(scene).toContain('九宫格补图 · 未配置');
      expect(scene).toContain(selected.title);
    }
    const gridHtml = renderToStaticMarkup(createElement(SalesPromptWorkspace, { manager: { ...manager(items[2]), items } }));
    expect(gridHtml).toContain('aria-label="人物生成，未配置" aria-current="true"');
  });
});

it('shows counts with a unit in filter options without repeating totals in closed controls', () => {
  const html = renderToStaticMarkup(createElement(SalesLibrarySelect, { value: 'all', label: '按风格筛选', onChange: () => {},
    showSelectedCount: false, countUnit: '组', options: [{ value: 'all', label: '全部风格', count: 1 }, { value: 'dance', label: '舞蹈', count: 1 }] }));
  const trigger = html.slice(html.indexOf('<button'), html.indexOf('</button>'));
  expect(trigger).toContain('全部风格');
  expect(trigger).not.toContain('sales-library-select-count');
  expect(html.match(/>1 组</g)).toHaveLength(2);
});

const batchProps = {
  preferredModel: 'vision-model', onModelChange: vi.fn(), items: [] as SalesScriptImportItem[],
  pending: false, error: '', errors: [] as string[], includeDepth: true, onIncludeDepthChange: vi.fn(),
  blockedReason: '',
  onAddFiles: vi.fn(), onRemove: vi.fn(), onClearCompleted: vi.fn(), onStart: vi.fn(), onStop: vi.fn(), onClose: vi.fn(),
};
const batchItem: SalesScriptImportItem = {
  key: 'video-1', name: '跳舞1.mp4', size: 12, lastModified: 1, status: 'queued', error: '', saveId: 'script-1',
};
function renderBatch(patch: Partial<typeof batchProps> = {}) {
  return renderToStaticMarkup(createElement(SalesScriptBatchImportDialog, { ...batchProps, ...patch }));
}

describe('action reference batch import dialog', () => {
  it('accepts multiple videos and explains what remains after processing', () => {
    const html = renderBatch();
    expect(html).toMatch(/<input[^>]*type="file"[^>]*multiple=""/);
    expect(html).toContain('video/mp4,video/quicktime,video/webm,.mp4,.mov,.webm');
    expect(html).toContain('处理结束即清理原片');
    expect(html).toContain('同时生成深度动作视频');
    expect(html).toContain('超出限制仍保存分析脚本');
    expect(html).toMatch(/<button[^>]*type="submit"[^>]*disabled=""/);
    expect(html).toContain('需要原片时请重新选择本地文件');
  });

  it('allows hiding a running batch while protecting queue options', () => {
    const html = renderBatch({ pending: true, items: [{ ...batchItem, status: 'depth', scriptId: 'saved-1', depthProgress: '处理进度 40%' }] });
    expect(html).toMatch(/<button[^>]*aria-label="收起动作素材批量导入"[^>]*>/);
    expect(html).not.toMatch(/<button[^>]*disabled=""[^>]*aria-label="收起动作素材批量导入"/);
    expect(html).not.toMatch(/<button[^>]*aria-label="收起动作素材批量导入"[^>]*disabled=""/);
    expect(html).toMatch(/<button[^>]*aria-label="动作素材批量分析模型"[^>]*disabled=""/);
    expect(html).toMatch(/<input[^>]*type="checkbox"[^>]*disabled=""/);
    expect(html).toContain('暂停队列');
    expect(html).toContain('脚本已入库，可在动作分类查看');
    expect(html).toContain('处理进度 40%');
    expect(html).toContain('已入库 1 / 1');
  });

  it('keeps failed and completed results distinct for resuming only unfinished items', () => {
    const html = renderBatch({ items: [
      { ...batchItem, status: 'done', scriptId: 'saved-1', depthState: 'skipped' },
      { ...batchItem, key: 'video-2', name: '跳舞2.mp4', status: 'error', error: '模型暂不可用' },
    ], errors: ['忽略了不支持的格式'], error: '队列已暂停' });
    expect(html).toContain('仅保存脚本，深度视频可稍后处理');
    expect(html).toContain('模型暂不可用');
    expect(html).toContain('忽略了不支持的格式');
    expect(html).toContain('队列已暂停');
    expect(html).toContain('继续未完成项（1）');
    expect(html).toContain('清除已完成记录');
    expect(html).not.toContain('移除待处理视频 跳舞1.mp4');
    expect(html).toContain('移除待处理视频 跳舞2.mp4');
  });

  it('explains why a pending single-video task must be preserved before starting the batch', () => {
    const html = renderBatch({ items: [batchItem], blockedReason: '请先暂存正在处理的单个视频，再开始批量分析。' });
    expect(html).toContain('请先暂存正在处理的单个视频，再开始批量分析。');
    expect(html).toMatch(/<button[^>]*type="submit"[^>]*disabled=""/);
  });
});
