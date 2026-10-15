import React, { useState, useRef } from 'react';
import {
  densityComposerPill,
} from '@client/shared/ui/layoutClasses';
import { Plus, ChevronDown, Split } from 'lucide-react';
import PromptBarModeSelector from './PromptBarModeSelector';
import PromptBarUploadMenu from './PromptBarUploadMenu';
import { PromptBarAtMenu } from './PromptBarAtMenu';
import PromptBarSkillsModal from './PromptBarSkillsModal';
import PromptBarPreferencesModal from './PromptBarPreferencesModal';
import { PromptBarSendActions } from './PromptBarSendActions';
import type { PromptBarControlsRowProps } from './PromptBarControlsRowTypes';
import { useAppStore } from '@client/store';
import { useI18n } from '@client/shared/i18n';

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
    setQuickPrompt,
    media,
    richInputRef,
    handleSendPrompt,
    canSend,
    isSubmitting,
  } = props;

  // 弹出状态管理
  const [showUploadMenu, setShowUploadMenu] = useState(false);
  const [showSkillsModal, setShowSkillsModal] = useState(false);
  const [showPreferencesModal, setShowPreferencesModal] = useState(false);
  const [canvasToggle, setCanvasToggle] = useState(false);
  const currentView = useAppStore((s) => s.currentView);

  // 触发按钮 Ref
  const uploadButtonRef = useRef<HTMLButtonElement>(null);
  const skillsButtonRef = useRef<HTMLButtonElement>(null);
  const prefsButtonRef = useRef<HTMLButtonElement>(null);

  return (
    <div
      className={`flex items-center justify-between gap-1.5 pt-1.5 sm:pt-2 mt-auto relative select-none ${
        anyDropdownOpen || showUploadMenu || showSkillsModal || showPreferencesModal || media.showAtMenu
          ? 'z-40'
          : 'z-10'
      }`}
    >
      {/* 🌟 左侧核心操作控件集群（严格对齐图1、图2、图3、图4、图5、图6） */}
      <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap min-w-0">
        {/* 1. 图 2：加号上传按钮与菜单 */}
        <div className="relative">
          <button
            ref={uploadButtonRef}
            type="button"
            aria-label="上传与模版"
            onClick={() => setShowUploadMenu(!showUploadMenu)}
            className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200/90 text-slate-700 flex items-center justify-center transition-all cursor-pointer shadow-2xs hover:scale-105 active:scale-95 shrink-0"
            title="本地上传 / 资产库 / 视频链接 / 预设提示词"
          >
            <Plus className="w-4 h-4 text-slate-800 stroke-[2.2]" />
          </button>

          <PromptBarUploadMenu
            isOpen={showUploadMenu}
            onClose={() => setShowUploadMenu(false)}
            triggerRef={uploadButtonRef}
            isUp={isUp}
            onTriggerLocalUpload={() => media.fileInputRef.current?.click()}
            onOpenAssetLibrary={() => {
              // 引导至资产库或打开资产挑选
              media.createSubjectInputRef.current?.click();
            }}
            onSubmitVideoUrl={(url) => {
              useAppStore.getState().addQuickRefImage(url);
            }}
            onSelectPresetPrompt={(preset) => {
              setQuickPrompt(preset);
              richInputRef.current?.focus();
            }}
          />
        </div>

        {/* 2. 图 3：@ 主体快捷按钮与级联菜单 */}
        <div className="relative" ref={media.atMenuButtonRef}>
          <button
            type="button"
            aria-label="引用主体或素材"
            onClick={() => {
              if (media.showAtMenu && media.atMenuTrigger === 'button') {
                media.setShowAtMenu(false);
                media.setAtMenuTrigger?.(null);
              } else {
                media.setAtMenuTrigger?.('button');
                media.setShowAtMenu(true);
              }
              richInputRef.current?.focus();
            }}
            className="w-8 h-8 rounded-full bg-transparent hover:bg-slate-100 text-slate-700 hover:text-slate-950 flex items-center justify-center transition-all cursor-pointer text-sm font-bold shrink-0"
            title="引用素材 / 角色 / 商品主体"
          >
            <span>@</span>
          </button>

          {media.showAtMenu && media.atMenuTrigger === 'button' && (
            <PromptBarAtMenu
              atMenuRef={media.atMenuRef}
              anchorRef={media.atMenuButtonRef}
              isUp={isUp}
              atMenuQuery={media.atMenuQuery}
              allSubjects={media.allSubjects}
              activeSubjects={media.activeSubjects}
              onCreateSubjectClick={() => {
                media.createSubjectInputRef.current?.click();
              }}
              onSelectSubject={media.handleSelectSubject}
              onClose={() => {
                media.setShowAtMenu(false);
                media.setAtMenuTrigger?.(null);
              }}
            />
          )}
        </div>

        {/* 3. 图 4：模式切换下拉（Agent模式 / 视频生成 / 图片生成 / 音频生成） */}
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

        {/* 4. 图 5：技能选择胶囊（带分支图标，展开技能面板，清晰标为待开发） */}
        <div className="relative">
          <button
            ref={skillsButtonRef}
            type="button"
            onClick={() => setShowSkillsModal(!showSkillsModal)}
            className={`${densityComposerPill} rounded-2xl font-semibold flex items-center gap-1.5 transition-all cursor-pointer border-0 shrink-0 ${
              showSkillsModal
                ? 'bg-slate-100 text-slate-950 shadow-none'
                : 'bg-transparent hover:bg-slate-50 text-slate-800 shadow-none'
            }`}
          >
            <Split className="w-3.5 h-3.5 rotate-90 text-slate-700 stroke-[2.2]" />
            <span className="text-xs sm:text-[13px] font-medium text-slate-900">{t('sidebar.skills')}</span>
            <ChevronDown className="w-3.5 h-3.5 opacity-60 ml-0.5" />
          </button>

          <PromptBarSkillsModal
            isOpen={showSkillsModal}
            onClose={() => setShowSkillsModal(false)}
            triggerRef={skillsButtonRef}
            isUp={isUp}
          />
        </div>

        {/* 5. 图 6-10：自定义模型 | 创作偏好 大面板 */}
        <div className="relative">
          <button
            ref={prefsButtonRef}
            type="button"
            onClick={() => setShowPreferencesModal(!showPreferencesModal)}
            className={`${densityComposerPill} rounded-2xl font-semibold flex items-center gap-1.5 transition-all cursor-pointer border-0 shrink-0 ${
              showPreferencesModal
                ? 'bg-slate-100 text-slate-950 shadow-none'
                : 'bg-transparent hover:bg-slate-50 text-slate-800 shadow-none'
            }`}
          >
            {/* 散点环形图标 */}
            <div className="w-3.5 h-3.5 flex items-center justify-center">
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
                <circle cx="12" cy="4" r="2" />
                <circle cx="19" cy="8" r="2" />
                <circle cx="19" cy="16" r="2" />
                <circle cx="12" cy="20" r="2" />
                <circle cx="5" cy="16" r="2" />
                <circle cx="5" cy="8" r="2" />
              </svg>
            </div>
            <span className="text-xs sm:text-[13px] font-medium text-slate-900">自定义模型</span>
            <span className="text-slate-300 text-xs font-normal">|</span>
            <span className="text-xs sm:text-[13px] font-medium text-slate-900">{t('promptBar.preferences')}</span>
            <ChevronDown className="w-3.5 h-3.5 opacity-60 ml-0.5" />
          </button>

          <PromptBarPreferencesModal
            isOpen={showPreferencesModal}
            onClose={() => setShowPreferencesModal(false)}
            triggerRef={prefsButtonRef}
            isUp={isUp}
            onSelectVideoModel={(m) => setQuickVideoModel(m)}
            onSelectImageModel={(m) => setQuickModel(m)}
            onSelectVideoDuration={(d) => setQuickVideoDuration(d)}
            onSelectVideoResolution={(res) => setQuickVideoResolution(res)}
            onSelectVideoAspect={(asp) => setQuickVideoAspectId(asp)}
            onSelectImageAspect={(asp) => setQuickAspectId(asp)}
          />
        </div>
      </div>

      <PromptBarSendActions
        isAgentMode={quickGenMode === 'agent'}
        canvasEnabled={canvasToggle || currentView === 'canvas'}
        setCanvasEnabled={setCanvasToggle}
        canSend={canSend}
        isSubmitting={isSubmitting}
        handleSendPrompt={handleSendPrompt}
        quickGenMode={quickGenMode}
      />
    </div>
  );
});
