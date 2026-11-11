import { homeGenerationSettings } from '@client/shared/home-publish/homePublish';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Download, Copy, Home, Link2 } from 'lucide-react';
import { downloadMediaOrOpen, fetchMediaBlob } from '@client/shared/media/downloadMedia';
import { isMediaPublishedOnHome, publishMediaResult, unpublishMediaFromHome } from '@client/shared/home-publish/homePublish';
import { useAppStore } from '@client/store';
import { useCanvasStore } from '@client/features/canvas/store/useCanvasStore';

import { useGlobalContextMenuEvents, type ContextMenuState } from './useGlobalContextMenuEvents';

/** 智能清洗缩略图 URL 还原最高清原始资源 */
export function cleanOriginalMediaUrl(rawUrl: string): string {
  if (!rawUrl) return '';
  try {
    const base = typeof window !== 'undefined' ? window.location.href : 'http://local.invalid';
    const parsed = new URL(rawUrl, base);
    const wrapped = parsed.searchParams.get('url');
    if (wrapped && parsed.pathname.includes('proxy-image')) return cleanOriginalMediaUrl(wrapped);
    parsed.searchParams.delete('x-oss-process');
    parsed.searchParams.delete('thumb');
    parsed.searchParams.delete('width');
    parsed.searchParams.delete('height');
    parsed.searchParams.delete('w');
    return parsed.toString();
  } catch {
    return rawUrl.replace(/[?&]x-oss-process=[^&]+/, '').replace(/[?&]thumb=[^&]+/, '');
  }
}

/** 将图像 Blob 写入系统剪贴板（支持在微信/PS/飞书等处直接 Ctrl+V 粘贴） */
export async function copyImageToClipboard(imageUrl: string): Promise<boolean> {
  try {
    const blob = await fetchMediaBlob(imageUrl);
    let pngBlob = blob;

    // 现代浏览器与操作系统剪贴板对非 png 格式兼容较差，自动转换为标准 PNG Blob
    if (blob.type !== 'image/png') {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      const objUrl = URL.createObjectURL(blob);
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = reject;
        img.src = objUrl;
      });
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('无法初始化 Canvas 2D 绘图上下文');
      ctx.drawImage(img, 0, 0);
      URL.revokeObjectURL(objUrl);

      pngBlob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Canvas 转换 PNG 失败'))), 'image/png');
      });
    }

    if (navigator.clipboard && typeof navigator.clipboard.write === 'function') {
      await navigator.clipboard.write([
        new ClipboardItem({
          'image/png': pngBlob,
        }),
      ]);
      return true;
    }
  } catch (err) {
    console.warn('[GlobalContextMenu] 写入系统图像剪贴板失败，自动回退至复制链接:', err);
  }

  // 极端受限降级：复制图片直链
  try {
    await navigator.clipboard.writeText(imageUrl);
    return true;
  } catch {
    return false;
  }
}

function showcaseId(url: string) {
  let hash = 0;
  for (const char of url) hash = Math.imul(hash, 31) + char.charCodeAt(0) | 0;
  return `url-${(hash >>> 0).toString(36)}`;
}

function toggleHomeShowcase(rawUrl: string, kind: 'image' | 'video'): 'published' | 'removed' {
  const url = cleanOriginalMediaUrl(rawUrl);
  if (isMediaPublishedOnHome(url)) {
    unpublishMediaFromHome(url);
    return 'removed';
  }
  const store = useAppStore.getState();
  const task = [...store.generationTasks, ...store.sessions.flatMap(session => session.tasks)]
    .find(item => item.resultUrl && cleanOriginalMediaUrl(item.resultUrl) === url);
  if (task) {
    publishMediaResult({ id: task.id || task.taskId || showcaseId(url), prompt: task.prompt || '', title: task.title, url, mediaType: kind, settings: homeGenerationSettings(task) });
    return 'published';
  }
  for (const project of useCanvasStore.getState().projects) {
    const node = project.nodes.find(item =>
      (item.imageUrl && cleanOriginalMediaUrl(item.imageUrl) === url) || (item.videoUrl && cleanOriginalMediaUrl(item.videoUrl) === url));
    if (!node) continue;
    publishMediaResult({ id: `canvas-${node.id}`, prompt: node.content || '', title: node.title || project.title, url, mediaType: kind, settings: node.drawing ? {
      model: node.drawing.model, quality: node.drawing.quality, aspectRatio: node.drawing.aspect,
      imageQuality: node.drawing.generationQuality, videoDuration: node.drawing.duration, videoRefMode: node.drawing.refMode,
      referenceImages: node.drawing.references, generateAudio: node.drawing.audio, videoContextIrEnabled: node.drawing.contextIrEnabled,
    } : undefined });
    return 'published';
  }
  publishMediaResult({ id: showcaseId(url), prompt: '', url, mediaType: kind });
  return 'published';
}

