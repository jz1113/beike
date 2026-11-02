import { getWorkspaceSecret } from '@client/shared/api/workspaceClient';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { assembleSalesVideoPrompt, bindBeatProductImages, normalizeScriptTemplate } from '@shared/domain/sales';
import SalesStudio from './SalesStudio';
import { ProductSetupPanel } from './components/salesProductSetup';
import { SalesScriptLibrary } from './components/SalesScriptLibrary';
import { SalesScriptReviewer } from './components/SalesScriptReviewer';
import { SalesScriptTaxonomyDialog } from './components/SalesScriptTaxonomyDialog';
import { SalesFinalPromptPanel } from './components/SalesFinalPromptPanel';
import { emptySalesCollection } from './model/salesCollectionDraft';
import { emptySalesProductionPlan } from './model/salesProductionDraft';

describe('single-screen ecommerce image workspace', () => {
  it('keeps product selection beside a single tabbed editor without numbered workflow blocks', () => {
    const html = renderToStaticMarkup(createElement(SalesStudio, { onBack: () => {} }));
    for (const label of ['视频制作', '资产库', '编辑内容', '商品卖点', '识别文字', '分镜脚本', '生成成片', '商品图片', '商品链接', '上传商品图片', '商品卖点工作区', '制作设置']) expect(html).toContain(label);
    const workspaceTabs = html.match(/aria-label="切换功能板块">([\s\S]*?)<\/div>/)?.[1] ?? '';
    expect(workspaceTabs.match(/role="tab"/g)).toHaveLength(2);
    expect(workspaceTabs).not.toContain('提示词管理');
    const editorTabs = html.match(/aria-label="编辑内容">([\s\S]*?)<\/div>/)?.[1] ?? '';
    expect(editorTabs.match(/role="tab"/g)).toHaveLength(3);
    expect(editorTabs).not.toContain('卖点文案');
    expect(html).not.toContain('sales-material-selling');
    expect(html.match(/<h2>商品卖点<\/h2>/g)).toHaveLength(1);
    expect(html).toMatch(/aria-selected="true"[^>]*>[\s\S]*?商品资料/);
    expect(html).toContain('跳过，进入分镜');
    for (const label of ['sales-flow-nav', 'sales-pipeline-section', '商品准备', '尚未选定参考脚本', '新建商品视频', '左侧点选商品图', '拖到右侧识别文字', '商品准备步骤', '下一步', '上一步', 'sales-product-name', 'sales-brand', 'sales-selling-points', '商品属性', '风格参考', '成片预览']) expect(html).not.toContain(label);
  });

  it('renders collected product card and clean borderless-ratio image tiles without redundant bottom bars', () => {
    const state = {
      ...emptySalesCollection(),
      collectedProductUrl: '10233097548161',
      productUrl: '10233097548161',
      productName: '红袖针织衫 咖啡条721 M',
      category: 'fashion' as const,
      imageCatalog: [{ index: 0, url: '/main.jpg', role: 'main' as const }],
    };
    const html = renderToStaticMarkup(createElement(ProductSetupPanel, {
      state,
      updateState: () => {},
      isBusy: false,
      isCollecting: false,
      isUploading: false,
      onCollect: () => {},
      onRetryUnavailable: () => {},
      onImageError: () => {},
      onUpload: () => {},
      onAddOCRImages: () => {},
      onImageDragging: () => {},
    }));
    expect(html).toContain('当前商品信息');
    expect(html).toContain('红袖针织衫 咖啡条721 M');
    expect(html).toContain('商品设置');
    expect(html).not.toContain('SKU: 10233097548161');
    expect(html).not.toContain('商品所属类目');
    expect(html).not.toContain('拖右识字');
    expect(html).not.toContain('sales-image-tile-actions');
    expect(html).not.toContain('aspect-square');
  });

  it('renders compact reference script covers without expanded storyboard details', () => {
    const script = normalizeScriptTemplate({
      title: '法式室内松弛感穿搭',
      durationSec: 9,
      format: 'presenter',
      voiceMode: 'voiceover',
      shots: [{ start: 0, end: 9, beats: [{ start: 0, end: 4, actionTemplate: '迎面走来', requiredView: 'front' }, { start: 4, end: 9, actionTemplate: '转身展示背部', requiredView: 'back' }] }],
    })!;
    const html = renderToStaticMarkup(createElement(SalesScriptLibrary, {
      items: [{ id: 's1', title: script.title, videoUrl: '/reference.mp4', depthVideoUrl: '/depth.mp4', videoHash: '', status: 'verified', script, model: '', promptVersion: '', version: 1, useCount: 2, updatedAt: '' }],
      taxonomyItems: [], taxonomyLoading: false, onManageTaxonomy: () => {},
      loading: false,
      onReview: () => {},
      onArchive: () => {},
      onDelete: () => {},
      onRefresh: () => {},
    }));
    expect(html).toContain('法式室内松弛感穿搭');
    expect(html).not.toContain('当前商品缺：背面');
    expect(html).not.toContain('sales-script-card-outline');
    expect(html).not.toContain('sales-card-filmstrip');
    expect(html.match(/<video/g)).toHaveLength(1);
    expect(html).toContain('preload="metadata"');
    expect(html).not.toMatch(/<video\b[^>]*\scontrols=/);
    expect(html).toContain('已确认');
    for (const label of ['当前已选用', '已选用', '选用此脚本', 'is-selected']) expect(html).not.toContain(label);

    const emptyHtml = renderToStaticMarkup(createElement(SalesScriptLibrary, {
      items: [],
      taxonomyItems: [], taxonomyLoading: false, onManageTaxonomy: () => {},
      loading: false,
      onReview: () => {},
      onArchive: () => {},
      onDelete: () => {},
      onRefresh: () => {},
      onOpenImport: () => {},
    }));
    expect(emptyHtml).toContain('上传参考视频');
    expect(emptyHtml).not.toContain('新增脚本');
    expect(emptyHtml).not.toContain('暂无参考脚本');
    expect(emptyHtml).not.toContain('粘贴拆解导入');
  });

  it('opens the requested management list with search, usage counts and safe row actions', () => {
    const html = renderToStaticMarkup(createElement(SalesScriptTaxonomyDialog, {
      initialKind: 'style',
      items: [{ id: 'cat-1', kind: 'category', name: '女装穿搭' }, { id: 'sty-1', kind: 'style', name: '口播讲解' }],
      loading: false,
      busy: false,
      error: '',
      usageCounts: { 'sty-1': 3 },
      onCreate: async () => true,
      onRename: async () => true,
      onRemove: async () => true,
      onRetry: () => {},
      onClose: () => {},
    }));
    expect(html).toContain('素材分类');
    expect(html).toContain('拍摄风格');
    expect(html).not.toContain('女装穿搭');
    expect(html).toContain('口播讲解');
    expect(html).toContain('aria-label="搜索风格"');
    expect(html).toContain('3 组');
    expect(html).toContain('aria-label="重命名风格 口播讲解"');
    expect(html).toContain('aria-label="口播讲解 更多操作"');
    expect(html).toContain('移除分类或风格不会删除素材');
    expect(html).not.toContain('推荐速建：');
  });

  it('renders script reviewer with global settings and exclusion leak detection', () => {
    const script = normalizeScriptTemplate({
      title: '街拍一镜到底推拉',
      durationSec: 6,
      format: 'presenter',
      voiceMode: 'speech',
      shots: [{ start: 0, end: 6, beats: [{ start: 0, end: 6, actionTemplate: '抚摸蓝色冲锋衣胸口门襟', requiredView: 'worn' }] }],
      sourceExclusions: [{ type: 'product', term: '蓝色冲锋衣', replacementRule: '替换为当前商品' }],
      review: ['请核对第 2 秒切点'],
    })!;
    const html = renderToStaticMarkup(createElement(SalesScriptReviewer, {
      draft: { status: 'draft', script, model: 'gemini-2.5-pro', promptVersion: 'v3' },
      taxonomyItems: [], taxonomyLoading: false, onManageTaxonomy: () => {},
      saving: false,
      onChange: () => {},
      onBack: () => {},
      onSaveDraft: () => {},
      onConfirm: () => {},
    }));
    expect(html).toContain('脚本设定');
    expect(html).toContain('确认入库');
    expect(html).not.toContain('确认并选用');
    expect(html).not.toContain('确认入库并选用');
    expect(html).not.toContain('脚本总时长秒数');
    expect(html).not.toContain('原片专属剥离清单');
    expect(html).not.toContain('后续所需资产槽位汇总');
    expect(html).not.toContain('复制提示词骨架');
    expect(html).toContain('检测到原片专属词残留：蓝色冲锋衣');
    expect(html).toContain('请核对第 2 秒切点');
    expect(html).not.toContain('<video');
    expect(html).not.toContain('编辑此段分镜与时间');
    expect(html).not.toContain('播放此段');
  });

  it('requires reference review before video generation and puts music composition last', () => {
    const script = normalizeScriptTemplate({
      title: '法式室内穿搭',
      durationSec: 8,
      format: 'presenter',
      voiceMode: 'voiceover',
      shots: [{ start: 0, end: 8, beats: [{ start: 0, end: 8, actionTemplate: '迎面走来展示{{商品}}', requiredView: 'front' }] }],
    })!;
    const images = [{ index: 0, url: '/front.jpg', role: 'main' as const, view: 'front' as const }, { index: 1, url: '/extra.jpg', role: 'main' as const }];
    const assembled = assembleSalesVideoPrompt({
      script,
      productName: '法式开衫',
      selectedImages: images,
      beatBindings: bindBeatProductImages(script, images),
      adaptedBeats: [{ index: 0, subject: '模特穿搭', action: '迎面走来展示开衫垂感', spokenLine: '这件法式开衫自带松弛感', subtitle: '自带松弛感' }],
      persona: { id: 'p1', name: '知夏', description: '', tags: '', avatarUrl: '/face.jpg', fullBodyUrl: '/body.jpg', faceUrl: '/face.jpg', sourceImages: ['/body.jpg', '/face.jpg'], hasReferenceImage: true, source: 'persona_library' },
      scene: { id: 's1', title: '法式客厅', description: '', lighting: '自然光', category: '', spatialType: 'indoor', tags: '', suitableCategories: ['fashion'], coverUrl: '/room.jpg', sourceImages: ['/room.jpg'], source: 'scene_library' },
    });
    const props: Parameters<typeof SalesFinalPromptPanel>[0] = {
      assembled,
      script,
      beatBindings: bindBeatProductImages(script, images),
      onEditMaterials: () => {},
      onEditStoryboard: () => {},
      plan: emptySalesProductionPlan(),
      videoModels: [],
      voiceModels: [],
      busy: '',
      progressText: '',
      onPatchPlan: () => {},
      onSynthesizeVoice: () => {},
      onGenerateVideo: () => {},
      onUploadRawVideo: () => {},
      onMixFinal: () => {},
      onCancel: () => {},
    };
    const html = renderToStaticMarkup(createElement(SalesFinalPromptPanel, props));
    expect(html).not.toContain('{{Mixed');
    expect(html).not.toContain('最终视频生成提示词');
    expect(html).not.toContain('即梦格式');
    expect(html).toContain('我已核对以上素材，确认使用');
    expect(html).toContain('用于第 1 段');
    expect(html).toContain('商品主图（#2）');
    expect(html).toContain('全片商品补充参考');
    const buttons = [...html.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)];
    const generate = buttons.find(([, , body]) => body.replace(/<[^>]*>/g, '') === '生成视频');
    const compose = buttons.find(([, , body]) => body.replace(/<[^>]*>/g, '') === '合成成片');
    expect(generate?.[1]).toContain('disabled=""');
    expect(compose?.[1]).toContain('disabled=""');
    expect(html.indexOf('核对引用素材')).toBeLessThan(html.indexOf('aria-label="生成视频"'));
    expect(html.indexOf('aria-label="生成视频"')).toBeLessThan(html.indexOf('aria-label="配乐与导出"'));
    expect(html).toContain('画外旁白');
    expect(html).toContain('视频预览与下载');
    expect(html).toContain('download="ecommerce-subtitles.srt"');
    expect(html).toContain('字幕单独导出为 SRT，尚未加入 MP4');
    const subtitleLink = html.match(/href="(data:application\/x-subrip[^"]+)"/)?.[1];
    expect(subtitleLink).toBeDefined();
    expect(decodeURIComponent(subtitleLink!.slice(subtitleLink!.indexOf(',') + 1)))
      .toContain('00:00:00,000 --> 00:00:08,000\r\n自带松弛感');
    const withVideo = { ...props, assembled: { ...assembled, effectiveVoiceMode: 'none' as const }, plan: { ...props.plan, generatedVideoUrl: '/raw-video.mp4' } };
    const noAudio = renderToStaticMarkup(createElement(SalesFinalPromptPanel, withVideo));
    const noAudioCompose = [...noAudio.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)]
      .find(([, , body]) => body.replace(/<[^>]*>/g, '') === '合成成片');
    expect(noAudioCompose?.[1]).toContain('disabled=""');
    expect(noAudio).toContain('无需配乐可直接下载原视频');
    const withAudio = renderToStaticMarkup(createElement(SalesFinalPromptPanel, { ...withVideo, hasBackgroundMusic: true }));
    const withAudioCompose = [...withAudio.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)]
      .find(([, , body]) => body.replace(/<[^>]*>/g, '') === '合成成片');
    expect(withAudioCompose).toBeDefined();
    expect(withAudioCompose?.[1]).not.toContain('disabled=""');
  });
});

