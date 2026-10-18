import { useState, useRef, useEffect } from 'react';
import { Sparkles, ArrowRight, Loader2, X } from 'lucide-react';
import { generateSkillFromIdea, type GeneratedSkillResult } from '../model/agentSkillGenerator';

export interface AgentCreateSkillBarProps {
  isOpen: boolean;
  onClose: () => void;
  onGenerated: (result: GeneratedSkillResult) => void;
  showToast: (msg: string) => void;
}

export function AgentCreateSkillBar({
  isOpen,
  onClose,
  onGenerated,
  showToast,
}: AgentCreateSkillBarProps) {
  const [idea, setIdea] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setIdea('');
      setTimeout(() => inputRef.current?.focus(), 80);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmed = idea.trim();
    if (!trimmed) {
      showToast('请输入需要沉淀的Skill想法');
      return;
    }

    setIsGenerating(true);
    try {
      await new Promise((r) => setTimeout(r, 650));
      const result = generateSkillFromIdea(trimmed);
      showToast('Agent 已为您规划并生成技能规范');
      onGenerated(result);
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '技能生成失败';
      showToast(msg);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="w-full border-b border-black/[0.05] dark:border-white/[0.06] bg-white/80 dark:bg-[#161618]/80 backdrop-blur-md px-6 py-3 animate-in slide-in-from-top-2 duration-200">
      <form
        onSubmit={handleSubmit}
        className="mx-auto flex max-w-4xl items-center gap-3 rounded-full border border-black/[0.06] dark:border-white/10 bg-slate-100/80 dark:bg-white/[0.05] p-1.5 pl-3 shadow-inner transition-all focus-within:border-slate-400 dark:focus-within:border-white/30 focus-within:bg-white dark:focus-within:bg-white/[0.08]"
      >
        <div className="flex shrink-0 items-center gap-1.5 rounded-full bg-slate-200/90 dark:bg-white/15 px-3 py-1 text-xs font-semibold text-slate-800 dark:text-slate-100 select-none">
          <Sparkles className="h-3.5 w-3.5 text-amber-500 animate-pulse" />
          <span>创建技能</span>
        </div>

        <input
          ref={inputRef}
          type="text"
          value={idea}
          disabled={isGenerating}
          onChange={(e) => setIdea(e.target.value)}
          placeholder="请输入需要沉淀的Skill想法："
          className="w-full bg-transparent text-xs text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none disabled:opacity-50"
        />

        <div className="flex shrink-0 items-center gap-1.5 pr-1">
          <button
            type="submit"
            disabled={isGenerating || !idea.trim()}
            className="flex h-8 items-center gap-1 rounded-full bg-slate-900 hover:bg-black dark:bg-white dark:hover:bg-slate-100 px-3 text-xs font-medium text-white dark:text-slate-900 transition-all disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
          >
            {isGenerating ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                <span>生成中</span>
              </>
            ) : (
              <>
                <span>AI 生成</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </>
            )}
          </button>

          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full text-slate-400 hover:bg-slate-200/80 dark:hover:bg-white/10 hover:text-slate-700 dark:hover:text-white transition-colors cursor-pointer"
            aria-label="关闭"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </form>
    </div>
  );
}
