import { useAssistantDialog } from '../useAssistantDialog';
import { useEffect, useRef, useState } from 'react';
import { Check, Upload, Plus, Search, Settings } from 'lucide-react';
import { AssistantSkillIcon } from './AssistantSkillIcon';
import { useShallow } from 'zustand/react/shallow';
import { useAppStore } from '@client/store';
import type { AssistantSkill } from '@shared/domain/assistant/skills/types';
import AssistantSkillManageModal from './AssistantSkillManageModal';
import {
  ManualSkillStudioModal,
  buildSkillFromStudio,
  parseLocalSkillFiles,
  studioStateFromSkill,
  type SkillDraftData,
  type SkillFileNode,
  type SkillStudioPayload,
} from '@client/shared/skills';

interface Props { showToast: (msg: string) => void; onUploadFiles: () => void; hasContext?: boolean }

export default function AssistantSkillsMenu({ showToast, onUploadFiles }: Props) {
  const store = useAppStore(useShallow(s => ({
    activeId: s.activeAssistantSkillId, setActive: s.setActiveAssistantSkillId,
    getSkills: s.getAllAssistantSkills,
    add: s.addAssistantSkill, update: s.updateAssistantSkill, remove: s.deleteAssistantSkill,
  })));
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [manage, setManage] = useState(false);
  const [studioOpen, setStudioOpen] = useState(false);
  const [studioFiles, setStudioFiles] = useState<SkillFileNode[] | null>(null);
  const [studioDraft, setStudioDraft] = useState<Partial<SkillDraftData> | null>(null);
  const [editingSkill, setEditingSkill] = useState<AssistantSkill | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const popoverRef = useAssistantDialog(open, () => { setOpen(false); setQuery(''); });
  const fileRef = useRef<HTMLInputElement>(null);
  const skills = store.getSkills();
  const filtered = skills.filter(s => `${s.displayName || ''} ${s.name} ${s.description}`.toLowerCase().includes(query.trim().toLowerCase()));
  const close = () => { setOpen(false); setQuery(''); };
  const openStudio = (files: SkillFileNode[] | null, draft: Partial<SkillDraftData> | null, editing: AssistantSkill | null) => {
    setEditingSkill(editing);
    setStudioFiles(files);
    setStudioDraft(draft);
    setStudioOpen(true);
  };
  const openEdit = (skill: AssistantSkill) => {
    if (skill.isBuiltin) { showToast('内置技能不可修改，请创建自定义技能'); return; }
    const state = studioStateFromSkill(skill);
    openStudio(state.files, state.draft, skill);
  };
  const saveStudio = (payload: SkillStudioPayload) => {
    const skill = buildSkillFromStudio(payload, editingSkill ? { id: editingSkill.id, createdAt: editingSkill.createdAt } : undefined);
    if (editingSkill && !editingSkill.isBuiltin) store.update(skill.id, skill);
    else store.add(skill);
    showToast(editingSkill ? '技能已更新' : '技能已创建');
  };
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
          <button type="button" onClick={() => { openStudio(null, null, null); close(); }}><Plus size={14} />创建技能</button>
          <button type="button" onClick={() => { setManage(true); close(); }}><Settings size={14} />管理技能</button>
        </div>
      </section>}
    </div>
    <input ref={fileRef} type="file" multiple accept=".md,.txt,.zip,text/markdown,application/zip" className="hidden" onChange={async e => {
      const selected = e.target.files; e.target.value = '';
      if (!selected?.length) return;
      try {
        const parsed = await parseLocalSkillFiles(selected);
        openStudio(parsed.files, parsed.draft, null);
        close();
        if (parsed.warnings[0]) showToast(parsed.warnings[0]);
      } catch (error) { showToast(error instanceof Error ? error.message : '技能文件解析失败'); }
    }} />
    <ManualSkillStudioModal
      isOpen={studioOpen}
      onClose={() => setStudioOpen(false)}
      showToast={showToast}
      initialFiles={studioFiles}
      initialDraft={studioDraft}
      heading={editingSkill ? '编辑技能' : '创建技能'}
      mode={editingSkill ? 'edit' : 'create'}
      onSave={saveStudio}
    />
    <AssistantSkillManageModal isOpen={manage} onClose={() => setManage(false)} skills={skills} activeSkillId={store.activeId} onActivate={store.setActive}
      onEdit={skill => { setManage(false); openEdit(skill); }} onDelete={store.remove} showToast={showToast} />
  </>;
}
