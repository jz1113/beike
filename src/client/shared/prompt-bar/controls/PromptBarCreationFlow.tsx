import { useState } from 'react';
import { useAppStore } from '@client/store';
import { Eye, ImagePlus, X } from 'lucide-react';
import type { AssistantSkill } from '@shared/domain/assistant/skills/types';
import { creationSkillFlow } from '@client/shared/skills/model/creationSkillFlows';
import { librarySkillItem } from '@client/shared/skills/model/libraryView';
import { CreationSkillDetailModal } from '@client/shared/skills/components/CreationSkillDetailModal';

export function PromptBarCreationFlow({ skill, refImagesCount, onUpload, onClear, onPrompt }: {
  skill: AssistantSkill; refImagesCount: number; onUpload: () => void; onClear: () => void; onPrompt: (text: string) => void;
}) {
  const [detail, setDetail] = useState(false);
  const flow = creationSkillFlow(skill.id)!;
  return <div className="rounded-xl border border-slate-200/70 px-3 py-2.5 text-xs dark:border-white/[0.08]" data-creation-flow={skill.id}>
    <div className="flex items-center justify-between gap-2"><span className="font-medium text-slate-900 dark:text-white">{skill.displayName || skill.name}</span><div className="flex items-center gap-1"><button type="button" onClick={() => setDetail(true)} className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-slate-500 hover:bg-slate-100 dark:text-neutral-400 dark:hover:bg-white/5"><Eye size={13} />使用说明</button><button type="button" onClick={onClear} aria-label={`移除创作技能 ${skill.displayName || skill.name}`} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-white/5"><X size={14} /></button></div></div>
    <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-2"><button type="button" onClick={onUpload} className="flex shrink-0 items-center gap-1.5 rounded-lg border border-dashed border-slate-300 px-2.5 py-2 text-slate-600 hover:bg-slate-50 dark:border-white/20 dark:text-neutral-300 dark:hover:bg-white/5"><ImagePlus size={14} />{refImagesCount ? `已添加 ${refImagesCount} 份素材` : flow.inputLabel}</button><p className="min-w-0 flex-1 basis-44 text-[11px] leading-5 text-slate-500 dark:text-neutral-400">{flow.inputHint}</p></div>
    {detail && <CreationSkillDetailModal item={librarySkillItem({ kind: 'assistant', content: skill })} onClose={() => setDetail(false)} onUse={(prompt, references) => { if (references !== undefined) useAppStore.getState().setQuickRefImages([...references]); if (prompt) onPrompt(prompt); setDetail(false); }} />}
  </div>;
}
