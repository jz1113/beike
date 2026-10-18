import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import type { SkillDraftData } from '../model/skillTypes';
import type { SkillStudioPayload } from '../model/buildSkillFromStudio';
import { extractYamlFrontmatter } from '../model/skillPackageParser';
import {
  type SkillFileNode,
  SKILL_EDITOR_PLACEHOLDER,
  createInitialSkillTree,
  findNodeById,
  addNodeToTree,
  renameNodeInTree,
  deleteNodeFromTree,
  updateNodeContentInTree,
  toggleFolderOpenInTree,
  getMainSkillContent,
  collectDirtyNodeIds,
  isProtectedSkillFile,
} from '../model/skillFileTree';
import { SkillFileTreeExplorer } from './SkillFileTreeExplorer';
import { SkillMetadataForm } from './SkillMetadataForm';

export interface ManualSkillStudioModalProps {
  isOpen: boolean;
  onClose: () => void;
  showToast: (msg: string) => void;
  initialFiles?: SkillFileNode[] | null;
  initialDraft?: Partial<SkillDraftData> | null;
  heading?: string;
  /** create：相对空白模板判断未保存；edit：相对打开时的内容判断未保存 */
  mode?: 'create' | 'edit';
  onSave: (skill: SkillStudioPayload) => void;
}

const DEFAULT_DRAFT: SkillDraftData = {
  title: '',
  description: '',
  genres: ['图片'],
  tags: [],
  defaultVideoModel: '',
  defaultImageModel: '',
  coverUrl: '',
  showcaseUrls: [],
  promptGuide: '',
  assetGuide: '',
  isPublic: false,
};

function studioSnapshot(nodes: SkillFileNode[], draft: SkillDraftData): string {
  const compact = (items: SkillFileNode[]): unknown => items.map((node) => ({
    id: node.id,
    name: node.name,
    type: node.type,
    content: node.type === 'file' ? node.content || '' : undefined,
    children: node.children ? compact(node.children) : undefined,
  }));
  return JSON.stringify({ nodes: compact(nodes), draft });
}

