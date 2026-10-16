import React, { useState, useRef } from 'react';
import { Plus, ChevronDown } from 'lucide-react';
import PromptBarModeSelector from './PromptBarModeSelector';
import PromptBarUploadMenu from './PromptBarUploadMenu';
import { PromptBarAssetPickerModal } from './PromptBarAssetPickerModal';
import { PromptBarAtMenu } from './PromptBarAtMenu';
import PromptBarSkillsModal from './PromptBarSkillsModal';
import PromptBarPreferencesModal from './PromptBarPreferencesModal';
import PromptBarSkillStoreModal from './PromptBarSkillStoreModal';
import PromptBarManualSkillModal from './PromptBarManualSkillModal';
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
    activeVideoModelObj,
    activeImageModelObj,
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
  const [isUploadHovered, setIsUploadHovered] = useState(false);
  const [isAtHovered, setIsAtHovered] = useState(false);
  const [showAssetPickerModal, setShowAssetPickerModal] = useState(false);
  const [showSkillsModal, setShowSkillsModal] = useState(false);
  const [showPreferencesModal, setShowPreferencesModal] = useState(false);
  const [showSkillStoreModal, setShowSkillStoreModal] = useState(false);
  const [showManualSkillModal, setShowManualSkillModal] = useState(false);
  const setAssistantModel = useAppStore((s) => s.setAssistantModel);

  // 触发按钮 Ref
  const uploadButtonRef = useRef<HTMLButtonElement>(null);
  const skillsButtonRef = useRef<HTMLButtonElement>(null);
  const prefsButtonRef = useRef<HTMLButtonElement>(null);

  // 选用技能：在输入框开头注入技能胶囊标签（图5）
  const handleUseSkill = (skillTitle: string) => {
    richInputRef.current?.insertSkill(skillTitle);
  };

  // 通过 Agent 创建：在输入框开头注入 [创建技能] 胶囊（图8）
  const handleAgentCreateSkill = () => {
    richInputRef.current?.insertSkill('创建技能');
  };

  const isAgent = quickGenMode === 'agent';
  const modelLabel = isAgent
    ? '智能匹配模型'
    : quickGenMode === 'video'
    ? activeVideoModelObj?.shortName || activeVideoModelObj?.name || '视频模型'
    : activeImageModelObj?.shortName || activeImageModelObj?.name || '图片模型';
  const preferenceLabel = isAgent ? '创作偏好' : t('promptBar.preferences');

  return (
    <div
      className={`flex items-center justify-between gap-2 pt-1 sm:pt-1.5 mt-auto relative select-none ${
        anyDropdownOpen ||
        showUploadMenu ||
        showSkillsModal ||
        showPreferencesModal ||
        showSkillStoreModal ||
        showManualSkillModal ||
        media.showAtMenu
          ? 'z-40'
          : 'z-10'
      }`}
    >
      {/* 🌟 左侧工具集群（对齐图1：+、@、模式选择、技能胶囊、模型与偏好胶囊依次紧凑排布） */}
      <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap min-w-0">
        {/* + 上传素材按钮 */}
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
            className={`w-7.5 h-7.5 sm:w-8 sm:h-8 rounded-full flex items-center justify-center transition-all cursor-pointer active:scale-95 shrink-0 ${
              showUploadMenu
                ? 'bg-slate-100 text-slate-900'
                : 'bg-transparent hover:bg-slate-100/80 text-slate-600 hover:text-slate-900'
            }`}
          >
            <Plus className="w-4 h-4 stroke-[2.2]" />
          </button>

          {isUploadHovered && !showUploadMenu && (
            <div
              role="tooltip"
              className={`absolute ${
                isUp ? 'bottom-full mb-2' : 'top-full mt-2'
              } left-1/2 -translate-x-1/2 px-2.5 py-1 rounded-full bg-slate-900 text-white text-xs font-medium whitespace-nowrap shadow-md pointer-events-none z-50 animate-fade-in`}
            >
              上传素材
            </div>
          )}

          <PromptBarUploadMenu
            isOpen={showUploadMenu}
            onClose={() => setShowUploadMenu(false)}
            triggerRef={uploadButtonRef}
            isUp={isUp}
            onTriggerLocalUpload={() => media.fileInputRef.current?.click()}
            onOpenAssetLibrary={() => {
              setShowAssetPickerModal(true);
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

        {/* @ 引用角色与素材按钮 */}
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
            className={`w-7.5 h-7.5 sm:w-8 sm:h-8 rounded-full flex items-center justify-center transition-all cursor-pointer active:scale-95 shrink-0 ${
              media.showAtMenu
                ? 'bg-slate-100 text-slate-900'
                : 'bg-transparent hover:bg-slate-100/80 text-slate-600 hover:text-slate-900'
            }`}
          >
            <span className="leading-none select-none text-[15px] font-medium text-slate-700">@</span>
          </button>

          {isAtHovered && !media.showAtMenu && (
            <div
              role="tooltip"
              className={`absolute ${
                isUp ? 'bottom-full mb-2.5' : 'top-full mt-2.5'
              } left-0 w-64 p-3 rounded-2xl bg-neutral-900/95 backdrop-blur-md text-white shadow-[0_12px_28px_rgba(0,0,0,0.28)] border border-neutral-800/80 pointer-events-none z-50 animate-fade-in text-left select-none`}
            >
              <div className="text-[13px] font-semibold text-white tracking-wide mb-1">
                引用角色与素材
              </div>
              <div className="text-xs text-slate-300 leading-relaxed font-normal">
                点击后会自动输入 @ 并打开角色库，可快速插入角色、图片、视频等引用。
              </div>
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

        {/* 模式切换下拉（Agent模式 / 视频生成 / 图片生成 / 音频生成） */}
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

      {/* 🌟 2. 中间核心胶囊展示集群（严格居中显示，对齐图1、图2、图3红框） */}
      <div className="flex-1 flex items-center justify-center gap-2 min-w-0 px-1 sm:px-2">
        {/* 2.1 技能选择独立白色微质感胶囊（对齐图1原案样式） */}
        <div className="relative">
          <button
            ref={skillsButtonRef}
            type="button"
            onClick={() => setShowSkillsModal(!showSkillsModal)}
            className={`h-8 sm:h-8.5 px-3 rounded-full font-medium flex items-center gap-1.5 transition-all cursor-pointer border shrink-0 active:scale-98 ${
              showSkillsModal
                ? 'bg-slate-100 text-slate-900 border-slate-300 shadow-none'
                : 'bg-white hover:bg-slate-50/80 text-slate-800 border-slate-200/90 shadow-[0_1px_2px_rgba(0,0,0,0.03)]'
            }`}
          >
            {/* 对齐图1的流转分支图标 */}
            <svg className="w-3.5 h-3.5 text-slate-700" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m16 3 4 4-4 4" />
              <path d="M20 7H9a4 4 0 0 0-4 4v1" />
              <path d="m8 21-4-4 4-4" />
              <path d="M4 17h11a4 4 0 0 0 4-4v-1" />
            </svg>
            <span className="text-xs sm:text-[13px] font-medium text-slate-900">{t('sidebar.skills')}</span>
            <ChevronDown className="w-3 h-3 text-slate-400 ml-0.5" />
          </button>

          <PromptBarSkillsModal
            isOpen={showSkillsModal}
            onClose={() => setShowSkillsModal(false)}
            triggerRef={skillsButtonRef}
            isUp={isUp}
            onUseSkill={handleUseSkill}
            onOpenStore={() => setShowSkillStoreModal(true)}
            onAgentCreate={handleAgentCreateSkill}
            onManualCreate={() => setShowManualSkillModal(true)}
          />
        </div>

        {/* 2.2 自定义模型 | 创作偏好 独立白色微质感胶囊（对齐图1原案样式） */}
        <div className="relative">
          <button
            ref={prefsButtonRef}
            type="button"
            onClick={() => setShowPreferencesModal(!showPreferencesModal)}
            className={`h-8 sm:h-8.5 px-3 sm:px-3.5 rounded-full font-medium flex items-center gap-2 transition-all cursor-pointer border shrink-0 active:scale-98 ${
              showPreferencesModal
                ? 'bg-slate-100 text-slate-900 border-slate-300 shadow-none'
                : 'bg-white hover:bg-slate-50/80 text-slate-800 border-slate-200/90 shadow-[0_1px_2px_rgba(0,0,0,0.03)]'
            }`}
          >
            {/* 散点环形微图标（对齐图1六点环形） */}
            <div className="w-3.5 h-3.5 flex items-center justify-center shrink-0">
              <svg className="w-3.5 h-3.5 text-slate-700" viewBox="0 0 24 24" fill="currentColor">
                <circle cx="12" cy="4" r="1.8" />
                <circle cx="18.9" cy="8" r="1.8" />
                <circle cx="18.9" cy="16" r="1.8" />
                <circle cx="12" cy="20" r="1.8" />
                <circle cx="5.1" cy="16" r="1.8" />
                <circle cx="5.1" cy="8" r="1.8" />
                <circle cx="12" cy="12" r="1.5" />
              </svg>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-xs sm:text-[13px] font-medium text-slate-800">{modelLabel}</span>
              <span className="text-slate-300 text-xs font-normal">|</span>
              <span className="text-xs sm:text-[13px] font-medium text-slate-800">{preferenceLabel}</span>
            </div>
            <ChevronDown className="w-3 h-3 text-slate-400" />
          </button>

          <PromptBarPreferencesModal
            isOpen={showPreferencesModal}
            onClose={() => setShowPreferencesModal(false)}
            triggerRef={prefsButtonRef}
            isUp={isUp}
            activeTab={quickGenMode === 'video' ? 'video' : quickGenMode === 'image' ? 'image' : 'reasoning'}
            onSelectVideoModel={(m) => setQuickVideoModel(m)}
            onSelectImageModel={(m) => setQuickModel(m)}
            onSelectReasoningModel={(m) => setAssistantModel(m)}
            onSelectVideoDuration={(d) => setQuickVideoDuration(d)}
            onSelectVideoResolution={(res) => setQuickVideoResolution(res)}
            onSelectVideoAspect={(asp) => setQuickVideoAspectId(asp)}
            onSelectImageAspect={(asp) => setQuickAspectId(asp)}
            onOpenSettings={() => useAppStore.getState().setCurrentView('settings')}
          />
        </div>
      </div>

      {/* 🌟 3. 右侧发送按钮 */}
      <div className="flex items-center shrink-0">
        <PromptBarSendActions
          isAgentMode={quickGenMode === 'agent'}
          canSend={canSend}
          isSubmitting={isSubmitting}
          handleSendPrompt={handleSendPrompt}
          quickGenMode={quickGenMode}
        />
      </div>

      {/* 素材库与资产库选取弹窗 */}
      <PromptBarAssetPickerModal
        isOpen={showAssetPickerModal}
        onClose={() => setShowAssetPickerModal(false)}
      />

      {/* 技能商店大弹窗（图7） */}
      <PromptBarSkillStoreModal
        isOpen={showSkillStoreModal}
        onClose={() => setShowSkillStoreModal(false)}
        onUseSkill={handleUseSkill}
        onOpenCreateMenu={() => setShowManualSkillModal(true)}
      />

      {/* 手动创建技能弹窗 */}
      <PromptBarManualSkillModal
        isOpen={showManualSkillModal}
        onClose={() => setShowManualSkillModal(false)}
        onSaveAndUse={(skill: { name: string }) => {
          handleUseSkill(skill.name);
        }}
      />
    </div>
  );
});
