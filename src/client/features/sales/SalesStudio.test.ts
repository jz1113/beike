import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { VideoSalesScript } from '@shared/domain/sales';
import SalesStudio from './SalesStudio';
import { useVideoSalesStudio } from './hooks/useVideoSalesStudio';
import { defaultSalesStudioState } from './model/salesStudioDraft';
import { salesFinalInputRevision, salesPlanInputRevision } from './model/salesStageRules';

vi.mock('./hooks/useVideoSalesStudio', () => ({ useVideoSalesStudio: vi.fn() }));
const panelWidth = vi.hoisted(() => ({ wide: false }));
vi.mock('./hooks/useSalesPanelWidth', () => ({ useSalesPanelWidth: () => ({ containerRef: { current: null }, wide: panelWidth.wide, width: 480, separatorProps: {} }) }));
vi.mock('@client/shared/prompt-bar/hooks/usePromptBarWorkflowModels', () => ({ usePreferenceModels: () => ({ ready: false, imageModels: [], videoModels: [], multimodalModels: [] }), matchesStoredModel: () => false }));

const script: VideoSalesScript = {
  id: 'script', title: '口播方案', totalDuration: 15, deliveryMode: 'single', renderStatus: 'pending',
  shots: [{ shotId: 1, type: 'hook', duration: 15, description: '展示商品', voiceover: '口播内容', camera: '近景', visualSource: 'product_image', transition: 'direct_concat' }],
  seo: { title: '', hashtags: [], coverText: '', interactionGuide: '', description: '' },
};
const base = {
  state: { ...defaultSalesStudioState, scripts: [script] },
  isCollecting: false, isUploading: false, isPlanning: false, isPreparingAssets: false, isFinalizing: false, isRendering: false,
  planPhase: null, renderPhase: null, error: null as string | null, videoError: null as string | null, videoSubmitError: null as string | null,
  updateState: vi.fn(), resetProject: vi.fn(), runPlan: vi.fn(), runAssets: vi.fn(), runFinalize: vi.fn(), runRender: vi.fn(), stopRender: vi.fn(),
  runProductCollect: vi.fn(), markImageUnavailable: vi.fn(), addProductImages: vi.fn(), editShot: vi.fn(), editAssetPrompt: vi.fn(), editFullPrompt: vi.fn(), retryShot: vi.fn(),
};
function render(patch: Partial<typeof base> = {}) {
  vi.mocked(useVideoSalesStudio).mockReturnValue({ ...base, ...patch } as unknown as ReturnType<typeof useVideoSalesStudio>);
  return renderToStaticMarkup(createElement(SalesStudio, { onBack: vi.fn() }));
}
beforeEach(() => { panelWidth.wide = false; vi.clearAllMocks(); });

