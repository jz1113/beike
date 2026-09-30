import { useAssistantDialog } from './useAssistantDialog';
import { useEffect, useRef, useState } from 'react';
import { Check, Upload, Plus, Search, Settings } from 'lucide-react';
import { AssistantSkillIcon } from './AssistantSkillIcon';
import { useShallow } from 'zustand/react/shallow';
import { useAppStore } from '@client/store';
import type { AssistantSkill } from '@shared/domain/assistant/skills/types';
import AssistantSkillEditorModal from './AssistantSkillEditorModal';
import AssistantSkillManageModal from './AssistantSkillManageModal';

interface Props { showToast: (msg: string) => void; onUploadFiles: () => void; hasContext?: boolean }

export default function AssistantSkillsMenu({ showToast, onUploadFiles }: Props) {
  const store = useAppStore(useShallow(s => ({
    activeId: s.activeAssistantSkillId, setActive: s.setActiveAssistantSkillId,
    getSkills: s.getAllAssistantSkills, customSkills: s.assistantCustomSkills,
    add: s.addAssistantSkill, update: s.updateAssistantSkill, remove: s.deleteAssistantSkill,
    importFile: s.importAssistantSkillFromFile,
  })));
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [editorSkill, setEditorSkill] = useState<AssistantSkill | null | undefined>(undefined);
  const [manage, setManage] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const popoverRef = useAssistantDialog(open, () => { setOpen(false); setQuery(''); });
  const fileRef = useRef<HTMLInputElement>(null);
  const skills = store.getSkills();
  const filtered = skills.filter(s => `${s.displayName || ''} ${s.name} ${s.description}`.toLowerCase().includes(query.trim().toLowerCase()));
  const close = () => { setOpen(false); setQuery(''); };
  useEffect(() => {
    if (!open) return;
    searchRef.current?.focus();
    const outside = (event: MouseEvent) => { if (!rootRef.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', outside);
    return () => document.removeEventListener('mousedown', outside);
  }, [open]);
  return <>
    <button type="button" className="agent-attachment-button" onClick={onUploadFiles} aria-label="上传附件" title="上传图片、视频或文档；也可粘贴或拖入"><Plus size={18} strokeWidth={1.8} aria-hidden="true" /></button>
    <div className="agent-skills-root" ref={rootRef} onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); close(); triggerRef.current?.focus(); } }}>
      <button ref={triggerRef} type="button" className="agent-composer-action" aria-label="选择技能" aria-expanded={open} data-active={Boolean(store.activeId)} onClick={() => { setQuery(''); setOpen(!open); }}><AssistantSkillIcon className="h-4 w-4" /><span>技能</span>{store.activeId && <span className="agent-selected-dot" />}</button>
      {open && <section ref={popoverRef} role="dialog" aria-modal="false" tabIndex={-1} className="agent-popover agent-skills-panel" aria-label="技能库">
        <label className="agent-search"><Search size={14} aria-hidden="true" /><input ref={searchRef} aria-label="搜索技能" placeholder="搜索技能" value={query} onChange={e => setQuery(e.target.value)} /></label>
        <div className="agent-skills-list">
          {filtered.map(skill => <button type="button" key={skill.id} className="agent-skill-option" title={`${skill.displayName || skill.name}\n${skill.description}`} aria-pressed={store.activeId === skill.id} onClick={() => { store.setActive(store.activeId === skill.id ? null : skill.id); close(); triggerRef.current?.focus(); }}>
            <AssistantSkillIcon className="h-4 w-4 shrink-0" /><span className="min-w-0 flex-1"><strong>{skill.displayName || skill.name}</strong></span>{store.activeId === skill.id && <Check size={14} className="shrink-0" aria-hidden="true" />}
          </button>)}
          {!filtered.length && <p className="agent-empty-result">没有匹配技能，换个关键词试试</p>}
        </div>
        <div className="agent-skills-footer">
          <button type="button" onClick={() => fileRef.current?.click()} title="导入 Markdown 或 JSON 技能文件"><Upload size={14} />上传技能文件</button>
          <button type="button" onClick={() => { setEditorSkill(null); close(); }}><Plus size={14} />创建技能</button>
          <button type="button" onClick={() => { setManage(true); close(); }}><Settings size={14} />管理技能</button>
        </div>
      </section>}
    </div>
    <input ref={fileRef} type="file" accept=".md,.json,text/markdown,application/json" className="hidden" onChange={async e => {
      const file = e.target.files?.[0]; e.target.value = '';
      if (!file) return;
      try { const skill = await store.importFile(file); showToast(`已导入技能：${skill.displayName || skill.name}`); close(); }
      catch (error) { showToast(error instanceof Error ? error.message : '技能文件解析失败'); }
    }} />
    <AssistantSkillEditorModal isOpen={editorSkill !== undefined} onClose={() => setEditorSkill(undefined)} showToast={showToast} initialSkill={editorSkill || null}
      onSave={skill => { if (editorSkill?.id && !editorSkill.isBuiltin) store.update(skill.id, skill); else store.add(skill); }} onDelete={store.remove} />
    <AssistantSkillManageModal isOpen={manage} onClose={() => setManage(false)} skills={skills} activeSkillId={store.activeId} onActivate={store.setActive}
      onEdit={skill => { setManage(false); setEditorSkill(skill); }} onDelete={store.remove} showToast={showToast} />
  </>;
}
