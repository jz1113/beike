import { useState } from 'react';
import { useAppStore } from '@client/store';
import type { AssistantSkill } from '@shared/domain/assistant/skills/types';
import { buildSkillFromStudio, studioStateFromSkill, type SkillStudioPayload } from '../model/buildSkillFromStudio';
import { parseLocalSkillFiles } from '../model/skillPackageParser';
import type { GeneratedSkillResult } from '../model/agentSkillGenerator';
import type { SkillFileNode } from '../model/skillFileTree';
import type { SkillDraftData } from '../model/skillTypes';

export function useLibrarySkillStudio(showToast: (message: string) => void) {
  const [open, setOpen] = useState(false);
  const [files, setFiles] = useState<SkillFileNode[] | null>(null);
  const [draft, setDraft] = useState<Partial<SkillDraftData> | null>(null);
  const [editing, setEditing] = useState<AssistantSkill | null>(null);
  const start = (files: SkillFileNode[] | null, draft: Partial<SkillDraftData> | null, editing: AssistantSkill | null = null) => {
    setFiles(files); setDraft(draft); setEditing(editing); setOpen(true);
  };
  return {
    open, files, draft, editing,
    close: () => setOpen(false),
    create: () => start(null, null),
    edit: (skill: AssistantSkill) => { const state = studioStateFromSkill(skill); start(state.files, state.draft, skill); },
    generated: (result: GeneratedSkillResult) => start(result.files, result.draft),
    upload: async (selected: FileList) => {
      try {
        const result = await parseLocalSkillFiles(selected);
        start(result.files, result.draft);
        if (result.warnings[0]) showToast(result.warnings[0]);
      } catch (error) { showToast(error instanceof Error ? error.message : '技能文件解析失败'); }
    },
    save: async (payload: SkillStudioPayload) => {
      const skill = buildSkillFromStudio(payload, editing ? { id: editing.id, createdAt: editing.createdAt } : undefined);
      if (editing) await useAppStore.getState().updateAssistantSkill(editing.id, { ...skill, libraryVersion: editing.libraryVersion });
      else await useAppStore.getState().addAssistantSkill(skill);
      showToast('技能已保存，可在需要时选择使用');
    },
  };
}
