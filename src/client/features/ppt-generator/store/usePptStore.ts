import { create } from 'zustand';
import { resolveModalityModelRoute } from '@shared/domain/models/modalityStorage';
import type {
  PptAspectRatio,
  PptCreationType,
  PptDetailLevel,
  PptLanguage,
  PptOutlinePage,
  PptReferenceFile,
  PptSlidePage,
  PptStage,
  PptTemplateItem,
} from '@shared/contracts/pptGeneration';
import {
  fetchPptDetail,
  fetchPptNarration,
  fetchPptOutline,
  fetchPptSlide,
} from '../api/pptApi';

export const PPT_PRESET_TEMPLATES: PptTemplateItem[] = [
  {
    id: 'cyber-obsidian',
    name: '赛博黑曜',
    category: '科技与人工智能',
    previewUrl: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=800&q=80',
    styleDescription: '深黑底色，高质感漫反射流光渐变，极简无衬线字体，科技蓝与暖琥珀点缀，线条精致锐利。',
    themeColor: '#6366F1',
  },
  {
    id: 'nordic-minimal',
    name: '北欧极简白',
    category: '设计与日常汇报',
    previewUrl: 'https://images.unsplash.com/photo-1507679799987-c73779587ccf?w=800&q=80',
    styleDescription: '纯净微白纸张底色，大量呼吸感留白，沉稳碳黑字体，克制冷灰线条，优雅主次层级。',
    themeColor: '#0F172A',
  },
  {
    id: 'mckinsey-navy',
    name: '咨询商务蓝',
    category: '商业提案与咨询',
    previewUrl: 'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?w=800&q=80',
    styleDescription: '深海蓝与纯白撞色，严谨网格对齐，清晰的数据图表与关键数字高亮，权威可信赖的专业质感。',
    themeColor: '#0284C7',
  },
  {
    id: 'warm-amber',
    name: '高雅人文金',
    category: '品牌与文化发布',
    previewUrl: 'https://images.unsplash.com/photo-1513542789411-b6a5d4f31634?w=800&q=80',
    styleDescription: '香槟金与燕麦色柔和微渐变，典雅衬线标题搭配高可读性正文，温暖高级的艺术格调。',
    themeColor: '#D97706',
  },
];

interface PptState {
  // 项目基础信息
  title: string;
  creationType: PptCreationType;
  ideaPrompt: string;
  outlineText: string;
  language: PptLanguage;
  aspectRatio: PptAspectRatio;
  detailLevel: PptDetailLevel;
  selectedTemplateId: string;
  styleDescription: string;
  stage: PptStage;
  referenceFiles: PptReferenceFile[];
  selectedChatModel: string;
  selectedImageModel: string;
  renderMode: 'layout' | 'visual';

  // 核心内容
  outlineMarkdown: string;
  outlinePages: PptOutlinePage[];
  pages: PptSlidePage[];
  currentPageIndex: number;

  // 状态追踪
  isGeneratingOutline: boolean;
  isGeneratingDetail: boolean;
  isGeneratingSlides: boolean;
  slideProgressText: string;
  error: string | null;

  // 动作
  setTitle: (title: string) => void;
  setCreationType: (type: PptCreationType) => void;
  setIdeaPrompt: (prompt: string) => void;
  setOutlineText: (text: string) => void;
  setLanguage: (lang: PptLanguage) => void;
  setAspectRatio: (ratio: PptAspectRatio) => void;
  setDetailLevel: (level: PptDetailLevel) => void;
  setSelectedTemplateId: (id: string) => void;
  setStyleDescription: (desc: string) => void;
  setStage: (stage: PptStage) => void;
  setCurrentPageIndex: (idx: number) => void;
  setSelectedChatModel: (model: string) => void;
  setSelectedImageModel: (model: string) => void;
  setRenderMode: (mode: 'layout' | 'visual') => void;
  addReferenceFile: (file: PptReferenceFile) => void;
  removeReferenceFile: (id: string) => void;

