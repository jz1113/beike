import { useMemo, useRef, useState } from 'react';
import { useAppStore } from '@client/store';
import { useToast } from '@client/shared/hooks/useToast';
import { apiFetch } from '@client/shared/api/apiClient';
import { announceSkillLibraryChange, setLibrarySkillFavorite } from '@client/shared/api/skillLibrary';
import { confirmAction } from '@client/shared/utils/confirmAction';
import StyleExtractModal from '@client/shared/modals/StyleExtractModal';
import type { BaseStyleSkill } from '@client/shared/modals/style-extract/types';
import { skillEntryKey, type SkillLibraryEntry, type SkillRuntime, type WorkshopSkill } from '@shared/domain/skills/library';
import { librarySkillItem } from '../model/libraryView';
import type { SkillItem, SkillMainTab } from '../model/skillTypes';
import { AgentCreateSkillBar } from './AgentCreateSkillBar';
import { ManualSkillStudioModal } from './ManualSkillStudioModal';
import { SkillsTopNav } from './SkillsTopNav';
import { SkillsCategoryFilter } from './SkillsCategoryFilter';
import { SkillsCardGrid } from './SkillsCardGrid';
import { SkillLibraryDetail } from './SkillLibraryDetail';
import { WorkshopSkillEditor } from './WorkshopSkillEditor';
import { useSkillLibraryData } from './useSkillLibraryData';
import { useLibrarySkillStudio } from './useLibrarySkillStudio';

interface Props { initialRuntime?: SkillRuntime | 'all'; onEnterWorkshop?: () => void }

