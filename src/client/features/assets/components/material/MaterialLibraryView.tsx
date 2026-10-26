import { useState, useMemo, useEffect, useCallback } from 'react';
import { useI18n } from '@client/shared/i18n';
import type { ChatSession } from '@client/store/appStoreTypes';
import type { AssetCanvasProject } from '../../model/canvasAssets';
import type { MergedAssetTask } from '../../model/mergeAssetTasks';
import MaterialProjectView from './MaterialProjectView';
import { buildMaterialProjects, type ProjectFolderItem } from '../../model/materialProjects';
import { useMaterialSelection } from '../../hooks/useMaterialSelection';
import MaterialProjectDetailView from './MaterialProjectDetailView';
import MaterialFloatingDock from './MaterialFloatingDock';
import MaterialAssetCard from './MaterialAssetCard';
import MaterialLibraryToolbar from './MaterialLibraryToolbar';
import { groupTasksByTimeline, filterMaterialTasks } from '../../model/materialTimeline';
import { getAssetMediaKind } from '../../model/assetMedia';
import { openAgentDocument } from '@client/shared/ui/agentDocumentBus';

interface Props {
  sessions: ChatSession[];
  canvasProjects: AssetCanvasProject[];
  mergedTasks: MergedAssetTask[];
  sourceType?: 'ai' | 'uploaded';
  onSourceTypeChange: (source: 'ai' | 'uploaded') => void;
  setPreviewTask: (task: MergedAssetTask, queue?: MergedAssetTask[]) => void;
  onBatchDelete: (ids: string[]) => Promise<boolean>;
  onBatchDownload: (ids: string[]) => void;
  onBatchDeleteProjects?: (projects: ProjectFolderItem[]) => Promise<boolean | void> | boolean | void;
  isDownloadingZip?: boolean;
  isDeleting?: boolean;
}

