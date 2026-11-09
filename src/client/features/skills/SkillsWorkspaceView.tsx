import { useCallback, useEffect, useMemo, useRef, useState, type ComponentProps, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Download, FolderOpen, SearchX, Upload, X } from 'lucide-react';
import { useAppStore } from '@client/store';
import { useToast } from '@client/shared/hooks/useToast';
import { useModalDialog } from '@client/shared/hooks/useModalDialog';
import { apiFetch } from '@client/shared/api/apiClient';
import { announceSkillLibraryChange, setLibrarySkillFavorite } from '@client/shared/api/skillLibrary';
import { confirmAction } from '@client/shared/utils/confirmAction';
import StyleExtractModal from '@client/shared/modals/StyleExtractModal';
import type { BaseStyleSkill } from '@client/shared/modals/style-extract/RecipeEditorPanel';
import { BUILTIN_ASSISTANT_SKILLS, mergeAssistantSkills, type AssistantSkill } from '@shared/domain/assistant/skills';
import { skillEntryKey, type SkillLibrary, type SkillLibraryEntry, type SkillRuntime, type WorkshopSkill } from '@shared/domain/skills/library';
import { buildSkillFromStudio, studioStateFromSkill, type SkillStudioPayload } from '@client/shared/skills/model/buildSkillFromStudio';
import { parseLocalSkillFiles } from '@client/shared/skills/model/skillPackageParser';
import type { GeneratedSkillResult } from '@client/shared/skills/model/agentSkillGenerator';
import type { SkillFileNode } from '@client/shared/skills/model/skillFileTree';
import { skillActivationPrompt } from '@client/shared/skills/model/creationSkillFlows';
import { filterSkills, librarySkillItem, skillCategories } from '@client/shared/skills/model/libraryView';
import { loadSkillFavorites, saveSkillFavorites, type SkillDraftData, type SkillItem, type SkillMainTab, type SkillPresentation } from '@client/shared/skills/model/skillTypes';
import { AgentCreateSkillBar } from '@client/shared/skills/components/AgentCreateSkillBar';
import { CodexAgentSkillSection } from '@client/shared/skills/components/CodexAgentSkillSection';
import { CodexSkillDetailModal, assistantSkillTitle } from '@client/shared/skills/components/CodexSkillDetailModal';
import { ManualSkillStudioModal } from '@client/shared/skills/components/ManualSkillStudioModal';
import { SkillCard } from '@client/shared/skills/components/SkillCard';
import { CreationSkillDetailModal } from '@client/shared/skills/components/CreationSkillDetailModal';
import { SkillsTopNav } from './components/SkillsTopNav';
import { WorkshopSkillEditor } from './components/WorkshopSkillEditor';

interface Props {
  initialRuntime?: SkillRuntime | 'all';
  onEnterWorkshop?: () => void;
}

