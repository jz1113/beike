import { useState, useEffect, useLayoutEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Check, AlertCircle } from 'lucide-react';
import { ApiaLogo, OneBoundLogo, QiyunLogo } from '@client/shared/icons';
import { credentialGet } from '@client/shared/api/credentialClient';
import {
  getExternalScraperCredentials,
  setPreferredScraper,
  getPreferredScraperSync,
  type PreferredScraper,
} from '@client/shared/utils/externalScraperCredentials';

export type ScraperEngine = PreferredScraper;

interface Props {
  value?: ScraperEngine;
  onChange?: (engine: ScraperEngine) => void;
  className?: string;
}

interface MenuPosition {
  top: number;
  left: number;
  maxHeight: number;
}

export default function ScraperEngineSelector({ value, onChange, className = '' }: Props) {
  const [engine, setEngine] = useState<ScraperEngine>(() => value ?? getPreferredScraperSync());
  const [isOpen, setIsOpen] = useState(false);
  const [hasApiaCreds, setHasApiaCreds] = useState(true);
  const [hasQiyunCreds, setHasQiyunCreds] = useState(true);
  const [hasWanbangCreds, setHasWanbangCreds] = useState(true);
  const [menuPos, setMenuPos] = useState<MenuPosition | null>(null);
  const anchorRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (value !== undefined) {
      setEngine(value);
    }
  }, [value]);

  useEffect(() => {
    let active = true;
    void Promise.all([
      getExternalScraperCredentials(),
      credentialGet('wanbang_api_key'),
      credentialGet('wanbang_api_secret'),
    ]).then(([creds, wanbangKey, wanbangSecret]) => {
      if (!active) return;
      setHasApiaCreds(Boolean(creds.scraperId && creds.scraperSecret));
      setHasQiyunCreds(Boolean(creds.qiyunAppId && creds.qiyunAppKey));
      setHasWanbangCreds(Boolean(wanbangKey.trim() && wanbangSecret.trim()));
    });
    return () => {
      active = false;
    };
  }, []);

  useLayoutEffect(() => {
    if (!isOpen) {
      setMenuPos(null);
      return;
    }
    const update = () => {
      const anchor = anchorRef.current;
      const panel = panelRef.current;
      if (!anchor || !panel) return;
      const rect = anchor.getBoundingClientRect();
      const margin = 8;
      const width = panel.offsetWidth;
      const left = Math.min(Math.max(rect.left, margin), Math.max(margin, window.innerWidth - width - margin));
      const top = rect.bottom + margin;
      setMenuPos({ top, left, maxHeight: Math.max(160, window.innerHeight - top - margin) });
    };
    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handleOutsideClick = (event: PointerEvent) => {
      const target = event.target as Node;
      if (anchorRef.current?.contains(target) || panelRef.current?.contains(target)) return;
      setIsOpen(false);
    };
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsOpen(false);
    };
    document.addEventListener('pointerdown', handleOutsideClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('pointerdown', handleOutsideClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [isOpen]);

  const selectEngine = (selected: ScraperEngine) => {
    setEngine(selected);
    setPreferredScraper(selected);
    onChange?.(selected);
    setIsOpen(false);
  };

  const getEngineBadge = () => {
    if (engine === 'apia') {
      return (
        <span className="flex items-center gap-1.5 font-semibold text-slate-800 dark:text-slate-100">
          <span className="flex h-4 w-4 shrink-0 items-center justify-center">
            <ApiaLogo className="h-3.5 w-3.5" />
          </span>
          <span className="truncate">APIA 图集解析</span>
        </span>
      );
    }
    if (engine === 'qiyun') {
      return (
        <span className="flex items-center gap-1.5 font-semibold text-slate-800 dark:text-slate-100">
          <span className="flex h-4 w-4 shrink-0 items-center justify-center">
            <QiyunLogo className="h-3.5 w-3.5" />
          </span>
          <span className="truncate">奇云解析</span>
        </span>
      );
    }
    if (engine === 'wanbang') {
      return (
        <span className="flex items-center gap-1.5 font-semibold text-slate-800 dark:text-slate-100">
          <span className="flex h-4 w-4 shrink-0 items-center justify-center overflow-hidden rounded-md">
            <OneBoundLogo className="h-4 w-4" />
          </span>
          <span className="truncate">万邦解析</span>
        </span>
      );
    }
    return (
      <span className="truncate font-semibold text-slate-800 dark:text-slate-100">自动调度解析</span>
    );
  };

  const menu = isOpen ? (
    <div
      ref={panelRef}
      role="listbox"
      aria-label="选择社媒解析服务接口"
      style={menuPos
        ? { top: menuPos.top, left: menuPos.left, maxHeight: menuPos.maxHeight, visibility: 'visible' }
        : { top: 0, left: 0, visibility: 'hidden' }}
      className="fixed z-[70] w-64 overflow-y-auto rounded-2xl border border-slate-200/90 dark:border-white/10 bg-white/95 dark:bg-[#1C1C20]/95 p-1.5 shadow-2xl backdrop-blur-xl text-xs"
    >
      <div className="px-2.5 py-1.5 text-[11px] font-bold text-slate-400 dark:text-slate-500 border-b border-slate-100 dark:border-white/5 mb-1">
        社媒与外站解析接口切换
      </div>
      <div className="flex flex-col gap-0.5">
        <EngineChoice
          selected={engine === 'auto'}
          onSelect={() => selectEngine('auto')}
          title="自动智能调度"
          detail="电商走万邦，社媒按平台分流互备"
        />
        <EngineChoice
          selected={engine === 'wanbang'}
          onSelect={() => selectEngine('wanbang')}
          title="万邦解析"
          detail="京东、淘宝、1688、拼多多商品图"
          missing={!hasWanbangCreds}
          icon={(
            <span className="flex h-5 w-5 shrink-0 items-center justify-center overflow-hidden rounded-lg">
              <OneBoundLogo className="h-5 w-5" />
            </span>
          )}
        />
        <EngineChoice
          selected={engine === 'apia'}
          onSelect={() => selectEngine('apia')}
          title="APIA 图集解析"
          detail="小红书、抖音、快手图集视频"
          missing={!hasApiaCreds}
          icon={(
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-lg bg-white dark:bg-white/10 shadow-2xs border border-slate-200/60 dark:border-white/10">
              <ApiaLogo className="h-3.5 w-3.5" />
            </span>
          )}
        />
        <EngineChoice
          selected={engine === 'qiyun'}
          onSelect={() => selectEngine('qiyun')}
          title="奇云解析"
          detail="30+主流平台、视频号去水印"
          missing={!hasQiyunCreds}
          icon={(
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200/60 dark:border-emerald-500/20">
              <QiyunLogo className="h-3.5 w-3.5" />
            </span>
          )}
        />
      </div>
    </div>
  ) : null;

  return (
    <div className={`relative inline-block text-left ${className}`}>
      <button
        ref={anchorRef}
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        title="选择外站与社媒解析使用的接口服务"
        className="inline-flex h-9 items-center gap-2 rounded-xl border border-slate-200/90 dark:border-white/10 bg-white/70 dark:bg-white/5 px-2.5 py-1.5 text-xs transition-all hover:bg-white dark:hover:bg-white/10 hover:border-slate-300 dark:hover:border-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
      >
        <span className="text-[11px] font-medium text-slate-400 dark:text-slate-500">接口</span>
        {getEngineBadge()}
        <ChevronDown
          className={`h-3.5 w-3.5 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          aria-hidden="true"
        />
      </button>
      {menu && typeof document !== 'undefined' ? createPortal(menu, document.body) : null}
    </div>
  );
}

function EngineChoice({
  selected,
  onSelect,
  icon,
  title,
  detail,
  missing = false,
}: {
  selected: boolean;
  onSelect: () => void;
  icon?: ReactNode;
  title: string;
  detail: string;
  missing?: boolean;
}) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      onClick={onSelect}
      className={`w-full text-left rounded-xl p-2 flex items-center justify-between transition-colors ${
        selected
          ? 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-950 dark:text-indigo-100 font-bold'
          : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100/80 dark:hover:bg-white/5'
      }`}
    >
      <div className="flex items-center gap-2 min-w-0">
        {icon}
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="font-semibold text-slate-900 dark:text-white">{title}</span>
            {missing && (
              <span className="inline-flex items-center gap-0.5 text-[9px] text-amber-500 font-normal">
                <AlertCircle className="w-2.5 h-2.5" />
                未配Key
              </span>
            )}
          </div>
          <div className="text-[10px] text-slate-400 dark:text-slate-500">{detail}</div>
        </div>
      </div>
      {selected && <Check className="h-4 w-4 text-indigo-600 shrink-0 ml-1" />}
    </button>
  );
}
