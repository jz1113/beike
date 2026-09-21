import { ChevronDown, Compass, FolderOpen, FolderPlus, Image as ImageIcon, Layout, Minus, Play, Plus, SquarePen, Video as VideoIcon } from 'lucide-react';
import { handleWindowDrag, handleWindowDoubleClick } from '@/shared/desktop/windowDrag';
import { CanvasUploadIcon, CanvasAssetFolderIcon } from '@/shared/icons';
import type { CanvasNode, CanvasProject } from '../types';
import type { RefObject } from 'react';

export interface CanvasEditorChromeProps {
  macOverlayPad: boolean;
  handleBackToHome: () => void;
  isEditingTitle: boolean;
  titleInputRef: RefObject<HTMLInputElement | null>;
  tempTitle: string;
  titleError: string;
  setTempTitle: (value: string) => void;
  setTitleError: (value: string) => void;
  skipTitleSaveOnBlurRef: { current: boolean };
  handleSaveTitle: () => void;
  handleCancelTitleEdit: () => void;
  displayProjectTitle: string;
  setIsEditingTitle: (value: boolean) => void;
  isTitleMenuOpen: boolean;
  setIsTitleMenuOpen: (value: boolean | ((prev: boolean) => boolean)) => void;
  createProject: () => void;
  projects: CanvasProject[];
  currentProject: CanvasProject;
  selectProject: (id: string | null) => void;
  nodes: CanvasProject['nodes'];
  handleResetView: () => void;
  handleZoom: (delta: number) => void;
  zoom: number;
  addNode: (projectId: string, node: Omit<CanvasNode, 'id' | 'createdAt'> & { id?: string; createdAt?: number }) => void;
  pan: { x: number; y: number };
  canvasViewportRef: RefObject<HTMLDivElement | null>;
  replacementNodeRef: { current: string | null };
  fileInputRef: RefObject<HTMLInputElement | null>;
  isAssetSubmenuOpen: boolean;
  setIsAssetSubmenuOpen: (value: boolean | ((prev: boolean) => boolean)) => void;
  handleOpenAssetModal: (type: 'image' | 'video') => void;
}

