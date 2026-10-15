import React, { useState, useRef, useEffect, type RefObject } from 'react';
import {
  type PromptPreferencesTab,
  type PromptComposerPreferences,
  loadPromptPreferences,
  savePromptPreferences,
} from '../promptBarPreferencesTypes';
import { PromptBarVideoTab } from './preferences/PromptBarVideoTab';
import { PromptBarImageTab } from './preferences/PromptBarImageTab';
import { PromptBarReasoningTab } from './preferences/PromptBarReasoningTab';

interface PromptBarPreferencesModalProps {
  isOpen: boolean;
  onClose: () => void;
  triggerRef: RefObject<HTMLElement | null>;
  activeTab?: PromptPreferencesTab;
  onSelectVideoModel?: (modelId: string) => void;
  onSelectImageModel?: (modelId: string) => void;
  onSelectVideoDuration?: (sec: number) => void;
  onSelectVideoResolution?: (res: '480P' | '720P' | '1080P') => void;
  onSelectVideoAspect?: (aspect: string) => void;
  onSelectImageAspect?: (aspect: string) => void;
  isUp?: boolean;
}

export default function PromptBarPreferencesModal({
  isOpen,
  onClose,
  triggerRef,
  onSelectVideoModel,
  onSelectImageModel,
  onSelectVideoDuration,
  onSelectVideoResolution,
  onSelectVideoAspect,
  onSelectImageAspect,
  isUp = true,
}: PromptBarPreferencesModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  const [currentTab, setCurrentTab] = useState<PromptPreferencesTab>('video');
  const [prefs, setPrefs] = useState<PromptComposerPreferences>(() => loadPromptPreferences());

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

  const updateVideoPrefs = (patch: Partial<typeof prefs.video>) => {
    setPrefs((prev) => {
      const next = { ...prev, video: { ...prev.video, ...patch } };
      savePromptPreferences(next);
      return next;
    });
    if (patch.modelId && onSelectVideoModel) onSelectVideoModel(patch.modelId);
    if (patch.resolution && onSelectVideoResolution) onSelectVideoResolution(patch.resolution);
    if (patch.aspect && onSelectVideoAspect) onSelectVideoAspect(patch.aspect);
    if (patch.durationMode === 'custom' && onSelectVideoDuration) {
      onSelectVideoDuration(patch.customDurationSec || prefs.video.customDurationSec);
    }
  };

  const updateImagePrefs = (patch: Partial<typeof prefs.image>) => {
    setPrefs((prev) => {
      const next = { ...prev, image: { ...prev.image, ...patch } };
      savePromptPreferences(next);
      return next;
    });
    if (patch.modelId && onSelectImageModel) onSelectImageModel(patch.modelId);
    if (patch.aspect && onSelectImageAspect) onSelectImageAspect(patch.aspect);
  };

  const updateReasoningPrefs = (patch: Partial<typeof prefs.reasoning>) => {
    setPrefs((prev) => {
      const next = { ...prev, reasoning: { ...prev.reasoning, ...patch } };
      savePromptPreferences(next);
      return next;
    });
  };

  return (
    <div
      ref={modalRef}
      className={`absolute left-0 ${
        isUp ? 'bottom-full mb-2 origin-bottom' : 'top-full mt-2 origin-top'
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
        <PromptBarVideoTab prefs={prefs} updateVideoPrefs={updateVideoPrefs} />
      )}
      {currentTab === 'image' && (
        <PromptBarImageTab prefs={prefs} updateImagePrefs={updateImagePrefs} />
      )}
      {currentTab === 'reasoning' && (
        <PromptBarReasoningTab prefs={prefs} updateReasoningPrefs={updateReasoningPrefs} />
      )}
    </div>
  );
}
