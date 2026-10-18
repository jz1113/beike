import { useState, useMemo, useEffect, useCallback } from 'react';
import { useI18n } from '@client/shared/i18n';
import type { ChatSession } from '@client/store/appStoreTypes';
import type { AssetCanvasProject } from '../model/canvasAssets';
import type { MergedAssetTask } from '../model/mergeAssetTasks';
import MaterialProjectView, { type ProjectFolderItem } from './MaterialProjectView';
import MaterialProjectDetailView from './MaterialProjectDetailView';
import MaterialFloatingDock from './MaterialFloatingDock';
import MaterialAssetCard from './MaterialAssetCard';
import MaterialLibraryToolbar from './MaterialLibraryToolbar';
import { groupTasksByTimeline, filterMaterialTasks } from '../model/materialTimeline';
import { getAssetMediaKind } from '../model/assetMedia';
import { openAgentDocument } from '@client/shared/ui/agentDocumentBus';

interface Props {
  sessions: ChatSession[];
  canvasProjects: AssetCanvasProject[];
  mergedTasks: MergedAssetTask[];
  sourceType?: 'ai' | 'uploaded';
  setPreviewTask: (task: MergedAssetTask, queue?: MergedAssetTask[]) => void;
  onBatchDelete: (ids: string[]) => void;
  onBatchDownload: (ids: string[]) => void;
  onDeleteProject?: (project: ProjectFolderItem) => void;
  onBatchDeleteProjects?: (projects: ProjectFolderItem[]) => Promise<boolean | void> | boolean | void;
  isDownloadingZip?: boolean;
  isDeleting?: boolean;
}