  // 流程驱动
  generateOutline: (vibeInstruction?: string, allowFallback?: boolean) => Promise<void>;
  updateOutlinePages: (pages: PptOutlinePage[]) => void;
  generateDetails: () => Promise<void>;
  updatePageDetail: (pageIndex: number, partial: Partial<PptSlidePage['detail']>) => void;
  generateAllSlides: () => Promise<void>;
  generateSingleSlide: (pageIndex: number, editInstruction?: string, originalImageUrl?: string) => Promise<void>;
  switchPageVersion: (pageIndex: number, versionId: string) => void;
  generateNarrations: () => Promise<void>;
  resetProject: () => void;
}

export const usePptStore = create<PptState>((set, get) => ({
  title: '新一代智能演示方案',
  creationType: 'idea',
  ideaPrompt: 'AI Native 原生演示的未来趋势与商业落地实践',
  outlineText: '',
  language: 'zh',
  aspectRatio: '16:9',
  detailLevel: 'default',
  selectedTemplateId: 'cyber-obsidian',
  styleDescription: '',
  stage: 'input',
  referenceFiles: [],
  selectedChatModel: '',
  selectedImageModel: '',
  renderMode: 'layout',

  outlineMarkdown: '',
  outlinePages: [],
  pages: [],
  currentPageIndex: 1,

  isGeneratingOutline: false,
  isGeneratingDetail: false,
  isGeneratingSlides: false,
  slideProgressText: '',
  error: null,

  setTitle: (title) => set({ title }),
  setCreationType: (creationType) => set({ creationType }),
  setIdeaPrompt: (ideaPrompt) => set({ ideaPrompt }),
  setOutlineText: (outlineText) => set({ outlineText }),
  setLanguage: (language) => set({ language }),
  setAspectRatio: (aspectRatio) => set({ aspectRatio }),
  setDetailLevel: (detailLevel) => set({ detailLevel }),
  setSelectedTemplateId: (selectedTemplateId) => set({ selectedTemplateId }),
  setStyleDescription: (styleDescription) => set({ styleDescription }),
  setStage: (stage) => set({ stage }),
  setCurrentPageIndex: (currentPageIndex) => set({ currentPageIndex }),
  setSelectedChatModel: (selectedChatModel) => set({ selectedChatModel }),
  setSelectedImageModel: (selectedImageModel) => set({ selectedImageModel }),
  setRenderMode: (renderMode) => set({ renderMode }),
  addReferenceFile: (file) => set((s) => ({ referenceFiles: [...s.referenceFiles, file] })),
  removeReferenceFile: (id) => set((s) => {
    const removed = s.referenceFiles.find((f) => f.id === id);
    if (removed?.url.startsWith('blob:')) URL.revokeObjectURL(removed.url);
    return { referenceFiles: s.referenceFiles.filter((f) => f.id !== id) };
  }),

  updateOutlinePages: (outlinePages) => set({ outlinePages }),

  updatePageDetail: (pageIndex, partial) => set((state) => {
    const nextPages = state.pages.map((p) => {
      if (p.pageIndex === pageIndex) {
        return { ...p, detail: { ...p.detail, ...partial } };
      }
      return p;
    });
    return { pages: nextPages };
  }),

  switchPageVersion: (pageIndex, versionId) => set((state) => {
    const nextPages = state.pages.map((p) => {
      if (p.pageIndex === pageIndex) {
        return { ...p, currentVersionId: versionId };
      }
      return p;
    });
    return { pages: nextPages };
  }),

  generateOutline: async (vibeInstruction, allowFallback) => {
    set({ isGeneratingOutline: true, error: null });
    try {
      const state = get();
      const route = resolveModalityModelRoute('chat', state.selectedChatModel);
      const res = await fetchPptOutline({
        ideaPrompt: state.ideaPrompt,
        outlineText: state.outlineText,
        userRequirement: vibeInstruction,
        language: state.language,
        currentOutline: state.outlinePages,
        model: state.selectedChatModel ? route.modelId || undefined : undefined,
        customBaseUrl: route.baseUrl || undefined,
        customApiKey: route.apiKey || undefined,
        allowFallback,
      });

      if (res.pages && res.pages.length > 0) {
        set({
          outlineMarkdown: res.markdown,
          outlinePages: res.pages,
          stage: 'outline',
          title: res.pages[0]?.title || state.title,
        });
      }
    } catch (err: unknown) {
      set({ error: err instanceof Error ? err.message : '大纲生成失败' });
    } finally {
      set({ isGeneratingOutline: false });
    }
  },

  generateDetails: async () => {
    set({ isGeneratingDetail: true, error: null });
    try {
      const state = get();
      const route = resolveModalityModelRoute('chat', state.selectedChatModel);
      const res = await fetchPptDetail({
        outlinePages: state.outlinePages,
        detailLevel: state.detailLevel,
        language: state.language,
        model: state.selectedChatModel ? route.modelId || undefined : undefined,
        customBaseUrl: route.baseUrl || undefined,
        customApiKey: route.apiKey || undefined,
        renderMode: state.renderMode,
      });

      const pages: PptSlidePage[] = state.outlinePages.map((outline, idx) => {
        const matched = res.details?.find((item) => Number(item.pageIndex) === outline.pageIndex);
        const det = matched || res.details?.[idx] || {
          pageIndex: outline.pageIndex,
          title: outline.title,
          contentText: `## ${outline.title}\n\n${outline.points.map((p) => `• ${p}`).join('\n')}`,
          visualAssets: '极简视觉构图，高质感光晕',
          layoutEmphasis: '左文右图卡片编排',
          speakerNotes: '本页核心结论演讲逻辑展开',
        };
        return {
          id: `page_${outline.pageIndex}_${Date.now()}`,
          pageIndex: outline.pageIndex,
          title: outline.title,
          outline,
          detail: det,
          versions: [],
          isGenerating: false,
        };
      });

      set({
        pages,
        stage: 'detail',
        currentPageIndex: 1,
      });
    } catch (err: unknown) {
      set({ error: err instanceof Error ? err.message : '生成页面描述失败' });
    } finally {
      set({ isGeneratingDetail: false });
    }
  },

  generateAllSlides: async () => {
    const state = get();
    set({ isGeneratingSlides: true, stage: 'studio', error: null });

    const tmpl = PPT_PRESET_TEMPLATES.find((t) => t.id === state.selectedTemplateId);
    const styleText = state.styleDescription || tmpl?.styleDescription || '';

    try {
      for (let i = 0; i < state.pages.length; i++) {
        const page = state.pages[i];
        set({ slideProgressText: `正在精细排版并渲染第 ${i + 1}/${state.pages.length} 页...` });

        try {
          const route = resolveModalityModelRoute('image', state.selectedImageModel);
          const pageDesc = state.renderMode === 'layout'
            ? (page.detail.visualAssets || page.title)
            : `${page.detail.contentText}\n\n版式：${page.detail.layoutEmphasis || ''}\n视觉：${page.detail.visualAssets || ''}`;
          const res = await fetchPptSlide({
            pageIndex: page.pageIndex,
            outlineTitle: page.title,
            pageDesc,
            aspectRatio: state.aspectRatio,
            pageStyleText: state.renderMode === 'layout' ? '' : styleText,
            templateImageUrl: state.renderMode === 'layout' ? undefined : tmpl?.previewUrl,
            modelId: state.selectedImageModel ? route.modelId || undefined : undefined,
            customBaseUrl: route.baseUrl || undefined,
            customApiKey: route.apiKey || undefined,
            renderMode: state.renderMode,
          });

          set((s) => {
            const nextPages = s.pages.map((p) => {
              if (p.pageIndex === page.pageIndex) {
                const newVersion = {
                  id: res.versionId,
                  url: res.url,
                  prompt: res.prompt,
                  createdAt: Date.now(),
                };
                return {
                  ...p,
                  currentVersionId: res.versionId,
                  versions: [...p.versions, newVersion],
                  isGenerating: false,
                };
              }
              return p;
            });
            return { pages: nextPages };
          });
        } catch (pageErr) {
          const message = pageErr instanceof Error ? pageErr.message : '生图失败';
          set((s) => ({
            pages: s.pages.map((p) => (p.pageIndex === page.pageIndex ? { ...p, error: message, isGenerating: false } : p)),
            error: message,
          }));
        }
      }
    } finally {
      set({ isGeneratingSlides: false, slideProgressText: '' });
    }
  },

  generateSingleSlide: async (pageIndex, editInstruction, originalImageUrl) => {
    const state = get();
    const page = state.pages.find((p) => p.pageIndex === pageIndex);
    if (!page) return;

    set((s) => ({
      pages: s.pages.map((p) => (p.pageIndex === pageIndex ? { ...p, isGenerating: true } : p)),
    }));

    const tmpl = PPT_PRESET_TEMPLATES.find((t) => t.id === state.selectedTemplateId);
    const styleText = state.styleDescription || tmpl?.styleDescription || '';

    try {
      const route = resolveModalityModelRoute('image', state.selectedImageModel);
      const res = await fetchPptSlide({
        pageIndex,
        outlineTitle: page.title,
        pageDesc: state.renderMode === 'layout' ? (page.detail.visualAssets || page.title) : `${page.detail.contentText}\n\n版式：${page.detail.layoutEmphasis || ''}\n视觉：${page.detail.visualAssets || ''}`,
        renderMode: state.renderMode,
        aspectRatio: state.aspectRatio,
        pageStyleText: styleText,
        templateImageUrl: tmpl?.previewUrl,
        editInstruction,
        originalImageUrl,
        modelId: state.selectedImageModel ? route.modelId || undefined : undefined,
        customBaseUrl: route.baseUrl || undefined,
        customApiKey: route.apiKey || undefined,
      });

      set((s) => ({
        pages: s.pages.map((p) => {
          if (p.pageIndex === pageIndex) {
            const newVersion = {
              id: res.versionId,
              url: res.url,
              prompt: res.prompt,
              editInstruction,
              createdAt: Date.now(),
            };
            return {
              ...p,
              currentVersionId: res.versionId,
              versions: [...p.versions, newVersion],
              isGenerating: false,
            };
          }
          return p;
        }),
      }));
    } catch (err: unknown) {
      set((s) => ({
        error: err instanceof Error ? err.message : '单页生图失败',
        pages: s.pages.map((p) => (p.pageIndex === pageIndex ? { ...p, isGenerating: false } : p)),
      }));
    }
  },

  generateNarrations: async () => {
    const state = get();
    try {
      const route = resolveModalityModelRoute('chat', state.selectedChatModel);
      const res = await fetchPptNarration({
        pages: state.pages.map((p) => ({
          pageIndex: p.pageIndex,
          title: p.title,
          contentText: p.detail.contentText,
        })),
        model: state.selectedChatModel ? route.modelId || undefined : undefined,
        customBaseUrl: route.baseUrl || undefined,
        customApiKey: route.apiKey || undefined,
      });

      if (res.narrations) {
        set((s) => ({
          pages: s.pages.map((p) => ({
            ...p,
            narrationText: res.narrations[String(p.pageIndex)] || p.narrationText,
          })),
        }));
      }
    } catch (err) {
      console.error('Narration generation error:', err);
    }
  },

  resetProject: () => {
    get().referenceFiles.forEach((file) => {
      if (file.url.startsWith('blob:')) URL.revokeObjectURL(file.url);
    });
    set({
      stage: 'input',
      outlinePages: [],
      pages: [],
      outlineMarkdown: '',
      referenceFiles: [],
      currentPageIndex: 1,
      error: null,
    });
  },
}));