/** Both global navigation and the workshop open this same library. */
export function SkillsWorkspaceView({ initialRuntime = 'all', onEnterWorkshop }: Props) {
  const { library, loading, error, reload } = useSkillLibraryData();
  const activeAssistantSkillId = useAppStore((s) => s.activeAssistantSkillId);
  const { message, show: showToast } = useToast(3500);
  const studio = useLibrarySkillStudio(showToast);
  const [runtime, setRuntime] = useState<SkillRuntime | 'all'>(initialRuntime);
  const [presentation, setPresentation] = useState<'creation' | 'agent'>('creation');
  const [tab, setTab] = useState<SkillMainTab>('all');
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('全部');
  const [agentOpen, setAgentOpen] = useState(false);
  const [filesLocationOpen, setFilesLocationOpen] = useState(false);
  const [extractOpen, setExtractOpen] = useState(false);
  const [feedSkill, setFeedSkill] = useState<BaseStyleSkill | undefined>();
  const [workshopEditor, setWorkshopEditor] = useState<WorkshopSkill | 'new' | null>(null);
  const [detail, setDetail] = useState<SkillLibraryEntry | null>(null);
  const [agentDetail, setAgentDetail] = useState<AssistantSkill | null>(null);
  const [localFavorites, setLocalFavorites] = useState<Set<string>>(() => loadSkillFavorites());
  const fileInput = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);
  const pending = useRef(new Set<string>());

  const mergedEntries = useMemo<SkillLibraryEntry[]>(() => {
    const customAssistants = library.skills.flatMap((entry) => entry.kind === 'assistant' ? [entry.content] : []);
    const allAssistants = mergeAssistantSkills(customAssistants, BUILTIN_ASSISTANT_SKILLS);
    const workshops = library.skills.filter((entry): entry is Extract<SkillLibraryEntry, { kind: 'workshop' }> => entry.kind === 'workshop');
    return [...allAssistants.map((content): SkillLibraryEntry => ({ kind: 'assistant', content })), ...workshops];
  }, [library.skills]);

  const entries = useMemo(() => new Map(mergedEntries.map((entry) => [skillEntryKey(entry), entry])), [mergedEntries]);
  const allItems = useMemo(() => mergedEntries.map(librarySkillItem), [mergedEntries]);
  const scopedItems = allItems.filter((item) => item.presentation === presentation && (runtime === 'all' || item.runtime === runtime));
  const categories = useMemo(
    () => skillCategories(scopedItems),
    [scopedItems],
  );
  const favorites = useMemo(() => {
    const set = new Set<string>(localFavorites);
    for (const item of allItems) {
      if (item.isFavorite || (item.runtime === 'assistant' && localFavorites.has(item.id.slice('assistant:'.length)))) set.add(item.id);
    }
    return set;
  }, [allItems, localFavorites]);

  const filtered = filterSkills(allItems, { presentation, runtime, scope: tab, category, query }, favorites);
  const filteredByUser = tab !== 'all' || query.trim().length > 0 || category !== '全部' || runtime !== 'all';
  const resetFilters = () => {
    setTab('all');
    setQuery('');
    setCategory('全部');
    setRuntime('all');
  };
  const createSkill = () => studio.create(presentation);
  const myLibraryEmpty = tab === 'my' && !query.trim() && category === '全部' && runtime === 'all';
  const duplicateSkill = (skill: AssistantSkill) => {
    studio.duplicate(skill);
    setDetail(null);
  };
  const typeCounts = {
    creation: allItems.filter((item) => item.presentation === 'creation').length,
    agent: allItems.filter((item) => item.presentation === 'agent').length,
  };

  const filteredAgentSkills = useMemo(() => {
    const allowedIds = new Set(filtered.filter((item) => item.presentation === 'agent').map((item) => item.id));
    return mergedEntries.flatMap((entry) => entry.kind === 'assistant' && allowedIds.has(skillEntryKey(entry)) ? [entry.content] : []);
  }, [filtered, mergedEntries]);

  const filteredCreationItems = useMemo(() => filtered.filter((item) => item.presentation === 'creation'), [filtered]);

  const run = async (key: string, action: () => Promise<void>) => {
    if (pending.current.has(key)) return;
    pending.current.add(key);
    try {
      await action();
    } catch (err) {
      showToast(err instanceof Error ? err.message : '技能操作失败');
    } finally {
      pending.current.delete(key);
    }
  };

  const requestStyle = async (method: string, body?: object, search = '') => {
    const response = await apiFetch(`/api/catalog/styles${search}`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    const result = await response.json();
    if (!response.ok || !result.success) throw new Error(result.error || '电商图文技能操作失败');
    announceSkillLibraryChange();
  };

  const tryAgentSkill = (skill: AssistantSkill, initialPromptOverride?: string, referenceImages?: string[]) => {
    const store = useAppStore.getState();
    const title = assistantSkillTitle(skill);
    if (referenceImages !== undefined) store.setQuickRefImages([...referenceImages]);
    store.setActiveAssistantSkillId(skill.id);
    store.setQuickGenMode('agent');
    store.setQuickPrompt(skillActivationPrompt(skill.id, title, store.quickPrompt || '', initialPromptOverride));
    if (store.currentView === 'canvas') {
      store.setIsAssistantOpen(true);
    } else {
      const activeSession = store.sessions.find((s) => s.id === store.currentSessionId);
      store.setCurrentView(activeSession?.tasks?.length ? 'generate' : 'home');
    }
    setAgentDetail(null);
    showToast(referenceImages !== undefined ? `已带入「${title}」示例的提示词与参考素材，可修改后发送` : `已选用「${title}」，填写需求或添加参考素材后发送`);
  };

  const toggleAgentSkill = (skill: AssistantSkill) => {
    const store = useAppStore.getState();
    const nextId = store.activeAssistantSkillId === skill.id ? null : skill.id;
    store.setActiveAssistantSkillId(nextId);
    const title = assistantSkillTitle(skill);
    showToast(nextId ? `本次指定「${title}」` : `已取消本次指定「${title}」，仍可由 Agent 按需调用`);
  };

  const askAgentToCreate = (idea: string) => {
    const store = useAppStore.getState();
    store.setActiveAssistantSkillId(null);
    store.setQuickGenMode('agent');
    store.setQuickPrompt(
      `请为我创建一个${presentation === 'agent' ? 'Agent 运行技能' : '创作模板技能'}。\n需求：${idea}\n交付标准 SKILL.md 和必要资源，注明作者、真实来源和许可证；没有核验的来源不得标成官方技能。只使用当前真实可用的工具。`,
    );
    if (store.currentView === 'canvas') {
      store.setIsAssistantOpen(true);
    } else {
      store.setCurrentView('home');
    }
    showToast('已准备好技能创建需求，请在对话栏确认并发送');
  };

  const toggleFavoriteByKey = (key: string) => {
    const entry = entries.get(key);
    if (!entry) return;
    const nextFav = !favorites.has(key);
    if (entry.kind === 'assistant' && entry.content.isBuiltin) {
      const next = new Set(localFavorites);
      if (nextFav) {
        next.add(key);
      } else {
        next.delete(key);
        next.delete(entry.content.id);
      }
      setLocalFavorites(next);
      saveSkillFavorites(next);
      return;
    }
    void run(key, () => setLibrarySkillFavorite(entry, nextFav));
  };

  const applySkill = (item: SkillItem, initialPromptOverride?: string, referenceImages?: string[]) => {
    const entry = entries.get(item.id);
    if (!entry) return;
    if (entry.kind === 'assistant') {
      tryAgentSkill(entry.content, initialPromptOverride, referenceImages);
      return;
    }
    const store = useAppStore.getState();
    store.setSelectedArchId(entry.content.id);
    if (onEnterWorkshop) onEnterWorkshop();
    else store.setCurrentView('workshop');
    showToast(`已将「${item.title}」应用到电商图文`);
  };

  const edit = (item: SkillItem) => {
    const entry = entries.get(item.id);
    if (entry?.kind === 'assistant') studio.edit(entry.content);
    else if (entry?.kind === 'workshop') setWorkshopEditor(entry.content);
  };

  const feed = (item: SkillItem) => {
    const entry = entries.get(item.id);
    if (entry?.kind !== 'workshop') return;
    setFeedSkill(entry.content);
    setExtractOpen(true);
  };

  const removeAssistant = async (skill: AssistantSkill) => {
    if (skill.isBuiltin) return;
    if (!await confirmAction({ title: '卸载技能', description: `确定卸载「${assistantSkillTitle(skill)}」吗？`, confirmText: '卸载', danger: true })) return;
    await useAppStore.getState().deleteAssistantSkill(skill.id);
    showToast('技能已卸载');
  };

  const remove = (item: SkillItem) => {
    void run(item.id, async () => {
      const entry = entries.get(item.id);
      if (!entry) return;
      const label = item.isOfficial ? '隐藏' : '删除';
      if (!await confirmAction({ title: `${label}技能`, description: `确定${label}「${item.title}」吗？`, confirmText: label, danger: true })) return;
      if (entry.kind === 'assistant') await useAppStore.getState().deleteAssistantSkill(entry.content.id);
      else {
        await requestStyle('DELETE', { id: entry.content.id });
        if (useAppStore.getState().selectedArchId === entry.content.id) useAppStore.getState().setSelectedArchId('');
      }
      showToast(item.isOfficial ? '官方技能已隐藏' : '技能已删除');
    });
  };

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-white text-slate-900 dark:bg-[#111111] dark:text-slate-100">
      <input ref={fileInput} type="file" multiple accept=".md,.zip,.txt,text/markdown,application/zip" className="hidden" onChange={(event) => {
        if (event.target.files?.length) void studio.upload(event.target.files, presentation);
        event.target.value = '';
      }} />
      <SkillsTopNav
        filters={
          <div className="min-w-0 lg:col-start-1 lg:row-start-1 lg:row-span-2">
            <div className="w-full space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200/70 pb-1 dark:border-white/[0.07]">
                <div aria-label="技能归属" className="flex items-center gap-6">
                  {([['all', '全部'], ['my', '我的'], ['favorite', '收藏']] as const).map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      aria-pressed={tab === value}
                      onClick={() => {
                        setTab(value);
                        setCategory('全部');
                      }}
                      className={`relative cursor-pointer pb-2 text-sm transition-colors ${tab === value ? 'font-medium text-slate-950 after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:rounded-full after:bg-slate-950 dark:text-white dark:after:bg-white' : 'font-medium text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'}`}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                <div className="flex flex-wrap items-center gap-2.5">
                  {presentation === 'creation' && (allItems.some((item) => item.runtime === 'workshop') || runtime === 'workshop') && (
                    <select
                      aria-label="筛选适用场景"
                      value={runtime}
                      onChange={(event) => {
                        setRuntime(event.target.value as SkillRuntime | 'all');
                        setCategory('全部');
                      }}
                      className="h-8 rounded-full border border-slate-200 bg-white px-3 text-xs text-slate-600 dark:border-white/10 dark:bg-[#202226] dark:text-slate-300"
                    >
                      <option value="all">全部场景</option>
                      <option value="assistant">助手创作</option>
                      <option value="workshop">电商图文换品</option>
                    </select>
                  )}
                  {filteredByUser && (
                    <button
                      type="button"
                      onClick={resetFilters}
                      className="cursor-pointer rounded-full px-2.5 py-1 text-xs text-slate-500 hover:bg-slate-200/60 dark:text-slate-400 dark:hover:bg-white/5"
                    >
                      重置筛选
                    </button>
                  )}
                </div>
              </div>

              <SkillsCategoryFilter selectedCategory={category} onSelectCategory={setCategory} categories={categories} />
            </div>
          </div>
        }
        onFilesLocation={() => setFilesLocationOpen(true)}
        purpose={presentation}
        onPurposeChange={(next) => {
          setPresentation(next);
          resetFilters();
        }}
        typeCounts={typeCounts}
        searchQuery={query}
        onSearchChange={setQuery}
        loading={loading}
        onRefresh={() => {
          void reload();
        }}
        onSelectAgentCreate={() => setAgentOpen(true)}
        onSelectLocalUpload={() => fileInput.current?.click()}
        onSelectManualCreate={createSkill}
        onSelectReference={
          presentation === 'creation'
            ? () => {
                setFeedSkill(undefined);
                setExtractOpen(true);
              }
            : undefined
        }
        onSelectWorkshop={presentation === 'creation' ? () => setWorkshopEditor('new') : undefined}
      />

      <AgentCreateSkillBar
        isOpen={agentOpen}
        onClose={() => setAgentOpen(false)}
        onAskAgent={askAgentToCreate}
        onGenerated={(result) => {
          studio.generated({ ...result, draft: { ...result.draft, kind: presentation } });
          setAgentOpen(false);
        }}
        showToast={showToast}
      />

      <main id="skill-library-panel" role="tabpanel" aria-labelledby={`skill-tab-${presentation}`} className="min-h-0 flex-1 overflow-y-auto px-5 pb-10 pt-4 sm:px-8" aria-busy={loading}>
        <div className="w-full space-y-6">
          {error && (
            <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-300">
              <p>{error}，可刷新重试。</p>
              <button
                type="button"
                onClick={() => {
                  void reload();
                }}
                className="font-semibold underline underline-offset-4"
              >
                重新加载
              </button>
            </div>
          )}
          {presentation === 'agent' && (
            <div className="flex flex-wrap items-center justify-between gap-2 px-3 text-xs text-slate-400 dark:text-slate-500">
              <p>
                <span className="mr-2 inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" />
                Agent 自动匹配技能，也可为本次对话指定一项
              </p>
              <span>{filteredAgentSkills.length} 项技能 · 点击查看完整指令与文件</span>
            </div>
          )}
          {loading && library.skills.length === 0 ? (
            <div role="status" className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              <span className="sr-only">正在加载技能库</span>
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="aspect-[16/11] animate-pulse rounded-2xl bg-slate-200/60 dark:bg-white/[0.04]" />
              ))}
            </div>
          ) : presentation === 'agent' ? (
            <div className="pb-5">
              <CodexAgentSkillSection
                skills={filteredAgentSkills}
                activeSkillId={activeAssistantSkillId}
                favorites={favorites}
                grouped={category === '全部'}
                onSelectSkill={setAgentDetail}
                onQuickToggleSkill={toggleAgentSkill}
                onToggleFavorite={(skill) => toggleFavoriteByKey(`assistant:${skill.id}`)}
              />
              {filteredAgentSkills.length === 0 && (
                <div className="flex justify-center gap-3 pb-8">
                  <button
                    type="button"
                    onClick={filteredByUser ? resetFilters : createSkill}
                    className="rounded-lg bg-slate-900 px-4 py-2 text-xs text-white dark:bg-white dark:text-slate-900"
                  >
                    {filteredByUser ? '清除筛选' : '创建运行技能'}
                  </button>
                  <button type="button" onClick={() => fileInput.current?.click()} className="px-4 py-2 text-xs text-slate-500">
                    导入技能包
                  </button>
                </div>
              )}
            </div>
          ) : (
            <SkillsCardGrid
              skills={filteredCreationItems}
              favorites={favorites}
              onUseSkill={(item, example) =>
                applySkill(item, example ? item.example?.prompt : undefined, example ? item.example?.referenceImages : undefined)
              }
              onEdit={edit}
              onFeed={feed}
              onDelete={remove}
              onDetail={(item) => setDetail(entries.get(item.id) || null)}
              onToggleFavorite={toggleFavoriteByKey}
              onDuplicate={(item) => {
                const entry = entries.get(item.id);
                if (entry?.kind === 'assistant') duplicateSkill(entry.content);
              }}
              emptyMessage={error ? '技能库暂时无法读取' : myLibraryEmpty ? '还没有自己的创作技能' : tab === 'favorite' && !query.trim() ? '还没有收藏创作技能' : filteredByUser ? '该分类下暂无匹配的创作技能' : '还没有创作技能'}
              onEmptyAction={myLibraryEmpty || !filteredByUser ? createSkill : resetFilters}
              emptyActionLabel={myLibraryEmpty ? '创建我的技能' : tab === 'favorite' ? '浏览全部技能' : filteredByUser ? '查看全部技能' : '创建创作技能'}
            />
          )}
          {library.hiddenOfficialRecipes.length > 0 && presentation === 'creation' && (
            <details className="rounded-xl border border-slate-200 p-4 text-xs text-slate-500 dark:border-white/10 dark:text-slate-400">
              <summary className="cursor-pointer">已隐藏的电商图文技能 · {library.hiddenOfficialRecipes.length}</summary>
              <div className="mt-4 flex flex-wrap gap-3">
                {library.hiddenOfficialRecipes.map((skill) => (
                  <button
                    type="button"
                    key={skill.id}
                    className="rounded-lg border border-slate-200 px-3 py-2 dark:border-white/10"
                    onClick={() => {
                      void run(`restore:${skill.id}`, () => requestStyle('POST', { id: skill.id }, '?action=restore'));
                    }}
                  >
                    {skill.name} · 恢复
                  </button>
                ))}
              </div>
            </details>
          )}
        </div>
      </main>

      <input
        ref={(element) => {
          folderInput.current = element;
          element?.setAttribute('webkitdirectory', '');
        }}
        type="file"
        multiple
        className="hidden"
        onChange={(event) => {
          if (event.target.files?.length) void studio.upload(event.target.files, presentation);
          event.target.value = '';
        }}
      />
      {filesLocationOpen && (
        <SkillFilesLocationDialog onClose={() => setFilesLocationOpen(false)} onImportFolder={() => folderInput.current?.click()} />
      )}
      <ManualSkillStudioModal
        isOpen={studio.open}
        onClose={studio.close}
        showToast={showToast}
        initialFiles={studio.files}
        initialDraft={studio.draft}
        heading={studio.editing ? '编辑技能' : '创建技能'}
        mode={studio.editing ? 'edit' : 'create'}
        onSave={studio.save}
      />
      {workshopEditor && (
        <WorkshopSkillEditor
          key={workshopEditor === 'new' ? 'new' : workshopEditor.id}
          skill={workshopEditor === 'new' ? null : workshopEditor}
          onClose={() => setWorkshopEditor(null)}
          onSaved={() => showToast('技能已保存，可选择应用到电商图文')}
        />
      )}
      <StyleExtractModal
        key={feedSkill?.id || 'new'}
        baseSkill={feedSkill}
        initialImages={[]}
        isOpen={extractOpen}
        onClose={() => setExtractOpen(false)}
        onRecipeCreated={() => {
          announceSkillLibraryChange();
          showToast('新技能已保存，可选择应用到电商图文');
        }}
      />
      {detail && librarySkillItem(detail).presentation === 'creation' && (
        <CreationSkillDetailModal
          useOnly
          key={skillEntryKey(detail)}
          item={librarySkillItem(detail)}
          isFavorite={favorites.has(skillEntryKey(detail))}
          onClose={() => setDetail(null)}
          onToggleFavorite={() => toggleFavoriteByKey(skillEntryKey(detail))}
          onUse={(initialPromptOverride, referenceImages) => {
            applySkill(librarySkillItem(detail), initialPromptOverride, referenceImages);
            setDetail(null);
          }}
          showToast={showToast}
        />
      )}
      <CodexSkillDetailModal
        skill={agentDetail}
        isActive={Boolean(agentDetail && activeAssistantSkillId === agentDetail.id)}
        onClose={() => setAgentDetail(null)}
        onToggleActive={toggleAgentSkill}
        onTryNow={tryAgentSkill}
        onEdit={(skill) => {
          setAgentDetail(null);
          studio.edit(skill);
        }}
        onDelete={removeAssistant}
        showToast={showToast}
      />
      {message && (
        <div role="status" className="fixed bottom-10 left-1/2 z-[150] max-w-[90vw] -translate-x-1/2 rounded-full bg-slate-900 px-5 py-2.5 text-xs text-white dark:bg-white dark:text-slate-900">
          {message}
        </div>
      )}
    </div>
  );
}

