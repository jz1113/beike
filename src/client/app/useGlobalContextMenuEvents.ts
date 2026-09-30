import { useEffect, type Dispatch, type RefObject, type SetStateAction } from 'react';
import type { ContextMenuState } from './contextMenuTypes';

interface ContextMenuEventOptions {
  setMenu: Dispatch<SetStateAction<ContextMenuState>>;
  closeMenu: () => void;
  menuRef: RefObject<HTMLDivElement | null>;
}

export function useGlobalContextMenuEvents({
  setMenu, closeMenu, menuRef,
}: ContextMenuEventOptions) {
  useEffect(() => {
    const handleContextMenu = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest('[data-prompt-folder-rename-input]')) {
        closeMenu();
        return;
      }
      // 文件夹名称的原位编辑保留浏览器文本菜单，其余区域使用应用菜单。
      e.preventDefault();

      if (!target) return;
      // 文件夹视图自己提供“重命名 / 新建文件夹”菜单；预览图不能抢成图片菜单。
      if (target.closest('[data-prompt-folder-area], [data-prompt-library-context]')) {
        closeMenu();
        return;
      }

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
    };
  }, [closeMenu, setMenu, menuRef]);

}
