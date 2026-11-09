import { useState, useMemo, useEffect, useCallback } from 'react';
import { useI18n } from '@client/shared/i18n';
import MaterialFloatingDock from './MaterialFloatingDock';
import MaterialAssetCard from './MaterialAssetCard';
import MaterialLibraryToolbar from './MaterialLibraryToolbar';
import { groupTasksByTimeline, filterMaterialTasks } from '../../model/materialTimeline';
import { getAssetMediaKind, type MergedAssetTask } from '../../model/agentAssetFilter';
import { openAgentDocument } from '@client/shared/ui/AppErrorBoundary';

/** Selection can only act on items visible in the current filter and project. */
export function useMaterialSelection(items: { id: string }[], scope: string) {
  const [selection, setSelection] = useState<{ scope: string; ids: string[] }>({ scope, ids: [] });
  const available = useMemo(() => new Set(items.map((item) => item.id)), [items]);
  const ids = useMemo(() => selection.scope === scope ? selection.ids.filter((id) => available.has(id)) : [], [selection, scope, available]);

  useEffect(() => {
    setSelection((previous) => {
      const next = previous.scope === scope ? previous.ids.filter((id) => available.has(id)) : [];
      return previous.scope === scope && next.length === previous.ids.length ? previous : { scope, ids: next };
    });
  }, [scope, available]);

  const clear = useCallback(() => setSelection({ scope, ids: [] }), [scope]);
  const toggle = useCallback((id: string, event?: { stopPropagation: () => void }) => {
    event?.stopPropagation();
    if (!available.has(id)) return;
    setSelection((previous) => {
      const current = previous.scope === scope ? previous.ids.filter((key) => available.has(key)) : [];
      return { scope, ids: current.includes(id) ? current.filter((key) => key !== id) : [...current, id] };
    });
  }, [scope, available]);
  const toggleAll = useCallback(() => {
    setSelection((previous) => ({ scope, ids: previous.scope === scope && available.size > 0 && [...available].every((id) => previous.ids.includes(id)) ? [] : [...available] }));
  }, [scope, available]);

  return { ids, clear, toggle, toggleAll };
}

interface Props {
  mergedTasks: MergedAssetTask[];
  sourceType?: 'ai' | 'uploaded';
  setPreviewTask: (task: MergedAssetTask, queue?: MergedAssetTask[]) => void;
  onBatchDelete: (ids: string[]) => Promise<boolean>;
  onBatchDownload: (ids: string[]) => void;
  isDownloadingZip?: boolean;
  isDeleting?: boolean;
}

export default function MaterialLibraryView({
  mergedTasks,
  sourceType = 'ai',
  setPreviewTask,
  onBatchDelete,
  onBatchDownload,
  isDownloadingZip = false,
  isDeleting = false,
}: Props) {
  const { t, locale } = useI18n();
  const [mediaCategory, setMediaCategory] = useState<'all' | 'image' | 'video' | 'audio' | 'document'>('all');

  // 排序与搜索
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest' | 'name'>('newest');
  const [searchInput, setSearchInput] = useState('');

  const [isBatchMode, setIsBatchMode] = useState(false);
  const [unavailableImages, setUnavailableImages] = useState<Set<string>>(() => new Set());
  const handleImageUnavailable = useCallback((url: string) => {
    setUnavailableImages(previous => previous.has(url) ? previous : new Set([...previous, url]));
  }, []);

  // 失败记录和所有回退地址均无法加载的图片不参与分组、计数与批量操作。
  const flatTasks = useMemo(() => {
    return filterMaterialTasks(mergedTasks, {
      sourceType,
      mediaCategory,
      searchInput,
      sortOrder,
      statusFilter: 'all',
      timeFilter: 'all',
    }).filter(task => getAssetMediaKind(task) !== 'image' || !task.resultUrl || !unavailableImages.has(task.resultUrl));
  }, [mergedTasks, sourceType, mediaCategory, searchInput, sortOrder, unavailableImages]);

  // 按日期时间分组
  const timelineGroups = useMemo(
    () => groupTasksByTimeline(flatTasks, sortOrder, locale),
    [flatTasks, sortOrder, locale]
  );

  const tasksSelection = useMaterialSelection(flatTasks, JSON.stringify([sourceType, mediaCategory, searchInput]));
  const selectedTaskIds = tasksSelection.ids;
  const toggleSelectTask = tasksSelection.toggle;
  const clearTasks = tasksSelection.clear;

  const handleExitBatchMode = useCallback(() => {
    setIsBatchMode(false);
    clearTasks();
  }, [clearTasks]);

  useEffect(() => {
    if (!isBatchMode) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !event.defaultPrevented) handleExitBatchMode();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isBatchMode, handleExitBatchMode]);

  const handleCardClick = useCallback((task: MergedAssetTask) => {
    if (getAssetMediaKind(task) === 'document') {
      const title = (task.title || task.prompt || 'AI交付方案').replace(/[\\/:*?"<>|]/g, '').slice(0, 24);
      openAgentDocument({
        filename: `${title}.md`,
        content: task.prompt || '方案内容',
        createdAt: typeof task.createdAt === 'number' ? task.createdAt : Date.now(),
      });
      return;
    }
    const valid = flatTasks.filter((t) => t.resultUrl && t.status !== 'FAILURE');
    setPreviewTask(task, valid.length > 0 ? valid : [task]);
  }, [flatTasks, setPreviewTask]);

  return (
    <div className="flex flex-col min-h-0 flex-1">
      {/* 🌟 二级工具控制栏 */}
      <MaterialLibraryToolbar
        mediaCategory={mediaCategory}
        onMediaCategoryChange={setMediaCategory}
        searchInput={searchInput}
        onSearchInputChange={setSearchInput}
        sortOrder={sortOrder}
        onSortOrderChange={setSortOrder}
        isBatchMode={isBatchMode}
        onEnterBatchMode={() => setIsBatchMode(true)}
        onExitBatchMode={handleExitBatchMode}
        selectedCount={selectedTaskIds.length}
        totalCount={flatTasks.length}
        onToggleSelectAll={tasksSelection.toggleAll}
      />

      {/* 主视图内容区域 */}
      {timelineGroups.length === 0 ? (
        <div className="flex h-64 flex-col items-center justify-center gap-2 text-slate-400">
          <p className="text-xs font-medium">{t('assets.noMatchingMaterials')}</p>
        </div>
      ) : (
        <div className="space-y-7 pb-24 pt-1">
          {timelineGroups.map((group) => (
            <section key={group.key} className="space-y-3">
              {group.label && <h2 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white select-none">
                {group.label}
              </h2>}

              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-7 gap-3.5">
                {group.tasks.map((task) => (
                  <MaterialAssetCard
                    key={task.id}
                    task={task}
                    isSelected={selectedTaskIds.includes(task.id)}
                    isBatchMode={isBatchMode}
                    onToggleSelect={toggleSelectTask}
                    onClick={handleCardClick}
                    onImageUnavailable={handleImageUnavailable}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      <MaterialFloatingDock
        selectedCount={selectedTaskIds.length}
        onClearSelection={clearTasks}
        onExitSelection={handleExitBatchMode}
        onBatchDelete={async () => { if (await onBatchDelete(selectedTaskIds)) handleExitBatchMode(); }}
        onBatchDownload={() => onBatchDownload(selectedTaskIds)}
        itemUnit="项"
        isDownloading={isDownloadingZip}
        isDeleting={isDeleting}
      />
    </div>
  );
}
