import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, FileText, Check, HelpCircle } from 'lucide-react';
import { useAppStore } from '@client/store';
import type { AssistantSkill } from '@shared/domain/assistant/skills/types';

export interface PromptBarManualSkillModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaveAndUse?: (skill: { name: string; content?: string }) => void;
}

const DEFAULT_SKILL_TEMPLATE = `# 技能名称

## 描述
一句话说明该技能的用途和适用场景。

## 提示词模版
在这里编写专用的结构化提示词模版与规则。
`;

export default function PromptBarManualSkillModal({
  isOpen,
  onClose,
  onSaveAndUse,
}: PromptBarManualSkillModalProps) {
  const [skillName, setSkillName] = useState('');
  const [skillDesc, setSkillDesc] = useState('');
  const [skillContent, setSkillContent] = useState(DEFAULT_SKILL_TEMPLATE);
  const addAssistantSkill = useAppStore((s) => s.addAssistantSkill);

  useEffect(() => {
    if (isOpen) {
      setSkillName('');
      setSkillDesc('');
      setSkillContent(DEFAULT_SKILL_TEMPLATE);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSave = () => {
    const trimmed = skillName.trim();
    if (!trimmed) return;
    const newSkill: AssistantSkill = {
      id: `custom-${Date.now()}`,
      name: trimmed,
      description: skillDesc.trim() || trimmed,
      prompt: skillContent,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      version: '1.0.0',
      isBuiltin: false,
    };
    addAssistantSkill(newSkill);
    onSaveAndUse?.({ name: trimmed, content: skillContent });
    onClose();
  };

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4 animate-fade-in select-none"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl bg-white rounded-3xl shadow-[0_24px_60px_rgba(0,0,0,0.18)] border border-slate-200/90 p-6 flex flex-col gap-4 animate-in fade-in zoom-in-95 max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-slate-100 flex items-center justify-center text-slate-800">
              <FileText className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 leading-tight">创建自定义技能</h2>
              <p className="text-xs text-slate-400">编写结构化 Prompt 模版与生成执行逻辑</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-4 overflow-y-auto flex-1 pr-1">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">技能名称</label>
            <input
              type="text"
              value={skillName}
              onChange={(e) => setSkillName(e.target.value)}
              placeholder="例：电商服饰三视图生成"
              className="w-full px-3.5 py-2 rounded-xl border border-slate-200 bg-slate-50 text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:bg-white focus:border-slate-400 focus:ring-1 focus:ring-slate-300 transition-all"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">技能简述</label>
            <input
              type="text"
              value={skillDesc}
              onChange={(e) => setSkillDesc(e.target.value)}
              placeholder="一句话说明该技能用途"
              className="w-full px-3.5 py-2 rounded-xl border border-slate-200 bg-slate-50 text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:bg-white focus:border-slate-400 focus:ring-1 focus:ring-slate-300 transition-all"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold text-slate-700">技能指令与模版 (Markdown)</label>
              <span className="text-[11px] text-slate-400 flex items-center gap-1">
                <HelpCircle className="w-3 h-3" /> 支持包含 #[skill] 与角色变量
              </span>
            </div>
            <textarea
              rows={8}
              value={skillContent}
              onChange={(e) => setSkillContent(e.target.value)}
              className="w-full p-3 rounded-xl border border-slate-200 bg-slate-50 text-xs font-mono text-slate-800 placeholder:text-slate-400 focus:outline-none focus:bg-white focus:border-slate-400 focus:ring-1 focus:ring-slate-300 transition-all resize-none leading-relaxed"
            />
          </div>
        </div>

        <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-full text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer"
          >
            取消
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!skillName.trim()}
            className={`px-5 py-2 rounded-full text-xs font-medium flex items-center gap-1.5 transition-all ${
              skillName.trim()
                ? 'bg-slate-900 hover:bg-black text-white cursor-pointer shadow-xs active:scale-95'
                : 'bg-slate-100 text-slate-400 cursor-not-allowed'
            }`}
          >
            <Check className="w-3.5 h-3.5 stroke-[2.2]" />
            <span>保存并使用</span>
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
