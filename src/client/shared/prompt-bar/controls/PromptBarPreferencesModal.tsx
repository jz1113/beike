import React, { useState, useRef, useEffect, type RefObject } from 'react';
import { useAppStore } from '@client/store';
import {
  type PromptPreferencesTab,
  type PromptComposerPreferences,
  type VideoAspectOption,
  type ImageAspectOption,
  loadPromptPreferences,
  savePromptPreferences,
} from '../promptBarPreferencesTypes';
import { usePreferenceModels } from '../hooks/usePromptBarWorkflowModels';
import { PromptBarVideoTab } from './preferences/PromptBarVideoTab';
import { PromptBarImageTab } from './preferences/PromptBarImageTab';
import { PromptBarReasoningTab } from './preferences/PromptBarReasoningTab';
import type { ReasoningEffort } from '@shared/domain/assistant/reasoning';

interface PromptBarPreferencesModalProps {
  isOpen: boolean;
  onClose: () => void;
  triggerRef: RefObject<HTMLElement | null>;
  activeTab?: PromptPreferencesTab;
  onSelectVideoModel?: (modelId: string) => void;
  onSelectImageModel?: (modelId: string) => void;
  onSelectReasoningModel?: (modelId: string) => void;
  onSelectReasoningEffort?: (effort: ReasoningEffort) => void;
  onSelectVideoDuration?: (sec: number) => void;
  onSelectVideoResolution?: (res: '480P' | '720P' | '1080P') => void;
  onSelectVideoAspect?: (aspect: string) => void;
  onSelectImageAspect?: (aspect: string) => void;
  onOpenSettings?: () => void;
  isUp?: boolean;
}