/** Both global navigation and the workshop open this same library. */
export function SkillLibraryWorkspace({ initialRuntime = 'all', onEnterWorkshop }: Props) {
  const { library, loading, error, reload } = useSkillLibraryData();
  const { message, show: showToast } = useToast(3500);
  const studio = useLibrarySkillStudio(showToast);
  const [runtime, setRuntime] = useState<SkillRuntime | 'all'>(initialRuntime);
  const [tab, setTab] = useState<SkillMainTab>('all');
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('全部');
  const [agentOpen, setAgentOpen] = useState(false);
  const [extractOpen, setExtractOpen] = useState(false);
  const [feedSkill, setFeedSkill] = useState<BaseStyleSkill | undefined>();
  const [workshopEditor, setWorkshopEditor] = useState<WorkshopSkill | 'new' | null>(null);
  const [detail, setDetail] = useState<SkillLibraryEntry | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const pending = useRef(new Set<string>());
  const entries = useMemo(() => new Map(library.skills.map(entry => [skillEntryKey(entry), entry])), [library.skills]);
  const allItems = useMemo(() => library.skills.map(librarySkillItem), [library.skills]);
  const scopedItems = allItems.filter(item => runtime === 'all' || item.runtime === runtime);
  const categories = ['全部', ...new Set(scopedItems.map(item => item.category))];
  const favorites = new Set(allItems.filter(item => item.isFavorite).map(item => item.id));
  const filtered = scopedItems.filter(item => (tab !== 'my' || !item.isOfficial)
    && (tab !== 'favorite' || favorites.has(item.id))
    && (category === '全部' || item.category === category)
    && `${item.title} ${item.description} ${item.category}`.toLowerCase().includes(query.trim().toLowerCase()));

  const run = async (key: string, action: () => Promise<void>) => {
    if (pending.current.has(key)) return;
    pending.current.add(key);
    try { await action(); } catch (error) { showToast(error instanceof Error ? error.message : '技能操作失败'); }
    finally { pending.current.delete(key); }
  };
  const requestStyle = async (method: string, body?: object, search = '') => {
    const response = await apiFetch(`/api/catalog/styles${search}`, { method,
      headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    const result = await response.json();
    if (!response.ok || !result.success) throw new Error(result.error || '工坊技能操作失败');
    announceSkillLibraryChange();
  };
  const useSkill = (item: SkillItem) => {
    const entry = entries.get(item.id);
    if (!entry) return;
    const store = useAppStore.getState();
    if (entry.kind === 'assistant') {
      store.setActiveAssistantSkillId(entry.content.id);
      store.setIsAssistantOpen(true);
      showToast(`已为助手选择「${item.title}」`);
    } else {
      store.setSelectedArchId(entry.content.id);
      store.setPendingBatchStage(2);
      window.dispatchEvent(new Event('workshop-skill-applied'));
      if (onEnterWorkshop) onEnterWorkshop();
      else { store.setCurrentView('workshop'); store.setActiveWorkshopTab('studio'); }
      showToast(`已将「${item.title}」应用到工坊`);
    }
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
  const remove = (item: SkillItem) => { void run(item.id, async () => {
    const entry = entries.get(item.id);
    if (!entry || !await confirmAction(item.isOfficial ? '隐藏这条官方技能吗？之后可在技能库中恢复。' : `删除技能「${item.title}」吗？已有批次的内容快照仍会保留。`)) return;
    if (entry.kind === 'assistant') await useAppStore.getState().deleteAssistantSkill(entry.content.id);
    else {
      await requestStyle('DELETE', undefined, `?${new URLSearchParams({ id: entry.content.id, version: entry.content.libraryVersion || '' })}`);
      if (useAppStore.getState().selectedArchId === entry.content.id) useAppStore.getState().setSelectedArchId('');
    }
    showToast(item.isOfficial ? '官方技能已隐藏' : '技能已删除');
  }); };

  return <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-white/95 text-slate-900 dark:bg-[#111214]/95 dark:text-slate-100">
    <input ref={fileInput} type="file" multiple accept=".md,.zip,.txt,text/markdown,application/zip" className="hidden" onChange={event => {
      if (event.target.files?.length) void studio.upload(event.target.files);
      event.target.value = '';
    }} />
    <SkillsTopNav activeTab={tab} onTabChange={setTab} searchQuery={query} onSearchChange={setQuery}
      onSelectAgentCreate={() => setAgentOpen(true)} onSelectLocalUpload={() => fileInput.current?.click()} onSelectManualCreate={studio.create} />
    <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-6 py-3 text-xs dark:border-white/5 md:px-8">
      <span className="mr-1 text-slate-500">适用场景</span>
      {([['all', '全部'], ['workshop', '工坊'], ['assistant', '助手']] as const).map(([value, label]) => <button key={value} type="button" aria-pressed={runtime === value}
        onClick={() => { setRuntime(value); setCategory('全部'); }} className={`rounded-full px-3 py-1.5 ${runtime === value ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900' : 'bg-slate-100 dark:bg-white/5'}`}>{label}</button>)}
      <button type="button" onClick={() => { setFeedSkill(undefined); setExtractOpen(true); }} className="ml-auto rounded-full border border-slate-200 px-3 py-1.5 dark:border-white/10">从参考图新建</button>
      <button type="button" onClick={() => setWorkshopEditor('new')} className="rounded-full border border-slate-200 px-3 py-1.5 dark:border-white/10">手动新建工坊技能</button>
      <button type="button" onClick={() => { void reload(); }} disabled={loading}>{loading ? '加载中…' : '刷新'}</button>
    </div>
    <p className="px-6 pt-3 text-xs text-slate-500 md:px-8">统一管理技能；工坊使用商品匹配与换品流程，助手使用技能正文和工具。右上角“创建技能”用于助手技能包，保存后可选择使用。</p>
    <AgentCreateSkillBar isOpen={agentOpen} onClose={() => setAgentOpen(false)} onGenerated={result => { studio.generated(result); setAgentOpen(false); }} showToast={showToast} />
    <SkillsCategoryFilter selectedCategory={category} onSelectCategory={setCategory} categories={categories} />
    {error && <p role="alert" className="px-6 py-3 text-sm text-red-600">{error}。原有资料已保留，可点击刷新重试。</p>}
    <main className="min-h-0 flex-1 overflow-y-auto" aria-busy={loading}>
      <SkillsCardGrid skills={filtered} favorites={favorites} onUseSkill={useSkill} onEdit={edit} onFeed={feed} onDelete={remove}
        onDetail={item => setDetail(entries.get(item.id) || null)}
        onToggleFavorite={id => { const entry = entries.get(id); if (entry) void run(id, () => setLibrarySkillFavorite(entry, !entry.content.isFavorite)); }}
        emptyMessage={loading ? '正在加载技能库…' : error ? '技能库暂时无法读取，请重试' : '当前筛选下暂无技能'} />
      <div className="flex flex-wrap items-center gap-3 px-6 pb-6 text-xs text-slate-500 md:px-8">
        <button type="button" onClick={() => { void run('seed', () => requestStyle('POST', {}, '?action=seed')); }}>导入官方工坊技能</button>
        {library.hiddenOfficialRecipes.length > 0 && <details><summary className="cursor-pointer">恢复已隐藏的官方技能（{library.hiddenOfficialRecipes.length}）</summary>
          <div className="mt-2 flex flex-wrap gap-3">{library.hiddenOfficialRecipes.map(skill => <button type="button" key={skill.id}
            onClick={() => { void run(`restore:${skill.id}`, () => requestStyle('POST', { id: skill.id }, '?action=restore')); }}>{skill.name} · 恢复</button>)}</div>
        </details>}
      </div>
    </main>
    <ManualSkillStudioModal isOpen={studio.open} onClose={studio.close} showToast={showToast} initialFiles={studio.files} initialDraft={studio.draft}
      heading={studio.editing ? '编辑助手技能' : '创建助手技能'} mode={studio.editing ? 'edit' : 'create'} onSave={studio.save} />
    {workshopEditor && <WorkshopSkillEditor key={workshopEditor === 'new' ? 'new' : workshopEditor.id} skill={workshopEditor === 'new' ? null : workshopEditor}
      onClose={() => setWorkshopEditor(null)} onSaved={() => showToast('技能已保存，可选择应用到工坊')} />}
    <StyleExtractModal key={feedSkill?.id || 'new'} baseSkill={feedSkill} initialImages={[]} isOpen={extractOpen} onClose={() => setExtractOpen(false)}
      onRecipeCreated={() => { announceSkillLibraryChange(); showToast('新技能已保存，可选择应用到工坊'); }} />
    {detail && <SkillLibraryDetail entry={detail} onClose={() => setDetail(null)} />}
    {message && <div role="status" className="fixed bottom-10 left-1/2 z-[150] max-w-[90vw] -translate-x-1/2 rounded-full bg-slate-900 px-5 py-2.5 text-xs text-white dark:bg-white dark:text-slate-900">{message}</div>}
  </div>;
}