describe('presentation mode, depth imitation and storyboard adaptation panels', () => {
  const script = normalizeScriptTemplate({
    title: '针织衫穿搭', durationSec: 6,
    shots: [{ start: 0, end: 6, beats: [{ start: 0, end: 6, actionTemplate: '展示{{商品}}' }] }],
  })!;
  const callbacks = {
    onPresentationModeChange: () => {}, onScriptVideoReferenceChange: () => {}, onVoiceModeChange: () => {},
  };
  const buttonTag = (html: string, label: string) => html.match(new RegExp(`<button\\b[^>]*aria-label="${label}"[^>]*>`))?.[0];

  it('offers only script or linked depth reference and shows narration with the separate subtitle export note', async () => {
    const { SalesPresentationModePanel } = await import('./components/SalesPresentationModePanel');
    const html = renderToStaticMarkup(createElement(SalesPresentationModePanel, {
      ...callbacks, script,
      plan: { ...emptySalesProductionPlan(), imitationMode: 'depth_imitation', scriptVideoReference: 'depth' },
      depthVideoUrl: '/depth.mp4', effectiveVoiceMode: 'speech', disabled: false,
    }));
    for (const label of ['表现形式', '卖点介绍', '纯画面展示', '介绍方式', '真人口播', '画外旁白', 'SRT 草稿单独导出']) expect(html).toContain(label);
    expect(buttonTag(html, '脚本＋深度视频')).toContain('aria-pressed="true"');
    expect(buttonTag(html, '脚本＋深度视频')).not.toContain('disabled');
    expect(buttonTag(html, '仅按脚本')).toContain('aria-pressed="false"');
    for (const label of ['附带原参考视频', '逐镜选择动作素材', '逐镜绑定动作', '单独深度转换']) expect(html).not.toContain(label);
  });

  it.each([
    { hasScript: true, depthUrl: undefined, disabled: false, scriptDisabled: false, hint: '当前脚本尚未关联深度视频' },
    { hasScript: true, depthUrl: '   ', disabled: false, scriptDisabled: false, hint: '当前脚本尚未关联深度视频' },
    { hasScript: false, depthUrl: '/depth.mp4', disabled: false, scriptDisabled: true, hint: '先选用参考脚本' },
    { hasScript: true, depthUrl: '/depth.mp4', disabled: true, scriptDisabled: true, hint: '深度视频仅参考动作与运镜' },
  ])('prevents unavailable action selections: $hasScript / $depthUrl / $disabled', async ({ hasScript, depthUrl, disabled, scriptDisabled, hint }) => {
    const { SalesPresentationModePanel } = await import('./components/SalesPresentationModePanel');
    const html = renderToStaticMarkup(createElement(SalesPresentationModePanel, {
      ...callbacks, script: hasScript ? script : null, plan: emptySalesProductionPlan(),
      depthVideoUrl: depthUrl, effectiveVoiceMode: 'speech', disabled,
    }));
    expect(buttonTag(html, '脚本＋深度视频')).toContain('disabled');
    expect(buttonTag(html, '仅按脚本')?.includes('disabled')).toBe(scriptDisabled);
    expect(html).toContain(hint);
  });

  it('hides narration controls and subtitle export guidance for clean visuals', async () => {
    const { SalesPresentationModePanel } = await import('./components/SalesPresentationModePanel');
    const html = renderToStaticMarkup(createElement(SalesPresentationModePanel, {
      ...callbacks, script, plan: { ...emptySalesProductionPlan(), presentationMode: 'clean_visual' },
      effectiveVoiceMode: 'none', disabled: false,
    }));
    expect(buttonTag(html, '纯画面展示')).toContain('aria-pressed="true"');
    expect(buttonTag(html, '卖点介绍')).toContain('aria-pressed="false"');
    for (const label of ['aria-label="介绍方式"', '人物出镜讲解', '旁白配合画面', 'SRT 草稿单独导出']) expect(html).not.toContain(label);
  });
});