export default SkillsWorkspaceView;

interface SkillsCategoryFilterProps {
  selectedCategory: string;
  onSelectCategory: (category: string) => void;
  categories: string[];
}

/** 仅在存在多个实际有效分类时渲染次级筛选，避免展示无内容的空分类胶囊。 */
function SkillsCategoryFilter({ selectedCategory, onSelectCategory, categories }: SkillsCategoryFilterProps) {
  if (categories.length <= 1) return null;
  return (
    <div
      role="tablist"
      aria-label="筛选技能分类"
      className="flex flex-wrap items-center gap-2 py-1"
    >
      {categories.map((category, index) => {
        const active = selectedCategory === category;
        return (
          <button
            key={category}
            type="button"
            role="tab"
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onSelectCategory(category)}
            onKeyDown={(event) => {
              if (event.nativeEvent.isComposing || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
              event.preventDefault();
              const next = event.key === 'Home' ? 0 : event.key === 'End' ? categories.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : categories.length - 1)) % categories.length;
              onSelectCategory(categories[next]);
              event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus();
            }}
            className={`shrink-0 cursor-pointer rounded-full border px-3.5 py-2 text-xs transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 ${
              active
                ? 'border-transparent bg-slate-200/90 font-semibold text-slate-900 dark:bg-[#2c2c2c] dark:text-white'
                : 'border-slate-200 bg-transparent font-medium text-slate-600 hover:bg-slate-100 dark:border-white/10 dark:text-neutral-400 dark:hover:bg-white/[0.06] dark:hover:text-white'
            }`}
          >
            {category}
          </button>
        );
      })}
    </div>
  );
}

