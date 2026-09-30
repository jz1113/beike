import { useAssistantDialog } from './useAssistantDialog';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Sparkles, X } from 'lucide-react';
import type { AssistantSkill } from '@shared/domain/assistant/skills/types';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  showToast: (msg: string) => void;
  initialSkill?: AssistantSkill | null;
  onSave: (skill: AssistantSkill) => void;
  onDelete?: (id: string) => void;
}

export default function AssistantSkillEditorModal({
  isOpen,
  onClose,
  showToast,
  initialSkill,
  onSave,
  onDelete,
}: Props) {
  const dialogRef = useAssistantDialog(isOpen, onClose);
  const isBuiltin = Boolean(initialSkill?.isBuiltin);
  const [name, setName] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [description, setDescription] = useState('');
  const [prompt, setPrompt] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    setName(initialSkill?.name || '');
    setDisplayName(initialSkill?.displayName || '');
    setDescription(initialSkill?.description || '');
    setPrompt(initialSkill?.prompt || initialSkill?.markdownDoc || '');
  }, [isOpen, initialSkill]);

  if (!isOpen) return null;

  const handleSubmit = () => {
    if (isBuiltin) { showToast('内置技能不可修改，请创建自定义技能'); return; }
    const trimmedName = name.trim();
    const trimmedPrompt = prompt.trim();
    if (!trimmedName) {
      showToast('请填写技能标识符');
      return;
    }
    if (!trimmedPrompt) {
      showToast('请填写技能指令正文');
      return;
    }
    const now = Date.now();

    onSave({
      ...initialSkill,
      id: initialSkill?.id || trimmedName.toLowerCase().replace(/[^a-z0-9-]+/g, '-') || `skill-${now}`,
      name: trimmedName,
      displayName: displayName.trim() || trimmedName,
      description: description.trim() || trimmedName,
      prompt: trimmedPrompt,
      markdownDoc: trimmedPrompt,
      author: '自定义',
      isBuiltin: false,
      createdAt: initialSkill?.createdAt || now,
      updatedAt: now,
    });
    showToast(initialSkill ? '技能已更新' : '技能已创建');
    onClose();
  };

  return createPortal(
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-950/15 p-4 backdrop-blur-[2px] animate-fade-in select-none">
      <section ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label={initialSkill ? '编辑技能' : '创建新技能'} className="flex max-h-[90vh] w-full max-w-[680px] flex-col overflow-hidden rounded-[20px] border border-slate-200/80 bg-white text-slate-900 shadow-[0_20px_48px_-28px_rgba(15,23,42,0.3)]">
        <header className="flex shrink-0 items-center justify-between gap-5 border-b border-slate-100 px-5 pb-3 pt-4 sm:px-6">
          <div className="flex items-center gap-2.5"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-rose-50 ring-1 ring-rose-100"><Sparkles className="h-3.5 w-3.5 text-rose-500" /></span><h3 className="text-sm font-black tracking-tight">
            {initialSkill ? '编辑技能' : '创建新技能'}
          </h3></div>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭技能编辑"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
          >
            <X className="w-4 h-4" />
          </button>
        </header>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4 text-xs sm:px-6">
          <div>
            <label className="block text-slate-700 font-medium mb-1.5">
              技能标识 (name，英文字母与连字符)
            </label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={isBuiltin}
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200/80 focus:bg-white focus:border-amber-400 text-sm text-slate-900 font-mono placeholder:text-slate-400 outline-none transition-all shadow-2xs"
              placeholder="例如：my-video-copilot"
            />
          </div>

          <div>
            <label className="block text-slate-700 font-medium mb-1.5">
              中文显示名称 (可选)
            </label>
            <input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              disabled={isBuiltin}
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200/80 focus:bg-white focus:border-amber-400 text-sm text-slate-900 placeholder:text-slate-400 outline-none transition-all shadow-2xs"
              placeholder="例如：我的短剧分镜助手"
            />
          </div>

          <div>
            <label className="block text-slate-700 font-medium mb-1.5">
              技能描述（何时触发与功能说明）
            </label>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={isBuiltin}
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200/80 focus:bg-white focus:border-amber-400 text-sm text-slate-900 placeholder:text-slate-400 outline-none transition-all shadow-2xs"
              placeholder="说明触发场景、适用的模型和任务目标"
            />
          </div>

          <div>
            <label className="block text-slate-700 font-medium mb-1.5">
              技能 Markdown 指令正文 (Prompt / 规范)
            </label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              disabled={isBuiltin}
              rows={12}
              className="soft-textarea min-h-[200px] w-full resize-y px-3.5 py-2.5 text-xs font-mono leading-relaxed text-slate-900 placeholder:text-slate-400"
              placeholder="# 技能名称&#10;&#10;## 目的&#10;说明此技能的目标...&#10;&#10;## 工作流程&#10;1. 明确要求...&#10;2. 构建时间线...&#10;&#10;## 输出合同&#10;返回结构..."
            />
          </div>
        </div>

        <footer className="flex shrink-0 items-center justify-between gap-3 border-t border-slate-100 bg-slate-50/50 px-5 py-3 sm:px-6">
          <div>
            {!isBuiltin && initialSkill && onDelete && (
              <button
                type="button"
                onClick={() => {
                  onDelete(initialSkill.id);
                  showToast('技能已删除');
                  onClose();
                }}
                className="px-3 py-2 rounded-xl text-xs font-medium text-red-500 hover:text-red-600 bg-red-50 hover:bg-red-100 transition-colors"
              >
                删除技能
              </button>
            )}
          </div>
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl px-3.5 py-2 text-xs font-bold text-slate-500 transition-colors hover:bg-white hover:text-slate-800"
            >
              取消
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={isBuiltin}
              className="rounded-xl bg-slate-950 px-3.5 py-2 text-xs font-bold text-white shadow-sm transition-colors hover:bg-slate-800"
            >
              保存技能
            </button>
          </div>
        </footer>
      </section>
    </div>,
    document.body,
  );
}
