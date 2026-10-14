import { useMemo } from 'react';
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
}

export default function MaterialProjectView({
  sessions,
  canvasProjects,
  mergedTasks,
  searchKeyword,
  sortOrder,
  onSelectProject,
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
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-6 pt-2">
      {projectList.map((project) => (
        <button
          key={project.id}
          type="button"
          onClick={() => onSelectProject(project)}
          className="group flex flex-col items-center justify-center p-4 rounded-2xl bg-transparent hover:bg-slate-100/70 transition-all cursor-pointer text-center focus-visible:outline-2 focus-visible:outline-indigo-500"
        >
          {/* 紫色文件夹图标（对应图2高保真效果） */}
          <div className="relative flex h-24 w-28 items-center justify-center transition-transform duration-200 group-hover:scale-105">
            <svg
              viewBox="0 0 120 100"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              className="h-full w-full drop-shadow-xs"
            >
              {/* 后层文件夹 */}
              <path
                d="M12 28C12 22.4772 16.4772 18 22 18H44.5C48.2 18 51.6 20 53.4 23.3L56.5 29H98C103.523 29 108 33.4772 108 39V74C108 79.5228 103.523 84 98 84H22C16.4772 84 12 79.5228 12 74V28Z"
                fill="#DDD6FE"
              />
              {/* 前盖 */}
              <path
                d="M12 40C12 34.4772 16.4772 30 22 30H98C103.523 30 108 34.4772 108 40V74C108 79.5228 103.523 84 98 84H22C16.4772 84 12 79.5228 12 74V40Z"
                fill="#ECE8FC"
              />
              {/* 装饰折角高光 */}
              <path
                d="M22 30H98C103.523 30 108 34.4772 108 40V44H12V40C12 34.4772 16.4772 30 22 30Z"
                fill="#C4B5FD"
                fillOpacity="0.4"
              />
            </svg>
          </div>

          {/* 标题与素材数 */}
          <div className="mt-2.5 w-full px-1">
            <h3 className="truncate text-xs font-semibold text-slate-800 group-hover:text-slate-950">
              {project.title}
            </h3>
            <p className="mt-1 text-[11px] text-slate-400">
              {project.assetCount > 0 ? `${project.assetCount} 个素材` : '暂无素材'}
            </p>
          </div>
        </button>
      ))}
    </div>
  );
}
