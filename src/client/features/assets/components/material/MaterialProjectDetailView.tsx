import { useState, useMemo } from 'react';
import { ArrowLeft, Check, ChevronDown, Search } from 'lucide-react';
import type { MergedAssetTask } from '../../model/mergeAssetTasks';
import { taskBelongsToProject, type ProjectFolderItem } from '../../model/materialProjects';
import { filterMaterialTasks } from '../../model/materialTimeline';
import { useMaterialSelection } from '../../hooks/useMaterialSelection';
import AssetMediaPreview from '../dialogs/AssetMediaPreview';
import MaterialFloatingDock from './MaterialFloatingDock';
import { getAssetMediaKind } from '../../model/assetMedia';
import { DocumentAssetCardCover } from './MaterialAssetCard';
import { openAgentDocument } from '@client/shared/ui/agentDocumentBus';

type Task = MergedAssetTask;

interface Props {
  project: ProjectFolderItem;
  mergedTasks: Task[];
  onBack: () => void;
  setPreviewTask: (task: Task, queue?: Task[]) => void;
  onBatchDelete: (ids: string[]) => Promise<boolean>;
  onBatchDownload: (ids: string[]) => void;
  sourceType: 'ai' | 'uploaded';
  onSourceTypeChange: (source: 'ai' | 'uploaded') => void;
  isDownloadingZip?: boolean;
  isDeleting?: boolean;
}

export type DisplaySize = 'large' | 'medium' | 'small';