export default function GlobalContextMenu() {
  const [menu, setMenu] = useState<ContextMenuState>({
    visible: false,
    x: 0,
    y: 0,
    type: null,
  });

  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const showToast = useCallback((msg: string) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToastMessage(msg);
    toastTimerRef.current = setTimeout(() => {
      setToastMessage(null);
    }, 2200);
  }, []);

  const closeMenu = useCallback(() => {
    setMenu((prev) => (prev.visible ? { ...prev, visible: false } : prev));
  }, []);

  useGlobalContextMenuEvents({ setMenu, closeMenu, menuRef });

  useEffect(() => () => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
  }, []);

  // 计算防止菜单溢出窗口边缘的自适应坐标
  let adjustedX = menu.x;
  let adjustedY = menu.y;
  if (typeof window !== 'undefined') {
    const menuWidth = 196;
    const menuHeight = menu.type === 'image' ? 172 : menu.type === 'video' ? 140 : 120;
    if (adjustedX + menuWidth > window.innerWidth - 12) {
      adjustedX = Math.max(12, window.innerWidth - menuWidth - 12);
    }
    if (adjustedY + menuHeight > window.innerHeight - 12) {
      adjustedY = Math.max(12, window.innerHeight - menuHeight - 12);
    }
  }

  const showcaseUrl = menu.mediaUrl ? cleanOriginalMediaUrl(menu.mediaUrl) : '';
  const showcasePublished = Boolean(showcaseUrl && isMediaPublishedOnHome(showcaseUrl));
  const showcaseLabel = menu.type === 'video'
    ? (showcasePublished ? '取消首页展示' : '设为首页展示视频')
    : (showcasePublished ? '取消首页展示' : '设为首页展示图');

  const handleToggleShowcase = () => {
    if (!menu.mediaUrl || (menu.type !== 'image' && menu.type !== 'video')) return;
    try {
      const published = toggleHomeShowcase(menu.mediaUrl, menu.type);
      closeMenu();
      showToast(published === 'removed' ? '已取消首页展示' : menu.type === 'video' ? '已设为首页展示视频' : '已设为首页展示图');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '首页展示保存失败');
    }
  };

  // 1. 下载图像/媒体
  const handleDownloadMedia = async () => {
    if (!menu.mediaUrl) return;
    const fullUrl = cleanOriginalMediaUrl(menu.mediaUrl);
    closeMenu();
    showToast(menu.type === 'video' ? '📥 开始下载视频…' : '📥 开始下载图像…');
    try {
      const ext = menu.type === 'video' ? 'mp4' : 'png';
      const cleanName = (menu.mediaAlt || `beike-${menu.type}-${Date.now()}`).slice(0, 30);
      const filename = `${cleanName}.${ext}`;
      await downloadMediaOrOpen(fullUrl, filename);
      showToast(menu.type === 'video' ? '✅ 视频已保存至下载目录' : '✅ 图像已保存至下载目录');
    } catch (err) {
      console.error('[GlobalContextMenu] 下载异常:', err);
      showToast('⚠️ 下载失败，已尝试在外部浏览器打开');
    }
  };

  // 3. 拷贝图像
  const handleCopyImage = async () => {
    if (!menu.mediaUrl) return;
    const fullUrl = cleanOriginalMediaUrl(menu.mediaUrl);
    closeMenu();
    showToast('⏳ 正在拷贝图像…');
    const success = await copyImageToClipboard(fullUrl);
    if (success) {
      showToast('✅ 图像已拷贝到剪贴板，可直接粘贴');
    } else {
      showToast('⚠️ 拷贝失败，请重试');
    }
  };

  // 4. 拷贝媒体链接
  const handleCopyMediaLink = async () => {
    if (!menu.mediaUrl) return;
    const fullUrl = cleanOriginalMediaUrl(menu.mediaUrl);
    closeMenu();
    try {
      await navigator.clipboard.writeText(fullUrl);
      showToast(menu.type === 'video' ? '🔗 已复制视频链接' : '🔗 已复制图像链接');
    } catch {
      showToast('⚠️ 复制链接失败');
    }
  };

  // 5. 拷贝选中文本
  const handleCopySelection = async () => {
    if (!menu.selectedText) return;
    closeMenu();
    try {
      await navigator.clipboard.writeText(menu.selectedText);
      showToast('📋 已复制所选内容');
    } catch {
      showToast('⚠️ 复制失败');
    }
  };

  if (typeof document === 'undefined') return null;

  return createPortal(
    <>
      {/* 优雅自消浮动轻提示 Toast */}
      {toastMessage && (
        <div className="fixed top-8 left-1/2 -translate-x-1/2 z-[1000000] pointer-events-none animate-in fade-in slide-in-from-top-3 duration-200">
          <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-900/90 text-white text-xs font-medium backdrop-blur-md shadow-xl border border-white/10">
            <span>{toastMessage}</span>
          </div>
        </div>
      )}

      {/* 现代极简右键浮层菜单 */}
      {menu.visible && (
        <div
          ref={menuRef}
          role="menu"
          aria-label="快捷操作菜单"
          style={{
            left: `${adjustedX}px`,
            top: `${adjustedY}px`,
          }}
          className="fixed z-[999999] min-w-[184px] bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl border border-slate-200/90 dark:border-slate-700/90 rounded-xl shadow-2xl p-1 text-[12.5px] text-slate-700 dark:text-slate-200 animate-in fade-in zoom-in-95 duration-100 select-none"
        >
          {/* 图像右键菜单：精准呈现保留项，彻底剔除无用项 */}
          {menu.type === 'image' && (
            <div className="space-y-0.5">
              <button
                type="button"
                onClick={handleToggleShowcase}
                className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-left hover:bg-blue-600 hover:text-white transition-colors duration-100 group"
              >
                <Home className="w-4 h-4 opacity-75 group-hover:opacity-100 shrink-0" />
                <span className="font-medium">{showcaseLabel}</span>
              </button>

              <button
                type="button"
                onClick={handleDownloadMedia}
                className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-left hover:bg-blue-600 hover:text-white transition-colors duration-100 group"
              >
                <Download className="w-4 h-4 opacity-75 group-hover:opacity-100 shrink-0" />
                <span className="font-medium">下载图像</span>
              </button>

              <button
                type="button"
                onClick={handleCopyImage}
                className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-left hover:bg-blue-600 hover:text-white transition-colors duration-100 group"
              >
                <Copy className="w-4 h-4 opacity-75 group-hover:opacity-100 shrink-0" />
                <span className="font-medium">拷贝图像</span>
              </button>

              <div className="h-px bg-slate-200/70 dark:bg-slate-700/70 my-1 mx-1" />

              <button
                type="button"
                onClick={handleCopyMediaLink}
                className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-left hover:bg-blue-600 hover:text-white transition-colors duration-100 group text-slate-600 dark:text-slate-300"
              >
                <Link2 className="w-4 h-4 opacity-75 group-hover:opacity-100 shrink-0" />
                <span>拷贝图像链接</span>
              </button>
            </div>
          )}

          {/* 视频右键菜单 */}
          {menu.type === 'video' && (
            <div className="space-y-0.5">
              <button
                type="button"
                onClick={handleToggleShowcase}
                className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-left hover:bg-blue-600 hover:text-white transition-colors duration-100 group"
              >
                <Home className="w-4 h-4 opacity-75 group-hover:opacity-100 shrink-0" />
                <span className="font-medium">{showcaseLabel}</span>
              </button>

              <button
                type="button"
                onClick={handleDownloadMedia}
                className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-left hover:bg-blue-600 hover:text-white transition-colors duration-100 group"
              >
                <Download className="w-4 h-4 opacity-75 group-hover:opacity-100 shrink-0" />
                <span className="font-medium">下载视频</span>
              </button>

              <div className="h-px bg-slate-200/70 dark:bg-slate-700/70 my-1 mx-1" />

              <button
                type="button"
                onClick={handleCopyMediaLink}
                className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-left hover:bg-blue-600 hover:text-white transition-colors duration-100 group text-slate-600 dark:text-slate-300"
              >
                <Link2 className="w-4 h-4 opacity-75 group-hover:opacity-100 shrink-0" />
                <span>拷贝视频链接</span>
              </button>
            </div>
          )}

          {/* 选中文本快捷菜单 */}
          {menu.type === 'selection' && (
            <div className="space-y-0.5">
              <button
                type="button"
                onClick={handleCopySelection}
                className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-left hover:bg-blue-600 hover:text-white transition-colors duration-100 group"
              >
                <Copy className="w-4 h-4 opacity-75 group-hover:opacity-100 shrink-0" />
                <span className="font-medium">拷贝</span>
              </button>
            </div>
          )}


        </div>
      )}
    </>,
    document.body
  );
}
