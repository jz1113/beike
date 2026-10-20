import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, Plus, Wrench } from 'lucide-react';
import PromptBarModeSelector from './PromptBarModeSelector';
import PromptBarUploadMenu from './PromptBarUploadMenu';
import { PromptBarAssetPickerModal } from './PromptBarAssetPickerModal';
import { PromptBarAtMenu } from './PromptBarAtMenu';
import { agentTriggerModelName, menuLabelForModel, PromptBarModelPickerModal } from './PromptBarModelPickerModal';
import { PromptBarReasoningPill } from './PromptBarReasoningPill';
import { PromptBarParamsPill } from './PromptBarParamsPill';
import PromptBarSkillsModal from './PromptBarSkillsModal';
import { PromptBarSkillCreatorHost, usePromptBarSkillCreator } from './PromptBarSkillCreator';
import { PromptBarSendActions } from './PromptBarSendActions';
import type { PromptBarControlsRowProps } from './PromptBarControlsRowTypes';
import { useAppStore } from '@client/store';
import { useI18n } from '@client/shared/i18n';
import { matchesStoredModel, usePreferenceModels } from '../hooks/usePromptBarWorkflowModels';
import type { QuickGenMode } from '@shared/domain/media/depthVideo';

function flatTriggerClass(active: boolean) {
  return `flex h-8 min-w-0 cursor-pointer items-center gap-1 rounded-lg px-1.5 text-[13px] font-medium transition-colors ${
    active
      ? 'bg-slate-100 text-slate-900 dark:bg-white/10 dark:text-white'
      : 'text-slate-800 hover:bg-slate-100 dark:text-slate-100 dark:hover:bg-white/10'
  }`;
}

function modalityOf(mode: QuickGenMode): 'chat' | 'image' | 'video' | 'audio' {
  if (mode === 'agent') return 'chat';
  if (mode === 'video' || mode === 'depth-video') return 'video';
  if (mode === 'audio') return 'audio';
  return 'image';
}

