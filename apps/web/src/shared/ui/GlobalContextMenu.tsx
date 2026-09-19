import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { ExternalLink, Download, Copy, Link2, Scissors, Clipboard, CheckSquare } from 'lucide-react';
import { openExternalUrl, fetchMediaBlob, downloadMediaOrOpen } from '@/lib/downloadMedia';

interface ContextMenuState {
  visible: boolean;
  x: number;
  y: number;
  type: 'image' | 'video' | 'selection' | 'input' | null;
  mediaUrl?: string;
  mediaAlt?: string;
  selectedText?: string;
  inputElement?: HTMLInputElement | HTMLTextAreaElement | null;
}

/** 智能清洗缩略图 URL 还原最高清原始资源 */
function cleanOriginalMediaUrl(rawUrl: string): string {
  if (!rawUrl) return '';
  try {
    const parsed = new URL(rawUrl, window.location.href);
    parsed.searchParams.delete('x-oss-process');
    parsed.searchParams.delete('thumb');
    parsed.searchParams.delete('width');
    parsed.searchParams.delete('height');
    return parsed.toString();
  } catch {
    return rawUrl.replace(/[?&]x-oss-process=[^&]+/, '').replace(/[?&]thumb=[^&]+/, '');
  }
}

/** 将图像 Blob 写入系统剪贴板（支持在微信/PS/飞书等处直接 Ctrl+V 粘贴） */
async function copyImageToClipboard(imageUrl: string): Promise<boolean> {
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

  useEffect(() => {
    const handleContextMenu = (e: MouseEvent) => {
      // 1. 无条件阻止浏览器 / WKWebView 默认右键菜单（彻底干掉检查元素、拷贝对象、查询、共享、自动填充等冗杂项）
      e.preventDefault();

      const target = e.target as HTMLElement | null;
      if (!target) return;

      // 2. 检查是否右键在可编辑文本框中 (input, textarea)
      if (
        (target instanceof HTMLInputElement && target.type !== 'range' && target.type !== 'checkbox') ||
        target instanceof HTMLTextAreaElement ||
        target.isContentEditable
      ) {
        const inputEl = target as HTMLInputElement | HTMLTextAreaElement;
        const selStart = inputEl.selectionStart ?? 0;
        const selEnd = inputEl.selectionEnd ?? 0;
        const hasSelection = selEnd > selStart;

        setMenu({
          visible: true,
          x: e.clientX,
          y: e.clientY,
          type: 'input',
          selectedText: hasSelection ? inputEl.value.slice(selStart, selEnd) : '',
          inputElement: inputEl,
        });
        return;
      }

      // 3. 检查是否有划选的文字
      const selectionText = window.getSelection()?.toString().trim();

      // 4. 检查是否命中图片（必须确实点击在 img 上，或点击在紧密覆盖该 img 的媒体卡片浮层上，绝不能在空白背景或画布视口容器中误触发）
      let mediaImg: HTMLImageElement | null = null;
      let customMediaUrl: string | null = null;

      // 如果点击发生在普通交互按钮或链接上，不触发媒体菜单
      const isInteractiveControl = Boolean(target.closest('button, a, select'));

      if (!isInteractiveControl) {
        // 4.1 直接点击了 img 元素
        if (target instanceof HTMLImageElement) {
          mediaImg = target;
        }

        // 4.2 物理坐标穿透检测 (支持遮罩层、角标、以及设置了 pointer-events-none 的图片)
        if (!mediaImg && typeof document.elementsFromPoint === 'function') {
          const hitElements = document.elementsFromPoint(e.clientX, e.clientY) || [];
          const underImg = hitElements.find(
            (el): el is HTMLImageElement => el instanceof HTMLImageElement
          );
          if (underImg) {
            mediaImg = underImg;
          }
        }

        // 4.3 紧凑卡片容器检测 (仅在处于明确的媒体卡片/节点内部时，且点击位于卡片区域内)
        if (!mediaImg) {
          const tightMediaCard = target.closest<HTMLElement>(
            '[data-media-url], [data-result-url], [data-media-card], .canvas-node-card, .group\\/media, figure'
          );
          if (tightMediaCard) {
            const rect = tightMediaCard.getBoundingClientRect?.();
            const inBounds =
              rect && rect.width > 0 && rect.height > 0
                ? e.clientX >= rect.left &&
                  e.clientX <= rect.right &&
                  e.clientY >= rect.top &&
                  e.clientY <= rect.bottom
                : true;

            if (inBounds) {
              customMediaUrl =
                tightMediaCard.getAttribute('data-media-url') ||
                tightMediaCard.getAttribute('data-result-url');

              if (!customMediaUrl) {
                // 仅查找该卡片范围内的图片，绝不跨越到外部或父级
                const childImg = tightMediaCard.querySelector('img');
                if (childImg) {
                  mediaImg = childImg;
                }
              }
            }
          }
        }
      }

      const candidateImgUrl = mediaImg?.currentSrc || mediaImg?.src || customMediaUrl;

      if (
        candidateImgUrl &&
        !candidateImgUrl.startsWith('data:image/svg') &&
        candidateImgUrl.trim() !== ''
      ) {
        setMenu({
          visible: true,
          x: e.clientX,
          y: e.clientY,
          type: 'image',
          mediaUrl: candidateImgUrl,
          mediaAlt: mediaImg?.alt || mediaImg?.title || '图像',
        });
        return;
      }

      // 5. 检查是否命中视频 (video 元素或带有明确视频播放卡片)
      let mediaVideo: HTMLVideoElement | null = null;

      if (!isInteractiveControl) {
        if (target instanceof HTMLVideoElement) {
          mediaVideo = target;
        }

        if (!mediaVideo && typeof document.elementsFromPoint === 'function') {
          const hitElements = document.elementsFromPoint(e.clientX, e.clientY) || [];
          const underVideo = hitElements.find(
            (el): el is HTMLVideoElement => el instanceof HTMLVideoElement
          );
          if (underVideo) {
            mediaVideo = underVideo;
          }
        }

        if (!mediaVideo) {
          const tightVideoCard = target.closest<HTMLElement>(
            '[data-video-url], [data-video-container], .canvas-node-card'
          );
          if (tightVideoCard) {
            const rect = tightVideoCard.getBoundingClientRect?.();
            const inBounds =
              rect && rect.width > 0 && rect.height > 0
                ? e.clientX >= rect.left &&
                  e.clientX <= rect.right &&
                  e.clientY >= rect.top &&
                  e.clientY <= rect.bottom
                : true;

            if (inBounds) {
              const childVideo = tightVideoCard.querySelector('video');
              if (childVideo) {
                mediaVideo = childVideo;
              }
            }
          }
        }
      }

      const candidateVideoUrl = mediaVideo?.currentSrc || mediaVideo?.src;
      if (candidateVideoUrl && candidateVideoUrl.trim() !== '') {
        setMenu({
          visible: true,
          x: e.clientX,
          y: e.clientY,
          type: 'video',
          mediaUrl: candidateVideoUrl,
          mediaAlt: '视频',
        });
        return;
      }

      // 6. 如果有划选的普通文字，提供复制
      if (selectionText) {
        setMenu({
          visible: true,
          x: e.clientX,
          y: e.clientY,
          type: 'selection',
          selectedText: selectionText,
        });
        return;
      }

      // 7. 空白处或普通 UI 按钮：直接静默屏蔽系统菜单，不弹出冗余杂项
      closeMenu();
    };

    const handlePointerDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        closeMenu();
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeMenu();
    };

    const handleWindowBlur = () => closeMenu();
    const handleScroll = () => closeMenu();

    document.addEventListener('contextmenu', handleContextMenu, { capture: true });
    window.addEventListener('pointerdown', handlePointerDown, { capture: true });
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('blur', handleWindowBlur);
    window.addEventListener('scroll', handleScroll, { capture: true, passive: true });

    return () => {
      document.removeEventListener('contextmenu', handleContextMenu, { capture: true });
      window.removeEventListener('pointerdown', handlePointerDown, { capture: true });
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('blur', handleWindowBlur);
      window.removeEventListener('scroll', handleScroll, { capture: true });
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, [closeMenu]);

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
