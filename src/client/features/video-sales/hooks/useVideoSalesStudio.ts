import { useState, useEffect, useCallback } from 'react';
import { resolveModalityModelRoute } from '@shared/domain/models/modalityStorage';
import type {
  VideoSalesCategory,
  VideoSalesMode,
  VideoSalesProductAnalysis,
  VideoSalesScript,
  VideoSalesShot,
  VideoSalesStyleType,
} from '@shared/domain/video-sales';
import { VIDEO_SALES_PRESET_TEMPLATES } from '@shared/domain/video-sales';
import {
  analyzeProductMedia,
  composeSalesVideo,
  generateSalesScripts,
  synthesizeSalesVoice,
} from '../api/videoSalesApi';

export type VideoSalesStep = 'setup' | 'script' | 'assets' | 'compose' | 'export';

const STORAGE_KEY = 'beike.video_sales.draft.v1';

export interface VideoSalesStudioState {
  currentStep: VideoSalesStep;
  productName: string;
  category: VideoSalesCategory;
  sellingPoints: string;
  priceRange: string;
  targetAudience: string;
  selectedPlatforms: string[];
  videoMode: VideoSalesMode;
  styleType: VideoSalesStyleType;
  targetDuration: number;
  productImages: string[];
  selectedChatModel?: string;
  selectedImageModel?: string;
  selectedVideoModel?: string;
  selectedVoiceModel?: string;
  analysis: VideoSalesProductAnalysis | null;
  scripts: VideoSalesScript[];
  selectedScriptIndex: number;
  selectedTemplateId: string | null;
  composedResultUrl: string | null;
  composedCommand: string | null;
}

const defaultState: VideoSalesStudioState = {
  currentStep: 'setup',
  productName: '德宝湿水不破纸巾',
  category: 'home',
  sellingPoints: '4层加厚韧性升级，湿水不破擦拭无碎屑，可作湿巾使用',
  priceRange: '29.9元/12包',
  targetAudience: '精致宝妈、上班族、对纸品品质有要求的白领',
  selectedPlatforms: ['douyin', 'xiaohongshu'],
  videoMode: 'product_closeup',
  styleType: 'pain_point',
  targetDuration: 25,
  productImages: [
    'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=800&auto=format&fit=crop&q=80',
  ],
  analysis: null,
  scripts: [],
  selectedScriptIndex: 0,
  selectedTemplateId: null,
  composedResultUrl: null,
  composedCommand: null,
};

