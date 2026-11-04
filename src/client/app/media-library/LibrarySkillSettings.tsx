import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { SalesPromptWorkspace } from '@client/features/sales/components/SalesPromptWorkspace';
import { useSalesPrompts } from '@client/features/sales/hooks/useSalesPrompts';
import { confirmAction } from '@client/shared/utils/confirmAction';
import '@client/features/sales/salesPrompts.css';

const prompts = {
  script: ['script-analysis'],
  persona: ['persona-design', 'persona-grid'],
  scene: ['scene-design', 'scene-grid'],
} as const;

export function LibrarySkillSettings({kind, onClose}: {kind:keyof typeof prompts; onClose:()=>void}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const manager = useSalesPrompts(true, prompts[kind]);
  const title = {script:'动作分析',persona:'人物生成',scene:'场景生成'}[kind]+'技能设置';
  useEffect(()=>{dialog.current?.showModal();},[]);
  async function close() {
    if (manager.saving) return;
    if (manager.hasUnsaved && !await confirmAction({title:'放弃未保存的技能修改？', confirmText:'放弃修改', danger:true})) return;
    onClose();
  }
  return <dialog ref={dialog} className="sales-material-dialog bml-skill-settings" aria-label={title}
    onCancel={event=>{event.preventDefault();void close();}}>
    <header><h2>{title}</h2><button aria-label="关闭技能设置" disabled={manager.saving} onClick={()=>void close()}><X size={17}/></button></header>
    <SalesPromptWorkspace manager={manager} showSidebar={false}/>
  </dialog>;
}