export default function MaterialLibraryView({
  sessions,
  canvasProjects,
  mergedTasks,
  sourceType = 'ai',
  setPreviewTask,
  onBatchDelete,
  onBatchDownload,
  onDeleteProject,
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

  // 勾选状态（平铺素材与项目视图独立）
  const [selectedTaskIds, setSelectedTaskIds] = useState<string[]>([]);
  const [selectedProjectIds, setSelectedProjectIds] = useState<string[]>([]);

  // 🌟 批量操作模式
  const [isBatchMode, setIsBatchMode] = useState(false);

  // 切换视图模式时重置批量和选择状态
  const handleViewModeChange = useCallback((nextMode: 'flat' | 'project') => {
    setViewMode(nextMode);
    setIsBatchMode(false);
    setSelectedTaskIds([]);
    setSelectedProjectIds([]);
  }, []);

  // 监听 Escape 快捷键退出批量模式
  useEffect(() => {
    if (!isBatchMode) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsBatchMode(false);
        setSelectedTaskIds([]);
        setSelectedProjectIds([]);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isBatchMode]);

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

  // 计算当前项目列表（供项目视图及其全选/统计使用）
  const projectList = useMemo(() => {
    const sessionCountMap = new Map<string, number>();
    for (const task of mergedTasks) {
      if (task.sessionId) {
        sessionCountMap.set(task.sessionId, (sessionCountMap.get(task.sessionId) || 0) + 1);
      }
    }

    const items: ProjectFolderItem[] = [];

    for (const s of sessions) {
      const count = sessionCountMap.get(s.id) || 0;
      items.push({
        id: s.id,
        title: s.title || '新创作对话',
        assetCount: count,
        type: 'session',
        updatedAt: s.updatedAt || s.createdAt || 0,
      });
    }

    for (const c of canvasProjects) {
      items.push({
        id: c.id,
        title: c.title || '未命名画布',
        assetCount: c.nodes?.length || 0,
        type: 'canvas',
        updatedAt: c.updatedAt || 0,
      });
    }

    const kw = searchInput.trim().toLowerCase();
    const filtered = kw ? items.filter((p) => p.title.toLowerCase().includes(kw)) : items;

    return filtered.sort((a, b) => {
      if (sortOrder === 'name') return a.title.localeCompare(b.title, 'zh-CN');
      if (sortOrder === 'oldest') return (a.updatedAt || 0) - (b.updatedAt || 0);
      return (b.updatedAt || 0) - (a.updatedAt || 0);
    });
  }, [sessions, canvasProjects, mergedTasks, searchInput, sortOrder]);

  // 平铺素材单选/反选
  const toggleSelectTask = useCallback((id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedTaskIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  }, []);

  // 项目单选/反选
  const toggleSelectProject = useCallback((id: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setSelectedProjectIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  }, []);

  // 全选 / 取消全选逻辑（响应当前视图维度）
  const handleToggleSelectAll = useCallback(() => {
    if (viewMode === 'project') {
      if (selectedProjectIds.length > 0 && selectedProjectIds.length === projectList.length) {
        setSelectedProjectIds([]);
      } else {
        setSelectedProjectIds(projectList.map((p) => p.id));
      }
    } else {
      if (selectedTaskIds.length > 0 && selectedTaskIds.length === flatTasks.length) {
        setSelectedTaskIds([]);
      } else {
        setSelectedTaskIds(flatTasks.map((t) => t.id));
      }
    }
  }, [viewMode, selectedProjectIds, projectList, selectedTaskIds, flatTasks]);

  const handleExitBatchMode = useCallback(() => {
    setIsBatchMode(false);
    setSelectedTaskIds([]);
    setSelectedProjectIds([]);
  }, []);

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

  // 执行批量删除项目
  const handleBatchDeleteSelectedProjects = useCallback(async () => {
    if (selectedProjectIds.length === 0) return;
    let targetProjects = projectList.filter((p) => selectedProjectIds.includes(p.id));
    if (targetProjects.length === 0) {
      targetProjects = [
        ...sessions
          .filter((s) => selectedProjectIds.includes(s.id))
          .map((s) => ({
            id: s.id,
            title: s.title || '未命名项目',
            assetCount: 0,
            type: 'session' as const,
          })),
        ...canvasProjects
          .filter((c) => selectedProjectIds.includes(c.id))
          .map((c) => ({
            id: c.id,
            title: c.title || '未命名画布',
            assetCount: 0,
            type: 'canvas' as const,
          })),
      ];
    }
    if (targetProjects.length === 0) return;

    if (onBatchDeleteProjects) {
      const res = await onBatchDeleteProjects(targetProjects);
      if (res === false) return;
    } else if (onDeleteProject) {
      for (const p of targetProjects) {
        onDeleteProject(p);
      }
    }
    setSelectedProjectIds([]);
    setIsBatchMode(false);
  }, [selectedProjectIds, projectList, sessions, canvasProjects, onBatchDeleteProjects, onDeleteProject]);

  // 项目详情视图
  if (selectedProject) {
    return (
      <MaterialProjectDetailView
        project={selectedProject}
        mergedTasks={mergedTasks}
        onBack={() => setSelectedProject(null)}
        setPreviewTask={setPreviewTask}
        onBatchDelete={onBatchDelete}
        onBatchDownload={onBatchDownload}
        onDeleteProject={(p) => {
          onDeleteProject?.(p);
          setSelectedProject(null);
        }}
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
            sessions={sessions}
            canvasProjects={canvasProjects}
            mergedTasks={mergedTasks}
            searchKeyword={searchInput}
            sortOrder={sortOrder}
            onSelectProject={(project) => setSelectedProject(project)}
            selectedProjectIds={selectedProjectIds}
            isBatchMode={isBatchMode}
            onToggleSelectProject={toggleSelectProject}
            onDeleteProject={onDeleteProject}
          />

          {/* 🌟 项目视图专属浮动操作栏：支持批量删除项目 */}
          <MaterialFloatingDock
            selectedCount={selectedProjectIds.length}
            onClearSelection={() => setSelectedProjectIds([])}
            onBatchDelete={handleBatchDeleteSelectedProjects}
            itemUnit="个项目"
            isDeleting={isDeleting}
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
                  <h2 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white select-none">
                    {group.label}
                  </h2>

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
            onClearSelection={() => setSelectedTaskIds([])}
            onBatchDelete={() => onBatchDelete(selectedTaskIds)}
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
