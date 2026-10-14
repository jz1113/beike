import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { ExternalLink, Download, Copy, Link2, Scissors, Clipboard, CheckSquare } from 'lucide-react';
import { openExternalUrl, downloadMediaOrOpen } from '@client/shared/media/downloadMedia';

import type { ContextMenuState } from './contextMenuTypes';
import { cleanOriginalMediaUrl, copyImageToClipboard } from './contextMenuMedia';
import { useGlobalContextMenuEvents } from './useGlobalContextMenuEvents';

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

  // 1. 在新窗口中打开图像/媒体
  const handleOpenInNewWindow = async () => {
    if (!menu.mediaUrl) return;
    const fullUrl = cleanOriginalMediaUrl(menu.mediaUrl);
    closeMenu();
    try {
      await openExternalUrl(fullUrl);
    } catch {
      window.open(fullUrl, '_blank', 'noopener,noreferrer');
    }
  };

  // 2. 下载图像/媒体
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

  // 6. 输入框操作：剪切
  const handleInputCut = async () => {
    if (!menu.inputElement) return;
    const el = menu.inputElement;
    const selStart = el.selectionStart ?? 0;
    const selEnd = el.selectionEnd ?? 0;
    if (selEnd > selStart) {
      const cutText = el.value.slice(selStart, selEnd);
      await navigator.clipboard.writeText(cutText);
      el.setRangeText('', selStart, selEnd, 'end');
      el.dispatchEvent(new Event('input', { bubbles: true }));
      showToast('✂️ 已剪切');
    }
    closeMenu();
  };

  // 7. 输入框操作：粘贴
  const handleInputPaste = async () => {
    if (!menu.inputElement) return;
    const el = menu.inputElement;
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        const selStart = el.selectionStart ?? el.value.length;
        const selEnd = el.selectionEnd ?? el.value.length;
        el.setRangeText(text, selStart, selEnd, 'end');
        el.dispatchEvent(new Event('input', { bubbles: true }));
        showToast('📋 已粘贴');
      }
    } catch (err) {
      console.warn('Clipboard read failed:', err);
    }
    closeMenu();
  };

  // 8. 输入框操作：全选
  const handleInputSelectAll = () => {
    if (menu.inputElement) {
      menu.inputElement.select();
    }
    closeMenu();
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
                onClick={handleOpenInNewWindow}
                className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-left hover:bg-blue-600 hover:text-white transition-colors duration-100 group"
              >
                <ExternalLink className="w-4 h-4 opacity-75 group-hover:opacity-100 shrink-0" />
                <span className="font-medium">在新窗口中打开图像</span>
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
                onClick={handleOpenInNewWindow}
                className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-left hover:bg-blue-600 hover:text-white transition-colors duration-100 group"
              >
                <ExternalLink className="w-4 h-4 opacity-75 group-hover:opacity-100 shrink-0" />
                <span className="font-medium">在新窗口中打开视频</span>
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

          {/* 输入框快捷菜单 */}
          {menu.type === 'input' && (
            <div className="space-y-0.5">
              {menu.selectedText ? (
                <>
                  <button
                    type="button"
                    onClick={handleInputCut}
                    className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-left hover:bg-blue-600 hover:text-white transition-colors duration-100 group"
                  >
                    <Scissors className="w-4 h-4 opacity-75 group-hover:opacity-100 shrink-0" />
                    <span>剪切</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleCopySelection}
                    className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-left hover:bg-blue-600 hover:text-white transition-colors duration-100 group"
                  >
                    <Copy className="w-4 h-4 opacity-75 group-hover:opacity-100 shrink-0" />
                    <span>拷贝</span>
                  </button>
                </>
              ) : null}

              <button
                type="button"
                onClick={handleInputPaste}
                className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-left hover:bg-blue-600 hover:text-white transition-colors duration-100 group"
              >
                <Clipboard className="w-4 h-4 opacity-75 group-hover:opacity-100 shrink-0" />
                <span>粘贴</span>
              </button>

              <div className="h-px bg-slate-200/70 dark:bg-slate-700/70 my-1 mx-1" />

              <button
                type="button"
                onClick={handleInputSelectAll}
                className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-left hover:bg-blue-600 hover:text-white transition-colors duration-100 group text-slate-600 dark:text-slate-300"
              >
                <CheckSquare className="w-4 h-4 opacity-75 group-hover:opacity-100 shrink-0" />
                <span>全选</span>
              </button>
            </div>
          )}
        </div>
      )}
    </>,
    document.body
  );
}
