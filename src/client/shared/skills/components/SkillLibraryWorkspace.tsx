import { useMemo, useRef, useState } from 'react';
import { useAppStore } from '@client/store';
import { useToast } from '@client/shared/hooks/useToast';
import { apiFetch } from '@client/shared/api/apiClient';
import { announceSkillLibraryChange, setLibrarySkillFavorite } from '@client/shared/api/skillLibrary';
import { confirmAction } from '@client/shared/utils/confirmAction';
import StyleExtractModal from '@client/shared/modals/StyleExtractModal';
import type { BaseStyleSkill } from '@client/shared/modals/style-extract/types';
import { BUILTIN_ASSISTANT_SKILLS, mergeAssistantSkills, type AssistantSkill } from '@shared/domain/assistant/skills';
import { skillEntryKey, type SkillLibraryEntry, type SkillRuntime, type WorkshopSkill } from '@shared/domain/skills/library';
import { filterSkills } from '../model/filterSkills';
import { librarySkillItem } from '../model/libraryView';
import { loadSkillFavorites, saveSkillFavorites, type SkillItem, type SkillMainTab } from '../model/skillTypes';
import { AgentCreateSkillBar } from './AgentCreateSkillBar';
import { CodexAgentSkillSection } from './CodexAgentSkillSection';
import { CodexSkillDetailModal, assistantSkillTitle } from './CodexSkillDetailModal';
import { ManualSkillStudioModal } from './ManualSkillStudioModal';
import { SkillsTopNav } from './SkillsTopNav';
import { SkillsCategoryFilter } from './SkillsCategoryFilter';
import { SkillsCardGrid } from './SkillsCardGrid';
import { CreationSkillDetailModal } from './CreationSkillDetailModal';
import { SkillLibraryDetail } from './SkillLibraryDetail';
import { WorkshopSkillEditor } from './WorkshopSkillEditor';
import { SkillFilesLocationDialog } from './SkillFilesLocationDialog';
import { useSkillLibraryData } from './useSkillLibraryData';
import { useLibrarySkillStudio } from './useLibrarySkillStudio';

interface Props { initialRuntime?: SkillRuntime | 'all'; onEnterWorkshop?: () => void }

