import React, { useState, useRef, useEffect, type RefObject } from 'react';
import { Info } from 'lucide-react';

interface PromptBarUploadMenuProps {
  isOpen: boolean;
  onClose: () => void;
  triggerRef: RefObject<HTMLElement | null>;
  onTriggerLocalUpload: () => void;
  onOpenAssetLibrary: () => void;
  onSubmitVideoUrl?: (url: string) => void;
  isUp?: boolean;
}

export default function PromptBarUploadMenu({
  isOpen,
  onClose,
  triggerRef,
  onTriggerLocalUpload,
  onOpenAssetLibrary,
  onSubmitVideoUrl,
  isUp = true,
}: PromptBarUploadMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  // 状态模式：主菜单 | 视频链接气泡
  const [activeView, setActiveView] = useState<'main' | 'videoUrl'>('main');

  // 视频链接输入状态
  const [videoUrlText, setVideoUrlText] = useState('');

  // 点击外部与 ESC 按键自动关闭
  useEffect(() => {
    if (!isOpen) {
      setActiveView('main');
      setVideoUrlText('');
      return;
    }

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        menuRef.current &&
        !menuRef.current.contains(target) &&
        triggerRef.current &&
        !triggerRef.current.contains(target)
      ) {
        onClose();
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose, triggerRef]);

  if (!isOpen) return null;

  const handleConfirmUrl = () => {
    if (videoUrlText.trim() && onSubmitVideoUrl) {
      onSubmitVideoUrl(videoUrlText.trim());
      setVideoUrlText('');
      onClose();
    }
  };

  // 视频链接上传形式浮层
  if (activeView === 'videoUrl') {
    return (
      <div
        ref={menuRef}
        className={`absolute left-0 ${
          isUp ? 'bottom-full mb-2 origin-bottom-left' : 'top-full mt-2 origin-top-left'
        } w-[360px] sm:w-[400px] rounded-[22px] bg-white dark:bg-[#18191c] border border-slate-200/80 dark:border-white/10 shadow-[0_20px_50px_rgba(0,0,0,0.12)] dark:shadow-[0_20px_50px_rgba(0,0,0,0.45)] p-4 z-50 animate-fade-in text-left select-none`}
      >
        <div className="text-[13px] text-slate-700 dark:text-slate-200 pb-3 flex items-center flex-wrap gap-1">
          <span>你也可以</span>
          <button
            type="button"
            onClick={() => {
              onClose();
              onTriggerLocalUpload();
            }}
            className="text-indigo-600 hover:text-indigo-700 hover:underline font-medium cursor-pointer transition-colors"
          >
            从本地上传
          </button>
        </div>

        {/* 胶囊输入行与确认按钮 */}
        <div className="flex items-center gap-2">
          <input
            type="url"
            placeholder="请输入参考内容的链接"
            value={videoUrlText}
            onChange={(e) => setVideoUrlText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleConfirmUrl();
              if (e.key === 'Escape') setActiveView('main');
            }}
            className="flex-1 px-4 py-2 rounded-full border border-slate-300 dark:border-white/15 text-xs text-slate-800 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:border-slate-500 dark:focus:border-white/30 focus:ring-1 focus:ring-slate-400 transition-all bg-white dark:bg-white/5"
            autoFocus
          />
          <button
            type="button"
            onClick={handleConfirmUrl}
            disabled={!videoUrlText.trim()}
            className={`px-5 py-2 rounded-full text-xs font-medium transition-all ${
              videoUrlText.trim()
                ? 'bg-slate-900 text-white hover:bg-black dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100 cursor-pointer shadow-xs'
                : 'bg-slate-100 text-slate-400 dark:bg-white/10 dark:text-slate-500 cursor-not-allowed'
            }`}
          >
            确认
          </button>
        </div>
      </div>
    );
  }

  // 标准主菜单
  return (
    <div
      ref={menuRef}
      className={`absolute left-0 ${
        isUp ? 'bottom-full mb-2 origin-bottom-left' : 'top-full mt-2 origin-top-left'
      } w-[168px] sm:w-[176px] rounded-[22px] bg-white dark:bg-[#18191c] border border-slate-200/80 dark:border-white/10 shadow-[0_16px_40px_rgba(0,0,0,0.08),0_2px_8px_rgba(0,0,0,0.04)] dark:shadow-[0_16px_40px_rgba(0,0,0,0.45)] p-1.5 z-50 animate-fade-in text-left select-none`}
    >
      <button
        type="button"
        onClick={() => {
          onClose();
          onTriggerLocalUpload();
        }}
        className="w-full px-3 py-2 rounded-xl text-[13px] font-normal text-slate-800 dark:text-slate-100 hover:text-slate-950 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-white/10 flex items-center transition-colors cursor-pointer"
      >
        <span>本地上传</span>
      </button>

      <button
        type="button"
        onClick={() => {
          onClose();
          onOpenAssetLibrary();
        }}
        className="w-full px-3 py-2 rounded-xl text-[13px] font-normal text-slate-800 dark:text-slate-100 hover:text-slate-950 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-white/10 flex items-center transition-colors cursor-pointer"
      >
        <span>资产库</span>
      </button>

      <button
        type="button"
        onClick={() => setActiveView('videoUrl')}
        className="w-full px-3 py-2 rounded-xl text-[13px] font-normal text-slate-800 dark:text-slate-100 hover:text-slate-950 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-white/10 flex items-center justify-between transition-colors cursor-pointer group"
      >
        <span>视频链接上传</span>
        <span title="支持视频链接解析引用">
          <Info className="w-4 h-4 text-slate-400 group-hover:text-slate-600 stroke-[1.8] transition-colors" />
        </span>
      </button>
    </div>
  );
}
