import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import type { AssistantSkill } from '@beike/shared/assistant/skills/types';

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
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-fade-in select-none">
      <div className="w-full max-w-xl max-h-[88vh] bg-white rounded-3xl border border-slate-200/90 shadow-2xl overflow-hidden flex flex-col text-slate-800">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 shrink-0">
          <h3 className="text-sm font-bold text-slate-900">
            {initialSkill ? '编辑技能' : '创建新技能'}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-4 text-xs overflow-y-auto min-h-0 flex-1">
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
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200/80 focus:bg-white focus:border-amber-400 text-xs font-mono leading-relaxed text-slate-900 placeholder:text-slate-400 resize-y min-h-[200px] outline-none transition-all shadow-2xs"
              placeholder="# 技能名称&#10;&#10;## 目的&#10;说明此技能的目标...&#10;&#10;## 工作流程&#10;1. 明确要求...&#10;2. 构建时间线...&#10;&#10;## 输出合同&#10;返回结构..."
            />
          </div>
        </div>

        <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-between gap-3 shrink-0 bg-white">
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
              className="px-4 py-2 rounded-xl text-xs font-medium text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors"
            >
              取消
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              className="px-5 py-2 rounded-xl text-xs font-semibold bg-slate-900 text-white hover:bg-slate-800 transition-all shadow-sm"
            >
              保存技能
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