describe("depth video conversion workspace", () => {
  it("displays source dimensions on both original and depth video headers while converting", async () => {
    const { SalesDepthWorkspace } = await import("./components/SalesDepthWorkspace");
    const store = new Map<string, string>();
    const prevStorage = (globalThis as { localStorage?: Storage }).localStorage;
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => { store.set(k, v); },
        removeItem: (k: string) => { store.delete(k); },
      },
    });
    try {
      store.set(
        "beike_sales_depth_job_v1",
        JSON.stringify({
          workspace: getWorkspaceSecret(),
          job: {
            operationId: "sales_depth_test_1",
            video: true,
            sourceUrl: "/storage/local/src.mp4",
            name: "动作 · 深度",
            description: "",
            style: "mocap",
            quality: "standard",
            taskId: "depth_task_1",
            width: 720,
            height: 1280,
            durationSec: 6.5,
          },
        }),
      );
      const html = renderToStaticMarkup(createElement(SalesDepthWorkspace, {
        enabled: true,
        source: null,
        onSaved: () => {},
      }));
      expect(html).toContain("原始视频");
      expect(html).toContain("720 × 1280");
      expect(html).toContain("深度视频");
      expect(html).toContain('title="输出尺寸">720 × 1280');
    } finally {
      Object.defineProperty(globalThis, "localStorage", { configurable: true, value: prevStorage });
    }
  });
});