export const PromptBarControlsRow = React.memo(function PromptBarControlsRow(props: PromptBarControlsRowProps) {
  const { t } = useI18n();
  const {
    isUp,
    anyDropdownOpen = false,
    quickGenMode,
    isDepthMode,
    modeMenu,
    modeButtonClass,
    handleModeSwitch,
    setQuickVideoModel,
    setQuickVideoDuration,
    setQuickModel,
    setQuickVideoAspectId,
    setQuickVideoResolution,
    setQuickAspectId,
    setQuickQuality,
    setQuickPrompt,
    media,
    richInputRef,
    handleSendPrompt,
    canSend,
    isSubmitting,
    quickVideoModel,
    quickModel,
    quickAudioModel,
    setQuickAudioModel,
    quickVideoRefMode,
    setQuickVideoRefMode,
    quickVideoAspectId,
    quickVideoResolution,
    quickVideoDuration,
    quickAspectId,
    quickQuality,
  } = props;

  const [showUploadMenu, setShowUploadMenu] = useState(false);
  const [isUploadHovered, setIsUploadHovered] = useState(false);
  const [isAtHovered, setIsAtHovered] = useState(false);
  const [showAssetPickerModal, setShowAssetPickerModal] = useState(false);
  const [showSkillsModal, setShowSkillsModal] = useState(false);
  const [showModelPicker, setShowModelPicker] = useState(false);
  const skillCreator = usePromptBarSkillCreator(richInputRef);

  const assistantModel = useAppStore((state) => state.assistantModel);
  const setAssistantModel = useAppStore((state) => state.setAssistantModel);
  const { ready, videoModels, imageModels, audioModels, multimodalModels } = usePreferenceModels();

  const uploadButtonRef = useRef<HTMLButtonElement>(null);
  const skillsButtonRef = useRef<HTMLButtonElement>(null);
  const modelButtonRef = useRef<HTMLButtonElement>(null);

  const isAgent = quickGenMode === 'agent';
  const isVideo = quickGenMode === 'video' || quickGenMode === 'depth-video';
  const isAudio = quickGenMode === 'audio';
  const currentModelsList = isAgent ? multimodalModels : isVideo ? videoModels : isAudio ? audioModels : imageModels;
  const storedModelId = isAgent ? assistantModel : isVideo ? quickVideoModel : isAudio ? quickAudioModel : quickModel;

  useEffect(() => {
    if (!ready) return;
    const apply = isAgent ? setAssistantModel : isVideo ? setQuickVideoModel : isAudio ? setQuickAudioModel : setQuickModel;
    if (!currentModelsList.length) {
      if (storedModelId) apply('');
      return;
    }
    if (!currentModelsList.some((model) => matchesStoredModel(model, storedModelId))) apply(currentModelsList[0].id);
  }, [
    ready,
    isAgent,
    isVideo,
    isAudio,
    currentModelsList,
    storedModelId,
    setAssistantModel,
    setQuickVideoModel,
    setQuickAudioModel,
    setQuickModel,
  ]);

  const selected = currentModelsList.find((model) => matchesStoredModel(model, storedModelId));
  const selectedModelId = selected?.id || '';
  const modelSourceId = selected?.upstreamId || selectedModelId;
  const modelDisplayName = modelSourceId ? menuLabelForModel(modelSourceId, selected?.name || modelSourceId) : '未配置模型';
  const agentModelName = agentTriggerModelName(modelSourceId, selected?.name || modelDisplayName);

  const menuOpen = anyDropdownOpen || showUploadMenu || showSkillsModal || skillCreator.overlayOpen || showModelPicker || media.showAtMenu;

  return (
    <div className={`relative mt-auto flex select-none flex-wrap items-center gap-1.5 pt-1 sm:gap-2 sm:pt-1.5 ${menuOpen ? 'z-40' : 'z-10'}`}>
      <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
        <div className="relative">
          <button
            ref={uploadButtonRef}
            type="button"
            aria-label="上传素材"
            onClick={() => {
              setShowUploadMenu(!showUploadMenu);
              setIsUploadHovered(false);
            }}
            onMouseEnter={() => setIsUploadHovered(true)}
            onMouseLeave={() => setIsUploadHovered(false)}
            className={`flex h-7.5 w-7.5 shrink-0 cursor-pointer items-center justify-center rounded-full transition-all active:scale-95 sm:h-8 sm:w-8 ${
              showUploadMenu
                ? 'bg-slate-100 text-slate-900 dark:bg-white/20 dark:text-white'
                : 'bg-transparent text-slate-600 hover:bg-slate-100/80 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-white/10 dark:hover:text-white'
            }`}
          >
            <Plus className="h-4 w-4 stroke-[2.2]" />
          </button>
          {isUploadHovered && !showUploadMenu && (
            <div role="tooltip" className={`pointer-events-none absolute left-1/2 z-50 -translate-x-1/2 whitespace-nowrap rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-800 shadow-md dark:border-white/10 dark:bg-slate-900 dark:text-white ${isUp ? 'bottom-full mb-2' : 'top-full mt-2'}`}>
              上传素材
            </div>
          )}
          <PromptBarUploadMenu
            isOpen={showUploadMenu}
            onClose={() => setShowUploadMenu(false)}
            triggerRef={uploadButtonRef}
            isUp={isUp}
            onTriggerLocalUpload={() => media.fileInputRef.current?.click()}
            onOpenAssetLibrary={() => setShowAssetPickerModal(true)}
            onSubmitVideoUrl={(url) => useAppStore.getState().addQuickRefImage(url)}
            onSelectPresetPrompt={(preset) => {
              setQuickPrompt(preset);
              richInputRef.current?.focus();
            }}
          />
        </div>

        <div className="relative" ref={media.atMenuButtonRef}>
          <button
            type="button"
            aria-label="引用角色与素材"
            onClick={() => {
              setIsAtHovered(false);
              if (media.showAtMenu) {
                media.setShowAtMenu(false);
                media.setAtMenuTrigger?.(null);
              } else {
                richInputRef.current?.insertAtSymbol();
                media.setAtMenuTrigger?.('input');
                media.setShowAtMenu(true);
              }
              richInputRef.current?.focus();
            }}
            onMouseEnter={() => setIsAtHovered(true)}
            onMouseLeave={() => setIsAtHovered(false)}
            className={`flex h-7.5 w-7.5 shrink-0 cursor-pointer items-center justify-center rounded-full transition-all active:scale-95 sm:h-8 sm:w-8 ${
              media.showAtMenu
                ? 'bg-slate-100 text-slate-900 dark:bg-white/20 dark:text-white'
                : 'bg-transparent text-slate-600 hover:bg-slate-100/80 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-white/10 dark:hover:text-white'
            }`}
          >
            <span className="select-none text-[15px] font-medium leading-none text-slate-700 dark:text-slate-200">@</span>
          </button>
          {isAtHovered && !media.showAtMenu && (
            <div role="tooltip" className={`pointer-events-none absolute left-0 z-50 w-64 rounded-2xl border border-slate-200 bg-white p-3 text-left text-slate-700 shadow-[0_12px_28px_rgba(0,0,0,0.12)] dark:border-white/10 dark:bg-[#18191c] dark:text-slate-200 ${isUp ? 'bottom-full mb-2.5' : 'top-full mt-2.5'}`}>
              <div className="mb-1 text-[13px] font-semibold">引用角色与素材</div>
              <div className="text-xs font-normal leading-relaxed text-slate-500 dark:text-slate-400">点击后会自动输入 @ 并打开角色库，可快速插入角色、图片、视频等引用。</div>
            </div>
          )}
          {media.showAtMenu && media.atMenuTrigger === 'button' && (
            <PromptBarAtMenu
              atMenuRef={media.atMenuRef}
              anchorRef={media.atMenuButtonRef}
              isUp={isUp}
              atMenuQuery={media.atMenuQuery}
              allSubjects={media.allSubjects}
              activeSubjects={media.activeSubjects}
              onCreateSubjectClick={() => media.createSubjectInputRef.current?.click()}
              onSelectSubject={media.handleSelectSubject}
              onClose={() => {
                media.setShowAtMenu(false);
                media.setAtMenuTrigger?.(null);
              }}
            />
          )}
        </div>

        <PromptBarModeSelector
          isUp={isUp}
          quickGenMode={quickGenMode}
          isDepthMode={isDepthMode}
          isOpen={modeMenu.isOpen}
          onToggle={modeMenu.toggle}
          menuRef={modeMenu.ref}
          modeButtonClass={modeButtonClass}
          onSelectMode={handleModeSwitch}
        />
      </div>

      <div className="flex min-w-0 flex-1 flex-nowrap items-center justify-center gap-1">
        <div className="relative">
          <button
            ref={skillsButtonRef}
            type="button"
            onClick={() => setShowSkillsModal(!showSkillsModal)}
            className={`${flatTriggerClass(showSkillsModal)} shrink-0`}
            title="选择或管理创作技能"
          >
            <Wrench className="h-3.5 w-3.5 shrink-0 stroke-[2] text-current" />
            <span>{t('sidebar.skills')}</span>
            <ChevronDown className="h-3 w-3 shrink-0" />
          </button>
          <PromptBarSkillsModal
            isOpen={showSkillsModal}
            onClose={() => setShowSkillsModal(false)}
            triggerRef={skillsButtonRef}
            isUp={isUp}
            onUseSkill={skillCreator.useSkill}
            onAgentCreate={skillCreator.openAgentCreate}
            onManualCreate={skillCreator.openManualCreate}
            onUploadFiles={skillCreator.uploadFiles}
          />
        </div>

        <div className="relative min-w-0">
          <button
            ref={modelButtonRef}
            type="button"
            onClick={() => setShowModelPicker(!showModelPicker)}
            className={`${flatTriggerClass(showModelPicker)} max-w-[220px]`}
            title={selectedModelId ? `当前模型：${isAgent ? agentModelName : modelSourceId}` : '未配置模型'}
          >
            <span className="truncate">{isAgent ? agentModelName : modelDisplayName}</span>
            {showModelPicker ? <ChevronUp className="h-3 w-3 shrink-0" /> : <ChevronDown className="h-3 w-3 shrink-0" />}
          </button>
          <PromptBarModelPickerModal
            isOpen={showModelPicker}
            onClose={() => setShowModelPicker(false)}
            triggerRef={modelButtonRef}
            isUp={isUp}
            models={currentModelsList}
            selectedModelId={selectedModelId}
            modalityKind={modalityOf(quickGenMode)}
            onSelectModel={(modelId) => {
              if (isAgent) setAssistantModel(modelId);
              else if (isVideo) setQuickVideoModel(modelId);
              else if (isAudio) setQuickAudioModel(modelId);
              else setQuickModel(modelId);
            }}
          />
        </div>

        {isAgent ? (
          <PromptBarReasoningPill assistantModel={selectedModelId} isUp={isUp} />
        ) : (
          <PromptBarParamsPill
            isUp={isUp}
            quickGenMode={quickGenMode}
            modelId={selectedModelId}
            supportedAspectRatios={selected?.supportedAspectRatios}
            supportedResolutions={selected?.supportedResolutions}
            quickVideoRefMode={quickVideoRefMode}
            quickVideoAspectId={quickVideoAspectId}
            quickVideoResolution={quickVideoResolution}
            quickVideoDuration={quickVideoDuration}
            setQuickVideoRefMode={setQuickVideoRefMode}
            setQuickVideoAspectId={setQuickVideoAspectId}
            setQuickVideoResolution={setQuickVideoResolution}
            setQuickVideoDuration={setQuickVideoDuration}
            quickAspectId={quickAspectId}
            quickQuality={quickQuality}
            setQuickAspectId={setQuickAspectId}
            setQuickQuality={setQuickQuality}
          />
        )}
      </div>

      <div className="ml-auto flex shrink-0 items-center">
        <PromptBarSendActions
          isAgentMode={isAgent}
          canSend={canSend}
          isSubmitting={isSubmitting}
          handleSendPrompt={handleSendPrompt}
          quickGenMode={quickGenMode}
        />
      </div>

      <PromptBarAssetPickerModal isOpen={showAssetPickerModal} onClose={() => setShowAssetPickerModal(false)} />
      <PromptBarSkillCreatorHost creator={skillCreator} />
    </div>
  );
});
