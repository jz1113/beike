import { useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useModalDialog } from '@client/shared/hooks/useModalDialog';
import { resolveVideoPromptSkill } from '@shared/domain/assistant/skills/videoPromptSkills';
import { AssistantSkillCardIcon } from '@client/shared/icons';
import type { VideoPromptOptimization } from '@client/shared/agent/videoPromptOptimizer';

export interface VideoPromptReview {
  id: string;
  optimization: VideoPromptOptimization;
  confirm: (prompt: string) => void;
  cancel: () => void;
  onDraft?: (prompt: string) => void;
}

export function VideoPromptReviewDialog({ review }: { review: VideoPromptReview }) {
  const [prompt,setPrompt]=useState(review.optimization.draft ?? review.optimization.optimized);
  const titleId=useId();
  const submitted=useRef(false);
  const dialog=useModalDialog(true,review.cancel,{initialFocusSelector:'textarea'});
  const skill=resolveVideoPromptSkill(review.optimization.skillId,review.optimization.videoModel,review.optimization.videoMode);
  return createPortal(<div onPointerDown={event=>event.stopPropagation()} onMouseDown={event=>event.stopPropagation()} onClick={event=>event.stopPropagation()} onKeyDown={event=>event.stopPropagation()} className="pointer-events-auto fixed inset-0 z-[200] grid place-items-center bg-black/60 p-3 backdrop-blur-sm">
    <section ref={dialog} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby={titleId} className="flex max-h-[92dvh] w-full max-w-3xl flex-col gap-4 overflow-auto rounded-2xl border border-slate-200 bg-white p-5 text-slate-800 shadow-xl dark:border-white/15 dark:bg-[#202023] dark:text-stone-100">
      <header className="flex items-start gap-3"><AssistantSkillCardIcon skill={skill}/><div className="min-w-0">
        <h2 id={titleId} className="font-semibold">确认视频提示词</h2>
        <p className="mt-1 break-words text-xs text-slate-500 dark:text-stone-300">本次 Skill：{skill?.displayName || review.optimization.skillId} · {review.optimization.skillId}</p>
        <p className="mt-1 break-all text-xs text-slate-500 dark:text-stone-400">版本：{review.optimization.revision} · 优化模型：{review.optimization.textModel}</p>
      </div></header>
      <p className="text-sm text-slate-600 dark:text-stone-300">视频尚未提交。可以修改下方提示词，确认后按当前稿件生成视频。</p>
      <details className="text-xs leading-6 text-slate-500 dark:text-stone-400"><summary className="w-fit cursor-pointer">查看原始提示词</summary><p className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-words">{review.optimization.original}</p></details>
      <label className="grid min-h-0 gap-2 text-sm">优化后的提示词（可修改）
        <textarea aria-label="优化后的提示词" value={prompt} maxLength={20000} onChange={event=>{setPrompt(event.target.value);review.onDraft?.(event.target.value);}} className="min-h-64 w-full resize-y rounded-xl border border-slate-300 bg-slate-50 p-3 text-sm leading-7 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-white/20 dark:bg-black/20"/>
      </label>
      <footer className="flex flex-wrap justify-end gap-3">
        <button type="button" className="min-h-11 rounded-xl border border-slate-300 px-4 text-sm dark:border-white/20" onClick={review.cancel}>取消，不生成视频</button>
        <button type="button" disabled={!prompt.trim()} className="min-h-11 rounded-xl bg-slate-900 px-5 text-sm text-white disabled:opacity-40 dark:bg-white dark:text-slate-900" onClick={()=>{if(submitted.current)return;submitted.current=true;review.confirm(prompt);}}>确认生成视频</button>
      </footer>
    </section>
  </div>,document.body);
}
