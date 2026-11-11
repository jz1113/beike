import { registerRefMediaKind } from '@client/shared/media/refMediaRegistry';
import { loadPromptPreferences, savePromptPreferences, restoreImagePromptOptions } from '@client/shared/prompt-bar/promptBarPreferencesTypes';
import { Suspense, useEffect, useRef, useState, type ReactNode } from 'react';
import { useAppStore } from '@client/store';
import { useQuickRefMediaDrop } from '@client/shared/hooks/useQuickRefMediaDrop';
import { useSafeTimeout, useViewVisibility } from '@client/shared/hooks/useSafeTimeout';
import { useToast } from '@client/shared/hooks/useToast';
import { modalityPickerSelections } from '@shared/domain/models/modalityStorage';
import { getEnabledImageModelsFromSettings, getEnabledVideoModelsFromSettings } from '@shared/domain/models/workflowModels';
import PromptActionBar from '@client/shared/prompt-bar/PromptActionBar';
import InspirationFeed from './components/inspiration/InspirationFeed';
import { inspirationComposerState, type InspirationUseOptions } from './model/inspirationItem';

interface Props {
  homeMode: 'generate' | 'canvas';
  setHomeMode: (mode: 'generate' | 'canvas') => void;
  recentProjects?: ReactNode;
}

