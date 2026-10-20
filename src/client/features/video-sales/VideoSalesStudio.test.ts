import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { VideoSalesScript } from '@shared/domain/video-sales';
import VideoSalesStudio from './VideoSalesStudio';
import { useVideoSalesStudio } from './hooks/useVideoSalesStudio';
import { defaultSalesStudioState } from './model/salesStudioDraft';

vi.mock('./hooks/useVideoSalesStudio', () => ({ useVideoSalesStudio: vi.fn() }));
vi.mock('./hooks/useSalesPanelWidth', () => ({ useSalesPanelWidth: () => ({ containerRef: { current: null }, wide: false, width: 480, separatorProps: {} }) }));
vi.mock('@client/shared/prompt-bar/hooks/usePromptBarWorkflowModels', () => ({ usePreferenceModels: () => ({ ready: false, imageModels: [], videoModels: [], multimodalModels: [] }), matchesStoredModel: () => false }));

const script: VideoSalesScript = {
  id: 'script', title: '口播方案', totalDuration: 15, deliveryMode: 'single', renderStatus: 'pending',
  shots: [{ shotId: 1, type: 'hook', duration: 15, description: '展示商品', voiceover: '口播内容', camera: '近景', visualSource: 'product_image', transition: 'direct_concat' }],
  seo: { title: '', hashtags: [], coverText: '', interactionGuide: '', description: '' },
};
const base = {
  state: { ...defaultSalesStudioState, scripts: [script] },
  isCollecting: false, isUploading: false, isPlanning: false, isPreparingAssets: false, isFinalizing: false, isRendering: false,
  planPhase: null, renderPhase: null, error: null as string | null, videoError: null, videoSubmitError: null,
  updateState: vi.fn(), resetProject: vi.fn(), runPlan: vi.fn(), runAssets: vi.fn(), runFinalize: vi.fn(), runRender: vi.fn(), stopRender: vi.fn(),
  runProductCollect: vi.fn(), markImageUnavailable: vi.fn(), addProductImages: vi.fn(), editShot: vi.fn(), editAssetPrompt: vi.fn(), editFullPrompt: vi.fn(), retryShot: vi.fn(),
};
function render(patch: Partial<typeof base> = {}) {
  vi.mocked(useVideoSalesStudio).mockReturnValue({ ...base, ...patch } as unknown as ReturnType<typeof useVideoSalesStudio>);
  return renderToStaticMarkup(createElement(VideoSalesStudio, { onBack: vi.fn() }));
}
beforeEach(() => vi.clearAllMocks());

describe('sales studio integration', () => {
  it('renders one footer and starts pending scripts at the script stage', () => {
    const html = render();
    expect(html.match(/<footer\b/g)).toHaveLength(1);
    expect(html).toMatch(/aria-current="step"[^>]*>[\s\S]*?口播脚本/);
    expect(html).toContain('口播与画面时间轴');
    expect(html).not.toContain('等待生成成片');
  });
  it('keeps a saved but invalid prompt out of completed-step markers', () => {
    const html = render({ state: { ...base.state, scripts: [{ ...script, fullPrompt: '旧版完整提示词', finalizedRevision: 'old' }] } });
    expect(html).toContain('aria-label="4 视频定稿，待完成"');
    expect(html).not.toContain('aria-label="4 视频定稿，已完成"');
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
  it('preserves query-only recovery for historical shot receipts', () => {
    const historical = { ...script, deliveryMode: undefined, shots: [{ ...script.shots[0], taskId: 'old-receipt', status: 'generating' as const }] };
    const html = render({ state: { ...base.state, scripts: [historical] } });
    expect(html).toContain('继续查询原任务');
    expect(html).toContain('镜头 1');
  });
});
