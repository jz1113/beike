import { useId, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { resolveVideoPromptSkill } from '@shared/domain/assistant/skills/videoPromptSkills';
import { skillDisplayDescription } from '@shared/domain/assistant/skills/skillDisplay';
import { AssistantSkillCardIcon } from '@client/shared/icons';
import { useModalDialog } from '@client/shared/hooks/useModalDialog';
import MarkdownBody from '@client/shared/ui/markdown/MarkdownBody';

export function VideoPromptSkillDetails({skillId,model,onClose}:{skillId:string;model?:string;onClose:()=>void}) {
  const skill=resolveVideoPromptSkill(skillId,model),titleId=useId();
  const dialog=useModalDialog(true,onClose);
  if(!skill)return null;
  return createPortal(<div className="pointer-events-auto fixed inset-0 z-[220] grid place-items-center bg-black/60 p-3 backdrop-blur-sm" onPointerDown={event=>event.stopPropagation()} onMouseDown={event=>event.stopPropagation()} onClick={event=>event.stopPropagation()} onKeyDown={event=>event.stopPropagation()}>
    <div ref={dialog} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby={titleId} className="flex max-h-[90dvh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white text-slate-800 shadow-xl dark:border-white/15 dark:bg-[#202023] dark:text-stone-100">
      <header className="flex items-center gap-3 border-b border-slate-200 p-5 dark:border-white/10">
        <AssistantSkillCardIcon skill={skill}/><div className="min-w-0 flex-1"><h2 id={titleId} className="font-semibold">{skill.displayName || skill.name}</h2><p className="mt-1 text-xs text-slate-500 dark:text-stone-400">{skill.source?.kind==='official'?'官方':'GitHub 社区'}视频提示词技能 · {skill.author}</p></div>
        <button type="button" aria-label="关闭技能介绍" onClick={onClose} className="grid h-11 w-11 shrink-0 place-items-center rounded-lg hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-sky-400 dark:hover:bg-white/10"><X aria-hidden="true" className="h-5 w-5"/></button>
      </header>
      <div className="min-h-0 space-y-5 overflow-auto p-5 text-sm leading-7">
        <p>{skillDisplayDescription(skill)}</p>
        {skill.usageGuide && <MarkdownBody content={skill.usageGuide}/>}
        <div className="border-t border-slate-200 pt-3 text-xs text-slate-500 dark:border-white/10 dark:text-stone-400">
          <p>技能标识：{skill.id} · 版本：{skill.version}</p>
          {skill.source && <a href={skill.source.url} target="_blank" rel="noreferrer" className="inline-block py-2 underline focus-visible:outline-2 focus-visible:outline-sky-400">{skill.source.kind==='official'?'查看官方来源':'查看 GitHub 社区来源'}</a>}
        </div>
      </div>
    </div>
  </div>,document.body);
}

export function VideoPromptSkillBadge({skillId,label,model}:{skillId?:string;label:string;model?:string}) {
  const [open,setOpen]=useState(false),skill=skillId?resolveVideoPromptSkill(skillId,model):undefined;
  if(!label)return null;
  if(!skill)return <span className="text-xs text-slate-600 dark:text-stone-300">{label}</span>;
  return <>
    <button type="button" aria-label={`查看${skill.displayName || skill.name}的介绍`} aria-haspopup="dialog" onPointerDown={event=>event.stopPropagation()} onMouseDown={event=>event.stopPropagation()} onKeyDown={event=>event.stopPropagation()} onClick={event=>{event.stopPropagation();setOpen(true);}} className="pointer-events-auto inline-flex min-h-9 max-w-full items-center gap-2 rounded-lg border border-slate-200 bg-white px-2 py-1 text-left text-xs text-slate-700 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-sky-400 dark:border-white/15 dark:bg-[#202023] dark:text-stone-200 dark:hover:bg-white/10">
      <AssistantSkillCardIcon skill={skill} className="!h-6 !w-6 !rounded-md !p-0.5"/><span className="min-w-0 break-words">{label}</span>
    </button>
    {open && <VideoPromptSkillDetails skillId={skill.id} model={model} onClose={()=>setOpen(false)}/>}
  </>;
}