export function ManualSkillStudioModal({
  isOpen,
  onClose,
  showToast,
  initialFiles,
  initialDraft,
  heading = '创建技能',
  mode = 'create',
  onSave,
}: ManualSkillStudioModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const baselineRef = useRef('');

  const [fileNodes, setFileNodes] = useState<SkillFileNode[]>(() =>
    initialFiles && initialFiles.length > 0 ? initialFiles : createInitialSkillTree()
  );
  const [activeFileId, setActiveFileId] = useState<string>('skill-root-md');
  const [draft, setDraft] = useState<SkillDraftData>(DEFAULT_DRAFT);
  const [baselineNodes, setBaselineNodes] = useState<SkillFileNode[]>([]);
  const [session, setSession] = useState(0);
  const sessionRef = useRef(0);

  useEffect(() => {
    if (!isOpen) return;

    const openedNodes = initialFiles && initialFiles.length > 0 ? initialFiles : createInitialSkillTree();
    const skillFile = openedNodes.find((node) => node.type === 'file' && node.name.toLowerCase() === 'skill.md');
    setFileNodes(openedNodes);
    setActiveFileId(skillFile?.id || openedNodes[0]?.id || 'skill-root-md');

    const nextDraft: SkillDraftData = initialDraft
      ? {
          title: initialDraft.title || '',
          description: initialDraft.description || '',
          genres: initialDraft.genres?.length ? initialDraft.genres : ['图片'],
          tags: initialDraft.tags || [],
          defaultVideoModel: initialDraft.defaultVideoModel || '',
          defaultImageModel: initialDraft.defaultImageModel || '',
          coverUrl: initialDraft.coverUrl || '',
          showcaseUrls: initialDraft.showcaseUrls || [],
          promptGuide: initialDraft.promptGuide || '',
          assetGuide: initialDraft.assetGuide || '',
          isPublic: Boolean(initialDraft.isPublic),
        }
      : DEFAULT_DRAFT;
    setDraft(nextDraft);
    const baseline = mode === 'edit'
      ? studioSnapshot(openedNodes, nextDraft)
      : studioSnapshot(createInitialSkillTree(), DEFAULT_DRAFT);
    baselineRef.current = baseline;
    setBaselineNodes(mode === 'edit' ? openedNodes : createInitialSkillTree());
    sessionRef.current += 1;
    setSession(sessionRef.current);
  }, [isOpen, initialFiles, initialDraft, mode]);

  const activeNode = findNodeById(fileNodes, activeFileId);
  const currentContent = activeNode?.content || '';

  const handleContentChange = (newContent: string) => {
    if (!activeFileId) return;
    setFileNodes((prev) => updateNodeContentInTree(prev, activeFileId, newContent));
  };

  const handleAddNode = (parentId: string | null, name: string, type: 'file' | 'folder') => {
    const newNode: SkillFileNode = {
      id: `${type}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name,
      type,
      content: type === 'file' ? '' : undefined,
      children: type === 'folder' ? [] : undefined,
      isOpen: true,
    };
    setFileNodes((prev) => addNodeToTree(prev, parentId, newNode));
    if (type === 'file') setActiveFileId(newNode.id);
  };

  const handleRenameNode = (id: string, newName: string) => {
    if (isProtectedSkillFile(fileNodes, id)) {
      showToast('SKILL.md 不能重命名');
      return;
    }
    setFileNodes((prev) => renameNodeInTree(prev, id, newName));
  };

  const handleDeleteNode = (id: string) => {
    if (isProtectedSkillFile(fileNodes, id)) {
      showToast('SKILL.md 不能删除');
      return;
    }
    const next = deleteNodeFromTree(fileNodes, id);
    setFileNodes(next);
    if (!findNodeById(next, activeFileId)) {
      const skillFile = next.find((node) => node.type === 'file' && node.name.toLowerCase() === 'skill.md');
      if (skillFile) setActiveFileId(skillFile.id);
    }
  };

  const handleToggleFolder = (id: string) => {
    setFileNodes((prev) => toggleFolderOpenInTree(prev, id));
  };

  const handleSaveAndUse = () => {
    const trimmedTitle = draft.title.trim();
    if (!trimmedTitle) {
      showToast('请输入技能名称');
      return;
    }
    const trimmedDesc = draft.description.trim();
    if (!trimmedDesc) {
      showToast('请输入一句话介绍');
      return;
    }
    if (draft.genres.length === 0) {
      showToast('请至少选择一个输出体裁');
      return;
    }
    if (draft.tags.length === 0) {
      showToast('需要选择 1 个类型标签');
      return;
    }
    if (!draft.coverUrl) {
      showToast('请上传技能封面');
      return;
    }

    const mainPrompt = getMainSkillContent(fileNodes);
    if (!extractYamlFrontmatter(mainPrompt).body.trim()) {
      showToast('技能内容不可为空，请完善 SKILL.md');
      return;
    }

    onSave({
      title: trimmedTitle,
      description: trimmedDesc,
      genres: draft.genres,
      tags: draft.tags,
      defaultVideoModel: draft.defaultVideoModel,
      defaultImageModel: draft.defaultImageModel,
      coverUrl: draft.coverUrl,
      showcaseUrls: draft.showcaseUrls,
      promptGuide: draft.promptGuide.trim(),
      assetGuide: draft.assetGuide.trim(),
      isPublic: draft.isPublic,
      files: fileNodes,
    });
    onClose();
  };

  const ready = session > 0 && session === sessionRef.current;
  const dirty = ready && studioSnapshot(fileNodes, draft) !== baselineRef.current;
  const dirtyIds = ready ? collectDirtyNodeIds(fileNodes, baselineNodes) : new Set<string>();

  const requestClose = () => {
    if (dirty && !window.confirm('当前技能还有未保存的修改，确定关闭吗？')) return;
    onClose();
  };

  if (!isOpen) return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/50 p-3 sm:p-6 backdrop-blur-sm animate-fade-in select-none"
    >
      <div
        ref={dialogRef}
        className="relative flex h-[92vh] max-h-[880px] w-full max-w-[1140px] flex-col overflow-hidden rounded-3xl border border-black/[0.08] dark:border-white/10 bg-white dark:bg-[#18181B] shadow-2xl animate-in zoom-in-95 duration-200"
      >
        <header className="flex h-12 shrink-0 items-center justify-between border-b border-black/[0.06] dark:border-white/[0.08] px-6">
          <h2 className="text-sm font-bold text-slate-900 dark:text-white">{heading}</h2>
          <button
            type="button"
            onClick={requestClose}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-white/10 dark:hover:text-white transition-colors cursor-pointer"
            aria-label="关闭"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="flex flex-1 overflow-hidden">
          <section className="flex flex-1 flex-col border-r border-black/[0.06] dark:border-white/[0.08] p-5">
            <div className="mb-2 flex items-center gap-1">
              <span className="text-xs font-semibold text-slate-900 dark:text-slate-100">技能内容</span>
              <span className="text-red-500">*</span>
            </div>

            <div className="flex flex-1 overflow-hidden rounded-2xl border border-black/[0.08] dark:border-white/10 bg-[#FAFAFA] dark:bg-[#141416]">
              <SkillFileTreeExplorer
                nodes={fileNodes}
                activeFileId={activeFileId}
                onSelectFile={setActiveFileId}
                onAddNode={handleAddNode}
                onRenameNode={handleRenameNode}
                onDeleteNode={handleDeleteNode}
                onToggleFolder={handleToggleFolder}
                dirtyIds={dirtyIds}
                onNotify={showToast}
              />

              <div className="flex flex-1 flex-col overflow-hidden bg-white dark:bg-[#18181B]">
                <div className="flex h-8 shrink-0 items-center justify-between border-b border-black/[0.04] dark:border-white/[0.06] px-4 text-[11px] text-slate-400 dark:text-slate-500">
                  <span className="font-mono">{activeNode?.name || '无选中文件'}</span>
                  <span>Markdown 语法</span>
                </div>
                <textarea
                  value={currentContent}
                  onChange={(e) => handleContentChange(e.target.value)}
                  placeholder={isProtectedSkillFile(fileNodes, activeFileId) ? SKILL_EDITOR_PLACEHOLDER : '在此输入文件内容'}
                  className="w-full flex-1 resize-none bg-transparent p-4 font-mono text-xs leading-relaxed text-slate-800 dark:text-slate-200 outline-none placeholder:text-slate-400 dark:placeholder:text-slate-600"
                />
              </div>
            </div>
          </section>

          <SkillMetadataForm
            draft={draft}
            onChange={setDraft}
            onSaveAndUse={handleSaveAndUse}
            showToast={showToast}
          />
        </div>
      </div>
    </div>,
    document.body
  );
}
