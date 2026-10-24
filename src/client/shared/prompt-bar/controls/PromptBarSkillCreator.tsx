import { useState, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { useAppStore } from '@client/store';
import { useToast } from '@client/shared/hooks/useToast';
import type { RichPromptInputRef } from '@client/shared/prompt-bar/RichPromptInput';
import { AgentCreateSkillBar } from '@client/shared/skills/components/AgentCreateSkillBar';
import { ManualSkillStudioModal } from '@client/shared/skills/components/ManualSkillStudioModal';
import { buildSkillFromStudio, type SkillStudioPayload } from '@client/shared/skills/model/buildSkillFromStudio';
import type { SkillFileNode } from '@client/shared/skills/model/skillFileTree';
import { parseLocalSkillFiles } from '@client/shared/skills/model/skillPackageParser';
import type { GeneratedSkillResult } from '@client/shared/skills/model/agentSkillGenerator';
import type { SkillDraftData } from '@client/shared/skills/model/skillTypes';

export function usePromptBarSkillCreator(richInputRef: RefObject<RichPromptInputRef | null>) {
  const { message, show } = useToast();
  const addAssistantSkill = useAppStore((state) => state.addAssistantSkill);
  const setActiveAssistantSkillId = useAppStore((state) => state.setActiveAssistantSkillId);
  const [agentOpen, setAgentOpen] = useState(false);
  const [studioOpen, setStudioOpen] = useState(false);
  const [studioFiles, setStudioFiles] = useState<SkillFileNode[] | null>(null);
  const [studioDraft, setStudioDraft] = useState<Partial<SkillDraftData> | null>(null);

  const openStudio = (files: SkillFileNode[] | null, draft: Partial<SkillDraftData> | null) => {
    setStudioFiles(files);
    setStudioDraft(draft);
    setStudioOpen(true);
  };

  return {
    toastMessage: message,
    overlayOpen: agentOpen || studioOpen,
    openAgentCreate: () => setAgentOpen(true),
    openManualCreate: () => openStudio(null, null),
    useSkill: (skill: { id: string; title: string }, initialPromptOverride?: string) => {
      const store = useAppStore.getState();
      store.setQuickGenMode('agent');
      setActiveAssistantSkillId(skill.id);
      if (initialPromptOverride !== undefined) {
        store.setQuickPrompt(initialPromptOverride);
      } else if (richInputRef.current) {
        const prev = store.quickPrompt || '';
        if (/【强指令·[^】]+】/.test(prev)) store.setQuickPrompt(prev.replace(/【强指令·[^】]+】[^【\n]*?[！。；]\s*/g, '').trim());
        richInputRef.current.insertSkill(skill.title);
      } else {
        const current = store.quickPrompt || '';
        const token = `#[skill:${skill.title}]`;
        if (!current.includes(token)) {
          const stripped = current.replace(/#\[skill:[^\]]+\]\s*/gi, '').trim();
          store.setQuickPrompt(stripped ? `${token} ${stripped}` : `${token} `);
        }
      }
    },
    uploadFiles: async (files: File[]) => {
      try {
        const parsed = await parseLocalSkillFiles(files);
        openStudio(parsed.files, parsed.draft);
        show(parsed.warnings[0] || '已提取技能元数据并载入工作室');
      } catch (error) {
        show(error instanceof Error ? error.message : '技能文件解析失败');
      }
    },
    agentOpen,
    closeAgent: () => setAgentOpen(false),
    onAgentGenerated: (result: GeneratedSkillResult) => openStudio(result.files, result.draft),
    studioOpen,
    closeStudio: () => setStudioOpen(false),
    studioFiles,
    studioDraft,
    show,
    saveSkill: async (payload: SkillStudioPayload) => {
      const skill = buildSkillFromStudio(payload);
      await addAssistantSkill(skill);
      useAppStore.getState().setQuickGenMode('agent');
      setActiveAssistantSkillId(skill.id);
      richInputRef.current?.insertSkill(skill.displayName || skill.name);
      show(`技能「${payload.title}」已保存并激活`);
    },
  };
}

export function PromptBarSkillCreatorHost({
  creator,
}: {
  creator: ReturnType<typeof usePromptBarSkillCreator>;
}) {
  return (
    <>
      {creator.agentOpen && createPortal(
        <div
          className="fixed inset-0 z-[120] flex items-start justify-center bg-black/40 px-4 pt-[18vh]"
          onClick={creator.closeAgent}
        >
          <div className="w-full max-w-3xl" onClick={(event) => event.stopPropagation()}>
            <AgentCreateSkillBar
              isOpen
              onClose={creator.closeAgent}
              onGenerated={creator.onAgentGenerated}
              showToast={creator.show}
            />
          </div>
        </div>,
        document.body,
      )}
      <ManualSkillStudioModal
        isOpen={creator.studioOpen}
        onClose={creator.closeStudio}
        showToast={creator.show}
        initialFiles={creator.studioFiles}
        initialDraft={creator.studioDraft}
        onSave={creator.saveSkill}
        saveLabel="保存并使用"
      />
      {creator.toastMessage && createPortal(
        <div className="pointer-events-none fixed bottom-6 left-1/2 z-[140] -translate-x-1/2 rounded-2xl bg-slate-900 px-4 py-2.5 text-xs font-medium text-white shadow-xl dark:bg-white dark:text-slate-950">
          {creator.toastMessage}
        </div>,
        document.body,
      )}
    </>
  );
}