describe('sales studio integration', () => {
  it.each([true, false])('shows the outline and actual video materials when wide=%s', (wide) => {
    panelWidth.wide = wide;
    const videoScript: VideoSalesScript = { ...script,
      shots: [{ ...script.shots[0], imageIndex: 0 }, { ...script.shots[0], shotId: 2, imageIndex: 0 }],
      assets: [{ id: 'person', kind: 'person', label: '出镜讲解者', prompt: '人物', required: true, status: 'done', validation: 'passed', url: '/person.jpg' }],
    };
    const html = render({ state: { ...base.state, scripts: [videoScript],
      workspaceNavigation: { step: 'video', lastCreativeStep: 'video' },
      imageCatalog: [{ index: 0, role: 'main', url: '/product.jpg' }, { index: 1, role: 'detail', url: '/unused.jpg' }],
      colorSelection: { colorLabel: '', confirmedImageUrls: ['/product.jpg', '/unused.jpg'], excludedImageUrls: [] },
    } });
    const summary = wide ? html.slice(html.indexOf('<aside'), html.indexOf('</aside>')) : html.slice(html.indexOf('创作与生成结果'), html.indexOf('最终完整视频提示词'));
    expect(summary).toContain('aria-label="脚本大纲"');
    expect(summary).not.toContain('待准备素材');
    expect(summary).toContain('aria-label="生成素材"');
    expect(summary).toContain('已确认');
    expect(summary).toContain('aria-label="整体使用素材"');
    const materials = summary.slice(summary.indexOf('aria-label="整体使用素材"'));
    expect(materials).toContain('图片 1');
    expect(materials).toContain('图片 2');
    expect(materials).not.toContain('图片 3');
    expect(materials).toContain('/product.jpg');
    expect(materials).toContain('/person.jpg');
    expect(materials).not.toContain('/unused.jpg');
    const workspace = html.slice(html.indexOf('创作与生成结果'), html.indexOf('<footer'));
    expect(workspace).not.toContain('当前制作阶段');
    expect(workspace).not.toContain('aria-label="视频设置"');
    expect(html.slice(html.indexOf('<footer'))).toContain('aria-label="视频设置"');
  });
  it('keeps unfinished generated materials visible with the missing-reference reason', () => {
    panelWidth.wide = true;
    const html = render({ state: { ...base.state,
      workspaceNavigation: { step: 'video', lastCreativeStep: 'video' },
      imageCatalog: [{ index: 0, role: 'main', url: '/product.jpg' }],
      colorSelection: { colorLabel: '', confirmedImageUrls: ['/product.jpg'], excludedImageUrls: [] },
      scripts: [{ ...script, shots: [{ ...script.shots[0], imageIndex: 0 }], assets: [{ id: 'person', kind: 'person', label: '出镜人物', prompt: '人物', required: true, status: 'failed' }] }],
    } });
    const summary = html.slice(html.indexOf('<aside'), html.indexOf('</aside>'));
    expect(summary).toContain('生成失败');
    expect(summary).toContain('出镜人物尚未生成');
  });
  it('keeps history available while reviewing scripts rather than only on results', () => {
    const html = render({ state: { ...base.state, scripts: [script, { ...script, id: 'history', title: '历史脚本' }] } });
    expect(html).toContain('口播与画面时间轴');
    expect(html).toContain('选择历史方案');
    expect(html).toContain('历史脚本');
    expect(html.indexOf('历史方案与任务')).toBeLessThan(html.indexOf('商品采集与前置设置'));
  });
  it('shows the distinction between a speaking presenter and voiceover', () => {
    const speaking = { ...script, shots: [{ ...script.shots[0], speechMode: 'on_camera' as const }, { ...script.shots[0], shotId: 2, speechMode: 'voiceover' as const }] };
    const html = render({ state: { ...base.state, category: 'fashion', videoMode: 'live_presenter', scripts: [speaking] } });
    expect(html).toContain('出镜说话 · 同步口型');
    expect(html).toContain('画外音');
    expect(html).toContain('段落 1 声音来源');
    expect(html).toContain('出镜方式');
    expect(html).toMatch(/value="live_presenter" selected=""/);
    expect(html).toContain('完整嘴部清晰可见');
    expect(html).not.toContain('返回修改商品与设置');
    expect(html).toContain('人物出镜讲解');
  });
  it('renders one footer and starts pending scripts at the script stage', () => {
    const html = render();
    expect(html.match(/<footer\b/g)).toHaveLength(1);
    expect(html).toMatch(/aria-current="step"[^>]*>[\s\S]*?卖点与脚本/);
    expect(html).toContain('口播与画面时间轴');
    expect(html).not.toContain('等待生成成片');
  });
  it('keeps a saved but invalid prompt out of completed-step markers', () => {
    const html = render({ state: { ...base.state, scripts: [{ ...script, fullPrompt: '旧版完整提示词', finalizedRevision: 'old' }] } });
    expect(html).toContain('aria-label="4 视频生成，待完成"');
    expect(html).not.toContain('aria-label="4 视频生成，已完成"');
  });
  it('keeps the prompt step complete when the new video model has a separate compatibility error', () => {
    const state = { ...structuredClone(defaultSalesStudioState), productName: '商品',
      imageCatalog: [{ index: 0, role: 'main' as const, url: '/product.jpg' }],
      colorSelection: { colorLabel: '', confirmedImageUrls: ['/product.jpg'], excludedImageUrls: [] },
    };
    const approved = { ...script, fullPrompt: '已经确认的整段提示词', assets: [], assetValidation: 'passed' as const,
      shots: [{ ...script.shots[0], imageIndex: 0 }], planRevision: salesPlanInputRevision(state),
      finalizedRevision: '',
    };
    approved.finalizedRevision = salesFinalInputRevision(state, approved);
    state.scripts = [approved];
    const html = render({ state, videoError: '当前视频模型不支持所选参考模式' });
    expect(html).toContain('aria-label="4 视频生成，已完成"');
    expect(base.runFinalize).not.toHaveBeenCalled();
  });
  it('shows the global error only once', () => {
    const html = render({ error: '本次采集失败' });
    expect(html.split('本次采集失败')).toHaveLength(2);
  });
  it('shows a video failure once even when also saved on the script', () => {
    const html = render({ error: '服务商拒绝本次任务', state: { ...base.state, scripts: [{ ...script, renderStatus: 'failed', renderError: '服务商拒绝本次任务' }] } });
    expect(html.split('服务商拒绝本次任务')).toHaveLength(2);
    expect(html).toContain('视频生成失败');
  });
  it('exposes only one query action for a single-video receipt', () => {
    const html = render({ state: { ...base.state, scripts: [{ ...script, renderTaskId: 'receipt', renderStatus: 'generating' }] } });
    expect(html).toContain('继续查询原任务');
    expect(html.split('继续查询原任务')).toHaveLength(2);
    expect(html).not.toContain('确认生成整段视频（可能计费）');
  });
  it('places product fields in the main workspace and creative controls in the bottom bar on wide product step', () => {
    panelWidth.wide = true;
    const html = render({ state: { ...defaultSalesStudioState, category: 'fashion', videoMode: 'live_presenter' } });
    const splitAt = html.indexOf('创作与生成结果');
    const footerAt = html.indexOf('<footer');
    const aside = html.slice(0, splitAt);
    const workspace = html.slice(splitAt, footerAt);
    const footer = html.slice(footerAt);
    expect(aside).toContain('商品链接');
    expect(aside).not.toContain('商品资料');
    expect(workspace).toContain('商品名称');
    expect(workspace).not.toContain('出镜方式');
    expect(footer).toContain('技能');
    expect(footer).toContain('出镜');
    expect(footer).toContain('模型');
  });
  it('preserves query-only recovery for historical shot receipts', () => {
    const historical = { ...script, deliveryMode: undefined, shots: [{ ...script.shots[0], taskId: 'old-receipt', status: 'generating' as const }] };
    const html = render({ state: { ...base.state, scripts: [historical] } });
    expect(html).toContain('继续查询原任务');
    expect(html).toContain('镜头 1');
  });
});
