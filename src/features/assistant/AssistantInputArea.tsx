'use client';

import {
  ArrowUp,
  Bot,
  Check,
  ChevronDown,
  Download,
  FileText,
  Film,
  HelpCircle,
  Image as ImageIcon,
  Loader2,
  Pencil,
  Play,
  Plus,
  Sparkles,
  Trash2,
  Upload,
  X,
  Zap,
} from 'lucide-react';
import { MediaAttachment } from '@/store/useAppStore';
import { proxyMediaUrl } from '@/lib/apiClient';
import { getModelIcon } from '@/shared/ui/ModelIcons';
import { isVideoMediaUrl } from '@/lib/mediaHelper';
import {
  AVAILABLE_SKILLS,
  AssistantSkill,
} from '@/lib/skills/ecommerce-visual-director';
import {
  FILE_ACCEPT,
  HISTORY_LIMIT_OPTIONS,
  SUPPORTED_DOC_FORMATS,
} from '@/features/assistant/assistantConstants';

export interface AssistantInputAreaProps {
  assistantAttachments: MediaAttachment[];
  removeAssistantAttachment: (idx: number) => void;
  selectedSkill: AssistantSkill | null;
  setSelectedSkill: (s: AssistantSkill | null) => void;
  showToast: (msg: string) => void;
  inputContent: string;
  setInputContent: (v: string) => void;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  handleKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  handlePaste: (e: React.ClipboardEvent) => void;
  handleSendMessage: (overrideContent?: string) => void;
  isSending: boolean;
  isSendingCurrent: boolean;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  skillImportInputRef: React.RefObject<HTMLInputElement | null>;
  handleFiles: (files: FileList | File[]) => void;
  handleImportSkillsFile: (files: FileList | null) => void;
  showSkillMenu: boolean;
  setShowSkillMenu: (v: boolean) => void;
  skillMenuRef: React.RefObject<HTMLDivElement | null>;
  customSkills: AssistantSkill[];
  handleEditCustomSkill: (e: React.MouseEvent, skill: AssistantSkill) => void;
  handleExportCustomSkill: (e: React.MouseEvent, skill: AssistantSkill) => void;
  handleDeleteCustomSkill: (e: React.MouseEvent, skillId: string) => void;
  handleDistillFromCurrentChat: () => void;
  setEditingCustomSkill: (s: AssistantSkill | null) => void;
  setDistillContext: (v: string | undefined) => void;
  setIsCustomSkillModalOpen: (v: boolean) => void;
  showModelMenu: boolean;
  setShowModelMenu: (v: boolean) => void;
  modelMenuRef: React.RefObject<HTMLDivElement | null>;
  availableAssistantModels: any[];
  currentModelObj: { name?: string; shortName?: string };
  assistantModel: string;
  setAssistantModel: (id: string) => void;
  showHistoryLimitMenu: boolean;
  setShowHistoryLimitMenu: (v: boolean) => void;
  historyMenuRef: React.RefObject<HTMLDivElement | null>;
  assistantHistoryLimit: number;
  setAssistantHistoryLimit: (n: number) => void;
  showLangMenu: boolean;
  setShowLangMenu: (v: boolean) => void;
  langMenuRef: React.RefObject<HTMLDivElement | null>;
  selectedLang: string;
  setSelectedLang: (v: string) => void;
  resolveAssistantMediaSrc: (rawUrl?: string | null, asVideo?: boolean) => string;
  setChatPreview: (v: { url: string; type: 'image' | 'video'; poster?: string } | null) => void;
}