export default function MaterialLibraryView({
  sessions,
  canvasProjects,
  mergedTasks,
  sourceType = 'ai',
  onSourceTypeChange,
  setPreviewTask,
  onBatchDelete,
  onBatchDownload,
  onBatchDeleteProjects,
  isDownloadingZip = false,
  isDeleting = false,
}: Props) {
  const { t, locale } = useI18n();
  // 🌟 核心视图模式：平铺视图 vs 项目视图
  const [viewMode, setViewMode] = useState<'flat' | 'project'>('flat');
  const [selectedProject, setSelectedProject] = useState<ProjectFolderItem | null>(null);

  // 🌟 媒体分类筛选：全部 / 图片 / 视频 / 音频 / 文档（仅平铺模式）
  const [mediaCategory, setMediaCategory] = useState<'all' | 'image' | 'video' | 'audio' | 'document'>('all');

  // 排序与搜索
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest' | 'name'>('newest');
  const [searchInput, setSearchInput] = useState('');

  const [isBatchMode, setIsBatchMode] = useState(false);

  // 平铺视图过滤逻辑（默认全量状态与时间，中等网格）
  const flatTasks = useMemo(() => {
    return filterMaterialTasks(mergedTasks, {
      sourceType,
      mediaCategory,
      searchInput,
      sortOrder,
      statusFilter: 'all',
      timeFilter: 'all',
    });
  }, [mergedTasks, sourceType, mediaCategory, searchInput, sortOrder]);

  // 按日期时间分组
  const timelineGroups = useMemo(
    () => groupTasksByTimeline(flatTasks, sortOrder, locale),
    [flatTasks, sortOrder, locale]
  );

  const sourceTasks = useMemo(() => filterMaterialTasks(mergedTasks, {
    sourceType, mediaCategory: 'all', searchInput: '', sortOrder,
  }), [mergedTasks, sourceType, sortOrder]);
  const allProjects = useMemo(() => buildMaterialProjects(sessions, canvasProjects, sourceTasks), [sessions, canvasProjects, sourceTasks]);
  const projectList = useMemo(() => {
    const keyword = searchInput.trim().toLowerCase();
    return allProjects.filter((project) => !keyword || project.title.toLowerCase().includes(keyword)).sort((a, b) => {
      if (sortOrder === 'name') return a.title.localeCompare(b.title, locale);
      return sortOrder === 'oldest' ? (a.updatedAt || 0) - (b.updatedAt || 0) : (b.updatedAt || 0) - (a.updatedAt || 0);
    });
  }, [allProjects, searchInput, sortOrder, locale]);
  const tasksSelection = useMaterialSelection(flatTasks, JSON.stringify([viewMode, sourceType, mediaCategory, searchInput]));
  const projectsSelection = useMaterialSelection(projectList, JSON.stringify([viewMode, sourceType, searchInput]));
  const selectedTaskIds = tasksSelection.ids;
  const selectedProjectIds = projectsSelection.ids;
  const toggleSelectTask = tasksSelection.toggle;
  const toggleSelectProject = projectsSelection.toggle;
  const clearTasks = tasksSelection.clear;
  const clearProjects = projectsSelection.clear;

  const handleExitBatchMode = useCallback(() => {
    setIsBatchMode(false);
    clearTasks();
    clearProjects();
  }, [clearTasks, clearProjects]);
  const handleViewModeChange = (nextMode: 'flat' | 'project') => {
    handleExitBatchMode();
    setViewMode(nextMode);
  };
  const handleToggleSelectAll = viewMode === 'project' ? projectsSelection.toggleAll : tasksSelection.toggleAll;

  useEffect(() => {
    if (!isBatchMode) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') handleExitBatchMode();
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

  const handleBatchDeleteSelectedProjects = async () => {
    const targets = projectList.filter((project) => selectedProjectIds.includes(project.id));
    if (!targets.length || !onBatchDeleteProjects) return;
    if (await onBatchDeleteProjects(targets) !== false) handleExitBatchMode();
  };

  const currentProject = selectedProject && allProjects.find((project) => project.id === selectedProject.id && project.type === selectedProject.type);
  if (currentProject) {
    return (
      <MaterialProjectDetailView
        key={`${currentProject.type}:${currentProject.id}`}
        project={currentProject}
        mergedTasks={mergedTasks}
        sourceType={sourceType}
        onSourceTypeChange={onSourceTypeChange}
        onBack={() => { setSelectedProject(null); handleExitBatchMode(); }}
        setPreviewTask={setPreviewTask}
        onBatchDelete={onBatchDelete}
        onBatchDownload={onBatchDownload}
        isDownloadingZip={isDownloadingZip}
        isDeleting={isDeleting}
      />
    );
  }

  const selectedCount = viewMode === 'project' ? selectedProjectIds.length : selectedTaskIds.length;
  const totalCount = viewMode === 'project' ? projectList.length : flatTasks.length;

  return (
    <div className="flex flex-col min-h-0 flex-1">
      {/* 🌟 二级工具控制栏 */}
      <MaterialLibraryToolbar
        viewMode={viewMode}
        onViewModeChange={handleViewModeChange}
        mediaCategory={mediaCategory}
        onMediaCategoryChange={setMediaCategory}
        searchInput={searchInput}
        onSearchInputChange={setSearchInput}
        sortOrder={sortOrder}
        onSortOrderChange={setSortOrder}
        isBatchMode={isBatchMode}
        onEnterBatchMode={() => setIsBatchMode(true)}
        onExitBatchMode={handleExitBatchMode}
        selectedCount={selectedCount}
        totalCount={totalCount}
        onToggleSelectAll={handleToggleSelectAll}
      />

      {/* 主视图内容区域 */}
      {viewMode === 'project' ? (
        <>
          <MaterialProjectView
            projects={projectList}
            onSelectProject={(project) => setSelectedProject(project)}
            selectedProjectIds={selectedProjectIds}
            isBatchMode={isBatchMode}
            onToggleSelectProject={toggleSelectProject}
          />

          {/* 🌟 项目视图专属浮动操作栏：支持批量删除项目 */}
          <MaterialFloatingDock
            selectedCount={selectedProjectIds.length}
            onClearSelection={clearProjects}
            onBatchDelete={handleBatchDeleteSelectedProjects}
            itemUnit="个项目"
            isDeleting={isDeleting}
            isDownloading={isDownloadingZip}
          />
        </>
      ) : (
        <>
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
            onBatchDelete={async () => { if (await onBatchDelete(selectedTaskIds)) handleExitBatchMode(); }}
            onBatchDownload={() => onBatchDownload(selectedTaskIds)}
            itemUnit="项"
            isDownloading={isDownloadingZip}
            isDeleting={isDeleting}
          />
        </>
      )}
    </div>
  );
}
