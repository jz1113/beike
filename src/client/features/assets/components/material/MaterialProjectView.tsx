import React, { useMemo, useState } from 'react';
import { Check } from 'lucide-react';
import { Folder } from '@client/shared/media/widgets/Folder';
import type { ProjectFolderItem } from '../../model/materialProjects';

interface Props {
  projects: ProjectFolderItem[];
  onSelectProject: (project: ProjectFolderItem) => void;
  selectedProjectIds?: string[];
  isBatchMode?: boolean;
  onToggleSelectProject?: (id: string, e?: React.MouseEvent) => void;
}

interface ProjectCardProps {
  project: ProjectFolderItem;
  photos: string[];
  isSelected: boolean;
  isBatchMode: boolean;
  onToggleSelect: (id: string, e: React.MouseEvent) => void;
  onClick: (project: ProjectFolderItem) => void;
}

function MaterialProjectCard({
  project,
  photos,
  isSelected,
  isBatchMode,
  onToggleSelect,
  onClick,
}: ProjectCardProps) {
  const [isHovered, setIsHovered] = useState(false);

  // 折页内部插图：有素材显示素材照片卡片，无素材显示清新渐变占位卡片
  const folderItems = useMemo(() => {
    if (photos.length > 0) {
      return photos.map((url) => ({ image: url }));
    }
    return [
      {
        content: (
          <div className="folder-photo flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-50/50">
            <div className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-100/70">
              <span className="block h-1.5 w-1.5 rounded-full bg-blue-400" />
            </div>
          </div>
        ),
      },
    ];
  }, [photos]);

  const handleCardClick = (e: React.MouseEvent) => {
    if (isBatchMode) {
      onToggleSelect(project.id, e);
    } else {
      onClick(project);
    }
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={handleCardClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleCardClick(e as unknown as React.MouseEvent);
        }
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={`group relative flex flex-col items-center p-2 pb-2 rounded-2xl transition-all duration-200 cursor-pointer text-center select-none ${
        isSelected
          ? 'bg-blue-50/60 ring-2 ring-blue-500 shadow-sm'
          : 'hover:bg-slate-100/70 border border-transparent hover:border-slate-200/60'
      }`}
    >
      {/* 🌟 复选框：支持鼠标悬停勾选（非批量）与常驻勾选（批量），对齐平铺素材卡片 */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onToggleSelect(project.id, e);
        }}
        aria-label={isSelected ? `取消选择项目 ${project.title}` : `选择项目 ${project.title}`}
        className={`absolute left-1.5 top-1.5 z-20 flex h-4 w-4 items-center justify-center rounded-sm transition-all cursor-pointer ${
          isSelected
            ? 'bg-slate-900 text-white shadow-xs opacity-100 dark:bg-white dark:text-slate-950'
            : isBatchMode
            ? 'border border-slate-300 bg-white/95 opacity-100 hover:bg-white text-transparent dark:hover:bg-white/10 dark:bg-[#18191c]/95'
            : 'border border-slate-300 bg-white/90 opacity-0 group-hover:opacity-100 hover:bg-white text-transparent dark:hover:bg-white/10 dark:bg-[#18191c]/95'
        }`}
      >
        {isSelected && <Check className="h-3 w-3 stroke-[3]" />}
      </button>

      {/* 🌟 经典纯色蓝 3D 拟物折页立体文件夹组件（容器与组件真实高度适配，彻底避免下边缘遮挡文字） */}
      <div className="relative flex h-[84px] w-full items-center justify-center transition-transform duration-200 group-hover:scale-105 pointer-events-none">
        <Folder
          variant="solid"
          mode="flap"
          layout="spread"
          color="#3d8bff"
          size={0.42}
          interactive={false}
          open={isHovered}
          items={folderItems}
        />
      </div>

      {/* 标题与素材数：z-10 确保层级置顶，与文件夹保持清晰间距 */}
      <div className="relative z-10 mt-1.5 w-full px-1">
        <h3
          className="truncate text-xs font-semibold text-slate-800 group-hover:text-slate-950 dark:text-slate-100"
          title={project.title}
        >
          {project.title}
        </h3>
        <p className="mt-0.5 text-[11px] text-slate-400">
          {project.assetCount > 0 ? `${project.assetCount} 个素材` : '暂无素材'}
        </p>
      </div>
    </div>
  );
}

export default function MaterialProjectView({
  projects: projectList,
  onSelectProject,
  selectedProjectIds = [],
  isBatchMode = false,
  onToggleSelectProject,
}: Props) {
  if (projectList.length === 0) {
    return (
      <div className="flex h-72 w-full flex-col items-center justify-center gap-3 text-slate-400">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-100 text-slate-300 dark:bg-white/10">
          <svg className="h-9 w-9" viewBox="0 0 24 24" fill="currentColor">
            <path d="M19.5 21a3 3 0 0 0 3-3v-4.5a3 3 0 0 0-3-3h-1.5V9a3 3 0 0 0-3-3h-3.379a3 3 0 0 1-2.121-.879L8.379 3.999A3 3 0 0 0 6.257 3.12H4.5A3 3 0 0 0 1.5 6.12V18a3 3 0 0 0 3 3h15Z" />
          </svg>
        </div>
        <p className="text-sm font-medium">暂无匹配项目</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(114px,126px))] gap-3.5 sm:gap-4 pt-1">
      {projectList.map((project) => (
        <MaterialProjectCard
          key={project.id}
          project={project}
          photos={project.photos}
          isSelected={selectedProjectIds.includes(project.id)}
          isBatchMode={Boolean(isBatchMode)}
          onToggleSelect={(id, e) => onToggleSelectProject?.(id, e)}
          onClick={onSelectProject}
        />
      ))}
    </div>
  );
}