export default function AssistantInputArea({
  assistantAttachments,
  removeAssistantAttachment,
  selectedSkill,
  setSelectedSkill,
  showToast,
  inputContent,
  setInputContent,
  textareaRef,
  handleKeyDown,
  handlePaste,
  handleSendMessage,
  isSending,
  isSendingCurrent,
  fileInputRef,
  skillImportInputRef,
  handleFiles,
  handleImportSkillsFile,
  showSkillMenu,
  setShowSkillMenu,
  skillMenuRef,
  customSkills,
  handleEditCustomSkill,
  handleExportCustomSkill,
  handleDeleteCustomSkill,
  handleDistillFromCurrentChat,
  setEditingCustomSkill,
  setDistillContext,
  setIsCustomSkillModalOpen,
  showModelMenu,
  setShowModelMenu,
  modelMenuRef,
  availableAssistantModels,
  currentModelObj,
  assistantModel,
  setAssistantModel,
  showHistoryLimitMenu,
  setShowHistoryLimitMenu,
  historyMenuRef,
  assistantHistoryLimit,
  setAssistantHistoryLimit,
  showLangMenu,
  setShowLangMenu,
  langMenuRef,
  selectedLang,
  setSelectedLang,
  resolveAssistantMediaSrc,
  setChatPreview,
}: AssistantInputAreaProps) {
  return (
    <>

        {/* 🌟 3. 底部多模态指令输入区 */}
        <div className="p-4 border-t border-slate-100 bg-white/90 backdrop-blur-md space-y-3 flex-shrink-0">
          {/* 待发送附件预览栏 */}
          {assistantAttachments.length > 0 && (
            <div className="flex items-center gap-2 overflow-x-auto pb-1 animate-fade-in">
              {assistantAttachments.map((att, idx) => (
                <div key={idx} className="relative w-14 h-14 rounded-xl overflow-hidden border border-slate-200 flex-shrink-0 bg-slate-100 group/att shadow-2xs">
                  {att.type === 'document' ? (
                    <div className="w-full h-full flex flex-col items-center justify-center gap-0.5 bg-indigo-50 px-0.5">
                      <FileText className="w-5 h-5 text-indigo-600" />
                      <span className="text-[8px] text-indigo-800 font-medium truncate max-w-full px-0.5">{att.name || '文档'}</span>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="absolute inset-0 w-full h-full cursor-pointer"
                      title={att.type === 'video' ? '预览视频' : '预览图片'}
                      onClick={() => {
                        if (att.type === 'video' && att.url) {
                          setChatPreview({ url: att.url, type: 'video', poster: att.thumbnailUrl });
                        } else if (att.url || att.thumbnailUrl) {
                          setChatPreview({ url: att.url || att.thumbnailUrl || '', type: 'image' });
                        }
                      }}
                    >
                      {att.type === 'video' && (!att.thumbnailUrl || isVideoMediaUrl(att.thumbnailUrl)) ? (
                        <video
                          src={resolveAssistantMediaSrc(att.url, true)}
                          muted
                          playsInline
                          preload="metadata"
                          className="w-full h-full object-cover pointer-events-none"
                        />
                      ) : (
                        <img 
                          src={resolveAssistantMediaSrc(att.thumbnailUrl || att.url, false)} 
                          alt="" 
                          referrerPolicy="no-referrer"
                          onError={(e) => {
                            const target = e.currentTarget;
                            const u = att.thumbnailUrl || att.url;
                            if (!target.dataset.hasRetried && u && !u.startsWith('data:') && !u.startsWith('blob:')) {
                              target.dataset.hasRetried = 'true';
                              target.src = proxyMediaUrl(u);
                            }
                          }}
                          className="w-full h-full object-cover" 
                        />
                      )}
                      {att.type === 'video' && (
                        <div className="absolute inset-0 bg-black/40 flex items-center justify-center pointer-events-none">
                          <Play className="w-4 h-4 text-white fill-white" />
                        </div>
                      )}
                    </button>
                  )}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      removeAssistantAttachment(idx);
                    }}
                    className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full bg-slate-900/80 hover:bg-red-500 text-white flex items-center justify-center transition-colors shadow-2xs z-10"
                  >
                    <X className="w-2.5 h-2.5" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* 输入框主卡片 */}
          <div className="relative rounded-2xl bg-slate-50/90 border border-slate-200/90 focus-within:border-red-400 focus-within:bg-white p-3 space-y-2 shadow-2xs transition-all">
            {/* 🌟 激活中的 Skill 悬浮药丸与快捷模板条 */}
            {selectedSkill && (
              <div className="space-y-1.5 animate-fade-in">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-red-50 border border-red-200 text-red-600 text-xs w-fit shadow-2xs">
                    <Sparkles className="w-3.5 h-3.5 text-red-500 flex-shrink-0" />
                    <span className="font-bold">{selectedSkill.name}</span>
                    <span className="text-[10px] text-slate-400 font-mono hidden sm:inline">({selectedSkill.badge})</span>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedSkill(null);
                        showToast('💬 已恢复默认纯净对话模式');
                      }}
                      className="p-0.5 rounded-full hover:bg-red-100 text-slate-400 hover:text-red-600 transition-colors cursor-pointer ml-1"
                      title="关闭当前 Skill，恢复纯净普通对话"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>

                  {selectedSkill.inputRequirements && selectedSkill.inputRequirements.length > 0 && (
                    <span className="text-[10px] text-slate-400 font-medium hidden md:inline truncate max-w-[200px]" title={selectedSkill.inputRequirements.join(' | ')}>
                      💡 支持一键全量丢入或按向导输入
                    </span>
                  )}
                </div>

                {/* 快捷模板胶囊滑动条 */}
                {selectedSkill.quickTemplates && selectedSkill.quickTemplates.length > 0 && (
                  <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 scrollbar-none">
                    {selectedSkill.quickTemplates.map((tpl, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => {
                          setInputContent(tpl.prompt);
                          textareaRef.current?.focus();
                        }}
                        className="flex-shrink-0 px-2 py-0.5 rounded-lg bg-white hover:bg-red-50 border border-slate-200 hover:border-red-300 text-slate-600 hover:text-red-600 text-[11px] font-medium transition-all cursor-pointer shadow-2xs flex items-center gap-1"
                        title={tpl.prompt}
                      >
                        <Zap className="w-2.5 h-2.5 text-red-500" />
                        <span>{tpl.label}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            <textarea
              ref={textareaRef}
              value={inputContent}
              onChange={e => {
                const val = e.target.value;
                setInputContent(val);
                if (val.trim() === '/' || val.endsWith('/')) {
                  setShowSkillMenu(true);
                }
              }}
              onKeyDown={handleKeyDown}
              onPaste={handlePaste}
              placeholder={selectedSkill ? `[${selectedSkill.name}] 描述需求或上传素材...` : "输入创作需求，输入 / 选择 Skill，或直接提问..."}
              rows={2}
              className="w-full bg-transparent border-0 text-slate-800 placeholder-slate-400 text-xs sm:text-sm resize-none outline-none leading-relaxed min-h-[44px]"
            />

            {/* 🌟 底部配置条 (极简流线型排版，工具居左，发送键固定在右下角) */}
            <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-100 text-xs text-slate-500 relative">
              {/* 左侧功能工具集 */}
              <div className="flex items-center gap-1.5 min-w-0 flex-1 flex-wrap sm:flex-nowrap py-0.5 relative z-30">
                {/* 1. 上传图片/视频按钮 */}
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="w-7 h-7 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 hover:text-slate-900 flex items-center justify-center transition-colors cursor-pointer flex-shrink-0 border border-slate-200/70"
                  title={`上传图片、视频或文档（${SUPPORTED_DOC_FORMATS}）`}
                >
                  <Plus className="w-4 h-4" />
                </button>

                {/* 1.5 🌟 选择技能 (Skill Selector) 按钮及浮层 */}
                <div className="relative flex-shrink-0" ref={skillMenuRef}>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowSkillMenu(!showSkillMenu);
                      setShowModelMenu(false);
                      setShowHistoryLimitMenu(false);
                      setShowLangMenu(false);
                    }}
                    className={`h-7 px-2.5 rounded-full flex items-center gap-1.5 text-xs transition-colors cursor-pointer border ${
                      selectedSkill 
                        ? 'bg-amber-50 text-amber-700 border-amber-300 font-bold hover:bg-amber-100 shadow-2xs' 
                        : 'bg-slate-100/90 hover:bg-slate-200/90 text-slate-700 hover:text-slate-900 border-slate-200/70 font-medium'
                    }`}
                    title="选择技能 (输入 / 亦可直接呼出)"
                  >
                    <Bot className="w-3.5 h-3.5 text-slate-500 flex-shrink-0" />
                    <span className="text-[11.5px] truncate max-w-[75px]">{selectedSkill ? selectedSkill.name : '选择技能'}</span>
                    <ChevronDown className="w-3 h-3 opacity-50 flex-shrink-0" />
                  </button>

                  {/* 🌟 技能选择弹窗列表 */}
                  {showSkillMenu && (
                    <div 
                      className="absolute bottom-full mb-2.5 left-0 w-80 sm:w-[410px] rounded-2xl bg-white border border-slate-200 shadow-2xl p-2 z-70 space-y-2 animate-fade-in text-left max-h-[460px] flex flex-col text-slate-800"
                      onClick={e => e.stopPropagation()}
                    >
                      {/* 顶部标题与管理操作 */}
                      <div className="px-3 py-2 border-b border-slate-100 flex items-center justify-between flex-shrink-0 gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <Bot className="w-4 h-4 text-red-500 flex-shrink-0" />
                          <span className="text-xs font-bold text-slate-900 tracking-wide truncate">AI 技能库</span>
                        </div>
                        
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <button
                            type="button"
                            onClick={() => skillImportInputRef.current?.click()}
                            className="p-1.5 rounded-lg text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
                            title="导入 Skill"
                          >
                            <Upload className="w-3.5 h-3.5" />
                          </button>

                          <button
                            type="button"
                            onClick={handleDistillFromCurrentChat}
                            className="p-1.5 rounded-lg text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
                            title="从对话提炼 Skill"
                          >
                            <Sparkles className="w-3.5 h-3.5" />
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              setEditingCustomSkill(null);
                              setDistillContext(undefined);
                              setIsCustomSkillModalOpen(true);
                              setShowSkillMenu(false);
                            }}
                            className="px-2 py-1 rounded-lg bg-white hover:bg-red-50 text-red-600 text-[11px] font-bold flex items-center gap-0.5 transition-colors cursor-pointer border border-red-200"
                            title="编写新 Skill"
                          >
                            <Plus className="w-3 h-3" />
                            <span>编写</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => setShowSkillMenu(false)}
                            className="p-1 rounded-lg text-slate-400 hover:text-slate-800 hover:bg-slate-100 transition-colors cursor-pointer"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* 技能列表 (可滚动) */}
                      <div className="overflow-y-auto scroll-contain space-y-1.5 p-1 max-h-80 scrollbar-thin">
                        {/* 纯净默认对话选项 */}
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedSkill(null);
                            setShowSkillMenu(false);
                            if (inputContent.trim() === '/') setInputContent('');
                            showToast('💬 已恢复默认纯净对话模式');
                          }}
                          className={`w-full p-2.5 rounded-xl text-left transition-all cursor-pointer flex items-start gap-3 border ${
                            !selectedSkill 
                              ? 'bg-red-50 border-red-200 text-slate-900 shadow-2xs' 
                              : 'hover:bg-slate-50 border-transparent text-slate-700'
                          }`}
                        >
                          <div className="w-8 h-8 rounded-xl bg-slate-100 flex items-center justify-center flex-shrink-0 mt-0.5 text-slate-500">
                            <Bot className="w-4 h-4" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-bold text-slate-900">💬 纯净默认对话 (无预设)</span>
                              {!selectedSkill && <Check className="w-3.5 h-3.5 text-red-600" />}
                            </div>
                            <p className="text-[10px] text-slate-500 line-clamp-1 mt-0.5">
                              不使用任何特定 Skill 预设，保持纯粹通用的日常 AI 问答，不污染对话
                            </p>
                          </div>
                        </button>

                        {/* 用户自定义 Skill 列表 */}
                        {customSkills.length > 0 ? (
                          <div className="pt-2 border-t border-slate-100 mt-2">
                            <div className="text-[10px] font-bold text-slate-400 px-2 py-1 flex items-center justify-between">
                              <span className="flex items-center gap-1">
                                <Sparkles className="w-3 h-3 text-amber-600" />
                                <span>我的专属 Skill 库 ({customSkills.length})</span>
                              </span>
                              <span className="text-[9px] text-slate-400">支持自由微调、更新与删除</span>
                            </div>
                            {customSkills.map((skill) => {
                              const isCurrent = selectedSkill?.id === skill.id;
                              return (
                                <div
                                  key={skill.id}
                                  onClick={() => {
                                    setSelectedSkill(skill);
                                    setShowSkillMenu(false);
                                    if (inputContent.trim() === '/') setInputContent('');
                                    showToast(`✨ 已启用自定义 Skill: ${skill.name}`);
                                  }}
                                  className={`group/skill w-full p-2.5 rounded-xl text-left transition-all cursor-pointer flex items-start gap-3 border mt-1.5 ${
                                    isCurrent 
                                      ? 'bg-amber-50 border-amber-200 text-slate-900 shadow-2xs' 
                                      : 'hover:bg-slate-50 border-transparent text-slate-700'
                                  }`}
                                >
                                  <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5 text-sm bg-slate-100 text-amber-600">
                                    <Sparkles className="w-4 h-4" />
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <div className="flex items-center justify-between gap-1">
                                      <div className="flex items-center gap-1.5 truncate min-w-0">
                                        <span className="text-xs font-bold text-slate-900 truncate">{skill.name}</span>
                                        {skill.badge && (
                                          <span className="px-1.5 py-0.2 rounded bg-amber-100 text-amber-700 text-[9px] font-medium flex-shrink-0">
                                            {skill.badge}
                                          </span>
                                        )}
                                      </div>
                                      
                                      <div className="flex items-center gap-0.5 shrink-0 ml-1 opacity-100 sm:opacity-0 sm:group-hover/skill:opacity-100 transition-opacity">
                                        <button
                                          type="button"
                                          onClick={(e) => handleExportCustomSkill(e, skill)}
                                          className="p-1 rounded-md text-slate-500 hover:bg-slate-200 hover:text-slate-800 transition-all cursor-pointer"
                                          title="导出"
                                        >
                                          <Download className="w-3 h-3" />
                                        </button>
                                        <button
                                          type="button"
                                          onClick={(e) => handleEditCustomSkill(e, skill)}
                                          className="p-1 rounded-md text-slate-500 hover:bg-slate-200 hover:text-slate-800 transition-all cursor-pointer"
                                          title="修改"
                                        >
                                          <Pencil className="w-3 h-3" />
                                        </button>
                                        <button
                                          type="button"
                                          onClick={(e) => handleDeleteCustomSkill(e, skill.id)}
                                          className="p-1 rounded-md text-slate-500 hover:bg-red-50 hover:text-red-600 transition-all cursor-pointer"
                                          title="删除"
                                        >
                                          <Trash2 className="w-3 h-3" />
                                        </button>
                                        {isCurrent && <Check className="w-3.5 h-3.5 text-amber-600 ml-0.5" />}
                                      </div>
                                    </div>
                                    <p className="text-[10px] text-slate-500 line-clamp-2 mt-0.5 leading-relaxed">
                                      {skill.description}
                                    </p>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  )}
                </div>

                {/* 2. 模型选择下拉 */}
                <div className="relative flex-shrink-0" ref={modelMenuRef}>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowModelMenu(!showModelMenu);
                      setShowSkillMenu(false);
                      setShowHistoryLimitMenu(false);
                      setShowLangMenu(false);
                    }}
                    className="h-7 px-2.5 rounded-full bg-slate-100/90 hover:bg-slate-200/90 text-slate-700 hover:text-slate-900 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer border border-slate-200/70"
                    title="当前对话分析模型 (可在系统设置中更改默认模型)"
                  >
                    <div className="w-4 h-4 flex items-center justify-center flex-shrink-0">
                      {getModelIcon(assistantModel, "w-3.5 h-3.5 text-slate-700")}
                    </div>
                    <span className="text-[11.5px] truncate max-w-[85px] sm:max-w-[120px] text-slate-800 font-mono">
                      {currentModelObj.shortName || assistantModel}
                    </span>
                    <ChevronDown className="w-3 h-3 opacity-50 flex-shrink-0" />
                  </button>

                  {showModelMenu && (
                    <div 
                      className="absolute bottom-full mb-2 left-0 w-72 sm:w-80 rounded-2xl bg-white border border-slate-200 shadow-2xl p-2 z-70 space-y-1 animate-fade-in text-left max-h-80 overflow-y-auto scroll-contain text-slate-800"
                      onClick={e => e.stopPropagation()}
                    >
                      <div className="px-2 py-1 text-[10px] text-slate-400 font-mono font-bold flex items-center justify-between border-b border-slate-100 pb-1.5">
                        <span>💬 助手对话与视觉分析模型</span>
                        <span className="bg-slate-100 px-1.5 py-0.5 rounded text-slate-600 font-mono">{availableAssistantModels.length} 个可用</span>
                      </div>
                      <div className="space-y-1 pt-1">
                        {availableAssistantModels.map(m => (
                          <button
                            key={m.id}
                            type="button"
                            onClick={() => {
                              setAssistantModel(m.id);
                              setShowModelMenu(false);
                              showToast(`🤖 已切换助手模型: ${m.shortName || m.name}`);
                            }}
                            className={`w-full p-2 rounded-xl text-xs flex items-center justify-between transition-colors cursor-pointer text-left ${
                              assistantModel === m.id ? 'bg-red-50 text-red-600 font-bold border border-red-200/80 shadow-2xs' : 'hover:bg-slate-100 text-slate-700 border border-transparent'
                            }`}
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <div className="w-6 h-6 rounded-lg bg-slate-100 flex items-center justify-center flex-shrink-0">
                                {getModelIcon(m.id, "w-3.5 h-3.5 text-slate-700")}
                              </div>
                              <div className="min-w-0">
                                <div className="flex items-center gap-1.5">
                                  <span className="truncate text-xs font-semibold">{m.name}</span>
                                  {m.badge && (
                                    <span className="px-1 py-0.2 rounded bg-slate-200/80 text-slate-700 text-[9px] font-medium flex-shrink-0">
                                      {m.badge}
                                    </span>
                                  )}
                                </div>
                                <div className="text-[10px] text-slate-400 font-mono truncate">{m.id}</div>
                              </div>
                            </div>
                            {assistantModel === m.id && <Check className="w-4 h-4 text-red-600 flex-shrink-0 ml-1.5" />}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* 3. 🌟 回读条数下拉 */}
                <div className="relative flex-shrink-0" ref={historyMenuRef}>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowHistoryLimitMenu(!showHistoryLimitMenu);
                      setShowModelMenu(false);
                      setShowSkillMenu(false);
                      setShowLangMenu(false);
                    }}
                    className="h-7 px-2.5 rounded-full bg-slate-100/90 hover:bg-slate-200/90 text-slate-600 hover:text-slate-900 text-xs font-mono flex items-center gap-1 transition-colors cursor-pointer border border-slate-200/70"
                  >
                    <span>回读{assistantHistoryLimit}条</span>
                    <ChevronDown className="w-3 h-3 opacity-50" />
                  </button>

                  {showHistoryLimitMenu && (
                    <div 
                      className="absolute bottom-full mb-2 left-0 w-36 rounded-2xl bg-white border border-slate-200 shadow-2xl p-1.5 z-70 space-y-0.5 animate-fade-in text-left max-h-52 overflow-y-auto scroll-contain text-slate-800"
                      onClick={e => e.stopPropagation()}
                    >
                      <div className="px-2 py-1 text-[10px] text-slate-400 font-mono">记忆上下文条数</div>
                      {HISTORY_LIMIT_OPTIONS.map(opt => (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => {
                            setAssistantHistoryLimit(opt.value);
                            setShowHistoryLimitMenu(false);
                          }}
                          className={`w-full px-2.5 py-1.5 rounded-xl text-xs flex items-center justify-between transition-colors cursor-pointer font-mono ${
                            assistantHistoryLimit === opt.value ? 'bg-red-50 text-red-600 font-bold' : 'hover:bg-slate-100 text-slate-700'
                          }`}
                        >
                          <span>{opt.label}</span>
                          {assistantHistoryLimit === opt.value && <Check className="w-3 h-3 text-red-600" />}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* 4. 语言设置 */}
                <div className="relative flex-shrink-0" ref={langMenuRef}>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowLangMenu(!showLangMenu);
                      setShowModelMenu(false);
                      setShowSkillMenu(false);
                      setShowHistoryLimitMenu(false);
                    }}
                    className="h-7 px-2.5 rounded-full bg-slate-100/90 hover:bg-slate-200/90 text-slate-600 hover:text-slate-900 text-xs flex items-center gap-1 transition-colors cursor-pointer border border-slate-200/70"
                  >
                    <span>{selectedLang}</span>
                    <ChevronDown className="w-3 h-3 opacity-50" />
                  </button>
                  {showLangMenu && (
                    <div 
                      className="absolute bottom-full mb-2 left-0 w-24 rounded-xl bg-white border border-slate-200 shadow-2xl p-1 z-70 space-y-0.5 animate-fade-in text-slate-800"
                      onClick={e => e.stopPropagation()}
                    >
                      {['中字', 'English', '双语'].map(l => (
                        <button
                          key={l}
                          type="button"
                          onClick={() => {
                            setSelectedLang(l);
                            try { localStorage.setItem('ai_assistant_output_lang', l); } catch {}
                            setShowLangMenu(false);
                          }}
                          className="w-full px-2 py-1 rounded-lg text-xs text-left hover:bg-slate-100 text-slate-700 cursor-pointer"
                        >
                          {l}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* 右侧：发送按钮 (固定在右下角，从不折行) */}
              <div className="flex items-center gap-2 flex-shrink-0 ml-auto">
                <button
                  type="button"
                  onClick={() => handleSendMessage()}
                  disabled={isSending || (!inputContent.trim() && assistantAttachments.length === 0)}
                  className="w-8 h-8 rounded-full bg-gradient-to-tr from-red-600 to-orange-500 hover:from-red-500 hover:to-orange-400 text-white flex items-center justify-center transition-all cursor-pointer active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed shadow-md shadow-orange-500/25 flex-shrink-0"
                  title="发送消息 (Enter)"
                >
                  {isSendingCurrent ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <ArrowUp className="w-4 h-4 stroke-[2.5]" />
                  )}
                </button>
              </div>
            </div>
          </div>

          <input
            type="file"
            ref={fileInputRef}
            onChange={e => {
              if (e.target.files) handleFiles(e.target.files);
              e.target.value = '';
            }}
            accept={FILE_ACCEPT}
            multiple
            className="hidden"
          />
          <input
            type="file"
            ref={skillImportInputRef}
            className="hidden"
            accept=".json,.md,.txt,application/json,text/markdown,text/plain"
            onChange={(e) => {
              void handleImportSkillsFile(e.target.files);
            }}
          />
        </div>

    </>
  );
}