export default function PromptBarPreferencesModal({
  isOpen,
  onClose,
  triggerRef,
  activeTab,
  onSelectVideoModel,
  onSelectImageModel,
  onSelectReasoningModel,
  onSelectReasoningEffort,
  onSelectVideoDuration,
  onSelectVideoResolution,
  onSelectVideoAspect,
  onSelectImageAspect,
  onOpenSettings,
  isUp = true,
}: PromptBarPreferencesModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  const [currentTab, setCurrentTab] = useState<PromptPreferencesTab>(activeTab || 'video');
  const [prefs, setPrefs] = useState<PromptComposerPreferences>(() => loadPromptPreferences());

  const { videoModels, imageModels, multimodalModels } = usePreferenceModels();

  // 当弹窗打开时，同步初始 activeTab 与最新持久化配置
  useEffect(() => {
    if (isOpen) {
      if (activeTab) setCurrentTab(activeTab);
      setPrefs(loadPromptPreferences());
    }
  }, [isOpen, activeTab]);

  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        modalRef.current &&
        !modalRef.current.contains(target) &&
        triggerRef.current &&
        !triggerRef.current.contains(target)
      ) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen, onClose, triggerRef]);

  if (!isOpen) return null;

  const handleOpenSettings = () => {
    onClose();
    if (onOpenSettings) {
      onOpenSettings();
    } else {
      useAppStore.getState().setCurrentView('settings');
    }
  };

  const updateVideoPrefs = (patch: Partial<typeof prefs.video>) => {
    setPrefs((prev) => {
      // 视频偏好和图片偏好共用同一个画面比例（排除 smart）
      const nextImageAspect = patch.aspect && patch.aspect !== 'smart'
        ? (patch.aspect as ImageAspectOption)
        : prev.image.aspect;
      const next: PromptComposerPreferences = {
        ...prev,
        video: { ...prev.video, ...patch },
        image: { ...prev.image, aspect: nextImageAspect },
      };
      savePromptPreferences(next);
      return next;
    });

    if (patch.modelId && onSelectVideoModel) onSelectVideoModel(patch.modelId);
    if (patch.resolution && onSelectVideoResolution) onSelectVideoResolution(patch.resolution);
    if (patch.aspect && onSelectVideoAspect) onSelectVideoAspect(patch.aspect);
    if (patch.aspect && patch.aspect !== 'smart' && onSelectImageAspect) onSelectImageAspect(patch.aspect);
    if (patch.durationMode === 'custom' && onSelectVideoDuration) {
      onSelectVideoDuration(patch.customDurationSec || prefs.video.customDurationSec);
    }
  };

  const updateImagePrefs = (patch: Partial<typeof prefs.image>) => {
    setPrefs((prev) => {
      const nextVideoAspect = patch.aspect ? (patch.aspect as VideoAspectOption) : prev.video.aspect;
      const next: PromptComposerPreferences = {
        ...prev,
        image: { ...prev.image, ...patch },
        video: { ...prev.video, aspect: nextVideoAspect },
      };
      savePromptPreferences(next);
      return next;
    });

    if (patch.modelId && onSelectImageModel) onSelectImageModel(patch.modelId);
    if (patch.aspect && onSelectImageAspect) onSelectImageAspect(patch.aspect);
    if (patch.aspect && onSelectVideoAspect) onSelectVideoAspect(patch.aspect);
  };

  const updateReasoningPrefs = (patch: Partial<typeof prefs.reasoning>) => {
    setPrefs((prev) => {
      const next: PromptComposerPreferences = {
        ...prev,
        reasoning: { ...prev.reasoning, ...patch },
      };
      savePromptPreferences(next);
      return next;
    });

    if (patch.modelId) {
      if (onSelectReasoningModel) onSelectReasoningModel(patch.modelId);
      try {
        localStorage.setItem('beike_assistant_selected_model', patch.modelId);
        localStorage.setItem('ai_assistant_model', patch.modelId);
      } catch {
        // optional
      }
    }

    if (patch.reasoningEffort) {
      if (onSelectReasoningEffort) onSelectReasoningEffort(patch.reasoningEffort);
      try {
        localStorage.setItem('beike_assistant_reasoning_effort', patch.reasoningEffort);
        const currentModel = patch.modelId || prefs.reasoning.modelId;
        if (currentModel) {
          const raw = JSON.parse(localStorage.getItem('beike_assistant_reasoning_by_model') || '{}');
          raw[currentModel] = patch.reasoningEffort;
          localStorage.setItem('beike_assistant_reasoning_by_model', JSON.stringify(raw));
        }
      } catch {
        // optional
      }
    }
  };

  return (
    <div
      ref={modalRef}
      className={`absolute left-1/2 -translate-x-1/2 ${
        isUp ? 'bottom-full mb-2.5 origin-bottom' : 'top-full mt-2.5 origin-top'
      } w-[780px] max-w-[calc(100vw-2rem)] rounded-3xl bg-white/95 backdrop-blur-xl border border-slate-200/90 shadow-[0_20px_50px_rgba(0,0,0,0.15)] p-5 z-50 animate-fade-in text-left select-none`}
    >
      <div className="flex items-center gap-1.5 p-1 bg-slate-100/80 rounded-2xl w-fit mb-4">
        <button
          type="button"
          onClick={() => setCurrentTab('video')}
          className={`px-4 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
            currentTab === 'video'
              ? 'bg-white text-slate-950 shadow-xs'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          视频偏好 *
        </button>
        <button
          type="button"
          onClick={() => setCurrentTab('image')}
          className={`px-4 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
            currentTab === 'image'
              ? 'bg-white text-slate-950 shadow-xs'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          图片偏好 *
        </button>
        <button
          type="button"
          onClick={() => setCurrentTab('reasoning')}
          className={`px-4 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
            currentTab === 'reasoning'
              ? 'bg-white text-slate-950 shadow-xs'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          推理模型 *
        </button>
      </div>

      {currentTab === 'video' && (
        <PromptBarVideoTab
          prefs={prefs}
          models={videoModels}
          updateVideoPrefs={updateVideoPrefs}
          onOpenSettings={handleOpenSettings}
        />
      )}
      {currentTab === 'image' && (
        <PromptBarImageTab
          prefs={prefs}
          models={imageModels}
          updateImagePrefs={updateImagePrefs}
          onOpenSettings={handleOpenSettings}
        />
      )}
      {currentTab === 'reasoning' && (
        <PromptBarReasoningTab
          prefs={prefs}
          models={multimodalModels}
          updateReasoningPrefs={updateReasoningPrefs}
          onOpenSettings={handleOpenSettings}
        />
      )}
    </div>
  );
}