/** Both global navigation and the workshop open this same library. */
export function SkillLibraryWorkspace({ initialRuntime = 'all', onEnterWorkshop }: Props) {
  const { library, loading, error, reload } = useSkillLibraryData();
  const activeAssistantSkillId = useAppStore((s) => s.activeAssistantSkillId);
  const { message, show: showToast } = useToast(3500);
  const studio = useLibrarySkillStudio(showToast);
  const [runtime, setRuntime] = useState<SkillRuntime | 'all'>(initialRuntime);
  const [presentation, setPresentation] = useState<'creation' | 'agent'>(initialRuntime === 'assistant' ? 'agent' : 'creation');
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
    () => presentation === 'agent'
      ? ['全部', ...new Set(scopedItems.map((item) => item.category))]
      : ['全部'],
    [presentation, scopedItems],
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
  const resetFilters = () => { setTab('all'); setQuery(''); setCategory('全部'); setRuntime('all'); };
  const createSkill = () => studio.create(presentation);
  const myLibraryEmpty = tab === 'my' && !query.trim() && category === '全部' && runtime === 'all';
  const duplicateSkill = (skill: AssistantSkill) => { studio.duplicate(skill); setDetail(null); };
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
    try { await action(); } catch (err) { showToast(err instanceof Error ? err.message : '技能操作失败'); }
    finally { pending.current.delete(key); }
  };

  const requestStyle = async (method: string, body?: object, search = '') => {
    const response = await apiFetch(`/api/catalog/styles${search}`, {
      method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined,
    });
    const result = await response.json();
    if (!response.ok || !result.success) throw new Error(result.error || '电商图文技能操作失败');
    announceSkillLibraryChange();
  };

  const tryAgentSkill = (skill: AssistantSkill, initialPromptOverride?: string) => {
    const store = useAppStore.getState();
    const title = assistantSkillTitle(skill);
    store.setActiveAssistantSkillId(skill.id);
    store.setQuickGenMode('agent');
    if (initialPromptOverride !== undefined) {
      store.setQuickPrompt(initialPromptOverride);
    } else {
      const current = store.quickPrompt || '';
      const token = `#[skill:${title}]`;
      if (!current.includes(token)) {
        const stripped = current.replace(/#\[skill:[^\]]+\]\s*/gi, '').trim();
        store.setQuickPrompt(stripped ? `${token} ${stripped}` : `${token} `);
      }
    }
    if (store.currentView === 'canvas') {
      store.setIsAssistantOpen(true);
    } else {
      const activeSession = store.sessions.find((s) => s.id === store.currentSessionId);
      store.setCurrentView(activeSession?.tasks?.length ? 'generate' : 'home');
    }
    setAgentDetail(null);
    showToast(`已选用「${title}」，可在创作栏修改参数或上传垫图`);
  };

  const toggleAgentSkill = (skill: AssistantSkill) => {
    const store = useAppStore.getState();
    const nextId = store.activeAssistantSkillId === skill.id ? null : skill.id;
    store.setActiveAssistantSkillId(nextId);
    const title = assistantSkillTitle(skill);
    showToast(nextId ? `本次指定「${title}」` : `已取消本次指定「${title}」，仍可由 Agent 按需调用`);
  };

  const askAgentToCreate = (idea: string) => {
    const creator = BUILTIN_ASSISTANT_SKILLS.find(skill => skill.id === 'skill-creator');
    if (!creator) { showToast('技能创建器暂不可用，请使用手动创建'); return; }
    tryAgentSkill(creator, `请为我创建一个${presentation === 'agent' ? 'Agent 运行技能' : '创作模板技能'}。\n需求：${idea}\n先根据需求补齐任务边界、输入、执行步骤与验收规则，再交付可保存的 SKILL.md 和必要资源。只使用当前真实可用的工具，不要套用无关的通用模板。`);
    showToast('已准备好技能创建需求，请在对话栏确认并发送');
  };

  const toggleFavoriteByKey = (key: string) => {
    const entry = entries.get(key);
    if (!entry) return;
    const nextFav = !favorites.has(key);
    if (entry.kind === 'assistant' && entry.content.isBuiltin) {
      const next = new Set(localFavorites);
      if (nextFav) next.add(key);
      else { next.delete(key); next.delete(entry.content.id); }
      setLocalFavorites(next);
      saveSkillFavorites(next);
      return;
    }
    void run(key, () => setLibrarySkillFavorite(entry, nextFav));
  };

  const applySkill = (item: SkillItem, initialPromptOverride?: string) => {
    const entry = entries.get(item.id);
    if (!entry) return;
    if (entry.kind === 'assistant') {
      tryAgentSkill(entry.content, initialPromptOverride);
      return;
    }
    const store = useAppStore.getState();
    store.setSelectedArchId(entry.content.id);
    store.setPendingBatchStage(2);
    window.dispatchEvent(new Event('workshop-skill-applied'));
    if (onEnterWorkshop) onEnterWorkshop();
    else { store.setCurrentView('workshop'); store.setActiveWorkshopTab('studio'); }
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
    setFeedSkill(entry.content); setExtractOpen(true);
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
    <div className={`flex h-full min-h-0 flex-1 flex-col overflow-hidden text-slate-900 dark:text-slate-100 ${presentation === 'agent' ? 'bg-white dark:bg-[#141517]' : 'bg-[#F5F6F8] dark:bg-[#111215]'}`}>
      <input ref={fileInput} type="file" multiple accept=".md,.zip,.txt,text/markdown,application/zip" className="hidden" onChange={(event) => {
        if (event.target.files?.length) void studio.upload(event.target.files, presentation);
        event.target.value = '';
      }} />
      <SkillsTopNav
        onFilesLocation={() => setFilesLocationOpen(true)}
        purpose={presentation}
        onPurposeChange={(next) => { setPresentation(next); resetFilters(); }}
        typeCounts={typeCounts}
        searchQuery={query}
        onSearchChange={setQuery}
        loading={loading}
        onRefresh={() => { void reload(); }}
        onSelectAgentCreate={() => setAgentOpen(true)}
        onSelectLocalUpload={() => fileInput.current?.click()}
        onSelectManualCreate={createSkill}
        onSelectReference={presentation === 'creation' ? () => { setFeedSkill(undefined); setExtractOpen(true); } : undefined}
        onSelectWorkshop={presentation === 'creation' ? () => setWorkshopEditor('new') : undefined}
      />

      <div className="shrink-0 px-5 pb-3 sm:px-8 lg:px-10">
        <div className="w-full space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200/80 pb-2 dark:border-white/[0.08]">
            <div aria-label="技能归属" className="flex items-center gap-6">
              {([['all', '全部'], ['my', '我的'], ['favorite', '收藏']] as const).map(([value, label]) => (
                <button key={value} type="button" aria-pressed={tab === value} onClick={() => { setTab(value); setCategory('全部'); }}
                  className={`relative cursor-pointer pb-2 text-sm transition-colors ${tab === value ? 'font-bold text-slate-950 after:absolute after:inset-x-0 after:bottom-0 after:h-[2.5px] after:rounded-full after:bg-slate-950 dark:text-white dark:after:bg-white' : 'font-medium text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'}`}>
                  {label}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              {presentation === 'creation' && (allItems.some((item) => item.runtime === 'workshop') || runtime === 'workshop') && (
                <select aria-label="筛选适用场景" value={runtime} onChange={(event) => { setRuntime(event.target.value as SkillRuntime | 'all'); setCategory('全部'); }}
                  className="h-8 rounded-full border border-slate-200 bg-white px-3 text-xs text-slate-600 dark:border-white/10 dark:bg-[#202226] dark:text-slate-300">
                  <option value="all">全部场景</option><option value="assistant">助手创作</option><option value="workshop">电商图文换品</option>
                </select>
              )}
              {filteredByUser && <button type="button" onClick={resetFilters} className="cursor-pointer rounded-full px-2.5 py-1 text-xs text-slate-500 hover:bg-slate-200/60 dark:text-slate-400 dark:hover:bg-white/5">重置筛选</button>}
            </div>
          </div>

          <SkillsCategoryFilter selectedCategory={category} onSelectCategory={setCategory} categories={categories} />
        </div>
      </div>

      <AgentCreateSkillBar isOpen={agentOpen} onClose={() => setAgentOpen(false)} onAskAgent={askAgentToCreate} onGenerated={(result) => { studio.generated({ ...result, draft: { ...result.draft, kind: presentation } }); setAgentOpen(false); }} showToast={showToast} />

      <main id="skill-library-panel" role="tabpanel" aria-labelledby={`skill-tab-${presentation}`} className="min-h-0 flex-1 overflow-y-auto px-5 pb-10 pt-3 sm:px-8 lg:px-10" aria-busy={loading}>
        <div className="w-full space-y-6">
          {error && <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-300"><p>{error}，可刷新重试。</p><button type="button" onClick={() => { void reload(); }} className="font-semibold underline underline-offset-4">重新加载</button></div>}
          {presentation === 'agent' && (
            <div className="flex flex-wrap items-center justify-between gap-2 px-3 text-xs text-slate-400 dark:text-slate-500">
              <p><span className="mr-2 inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" />Agent 自动匹配技能，也可为本次对话指定一项</p>
              <span>{filteredAgentSkills.length} 项技能 · 点击查看完整指令与文件</span>
            </div>
          )}
          {loading && library.skills.length === 0 ? (
            <div role="status" className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"><span className="sr-only">正在加载技能库</span>{[1, 2, 3, 4].map((i) => <div key={i} className="aspect-[16/11] animate-pulse rounded-2xl bg-slate-200/60 dark:bg-white/[0.04]" />)}</div>
          ) : presentation === 'agent' ? (
            <div className="pb-5">
              <CodexAgentSkillSection skills={filteredAgentSkills} activeSkillId={activeAssistantSkillId} favorites={favorites} grouped={category === '全部'}
                onSelectSkill={setAgentDetail} onQuickToggleSkill={toggleAgentSkill} onToggleFavorite={(skill) => toggleFavoriteByKey(`assistant:${skill.id}`)} />
              {filteredAgentSkills.length === 0 && <div className="flex justify-center gap-3 pb-8"><button type="button" onClick={filteredByUser ? resetFilters : createSkill} className="rounded-lg bg-slate-900 px-4 py-2 text-xs text-white dark:bg-white dark:text-slate-900">{filteredByUser ? '清除筛选' : '创建运行技能'}</button><button type="button" onClick={() => fileInput.current?.click()} className="px-4 py-2 text-xs text-slate-500">导入技能包</button></div>}
            </div>
          ) : (
            <SkillsCardGrid skills={filteredCreationItems} favorites={favorites} onUseSkill={(item) => applySkill(item)} onEdit={edit} onFeed={feed} onDelete={remove}
              onDetail={(item) => setDetail(entries.get(item.id) || null)} onToggleFavorite={toggleFavoriteByKey}
              onDuplicate={(item) => { const entry = entries.get(item.id); if (entry?.kind === 'assistant') duplicateSkill(entry.content); }}
              emptyMessage={error ? '技能库暂时无法读取' : myLibraryEmpty ? '还没有自己的创作技能' : tab === 'favorite' && !query.trim() ? '还没有收藏创作技能' : filteredByUser ? '该分类下暂无匹配的创作技能' : '还没有创作技能'}
              onEmptyAction={myLibraryEmpty || !filteredByUser ? createSkill : resetFilters}
              emptyActionLabel={myLibraryEmpty ? '创建我的技能' : tab === 'favorite' ? '浏览全部技能' : filteredByUser ? '查看全部技能' : '创建创作技能'} />
          )}
          {library.hiddenOfficialRecipes.length > 0 && presentation === 'creation' && (
            <details className="rounded-xl border border-slate-200 p-4 text-xs text-slate-500 dark:border-white/10 dark:text-slate-400">
              <summary className="cursor-pointer">已隐藏的电商图文技能 · {library.hiddenOfficialRecipes.length}</summary>
              <div className="mt-4 flex flex-wrap gap-3">{library.hiddenOfficialRecipes.map((skill) => <button type="button" key={skill.id} className="rounded-lg border border-slate-200 px-3 py-2 dark:border-white/10" onClick={() => { void run(`restore:${skill.id}`, () => requestStyle('POST', { id: skill.id }, '?action=restore')); }}>{skill.name} · 恢复</button>)}</div>
            </details>
          )}
        </div>
      </main>

      <input ref={element => { folderInput.current = element; element?.setAttribute('webkitdirectory', ''); }} type="file" multiple className="hidden" onChange={event => { if (event.target.files?.length) void studio.upload(event.target.files, presentation); event.target.value = ''; }} />
      {filesLocationOpen && <SkillFilesLocationDialog onClose={() => setFilesLocationOpen(false)} onImportFolder={() => folderInput.current?.click()} />}
      <ManualSkillStudioModal isOpen={studio.open} onClose={studio.close} showToast={showToast} initialFiles={studio.files} initialDraft={studio.draft} heading={studio.editing ? '编辑技能' : '创建技能'} mode={studio.editing ? 'edit' : 'create'} onSave={studio.save} />
      {workshopEditor && <WorkshopSkillEditor key={workshopEditor === 'new' ? 'new' : workshopEditor.id} skill={workshopEditor === 'new' ? null : workshopEditor} onClose={() => setWorkshopEditor(null)} onSaved={() => showToast('技能已保存，可选择应用到电商图文')} />}
      <StyleExtractModal key={feedSkill?.id || 'new'} baseSkill={feedSkill} initialImages={[]} isOpen={extractOpen} onClose={() => setExtractOpen(false)} onRecipeCreated={() => { announceSkillLibraryChange(); showToast('新技能已保存，可选择应用到电商图文'); }} />
      {detail && (librarySkillItem(detail).presentation === 'creation'
        ? <CreationSkillDetailModal key={skillEntryKey(detail)} item={librarySkillItem(detail)} isFavorite={favorites.has(skillEntryKey(detail))} onDuplicate={detail.kind === 'assistant' ? () => duplicateSkill(detail.content) : undefined} onClose={() => setDetail(null)} onToggleFavorite={() => toggleFavoriteByKey(skillEntryKey(detail))} onUse={(initialPromptOverride) => { applySkill(librarySkillItem(detail), initialPromptOverride); setDetail(null); }} showToast={showToast} />
        : <SkillLibraryDetail entry={detail} onClose={() => setDetail(null)} />)}
      <CodexSkillDetailModal skill={agentDetail} isActive={Boolean(agentDetail && activeAssistantSkillId === agentDetail.id)} onClose={() => setAgentDetail(null)} onToggleActive={toggleAgentSkill} onTryNow={tryAgentSkill} onEdit={(skill) => { setAgentDetail(null); studio.edit(skill); }} onDelete={removeAssistant} showToast={showToast} />
      {message && <div role="status" className="fixed bottom-10 left-1/2 z-[150] max-w-[90vw] -translate-x-1/2 rounded-full bg-slate-900 px-5 py-2.5 text-xs text-white dark:bg-white dark:text-slate-900">{message}</div>}
    </div>
  );
}