export default function HomePage({
  recentProjects,
  homeMode,
  setHomeMode,
}: Props) {

  const { dropZoneProps: pageMediaDropProps, toastMsg: dropToastMsg } = useQuickRefMediaDrop();
  const visible = useViewVisibility();
  const quickGenMode = useAppStore(state => state.quickGenMode);
  const { message: inspirationNotice, show: showInspirationNotice, clear: clearInspirationNotice } = useToast(6000);
  const { setSafeTimeout } = useSafeTimeout();
  const heading = homeMode === 'canvas' ? '让灵感，在画布上展开' : {
    agent: '把想法，交给 Agent', image: '把灵感，变成画面', video: '让想法，动起来',
    audio: '让创意，被听见', collect: '从商品，开始创作',
    'depth-image': '提取画面中的空间层次', 'depth-video': '捕捉视频中的动作与深度',
  }[quickGenMode];
  const [canvasVisited, setCanvasVisited] = useState(homeMode === 'canvas');
  useEffect(() => {
    useAppStore.getState().invalidatePromptAttachments();
    if (homeMode === 'canvas') setCanvasVisited(true);
  }, [homeMode]);
  const modePanel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (visible && useAppStore.getState().previousView === 'canvas') {
      modePanel.current?.focus();
    } else if (visible && useAppStore.getState().previousView === 'asset_library') {
      const frame = requestAnimationFrame(() => modePanel.current?.querySelector<HTMLElement>('[contenteditable="true"]')?.focus());
      return () => cancelAnimationFrame(frame);
    }
  }, [visible]);

  const handleUsePrompt = (prompt: string, opts: InspirationUseOptions) => {
    clearInspirationNotice();
    if (opts?.referenceAudioUrls?.length) {
      return '此作品包含参考音频，请回原画布编辑或重试原任务以保留完整素材';
    }
    if (opts?.referenceImages?.some(url => url.startsWith('blob:'))) {
      return '此作品的参考素材使用临时地址，请回原任务确认素材后重试';
    }
    restoreImagePromptOptions(opts?.imageGenerationQuality, opts?.inferenceStrength);
    if (opts?.generateAudio !== undefined) {
      const prefs = loadPromptPreferences();
      savePromptPreferences({ ...prefs, video: { ...prefs.video, generateAudio: opts.generateAudio } });
    }
    for (const url of opts?.referenceVideoUrls ?? []) registerRefMediaKind(url, 'video');
    useAppStore.getState().invalidatePromptAttachments();
    const patch = inspirationComposerState(prompt, undefined, opts);
    const kind = patch.quickGenMode === 'video' ? 'video' : 'image';
    const modelKey = kind === 'video' ? 'quickVideoModel' : 'quickModel';
    const requestedModel = patch[modelKey];
    if (requestedModel) {
      const choices: { id: string; upstreamId?: string }[] = modalityPickerSelections(kind)?.map(model => ({ id: model.id, upstreamId: model.modelId }))
        ?? (kind === 'video' ? getEnabledVideoModelsFromSettings() : getEnabledImageModelsFromSettings());
      const matching = choices.filter(model => model.id === requestedModel || model.upstreamId === requestedModel);
      const currentModel = useAppStore.getState()[modelKey];
      const selected = matching.find(model => model.id === currentModel) || matching[0];
      if (selected) patch[modelKey] = selected.id;
      else {
        delete patch[modelKey];
        showInspirationNotice(`案例模型 ${requestedModel} 当前不可用，${currentModel ? '已保留当前模型，请确认生成参数' : '请先配置并选择可用模型'}`);
      }
    }
    setHomeMode('generate');
    useAppStore.setState(patch);
    setSafeTimeout(() => {
      const panel = modePanel.current;
      panel?.querySelector<HTMLElement>('[contenteditable="true"]')?.focus({ preventScroll: true });
      panel?.closest('[data-hub-scroll]')?.scrollTo({ top: 0 });
    }, 0);
    return undefined;
  };

  return (
    <div
      data-hub-scroll
      {...pageMediaDropProps}
      className="flex-1 min-w-0 w-full overflow-y-auto [scrollbar-gutter:stable] bg-[#f8fafc] dark:bg-[#111318] text-slate-900 dark:text-slate-100 select-none pb-16 relative"
    >
      {dropToastMsg && (
        <div className="pointer-events-none fixed top-20 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-2xl bg-slate-900/95 dark:bg-[#20232A]/95 backdrop-blur-md border border-transparent dark:border-white/10 text-white dark:text-[#EDEDED] text-xs font-semibold shadow-xl">
          {dropToastMsg}
        </div>
      )}
      <div className="w-full px-4 pb-5 pt-6 sm:px-6 sm:pt-8 lg:px-8 2xl:px-10">
        <section className="mx-auto w-full max-w-6xl xl:max-w-[1440px] 2xl:max-w-[1640px]">
          <h1 className="relative z-20 mx-auto mb-6 max-w-[1200px] text-[24px] font-medium tracking-tight text-slate-950 dark:text-white sm:text-[28px]">
            {heading}
          </h1>

          <div ref={modePanel} id="home-mode-panel" role="region" tabIndex={-1} aria-label={homeMode === 'canvas' ? '无限画布' : quickGenMode === 'agent' ? 'Agent 创作' : '生成创作'} className={`mx-auto w-full max-w-[1200px] rounded-3xl ${homeMode === 'canvas' ? 'outline-none' : ''}`}>
            {homeMode === 'generate' && (
              <div className="relative z-30">
                <PromptActionBar inputPlaceholder={{
                  agent: '输入想法、描述或上传参考，开始创作',
                  image: '描述想生成的画面，或上传参考图',
                  video: '描述镜头与动作，或上传参考素材',
                  audio: '输入台词或声音描述，开始生成音频',
                  collect: undefined, 'depth-image': undefined, 'depth-video': undefined,
                }[quickGenMode]} />
                {inspirationNotice && <p role="status" className="mt-3 px-2 text-sm text-amber-700 dark:text-amber-300">{inspirationNotice}</p>}
              </div>
            )}
            {(homeMode === 'canvas' || canvasVisited) && (
              <div aria-hidden={homeMode !== 'canvas'} inert={homeMode !== 'canvas'} className={homeMode === 'canvas' ? 'relative z-20' : 'hidden'}>
                <Suspense fallback={<p role="status" className="text-sm text-slate-500">正在加载项目列表…</p>}>
                  {recentProjects}
                </Suspense>
              </div>
            )}
          </div>
        </section>

        <div className="relative z-0 mt-10 w-full">
          <InspirationFeed onUsePrompt={handleUsePrompt} />
        </div>
      </div>

    </div>
  );
}
