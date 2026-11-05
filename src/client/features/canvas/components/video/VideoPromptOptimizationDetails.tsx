import type { VideoPromptOptimization } from '@client/shared/agent/videoPromptOptimizer';
import { resolveVideoPromptSkill } from '@shared/domain/assistant/skills/videoPromptSkills';

export function VideoPromptOptimizationDetails({ value, dark=false, historical=false }: { value?: VideoPromptOptimization; dark?: boolean; historical?: boolean }) {
  if (!value) return null;
  const skill=resolveVideoPromptSkill(value.skillId,value.videoModel,value.videoMode);
  return <details className={`min-w-0 text-xs leading-6 ${dark?'text-stone-300':'text-slate-600 dark:text-stone-300'}`}>
    <summary className="min-h-11 cursor-pointer rounded py-2 focus-visible:outline-2 focus-visible:outline-sky-300">{historical?'上次模型的优化记录':'查看原文与优化稿'} · {skill?.displayName || '视频提示词技能'}</summary>
    <div className="mt-2 grid min-w-0 gap-2">
      <a className="w-fit underline" href={value.sourceUrl} target="_blank" rel="noreferrer">{skill?.source?.kind==='community'?'GitHub 社区来源':'官方来源'} · {value.revision}</a>
      <p>优化模型：{value.textModel}</p>
      <p>原始提示词</p><p className="max-h-40 overflow-auto whitespace-pre-wrap break-words">{value.original}</p>
      <p>{value.submitted?'实际提交的提示词':'优化稿'}</p><p className="max-h-60 overflow-auto whitespace-pre-wrap break-words">{value.submitted ?? value.draft ?? value.optimized}</p>
    </div>
  </details>;
}
