import { useAssistantDialog } from '../useAssistantDialog';
import { useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Check,
  ChevronLeft,
  Edit3,
  Search,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { AssistantSkillCardIcon, AssistantSkillIcon } from './AssistantSkillIcon';
import FormattedMarkdown from '../message/FormattedMarkdown';
import type { AssistantSkill } from '@shared/domain/assistant/skills/types';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  skills: AssistantSkill[];
  activeSkillId: string | null;
  onActivate: (id: string | null) => void;
  onEdit: (skill: AssistantSkill) => void;
  onDelete: (id: string) => void;
  showToast: (msg: string) => void;
}

export default function AssistantSkillManageModal({
  isOpen,
  onClose,
  skills,
  activeSkillId,
  onActivate,
  onEdit,
  onDelete,
  showToast,
}: Props) {
  const dialogRef = useAssistantDialog(isOpen, onClose);
  const [keyword, setKeyword] = useState('');
  const [selectedSkillId, setSelectedSkillId] = useState<string | null>(null);

  if (!isOpen) return null;

  const selectedSkill = selectedSkillId
    ? skills.find((s) => s.id === selectedSkillId) || null
    : null;

  // 确保「提示词反推专家」始终排在第一位
  const sortedSkills = [...skills].sort((a, b) => {
    if (a.id === 'prompt-reverse-engineer' || a.name === '提示词反推专家') return -1;
    if (b.id === 'prompt-reverse-engineer' || b.name === '提示词反推专家') return 1;
    return 0;
  });

  const filtered = sortedSkills.filter((s) => {
    const q = keyword.trim().toLowerCase();
    if (!q) return true;
    return (
      s.name.toLowerCase().includes(q) ||
      (s.displayName && s.displayName.toLowerCase().includes(q)) ||
      s.description.toLowerCase().includes(q) ||
      s.id.toLowerCase().includes(q)
    );
  });

  const handleClose = () => {
    setSelectedSkillId(null);
    setKeyword('');
    onClose();
  };

  const handleToggleActive = (skillId: string) => {
    const isCurrentlyActive = activeSkillId === skillId;
    const nextId = isCurrentlyActive ? null : skillId;
    onActivate(nextId);
    const targetSkill = skills.find((s) => s.id === skillId);
    const skillTitle = targetSkill?.displayName || targetSkill?.name || '技能';
    if (nextId) {
      showToast(`本次使用「${skillTitle}」`);
    } else {
      showToast(`已取消本次选择「${skillTitle}」`);
    }
  };

  return createPortal(
    <div ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label="技能管理" className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/15 p-4 backdrop-blur-[2px] animate-fade-in select-none">
      <div className="flex max-h-[90vh] w-full max-w-[760px] flex-col overflow-hidden rounded-[20px] border border-slate-200/80 dark:border-white/10 bg-white dark:bg-[#1B1B1E] text-slate-900 dark:text-[#EDEDED] shadow-[0_20px_48px_-28px_rgba(15,23,42,0.3)] dark:shadow-[0_20px_50px_rgba(0,0,0,0.6)]">
        {/* ================= 视图 2：技能详情视图 ================= */}
        {selectedSkill ? (
          <div className="flex flex-col flex-1 min-h-0">
            {/* 顶栏导航 */}
            <div className="flex items-center justify-between px-6 py-3.5 border-b border-slate-100 dark:border-white/10 shrink-0">
              <button
                type="button"
                onClick={() => setSelectedSkillId(null)}
                className="flex items-center gap-1 text-xs font-medium text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white px-2 py-1 -ml-2 rounded-lg hover:bg-slate-100 dark:hover:bg-white/10 transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
                <span>返回</span>
              </button>
              <button
                type="button"
                onClick={handleClose}
                className="p-1.5 rounded-full hover:bg-slate-100 dark:hover:bg-white/10 text-slate-400 hover:text-slate-700 dark:hover:text-white transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* 头部信息与 iOS 风格开关 */}
            <div className="px-6 pt-5 pb-3 shrink-0">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-2.5 flex-wrap">
                  <AssistantSkillIcon className="w-5 h-5 text-amber-500 shrink-0" strokeWidth={1.8} />
                  <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white tracking-tight">
                    {selectedSkill.displayName || selectedSkill.name}
                  </h3>
                  {selectedSkill.displayName && selectedSkill.displayName !== selectedSkill.name && (
                    <span className="text-xs text-slate-400 dark:text-slate-500 font-mono font-normal">
                      ({selectedSkill.name})
                    </span>
                  )}
                </div>

                {/* 状态与 iOS Toggle 切换开关 */}
                <div className="flex items-center gap-2.5 shrink-0">
                  <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                    {activeSkillId === selectedSkill.id ? '本次使用' : '点击立即'}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleToggleActive(selectedSkill.id)}
                    className={`w-11 h-6 rounded-full p-0.5 transition-colors duration-200 ease-in-out focus:outline-none flex items-center ${
                      activeSkillId === selectedSkill.id
                        ? 'bg-amber-500 justify-end'
                        : 'bg-slate-300 dark:bg-white/20 justify-start'
                    }`}
                  >
                    <div className="w-5 h-5 bg-white rounded-full shadow-md transform transition-transform dark:bg-[#18191c]" />
                  </button>
                </div>
              </div>

              {/* 描述信息 */}
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed mt-2.5 pr-6">
                {selectedSkill.description}
              </p>
            </div>

            {/* Markdown 文档容器 */}
            <div className="flex-1 overflow-y-auto px-6 py-2 min-h-0">
              <div className="bg-slate-50/90 dark:bg-[#141416] border border-slate-200/80 dark:border-white/10 rounded-2xl p-5 text-slate-700 dark:text-slate-300 shadow-inner">
                <FormattedMarkdown
                  content={selectedSkill.markdownDoc || selectedSkill.prompt}
                  className="text-slate-700 dark:text-slate-300 leading-relaxed"
                />
              </div>
            </div>

            {/* 底部固定操作栏 */}
            <div className="p-5 border-t border-slate-100 dark:border-white/10 flex items-center justify-between gap-3 shrink-0 bg-white dark:bg-[#18181b]">
              <div className="flex items-center gap-2">
                {!selectedSkill.isBuiltin && (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        onEdit(selectedSkill);
                        handleClose();
                      }}
                      className="px-3 py-2 rounded-xl text-xs font-medium text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white bg-slate-100 dark:bg-white/10 hover:bg-slate-200 dark:hover:bg-white/20 transition-colors flex items-center gap-1.5"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                      编辑技能
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        onDelete(selectedSkill.id);
                        showToast('技能已删除');
                        setSelectedSkillId(null);
                      }}
                      className="px-3 py-2 rounded-xl text-xs font-medium text-red-500 hover:text-red-600 dark:text-rose-400 dark:hover:text-rose-300 bg-red-50 dark:bg-rose-950/40 hover:bg-red-100 dark:hover:bg-rose-900/50 transition-colors flex items-center gap-1.5"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      删除
                    </button>
                  </>
                )}
              </div>

              {/* 主操作：在对话中使用 */}
              <button
                type="button"
                onClick={() => {
                  if (activeSkillId !== selectedSkill.id) {
                    onActivate(selectedSkill.id);
                    const title = selectedSkill.displayName || selectedSkill.name;
                    showToast(`已为本条消息选择「${title}」`);
                  }
                  handleClose();
                }}
                className={`px-5 py-2.5 rounded-xl text-xs font-semibold transition-all shadow-sm flex items-center gap-2 ${
                  activeSkillId === selectedSkill.id
                    ? 'bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800/60 hover:bg-amber-100 dark:hover:bg-amber-900/50'
                    : 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-200'
                }`}
              >
                {activeSkillId === selectedSkill.id ? (
                  <>
                    <Check className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                    已在对话中使用
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    在对话中使用
                  </>
                )}
              </button>
            </div>
          </div>
        ) : (
          /* ================= 视图 1：技能列表视图 ================= */
          <div className="flex flex-col flex-1 min-h-0">
            {/* 顶栏：原生系统风格标题（去除应用 Tab） + 关闭按钮 */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-white/10 shrink-0">
              <div className="flex items-center gap-2">
                <AssistantSkillIcon className="w-4 h-4 text-amber-500 shrink-0" strokeWidth={1.8} />
                <h3 className="text-sm font-bold text-slate-800 dark:text-white">技能</h3>
              </div>

              <button
                type="button"
                onClick={handleClose}
                className="p-1.5 rounded-full hover:bg-slate-100 dark:hover:bg-white/10 text-slate-400 hover:text-slate-700 dark:hover:text-white transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* 搜索框 */}
            <div className="px-6 py-3 border-b border-slate-100 dark:border-white/10 shrink-0 bg-slate-50/50 dark:bg-[#151518]">
              <div className="relative flex items-center">
                <Search className="w-4 h-4 text-slate-400 dark:text-slate-500 absolute left-3.5 pointer-events-none" />
                <input
                  value={keyword}
                  onChange={(e) => setKeyword(e.target.value)}
                  placeholder="搜索技能名称或描述..."
                  className="w-full pl-9 pr-4 py-2 bg-white dark:bg-[#1B1B1E] border border-slate-200/80 dark:border-white/10 focus:border-amber-400 dark:focus:border-amber-400/80 rounded-xl text-xs sm:text-sm text-slate-800 dark:text-slate-200 placeholder:text-slate-400 dark:placeholder:text-slate-500 outline-none transition-all shadow-2xs"
                />
              </div>
            </div>

            {/* 双列卡片网格（对齐系统轻奢素雅风格） */}
            <div className="flex-1 overflow-y-auto p-5 grid grid-cols-1 sm:grid-cols-2 gap-3 min-h-0">
              {filtered.length === 0 ? (
                <div className="text-center py-16 col-span-full text-slate-400 dark:text-slate-500 text-xs">
                  暂无匹配技能
                </div>
              ) : (
                filtered.map((skill) => {
                  const isActive = activeSkillId === skill.id;

                  return (
                    <div
                      key={skill.id}
                      onClick={() => setSelectedSkillId(skill.id)}
                      className={`p-4 rounded-2xl border transition-all duration-200 cursor-pointer flex flex-col justify-between group relative text-left ${
                        isActive
                          ? 'bg-amber-50/60 dark:bg-amber-950/40 border-amber-300 dark:border-amber-500/50 shadow-sm ring-1 ring-amber-200/60 dark:ring-amber-900/40'
                          : 'bg-slate-50/60 dark:bg-white/5 hover:bg-slate-100/80 dark:hover:bg-white/10 border-slate-200/70 dark:border-white/10 hover:border-slate-300 dark:hover:border-white/20 hover:shadow-xs'
                      }`}
                    >
                      <div>
                        {/* 顶部图标与标题行（直接使用纯净 SVG，不加背景色，去除 TapNow 文字） */}
                        <div className="flex items-start justify-between gap-2.5">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <AssistantSkillCardIcon skill={skill} size="md" />
                            <div className="min-w-0">
                              <div className="text-xs sm:text-sm font-semibold text-slate-800 dark:text-slate-200 group-hover:text-slate-950 dark:group-hover:text-white truncate">
                                {skill.name}
                              </div>
                            </div>
                          </div>

                          {/* 选中对勾 */}
                          {isActive && (
                            <div className="w-5 h-5 rounded-full bg-amber-500 flex items-center justify-center shrink-0 mt-0.5 shadow-2xs">
                              <Check className="w-3 h-3 text-white" strokeWidth={2.5} />
                            </div>
                          )}
                        </div>

                        {/* 描述信息（三行截断） */}
                        <p className="text-xs text-slate-500 dark:text-slate-400 group-hover:text-slate-600 dark:group-hover:text-slate-300 line-clamp-3 leading-relaxed mt-2.5">
                          {skill.description}
                        </p>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
