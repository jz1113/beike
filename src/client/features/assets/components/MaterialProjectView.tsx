import React, { useMemo, useState } from 'react';
import { Check } from 'lucide-react';
import { Folder } from '@client/shared/media/widgets/Folder';
import type { ChatSession } from '@client/store/types';
import type { AssetCanvasProject } from '../model/canvasAssets';
import type { AssetTaskBatch } from '../model/assetBatch';

type Task = AssetTaskBatch['tasks'][number];

export interface ProjectFolderItem {
  id: string;
  title: string;
  assetCount: number;
  type: 'session' | 'canvas';
  updatedAt?: number;
}

interface Props {
  sessions: ChatSession[];
  canvasProjects: AssetCanvasProject[];
  mergedTasks: Task[];
  searchKeyword: string;
  sortOrder: 'newest' | 'oldest' | 'name';
  onSelectProject: (project: ProjectFolderItem) => void;
  selectedProjectIds?: string[];
  isBatchMode?: boolean;
  onToggleSelectProject?: (id: string, e?: React.MouseEvent) => void;
  onDeleteProject?: (project: ProjectFolderItem) => void;
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
            ? 'bg-slate-900 text-white shadow-xs opacity-100'
            : isBatchMode
            ? 'border border-slate-300 bg-white/95 opacity-100 hover:bg-white text-transparent'
            : 'border border-slate-300 bg-white/90 opacity-0 group-hover:opacity-100 hover:bg-white text-transparent'
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
          className="truncate text-xs font-semibold text-slate-800 group-hover:text-slate-950"
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
  sessions,
  canvasProjects,
  mergedTasks,
  searchKeyword,
  sortOrder,
  onSelectProject,
  selectedProjectIds = [],
  isBatchMode = false,
  onToggleSelectProject,
}: Props) {
  // 聚合各项目素材统计
  const projectList = useMemo(() => {
    // 统计各 session 对应素材数
    const sessionCountMap = new Map<string, number>();
    for (const task of mergedTasks) {
      if (task.sessionId) {
        sessionCountMap.set(task.sessionId, (sessionCountMap.get(task.sessionId) || 0) + 1);
      }
    }

    const items: ProjectFolderItem[] = [];

    // 对话项目 / 创作项目
    for (const s of sessions) {
      const count = sessionCountMap.get(s.id) || s.tasks?.length || 0;
      items.push({
        id: s.id,
        title: s.title || '未命名项目',
        assetCount: count,
        type: 'session',
        updatedAt: s.updatedAt || s.createdAt || 0,
      });
    }

    // 画布项目
    for (const c of canvasProjects) {
      items.push({
        id: c.id,
        title: c.title || '未命名画布',
        assetCount: c.nodes?.length || 0,
        type: 'canvas',
        updatedAt: c.updatedAt || 0,
      });
    }

    // 搜索过滤
    const kw = searchKeyword.trim().toLowerCase();
    const filtered = kw ? items.filter((p) => p.title.toLowerCase().includes(kw)) : items;

    // 排序
    return filtered.sort((a, b) => {
      if (sortOrder === 'name') return a.title.localeCompare(b.title, 'zh-CN');
      if (sortOrder === 'oldest') return (a.updatedAt || 0) - (b.updatedAt || 0);
      return (b.updatedAt || 0) - (a.updatedAt || 0);
    });
  }, [sessions, canvasProjects, mergedTasks, searchKeyword, sortOrder]);

  // 提取各项目的最新素材照片供 3D 拟物折页文件夹预览（最多 3 张）
  const projectPhotosMap = useMemo(() => {
    const map = new Map<string, string[]>();

    // 1. 会话/对话项目素材
    for (const task of mergedTasks) {
      if (!task.sessionId) continue;
      const url = task.resultUrl || task.coverUrl;
      if (!url || task.status === 'FAILURE') continue;

      const list = map.get(task.sessionId);
      if (!list) {
        map.set(task.sessionId, [url]);
      } else if (list.length < 3 && !list.includes(url)) {
        list.push(url);
      }
    }

    // 2. 画布项目素材
    for (const canvas of canvasProjects) {
      const urls: string[] = [];
      if (canvas.thumbnail) urls.push(canvas.thumbnail);
      if (canvas.nodes) {
        for (const node of canvas.nodes) {
          if (urls.length >= 3) break;
          const nodeUrl = node.imageUrl || node.referenceImageUrl;
          if (nodeUrl && !urls.includes(nodeUrl)) {
            urls.push(nodeUrl);
          }
        }
      }
      if (urls.length > 0) {
        map.set(canvas.id, urls);
      }
    }

    return map;
  }, [mergedTasks, canvasProjects]);

  if (projectList.length === 0) {
    return (
      <div className="flex h-72 w-full flex-col items-center justify-center gap-3 text-slate-400">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-100 text-slate-300">
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
          photos={projectPhotosMap.get(project.id) || []}
          isSelected={selectedProjectIds.includes(project.id)}
          isBatchMode={Boolean(isBatchMode)}
          onToggleSelect={(id, e) => onToggleSelectProject?.(id, e)}
          onClick={onSelectProject}
        />
      ))}
    </div>
  );
}