export function CanvasEditorChrome(p: CanvasEditorChromeProps) {
  const {
    macOverlayPad, handleBackToHome, isEditingTitle, titleInputRef, tempTitle, titleError,
    setTempTitle, setTitleError, skipTitleSaveOnBlurRef, handleSaveTitle, handleCancelTitleEdit,
    displayProjectTitle, setIsEditingTitle, isTitleMenuOpen, setIsTitleMenuOpen, createProject,
    projects, currentProject, selectProject, nodes, handleResetView,
    handleZoom, zoom, addNode, pan, canvasViewportRef, replacementNodeRef, fileInputRef,
    isAssetSubmenuOpen, setIsAssetSubmenuOpen, handleOpenAssetModal,
  } = p;
  return (
    <>
      {/* 顶栏：左上角贝壳 logo + 画板标题下拉 */}
      <header
        data-tauri-drag-region
        onMouseDown={handleWindowDrag}
        onDoubleClick={handleWindowDoubleClick}
        className={`canvas-fixed-ui relative w-full h-16 shrink-0 pr-4 sm:pr-6 bg-[#f6f8fc]/82 backdrop-blur-xl flex items-center justify-between z-30 select-none ${
          macOverlayPad ? 'pl-20' : 'pl-4 sm:pl-6'
        }`}
      >
        <div className="flex items-center gap-2 min-w-0">
          <button
            type="button"
            onClick={handleBackToHome}
            className="w-9 h-9 xl:w-10 xl:h-10 rounded-xl hover:bg-white/80 flex items-center justify-center transition-all group cursor-pointer active:scale-95 shrink-0"
            title="贝壳云图 · 返回首页"
          >
            <img
              src="/app_logo.png"
              alt="贝壳云图"
              draggable={false}
              className="w-8 h-8 xl:w-9 xl:h-9 object-contain drop-shadow-[0_2px_8px_rgba(239,68,68,0.3)] group-hover:scale-105 transition-transform"
            />
          </button>
          <div className="h-10 flex items-center gap-2.5">

          {/* 项目标题：双击直接改名，失焦或回车自动保存。 */}
          <div className="relative canvas-title-menu-container flex items-center">
            {isEditingTitle ? (
              <div className="relative flex items-center">
                <input
                  ref={titleInputRef}
                  type="text"
                  value={tempTitle}
                  maxLength={40}
                  aria-label="项目名称"
                  aria-invalid={Boolean(titleError)}
                  onChange={(e) => {
                    setTempTitle(e.target.value);
                    if (titleError) setTitleError('');
                  }}
                  onFocus={(e) => e.target.select()}
                  onBlur={() => {
                    if (skipTitleSaveOnBlurRef.current) {
                      skipTitleSaveOnBlurRef.current = false;
                      return;
                    }
                    handleSaveTitle();
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      e.currentTarget.blur();
                    }
                    if (e.key === 'Escape') {
                      e.preventDefault();
                      handleCancelTitleEdit();
                    }
                  }}
                  className={`text-xs sm:text-[13.5px] font-bold text-slate-900 px-1.5 py-0.5 -ml-1 rounded-md bg-white/80 focus:bg-white focus:outline-none focus:ring-2 min-w-[110px] max-w-[240px] ${
                    titleError ? 'ring-2 ring-rose-400/45 focus:ring-rose-400/45' : 'focus:ring-indigo-400/30'
                  }`}
                />
                {titleError && (
                  <p role="alert" className="absolute left-0 top-full mt-2 z-50 whitespace-nowrap rounded-lg bg-rose-50 px-2 py-1 text-[11px] font-medium text-rose-600 shadow-sm">
                    {titleError}
                  </p>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-0.5">
                <span
                  role="button"
                  tabIndex={0}
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    setTempTitle(displayProjectTitle);
                    setTitleError('');
                    setIsEditingTitle(true);
                    setIsTitleMenuOpen(false);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setTempTitle(displayProjectTitle);
                      setTitleError('');
                      setIsEditingTitle(true);
                      setIsTitleMenuOpen(false);
                    }
                  }}
                  className="block max-w-[240px] cursor-text truncate rounded-md px-1 -mx-1 text-[15px] font-bold leading-none text-slate-900 transition-colors hover:bg-white/75 focus:outline-none focus:ring-2 focus:ring-indigo-400/30"
                  title={`双击重命名：${displayProjectTitle}`}
                  aria-label={`项目名称：${displayProjectTitle}，双击重命名`}
                >
                  {displayProjectTitle}
                </span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsTitleMenuOpen(!isTitleMenuOpen);
                  }}
                  className="p-1 rounded-md hover:bg-white/80 text-slate-500 hover:text-slate-800 transition-colors cursor-pointer"
                  title="画板选项"
                >
                  <ChevronDown className="w-4 h-4 stroke-[2]" />
                </button>
              </div>
            )}

            {/* 标题下拉快捷浮层（完全对齐图 2 生成对话卡片式设计） */}
            {isTitleMenuOpen && (
              <div
                onClick={(e) => e.stopPropagation()}
                className="absolute left-0 top-full mt-3 w-80 bg-white/96 shadow-[0_16px_44px_rgba(15,23,42,0.14)] rounded-2xl p-2.5 z-50 flex flex-col gap-2 animate-in fade-in zoom-in-95 duration-150 select-none"
              >
                {/* 快捷新建画板按钮（对齐图 2：白底圆角卡片，加粗黑字与正方形线笔图标） */}
                <button
                  type="button"
                  onClick={() => {
                    createProject();
                    setIsTitleMenuOpen(false);
                  }}
                  className="w-full py-2.5 px-3.5 rounded-xl bg-slate-50 hover:bg-slate-100 active:bg-slate-200 transition-all text-slate-800 hover:text-slate-950 text-sm font-semibold flex items-center gap-2.5 cursor-pointer group"
                >
                  <SquarePen className="w-4.5 h-4.5 text-slate-600 group-hover:text-slate-950 shrink-0 stroke-[2]" />
                  <span>新建画板</span>
                </button>

                {/* 分组标识（对齐图 2：仅展示灰色的「最近」） */}
                <div className="px-2 pt-1 pb-0.5 text-xs font-medium text-slate-400">
                  最近
                </div>

                {/* 最近画板列表 */}
                <div className="max-h-[320px] overflow-y-auto space-y-1.5 pr-0.5 scrollbar-thin">
                  {projects.map((proj) => {
                    const isSelected = proj.id === currentProject?.id;
                    const cover =
                      proj.thumbnail ||
                      proj.nodes.find((n) => n.imageUrl)?.imageUrl ||
                      proj.nodes.find((n) => n.videoUrl)?.videoUrl;

                    return (
                      <div
                        key={proj.id}
                        onClick={() => {
                          selectProject(proj.id);
                          setIsTitleMenuOpen(false);
                        }}
                        className={`group relative w-full px-2.5 py-2 rounded-xl flex items-center gap-3 transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-slate-100 text-slate-900 font-semibold'
                            : 'hover:bg-slate-50 text-slate-700 font-medium'
                        }`}
                      >
                        {/* 画板 1:1 正方形封面海报 / 默认占位 */}
                        <div className="w-9 h-9 rounded-lg overflow-hidden bg-slate-100 shrink-0 flex items-center justify-center">
                          {cover ? (
                            <img src={cover} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <Layout className="w-4 h-4 text-slate-500" />
                          )}
                        </div>

                        {/* 画板标题 */}
                        <span
                          className={`flex-1 min-w-0 text-sm truncate leading-snug ${
                            isSelected ? 'text-slate-900 font-semibold' : 'text-slate-700'
                          }`}
                        >
                          {proj.title || '未命名画板'}
                        </span>
                      </div>
                    );
                  })}
                </div>

                {/* 底部快捷返回首页 */}
                <div className="pt-1">
                  <button
                    type="button"
                    onClick={handleBackToHome}
                    className="w-full flex items-center gap-2 px-3 py-2 hover:bg-slate-50 text-slate-500 hover:text-slate-900 rounded-xl text-left text-xs font-medium cursor-pointer transition-colors"
                  >
                    <FolderOpen className="w-3.5 h-3.5 text-slate-400" />
                    <span>返回首页</span>
                  </button>
                </div>
              </div>
            )}
          </div>
          <div className="hidden items-center gap-2 pl-2 text-xs sm:flex">
            <span className="text-slate-500">节点 {nodes.length}</span>
            <span className="text-slate-600">·</span>
            <span className="inline-flex items-center gap-1.5 text-slate-400"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />已保存</span>
          </div>
        </div>
        </div>

        {/* 顶栏右侧根据用户需求清空多余画框信息 */}
        <div className="flex items-center gap-2" />
      </header>

      {/* 🌟 2. 左侧垂直悬浮工具栏 (严格对照图 1 包含 4 个核心工具) */}
      <div className="canvas-fixed-ui fixed left-4 top-1/2 -translate-y-1/2 z-30 flex flex-col gap-1.5 p-1.5 rounded-2xl bg-white/84 backdrop-blur-md shadow-[0_10px_30px_rgba(71,85,105,0.13)]">
        <button type="button" title="添加文件节点" aria-label="添加文件节点" className="rounded-xl p-3 text-slate-600 hover:bg-slate-100 hover:text-slate-900" onClick={() => {
          if (!currentProject) return;
          addNode(currentProject.id, { type: 'file', title: '文件', x: (-pan.x + (canvasViewportRef.current?.clientWidth || 900) / 2) / zoom - 126, y: (-pan.y + (canvasViewportRef.current?.clientHeight || 600) / 2) / zoom - 126, width: 252, height: 252 });
        }}><FolderPlus className="h-5 w-5" /></button>
        {/* 🌟 按钮 1：本地上传 (图 1) */}
        <button
          type="button"
          onClick={() => { replacementNodeRef.current = null; fileInputRef.current?.click(); }}
          className="w-9 h-9 rounded-xl hover:bg-slate-100 text-slate-600 hover:text-slate-900 flex items-center justify-center transition-colors group relative cursor-pointer"
          title="本地上传"
        >
          {/* 上传图标 (对齐图 1 矢量向上箭头 + 托盘横线) */}
          <CanvasUploadIcon className="w-4 h-4 text-slate-600" />

          {/* 悬停浮现微气泡：白底黑字 本地上传 */}
          <span className="absolute left-full ml-2.5 px-2.5 py-1 rounded-lg bg-white text-slate-700 text-xs font-medium opacity-0 group-hover:opacity-100 transition-all duration-150 pointer-events-none whitespace-nowrap shadow-[0_4px_16px_rgba(71,85,105,0.16)] z-40">
            本地上传
          </span>
        </button>

        {/* 🌟 按钮 2：导入资产 (图 1 第 2 项) */}
        <div className="relative group/asset">
          <button
            type="button"
            onClick={() => {
              setIsAssetSubmenuOpen(!isAssetSubmenuOpen);
            }}
            onMouseEnter={() => setIsAssetSubmenuOpen(true)}
            className="w-9 h-9 rounded-xl hover:bg-slate-100 text-slate-600 hover:text-slate-900 flex items-center justify-center transition-colors relative cursor-pointer"
            title="导入资产"
          >
            <div className="relative flex items-center justify-center">
              {/* 折角资产文件夹图标 (对齐图 1) */}
              <CanvasAssetFolderIcon className="w-4 h-4 text-slate-600" />
              {/* 右侧微小折叠三角形箭头点缀 */}
              <span className="absolute -right-1 bottom-1 text-[7px] text-slate-500 leading-none">
                ▶
              </span>
            </div>

            {!isAssetSubmenuOpen && (
              <span className="absolute left-full ml-2.5 px-2.5 py-1 rounded-lg bg-white/98 text-slate-800 text-xs font-medium opacity-0 group-hover/asset:opacity-100 transition-all duration-150 pointer-events-none whitespace-nowrap shadow-[0_4px_16px_rgba(0,0,0,0.08)] border border-slate-200/90 z-40">
                导入资产
              </span>
            )}
          </button>

          {/* 侧拉二级菜单 (导入图片 / 导入视频) */}
          {isAssetSubmenuOpen && (
            <div
              onMouseEnter={() => setIsAssetSubmenuOpen(true)}
              onMouseLeave={() => setIsAssetSubmenuOpen(false)}
              className="absolute left-full ml-2 top-0 py-1.5 px-1 w-32 rounded-2xl bg-white/96 backdrop-blur-md shadow-[0_8px_24px_rgba(71,85,105,0.16)] z-50 flex flex-col gap-0.5 animate-in fade-in zoom-in-95 duration-150"
            >
              <button
                type="button"
                onClick={() => handleOpenAssetModal('image')}
                className="flex items-center gap-2.5 px-3 py-2 rounded-xl hover:bg-slate-100 text-slate-700 text-xs font-medium transition-colors text-left cursor-pointer"
              >
                <ImageIcon className="w-4 h-4 text-slate-600 stroke-[1.8]" />
                <span>导入图片</span>
              </button>

              <button
                type="button"
                onClick={() => handleOpenAssetModal('video')}
                className="flex items-center gap-2.5 px-3 py-2 rounded-xl hover:bg-slate-100 text-slate-700 text-xs font-medium transition-colors text-left cursor-pointer"
              >
                <VideoIcon className="w-4 h-4 text-slate-600 stroke-[1.8]" />
                <span>导入视频</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* 🌟 3. 左下角视口缩放与导航工具条 (严格对照图 2) */}
      <div className="canvas-fixed-ui absolute left-5 bottom-5 z-30 flex items-center gap-2 bg-white/84 backdrop-blur-md px-3 py-1.5 rounded-xl shadow-[0_8px_24px_rgba(71,85,105,0.12)] text-xs text-slate-700 select-none">
        <button
          type="button"
          onClick={handleResetView}
          className="w-5 h-5 flex items-center justify-center text-slate-500 hover:text-slate-900 transition-colors"
          title="复位视野"
        >
          <Compass className="w-3.5 h-3.5 stroke-[1.8]" />
        </button>

        <button
          type="button"
          onClick={() => handleZoom(-0.1)}
          className="w-5 h-5 flex items-center justify-center text-slate-500 hover:text-slate-900 transition-colors"
          title="缩小"
        >
          <Minus className="w-3.5 h-3.5 stroke-[2]" />
        </button>

        <span className="font-mono text-[11px] font-bold text-slate-800 min-w-8 text-center">
          {Math.round(zoom * 100)}%
        </span>

        <button
          type="button"
          onClick={() => handleZoom(0.1)}
          className="w-5 h-5 flex items-center justify-center text-slate-500 hover:text-slate-900 transition-colors"
          title="放大"
        >
          <Plus className="w-3.5 h-3.5 stroke-[2]" />
        </button>

        <button
          type="button"
          onClick={handleResetView}
          className="w-5 h-5 flex items-center justify-center text-slate-500 hover:text-slate-900 transition-colors"
          title="全景居中"
        >
          <Play className="w-3 h-3 fill-slate-500 stroke-slate-500" />
        </button>
      </div>


    </>
  );
}