export default function MaterialProjectDetailView({
  project,
  mergedTasks,
  onBack,
  setPreviewTask,
  onBatchDelete,
  onBatchDownload,
  sourceType,
  onSourceTypeChange,
  isDownloadingZip = false,
  isDeleting = false,
}: Props) {
  const [searchInput, setSearchInput] = useState('');
  const [mediaFilter, setMediaFilter] = useState<'all' | 'image' | 'video' | 'audio' | 'document'>('all');
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest' | 'name'>('newest');
  const [displaySize, setDisplaySize] = useState<DisplaySize>('medium');
  const projectTasks = useMemo(() => mergedTasks.filter((task) => taskBelongsToProject(task, project)), [mergedTasks, project]);
  const filteredTasks = useMemo(() => filterMaterialTasks(projectTasks, {
    sourceType, mediaCategory: mediaFilter, searchInput, sortOrder,
  }), [projectTasks, sourceType, mediaFilter, searchInput, sortOrder]);
  const selection = useMaterialSelection(filteredTasks, JSON.stringify([project.type, project.id, sourceType, mediaFilter, searchInput]));
  const selectedIds = selection.ids;
  const toggleSelect = selection.toggle;

  const handleCardClick = (task: Task) => {
    if (getAssetMediaKind(task) === 'document') {
      const title = (task.title || task.prompt || 'AI交付方案').replace(/[\\/:*?"<>|]/g, '').slice(0, 24);
      openAgentDocument({
        filename: `${title}.md`,
        content: task.prompt || '方案内容',
        createdAt: typeof task.createdAt === 'number' ? task.createdAt : Date.now(),
      });
      return;
    }
    const valid = filteredTasks.filter((t) => t.resultUrl && t.status !== 'FAILURE');
    setPreviewTask(task, valid.length > 0 ? valid : [task]);
  };

  const gridClass =
    displaySize === 'large'
      ? 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5'
      : displaySize === 'small'
      ? 'grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8'
      : 'grid-cols-2 sm:grid-cols-3 md:grid-cols-5 lg:grid-cols-7';

  return (
    <div className="flex flex-col min-h-0 flex-1">
      {/* 顶部控制栏 (对应图5) */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-2 pb-4">
        {/* 左侧：返回箭头 + 项目名 + 来源分类胶囊 */}
        <div className="flex items-center gap-4 shrink-0">
          <button
            type="button"
            onClick={onBack}
            className="flex items-center gap-2 text-sm font-bold text-slate-800 hover:text-slate-950 transition-colors dark:hover:text-white dark:text-slate-100"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>{project.title}</span>
          </button>

          {/* AI生成 / 我上传的 胶囊 */}
          <div className="inline-flex items-center p-0.5 rounded-full bg-slate-100 border border-slate-200/60 shadow-2xs dark:bg-white/10 dark:border-white/10">
            <button
              type="button"
              onClick={() => onSourceTypeChange('ai')}
              className={`px-3 py-1 rounded-full text-xs transition-all ${
                sourceType === 'ai'
                  ? 'bg-white text-slate-900 font-semibold shadow-2xs dark:text-slate-100 dark:bg-[#18191c]'
                  : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-100 dark:text-slate-400'
              }`}
            >
              AI 生成
            </button>
            <button
              type="button"
              onClick={() => onSourceTypeChange('uploaded')}
              className={`px-3 py-1 rounded-full text-xs transition-all ${
                sourceType === 'uploaded'
                  ? 'bg-white text-slate-900 font-semibold shadow-2xs dark:text-slate-100 dark:bg-[#18191c]'
                  : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-100 dark:text-slate-400'
              }`}
            >
              我上传的
            </button>
          </div>
        </div>

        {/* 右侧：搜索 + 筛选 + 排序 + 展示尺寸 */}
        <div className="flex items-center gap-2.5 shrink-0">
          {/* 搜索框 */}
          <div className="relative flex items-center">
            <Search className="w-3.5 h-3.5 absolute left-3 pointer-events-none text-slate-400" />
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="搜索资产"
              className="w-36 pl-8 pr-3 py-1 rounded-full bg-slate-100 hover:bg-slate-200/60 text-xs text-slate-800 placeholder-slate-400 outline-none transition-all h-8 dark:text-slate-100 dark:bg-white/10"
            />
          </div>

          {/* 筛选 */}
          <div className="relative flex items-center">
            <select
              value={mediaFilter}
              onChange={(e) => setMediaFilter(e.target.value as typeof mediaFilter)}
              className="appearance-none pl-3 pr-7 py-1 rounded-xl bg-slate-100 hover:bg-slate-200/60 text-slate-700 text-xs font-medium outline-none cursor-pointer h-8 dark:text-slate-200 dark:bg-white/10"
            >
              <option value="all">筛选: 全部</option>
              <option value="image">图片</option>
              <option value="video">视频</option>
              <option value="audio">音频</option>
              <option value="document">文档</option>
            </select>
            <ChevronDown className="w-3 h-3 text-slate-400 absolute right-2 pointer-events-none" />
          </div>

          {/* 排序 */}
          <div className="relative flex items-center">
            <select
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value as typeof sortOrder)}
              className="appearance-none pl-3 pr-7 py-1 rounded-xl bg-slate-100 hover:bg-slate-200/60 text-slate-700 text-xs font-medium outline-none cursor-pointer h-8 dark:text-slate-200 dark:bg-white/10"
            >
              <option value="newest">排序: 最新</option>
              <option value="oldest">排序: 最早</option>
              <option value="name">排序: 名称</option>
            </select>
            <ChevronDown className="w-3 h-3 text-slate-400 absolute right-2 pointer-events-none" />
          </div>

          {/* 展示尺寸 */}
          <div className="relative flex items-center">
            <select
              value={displaySize}
              onChange={(e) => setDisplaySize(e.target.value as DisplaySize)}
              className="appearance-none pl-3 pr-7 py-1 rounded-xl bg-slate-100 hover:bg-slate-200/60 text-slate-700 text-xs font-medium outline-none cursor-pointer h-8 dark:text-slate-200 dark:bg-white/10"
            >
              <option value="medium">展示尺寸: 中</option>
              <option value="large">展示尺寸: 大</option>
              <option value="small">展示尺寸: 小</option>
            </select>
            <ChevronDown className="w-3 h-3 text-slate-400 absolute right-2 pointer-events-none" />
          </div>
        </div>
      </div>

      {/* 素材网格 (对应图5) */}
      {filteredTasks.length === 0 ? (
        <div className="flex h-64 flex-col items-center justify-center gap-2 text-slate-400">
          <p className="text-xs font-medium">暂无符合条件的素材</p>
        </div>
      ) : (
        <div className={`grid ${gridClass} gap-3.5 pb-24 pt-2`}>
          {filteredTasks.map((task) => {
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
                  className={`relative aspect-video w-full overflow-hidden rounded-xl bg-slate-100 transition-all dark:bg-white/10 ${
                    isSelected
                      ? 'ring-2 ring-purple-600 border border-purple-500 shadow-md'
                      : 'border border-slate-200/70 hover:border-slate-300 dark:border-white/10'
                  }`}
                >
                  {/* 左上角勾选框 (对应图5) */}
                  <button
                    type="button"
                    onClick={(e) => toggleSelect(task.id, e)}
                    aria-label={isSelected ? '取消勾选' : '勾选'}
                    className={`absolute left-2 top-2 z-20 flex h-4 w-4 items-center justify-center rounded-sm transition-all ${
                      isSelected
                        ? 'bg-slate-900 text-white shadow-xs dark:bg-white dark:text-slate-950'
                        : 'border border-slate-300 bg-white/80 hover:bg-white text-transparent dark:hover:bg-white/10 dark:bg-[#18191c]/95'
                    }`}
                  >
                    {isSelected && <Check className="h-3 w-3 stroke-[3]" />}
                  </button>

                  {/* 媒体内容 */}
                  {kind === 'document' ? (
                    <DocumentAssetCardCover task={task} />
                  ) : task.resultUrl ? (
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

                  {/* 视频时长角标 (对应图1与图5，如 7s, 4s, 3s) */}
                  {durationBadge && (
                    <span className="absolute bottom-1.5 left-1.5 z-10 px-1 py-0.2 rounded-sm bg-black/60 text-[10px] font-mono font-medium text-white backdrop-blur-2xs">
                      {durationBadge}
                    </span>
                  )}
                </div>

                {/* 缩略图下方文件名/标题 */}
                <p
                  className="mt-1.5 truncate text-[11px] font-medium text-slate-700 px-0.5 dark:text-slate-200"
                  title={title}
                >
                  {title}
                </p>
              </div>
            );
          })}
        </div>
      )}

      {/* 底部浮动批量操作栏 (图5) */}
      <MaterialFloatingDock
        selectedCount={selectedIds.length}
        onClearSelection={selection.clear}
        onBatchDownload={() => onBatchDownload(selectedIds)}
        onBatchDelete={async () => { if (await onBatchDelete(selectedIds)) selection.clear(); }}
        isDownloading={isDownloadingZip}
        isDeleting={isDeleting}
      />
    </div>
  );
}
