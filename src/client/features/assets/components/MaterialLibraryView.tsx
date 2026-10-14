import { useState, useMemo } from 'react';
import { Check, ChevronDown, Search } from 'lucide-react';
import type { ChatSession } from '@client/store/types';
import type { AssetCanvasProject } from '../model/canvasAssets';
import type { AssetTaskBatch } from '../model/assetBatch';
import type { DisplaySize } from './MaterialProjectDetailView';
import MaterialProjectView, { type ProjectFolderItem } from './MaterialProjectView';
import MaterialProjectDetailView from './MaterialProjectDetailView';
import MaterialFloatingDock from './MaterialFloatingDock';
import AssetMediaPreview from './AssetMediaPreview';
import { getAssetMediaKind } from '../model/assetMedia';

type Task = AssetTaskBatch['tasks'][number];

interface Props {
  sessions: ChatSession[];
  canvasProjects: AssetCanvasProject[];
  mergedTasks: Task[];
  setPreviewTask: (task: Task, queue?: Task[]) => void;
  onBatchDelete: (ids: string[]) => void;
  onBatchDownload: (ids: string[]) => void;
  isDownloadingZip?: boolean;
  isDeleting?: boolean;
}

export default function MaterialLibraryView({
  sessions,
  canvasProjects,
  mergedTasks,
  setPreviewTask,
  onBatchDelete,
  onBatchDownload,
  isDownloadingZip = false,
  isDeleting = false,
}: Props) {
  // 视图模式：平铺视图 vs 项目视图 (对应图1与图2)
  const [viewMode, setViewMode] = useState<'flat' | 'project'>('flat');
  const [selectedProject, setSelectedProject] = useState<ProjectFolderItem | null>(null);

  // 筛选与控制
  const [sourceType, setSourceType] = useState<'ai' | 'uploaded'>('ai');
  const [searchInput, setSearchInput] = useState('');
  const [mediaFilter, setMediaFilter] = useState<'all' | 'image' | 'video' | 'audio'>('all');
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest' | 'name'>('newest');
  const [displaySize, setDisplaySize] = useState<DisplaySize>('medium');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  // 平铺视图下的素材过滤
  const flatTasks = useMemo(() => {
    let list = [...mergedTasks];

    // 来源过滤 (我上传的 vs AI生成)
    if (sourceType === 'uploaded') {
      list = list.filter((t) => t.isUploaded || t.sourceImageUrl || t.referenceImageUrl);
    }

    // 媒体过滤
    if (mediaFilter !== 'all') {
      list = list.filter((t) => getAssetMediaKind(t) === mediaFilter);
    }

    // 搜索过滤
    const kw = searchInput.trim().toLowerCase();
    if (kw) {
      list = list.filter((t) => (t.title || t.prompt || '').toLowerCase().includes(kw));
    }

    // 排序
    return list.sort((a, b) => {
      if (sortOrder === 'name') {
        const titleA = a.title || a.prompt || '';
        const titleB = b.title || b.prompt || '';
        return titleA.localeCompare(titleB, 'zh-CN');
      }
      const timeA = new Date(a.createdAt).getTime() || 0;
      const timeB = new Date(b.createdAt).getTime() || 0;
      return sortOrder === 'oldest' ? timeA - timeB : timeB - timeA;
    });
  }, [mergedTasks, sourceType, mediaFilter, searchInput, sortOrder]);

  const toggleSelect = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleCardClick = (task: Task) => {
    const valid = flatTasks.filter((t) => t.resultUrl && t.status !== 'FAILURE');
    setPreviewTask(task, valid.length > 0 ? valid : [task]);
  };

  const gridClass =
    displaySize === 'large'
      ? 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5'
      : displaySize === 'small'
      ? 'grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8'
      : 'grid-cols-2 sm:grid-cols-3 md:grid-cols-5 lg:grid-cols-7';

  // 若已点进某个项目，渲染项目详情视图 (对应图5)
  if (selectedProject) {
    return (
      <MaterialProjectDetailView
        project={selectedProject}
        mergedTasks={mergedTasks}
        onBack={() => setSelectedProject(null)}
        setPreviewTask={setPreviewTask}
        onBatchDelete={onBatchDelete}
        onBatchDownload={onBatchDownload}
        isDownloadingZip={isDownloadingZip}
        isDeleting={isDeleting}
      />
    );
  }

  return (
    <div className="flex flex-col min-h-0 flex-1">
      {/* 顶部控制栏 (对应图1平铺视图 / 图2项目视图) */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-2 pb-4">
        {/* 左侧：来源胶囊 + 视图切换下拉 */}
        <div className="flex items-center gap-3 shrink-0">
          {/* AI 生成 / 我上传的 胶囊 */}
          {viewMode === 'flat' && (
            <div className="inline-flex items-center p-0.5 rounded-full bg-slate-100 border border-slate-200/60 shadow-2xs">
              <button
                type="button"
                onClick={() => setSourceType('ai')}
                className={`px-3 py-1 rounded-full text-xs transition-all ${
                  sourceType === 'ai'
                    ? 'bg-white text-slate-900 font-semibold shadow-2xs'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                AI 生成
              </button>
              <button
                type="button"
                onClick={() => setSourceType('uploaded')}
                className={`px-3 py-1 rounded-full text-xs transition-all ${
                  sourceType === 'uploaded'
                    ? 'bg-white text-slate-900 font-semibold shadow-2xs'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                我上传的
              </button>
            </div>
          )}

          {/* 平铺视图 ˅ / 项目视图 ˅ 下拉 */}
          <div className="relative flex items-center">
            <select
              value={viewMode}
              onChange={(e) => setViewMode(e.target.value as 'flat' | 'project')}
              className="appearance-none pl-3 pr-7 py-1 rounded-xl bg-slate-100 hover:bg-slate-200/60 text-slate-800 text-xs font-semibold outline-none cursor-pointer h-8"
            >
              <option value="flat">平铺视图</option>
              <option value="project">项目视图</option>
            </select>
            <ChevronDown className="w-3 h-3 text-slate-400 absolute right-2 pointer-events-none" />
          </div>
        </div>

        {/* 右侧：搜索 + 筛选 + 排序 + (平铺专属) 展示尺寸 */}
        <div className="flex items-center gap-2.5 shrink-0">
          <div className="relative flex items-center">
            <Search className="w-3.5 h-3.5 absolute left-3 pointer-events-none text-slate-400" />
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="搜索资产"
              className="w-36 pl-8 pr-3 py-1 rounded-full bg-slate-100 hover:bg-slate-200/60 text-xs text-slate-800 placeholder-slate-400 outline-none transition-all h-8"
            />
          </div>

          <div className="relative flex items-center">
            <select
              value={mediaFilter}
              onChange={(e) => setMediaFilter(e.target.value as typeof mediaFilter)}
              className="appearance-none pl-3 pr-7 py-1 rounded-xl bg-slate-100 hover:bg-slate-200/60 text-slate-700 text-xs font-medium outline-none cursor-pointer h-8"
            >
              <option value="all">筛选: 全部</option>
              <option value="image">图片</option>
              <option value="video">视频</option>
              <option value="audio">音频</option>
            </select>
            <ChevronDown className="w-3 h-3 text-slate-400 absolute right-2 pointer-events-none" />
          </div>

          <div className="relative flex items-center">
            <select
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value as typeof sortOrder)}
              className="appearance-none pl-3 pr-7 py-1 rounded-xl bg-slate-100 hover:bg-slate-200/60 text-slate-700 text-xs font-medium outline-none cursor-pointer h-8"
            >
              <option value="newest">排序: 最新</option>
              <option value="oldest">排序: 最早</option>
              <option value="name">排序: 名称</option>
            </select>
            <ChevronDown className="w-3 h-3 text-slate-400 absolute right-2 pointer-events-none" />
          </div>

          {viewMode === 'flat' && (
            <div className="relative flex items-center">
              <select
                value={displaySize}
                onChange={(e) => setDisplaySize(e.target.value as DisplaySize)}
                className="appearance-none pl-3 pr-7 py-1 rounded-xl bg-slate-100 hover:bg-slate-200/60 text-slate-700 text-xs font-medium outline-none cursor-pointer h-8"
              >
                <option value="medium">展示尺寸: 中</option>
                <option value="large">展示尺寸: 大</option>
                <option value="small">展示尺寸: 小</option>
              </select>
              <ChevronDown className="w-3 h-3 text-slate-400 absolute right-2 pointer-events-none" />
            </div>
          )}
        </div>
      </div>

      {/* 主内容区域 */}
      {viewMode === 'project' ? (
        /* 项目视图 (对应图2) */
        <MaterialProjectView
          sessions={sessions}
          canvasProjects={canvasProjects}
          mergedTasks={mergedTasks}
          searchKeyword={searchInput}
          sortOrder={sortOrder}
          onSelectProject={(project) => setSelectedProject(project)}
        />
      ) : (
        /* 平铺视图 (对应图1) */
        <>
          {flatTasks.length === 0 ? (
            <div className="flex h-64 flex-col items-center justify-center gap-2 text-slate-400">
              <p className="text-xs font-medium">暂无匹配的素材</p>
            </div>
          ) : (
            <div className={`grid ${gridClass} gap-3.5 pb-24 pt-2`}>
              {flatTasks.map((task) => {
                const isSelected = selectedIds.includes(task.id);
                const kind = getAssetMediaKind(task);
                const isVideo = kind === 'video';
                const durationBadge = isVideo ? (task.duration ? `${task.duration}s` : '5s') : null;
                const title = task.title || task.prompt || (isVideo ? 'video_001.mp4' : 'character_001');

                return (
                  <div
                    key={task.id}
                    onClick={() => handleCardClick(task)}
                    className={`group relative flex flex-col cursor-pointer transition-all ${
                      isSelected ? 'scale-[0.99]' : ''
                    }`}
                  >
                    {/* 缩略图容器 */}
                    <div
                      className={`relative aspect-video w-full overflow-hidden rounded-xl bg-slate-100 transition-all ${
                        isSelected
                          ? 'ring-2 ring-purple-600 border border-purple-500 shadow-md'
                          : 'border border-slate-200/70 hover:border-slate-300'
                      }`}
                    >
                      {/* 左上角勾选框 (对应图1与图5) */}
                      <button
                        type="button"
                        onClick={(e) => toggleSelect(task.id, e)}
                        aria-label={isSelected ? '取消勾选' : '勾选'}
                        className={`absolute left-2 top-2 z-20 flex h-4 w-4 items-center justify-center rounded-sm transition-all ${
                          isSelected
                            ? 'bg-slate-900 text-white shadow-xs'
                            : 'border border-slate-300 bg-white/80 opacity-0 group-hover:opacity-100 hover:bg-white text-transparent'
                        }`}
                      >
                        {isSelected && <Check className="h-3 w-3 stroke-[3]" />}
                      </button>

                      {/* 媒体内容 */}
                      {task.resultUrl ? (
                        <AssetMediaPreview
                          src={task.resultUrl}
                          mediaType={task.mediaType}
                          model={task.model}
                          title={title}
                          posterUrl={task.coverUrl}
                          videoAutoPlay={false}
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-slate-300">
                          <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                            <rect width="18" height="18" x="3" y="3" rx="2" strokeWidth="1.5" />
                            <circle cx="8.5" cy="8.5" r="1.5" strokeWidth="1.5" />
                            <path d="m21 15-5-5L5 21" strokeWidth="1.5" />
                          </svg>
                        </div>
                      )}

                      {/* 视频时长角标 (对应图1，如 7s, 4s, 3s) */}
                      {durationBadge && (
                        <span className="absolute bottom-1.5 left-1.5 z-10 px-1 py-0.2 rounded-sm bg-black/60 text-[10px] font-mono font-medium text-white backdrop-blur-2xs">
                          {durationBadge}
                        </span>
                      )}
                    </div>

                    {/* 缩略图下方文件名/标题 */}
                    <p
                      className="mt-1.5 truncate text-[11px] font-medium text-slate-700 px-0.5"
                      title={title}
                    >
                      {title}
                    </p>
                  </div>
                );
              })}
            </div>
          )}

          {/* 底部浮动批量操作栏 */}
          <MaterialFloatingDock
            selectedCount={selectedIds.length}
            onClearSelection={() => setSelectedIds([])}
            onBatchDownload={() => onBatchDownload(selectedIds)}
            onBatchDelete={() => onBatchDelete(selectedIds)}
            isDownloading={isDownloadingZip}
            isDeleting={isDeleting}
          />
        </>
      )}
    </div>
  );
}