function useSkillLibraryData() {
  const [library, setLibrary] = useState<SkillLibrary>({ skills: [], hiddenOfficialRecipes: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const epoch = useRef(0);
  const invalidate = useCallback(() => {
    ++epoch.current;
  }, []);
  const reload = useCallback(async () => {
    const request = ++epoch.current;
    setLoading(true);
    try {
      const data = await useAppStore.getState().refreshAssistantSkills();
      if (epoch.current === request) {
        setLibrary(data);
        setError('');
      }
    } catch (error) {
      if (epoch.current === request) setError(error instanceof Error ? error.message : '技能库加载失败');
    } finally {
      if (epoch.current === request) setLoading(false);
    }
  }, []);
  useEffect(() => {
    void reload();
    const changed = () => {
      void reload();
    };
    window.addEventListener('skill-library-changed', changed);
    return () => {
      invalidate();
      window.removeEventListener('skill-library-changed', changed);
    };
  }, [reload, invalidate]);
  return { library, loading, error, reload };
}

function useLibrarySkillStudio(showToast: (message: string) => void) {
  const [open, setOpen] = useState(false);
  const [files, setFiles] = useState<SkillFileNode[] | null>(null);
  const [draft, setDraft] = useState<Partial<SkillDraftData> | null>(null);
  const [editing, setEditing] = useState<AssistantSkill | null>(null);
  const start = (files: SkillFileNode[] | null, draft: Partial<SkillDraftData> | null, editing: AssistantSkill | null = null) => {
    setFiles(files);
    setDraft(draft);
    setEditing(editing);
    setOpen(true);
  };
  return {
    open,
    files,
    draft,
    editing,
    close: () => setOpen(false),
    create: (kind: SkillPresentation = 'creation') => start(null, { kind }),
    edit: (skill: AssistantSkill) => {
      const state = studioStateFromSkill(skill);
      start(state.files, state.draft, skill);
    },
    duplicate: (skill: AssistantSkill) => {
      const state = studioStateFromSkill(skill);
      start(state.files, { ...state.draft, title: `${state.draft.title.slice(0, 16)} 副本` });
    },
    generated: (result: GeneratedSkillResult) => start(result.files, result.draft),
    upload: async (selected: FileList, kind: SkillPresentation) => {
      try {
        const result = await parseLocalSkillFiles(selected);
        start(result.files, { ...result.draft, kind: result.draft.kind || kind });
        if (result.warnings[0]) showToast(result.warnings[0]);
      } catch (error) {
        showToast(error instanceof Error ? error.message : '技能文件解析失败');
      }
    },
    save: async (payload: SkillStudioPayload) => {
      const skill = buildSkillFromStudio(payload, editing ? { id: editing.id, createdAt: editing.createdAt } : undefined);
      if (editing) await useAppStore.getState().updateAssistantSkill(editing.id, { ...skill, libraryVersion: editing.libraryVersion });
      else await useAppStore.getState().addAssistantSkill(skill);
      showToast('技能已保存，可在需要时选择使用');
    },
  };
}

interface SkillsCardGridProps extends Omit<ComponentProps<typeof SkillCard>, 'skill' | 'isFavorite'> {
  skills: SkillItem[];
  favorites: Set<string>;
  emptyMessage?: string;
  onEmptyAction?: () => void;
  emptyActionLabel?: string;
  createTile?: ReactNode;
}

function SkillsCardGrid({
  skills,
  favorites,
  emptyMessage,
  onEmptyAction,
  emptyActionLabel,
  createTile,
  ...actions
}: SkillsCardGridProps) {
  if (skills.length === 0) {
    return <SkillsEmptyState message={emptyMessage} onAction={onEmptyAction} actionLabel={emptyActionLabel} />;
  }
  return (
    <div className="grid grid-cols-1 items-start gap-x-3 gap-y-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {skills.map((skill) => (
        <SkillCard key={skill.id} skill={skill} isFavorite={favorites.has(skill.id)} compact {...actions} />
      ))}
      {createTile}
    </div>
  );
}