export function useVideoSalesStudio() {
  const [state, setState] = useState<VideoSalesStudioState>(() => {
    if (typeof window === 'undefined') return defaultState;
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        return { ...defaultState, ...parsed };
      }
    } catch {
      // ignore
    }
    return defaultState;
  });

  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isGeneratingScript, setIsGeneratingScript] = useState(false);
  const [isComposing, setIsComposing] = useState(false);
  const [composeProgress, setComposeProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // 自动持久化草稿
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // ignore
    }
  }, [state]);

  const updateState = useCallback((patch: Partial<VideoSalesStudioState>) => {
    setState((prev) => ({ ...prev, ...patch }));
  }, []);

  const goToStep = useCallback((step: VideoSalesStep) => {
    setState((prev) => ({ ...prev, currentStep: step }));
  }, []);

  // 1. 商品智能视觉分析
  const runProductAnalysis = useCallback(async () => {
    if (state.productImages.length === 0) {
      setError('请至少添加一张商品参考图');
      return;
    }
    setIsAnalyzing(true);
    setError(null);
    try {
      const route = resolveModalityModelRoute('chat', state.selectedChatModel);
      const res = await analyzeProductMedia({
        imageUrls: state.productImages,
        productName: state.productName,
        category: state.category,
        model: state.selectedChatModel ? route.modelId || undefined : undefined,
        customBaseUrl: route.baseUrl || undefined,
        customApiKey: route.apiKey || undefined,
      });
      updateState({
        analysis: res,
        sellingPoints: res.sellingPoints?.join('；') || state.sellingPoints,
        targetAudience: res.targetAudience || state.targetAudience,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : '商品分析失败');
    } finally {
      setIsAnalyzing(false);
    }
  }, [state.productImages, state.productName, state.category, state.sellingPoints, state.targetAudience, state.selectedChatModel, updateState]);

  // 2. 脚本生成
  const runScriptGeneration = useCallback(async () => {
    if (!state.productName.trim()) {
      setError('请填写商品名称');
      return;
    }
    setIsGeneratingScript(true);
    setError(null);
    try {
      const route = resolveModalityModelRoute('chat', state.selectedChatModel);
      const res = await generateSalesScripts({
        productName: state.productName,
        category: state.category,
        productDescription: state.sellingPoints,
        productImages: state.productImages,
        productAnalysis: state.analysis ? JSON.stringify(state.analysis) : undefined,
        videoMode: state.videoMode,
        styleType: state.styleType,
        targetDuration: state.targetDuration,
        priceRange: state.priceRange,
        targetAudience: state.targetAudience,
        platforms: state.selectedPlatforms,
        templateId: state.selectedTemplateId || undefined,
        model: state.selectedChatModel ? route.modelId || undefined : undefined,
        customBaseUrl: route.baseUrl || undefined,
        customApiKey: route.apiKey || undefined,
      });

      if (res.length === 0) {
        setError('没有生成可用脚本，请调整商品信息后重试，或使用示例脚本');
        return;
      }
      updateState({
        scripts: res,
        selectedScriptIndex: 0,
        currentStep: 'script',
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : '生成脚本失败');
    } finally {
      setIsGeneratingScript(false);
    }
  }, [state, updateState]);

  // 修改当前脚本的分镜
  const updateCurrentScriptShots = useCallback((next: VideoSalesShot[] | ((shots: VideoSalesShot[]) => VideoSalesShot[])) => {
    setState((prev) => {
      const scripts = [...prev.scripts];
      const cur = scripts[prev.selectedScriptIndex];
      if (!cur) return prev;
      const newShots = typeof next === 'function' ? next(cur.shots) : next;
      scripts[prev.selectedScriptIndex] = {
        ...cur,
        shots: newShots,
        totalDuration: newShots.reduce((acc, s) => acc + (s.duration || 3), 0),
      };
      return { ...prev, scripts };
    });
  }, []);

  // 4. 执行 FFmpeg 视频合成
  const useExampleScripts = useCallback(() => {
    const presets = VIDEO_SALES_PRESET_TEMPLATES.filter((item) => item.category === state.category);
    const scripts: VideoSalesScript[] = presets.map((item) => ({
      id: item.id,
      title: item.name,
      styleType: item.styleType,
      totalDuration: item.shots.reduce((acc, shot) => acc + shot.duration, 0),
      shots: item.shots,
      seo: item.seo,
    }));
    if (scripts.length === 0) {
      setError('当前品类没有示例脚本');
      return;
    }
    updateState({ scripts, selectedScriptIndex: 0, currentStep: 'script' });
  }, [state.category, updateState]);

  const runVideoComposition = useCallback(async (options?: { bgmPath?: string; bgmVolume?: number; aspectRatio?: string }) => {
    const curScript = state.scripts[state.selectedScriptIndex];
    if (!curScript || curScript.shots.length === 0) {
      setError('没有可合成的分镜脚本');
      return;
    }
    setIsComposing(true);
    setComposeProgress(10);
    setError(null);

    const timer = setInterval(() => {
      setComposeProgress((p) => (p < 85 ? p + 15 : p));
    }, 400);

    try {
      const voiceRoute = resolveModalityModelRoute('voice', state.selectedVoiceModel);
      const clips = [];
      for (let idx = 0; idx < curScript.shots.length; idx += 1) {
        const shot = curScript.shots[idx];
        let audioUrl = shot.audioUrl;
        if (shot.voiceover?.trim() && voiceRoute.modelId && voiceRoute.baseUrl && voiceRoute.apiKey) {
          audioUrl = await synthesizeSalesVoice({
            text: shot.voiceover,
            model: voiceRoute.modelId,
            customBaseUrl: voiceRoute.baseUrl,
            customApiKey: voiceRoute.apiKey,
          });
        }
        clips.push({
          type: (shot.visualSource === 'product_image' ? 'image' : 'video') as 'image' | 'video',
          filePath: shot.assetUrl || (state.productImages[idx % state.productImages.length] || ''),
          duration: shot.duration,
          transition: shot.transition,
          motion: shot.motion || 'zoom_in_slow',
          hasAudio: Boolean(audioUrl),
          audioUrl,
          voiceover: shot.voiceover,
        });
      }
      if (clips.some((clip) => !clip.filePath)) {
        setError('有分镜还没有画面素材');
        return;
      }

      let accumTime = 0;
      const subtitles = curScript.shots.map((shot) => {
        const start = accumTime;
        const end = accumTime + shot.duration;
        accumTime = end;
        return {
          text: shot.voiceover || shot.description,
          startTime: start,
          endTime: end,
        };
      });

      const res = await composeSalesVideo({
        projectId: `proj_${Date.now()}`,
        clips,
        output: {
          resolution: '1080p',
          aspectRatio: options?.aspectRatio || '9:16',
          bgmVolume: options?.bgmVolume ?? 0.3,
          bgmPath: options?.bgmPath,
        },
        subtitles,
      });

      setComposeProgress(100);
      updateState({
        composedResultUrl: res.resultUrl || clips[0].filePath,
        composedCommand: res.command,
        currentStep: 'export',
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : '视频合成失败');
    } finally {
      clearInterval(timer);
      setIsComposing(false);
    }
  }, [state.scripts, state.selectedScriptIndex, state.productImages, state.selectedVoiceModel, updateState]);

  const resetProject = useCallback(() => {
    setState(defaultState);
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  return {
    state,
    updateState,
    goToStep,
    isAnalyzing,
    isGeneratingScript,
    isComposing,
    composeProgress,
    error,
    setError,
    runProductAnalysis,
    runScriptGeneration,
    updateCurrentScriptShots,
    runVideoComposition,
    useExampleScripts,
    resetProject,
  };
}