interface SkillsEmptyStateProps {
  message?: string;
  onAction?: () => void;
  actionLabel?: string;
}

function SkillsEmptyState({ message = '暂无技能', onAction, actionLabel = '创建技能' }: SkillsEmptyStateProps) {
  return (
    <div role="status" className="flex min-h-72 flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white/30 px-5 py-12 text-center dark:border-white/10 dark:bg-white/[0.015]">
      <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-200/50 text-slate-400 dark:bg-white/5">
        <SearchX size={23} />
      </span>
      <h3 className="text-sm font-medium text-slate-700 dark:text-slate-200">{message}</h3>
      <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">可以调整筛选条件，也可以导入或创建自己的技能。</p>
      {onAction && (
        <button type="button" onClick={onAction} className="mt-5 rounded-lg bg-slate-900 px-4 py-2 text-xs font-medium text-white hover:bg-slate-700 dark:bg-white dark:text-slate-900">
          {actionLabel}
        </button>
      )}
    </div>
  );
}

function SkillFilesLocationDialog({ onClose, onImportFolder }: { onClose: () => void; onImportFolder: () => void }) {
  const dialogRef = useModalDialog(true, onClose);
  return createPortal(
    <div
      className="fixed inset-0 z-[130] flex items-center justify-center bg-slate-950/30 p-4 backdrop-blur-sm dark:bg-black/60"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="技能文件管理"
        tabIndex={-1}
        className="w-full max-w-xl rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-white/10 dark:bg-[#1b1d20]"
      >
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900 dark:text-white">
            <FolderOpen size={18} />
            技能文件
          </h2>
          <button type="button" onClick={onClose} aria-label="关闭文件管理" className="rounded-full p-2 text-slate-400 hover:bg-slate-100 dark:hover:bg-white/5">
            <X size={16} />
          </button>
        </div>
        <p className="mt-4 text-sm leading-6 text-slate-500 dark:text-slate-400">一个技能使用一个文件夹。主指令、参考规范和交付模板放在一起，可整体导入和导出。</p>
        <pre className="mt-4 rounded-xl bg-slate-50 p-4 font-mono text-xs leading-6 text-slate-500 dark:bg-black/20 dark:text-slate-400">
          {'my-skill/\n  SKILL.md          主指令\n  agents/           展示信息（可选）\n  references/       按需读取的规范\n  assets/           交付模板与素材\n  scripts/          辅助代码（如有）'}
        </pre>
        <p className="mt-4 text-xs leading-6 text-slate-500 dark:text-slate-400">
          自定义技能保存在当前工作区；可从详情页导出 ZIP 自行备份。当前导入文本文件，图片等二进制素材会提示跳过。脚本可随包保存与查看，不会自动运行。
        </p>
        <details className="mt-3 text-xs text-slate-400">
          <summary className="cursor-pointer">内置技能的源码位置</summary>
          <code className="mt-2 block break-all rounded-lg bg-slate-50 p-3 dark:bg-white/5">src/shared/domain/assistant/skills/packages/</code>
        </details>
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
          <span className="flex items-center gap-1.5 text-[11px] text-slate-400">
            <Download size={12} />
            打开技能详情可导出完整包
          </span>
          <button
            type="button"
            onClick={() => {
              onClose();
              onImportFolder();
            }}
            className="flex items-center gap-2 rounded-full bg-slate-900 px-4 py-2.5 text-xs font-medium text-white dark:bg-white dark:text-slate-900"
          >
            <Upload size={14} />
            导入技能文件夹
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
