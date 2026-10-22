import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useSyncExternalStore } from 'react';
import type { PetPose, PetSpriteVersion } from '@shared/domain/pets/atlas';
import { pointerLookIndex } from '@shared/domain/pets/atlas';
import { resolvePetPose } from '@shared/domain/pets/activity';
import { useFileDropZone } from '@client/shared/hooks/useFileDropZone';
import { useMediaQuery } from '@client/shared/hooks/useMediaQuery';
import { useAppStore } from '@client/store';
import { BeikePet } from '@client/shared/pets/BeikePet';
import { getPetFeed, subscribePetFeed } from '@client/shared/pets/petFeed';
import { PET_SIZES, beikePhaseFor, updatePetPreferences, usePetPreferences } from '@client/shared/pets/petPreferences';
import { petSheetURL } from '@client/shared/pets/petClient';
import { petStackLayout, type PetFloatBox, type PetFloatPlacement } from '@client/shared/pets/petGeometry';
import { PetSprite } from '@client/shared/pets/PetSprite';
import { usePetAnchor } from '@client/shared/pets/usePetAnchor';
import { getUsageSummary, USAGE_LOG_EVENT } from '@client/shared/utils/usageTracker';

const CHIP_BOX: PetFloatBox = { width: 144, height: 28 };
const MENU_BOX: PetFloatBox = { width: 176, height: 96 };
const menuItemClass = 'block w-full px-3 py-2 text-left hover:bg-slate-50 dark:hover:bg-white/5';

function usePetFlash() {
  const [flash, setFlash] = useState<PetPose | null>(null);
  useEffect(() => {
    let timer = 0;
    const onDone = (event: Event) => {
      const status = (event as CustomEvent<{ updates?: { status?: string } }>).detail?.updates?.status;
      const next = status === 'SUCCESS' || status === 'COMPLETED' ? 'success' : status === 'FAILURE' || status === 'FAILED' ? 'failed' : null;
      if (!next) return;
      setFlash(next);
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setFlash(null), 1600);
    };
    window.addEventListener('azhuo:generation-completed', onDone);
    return () => { window.removeEventListener('azhuo:generation-completed', onDone); window.clearTimeout(timer); };
  }, []);
  return flash;
}

const emptyToday = { prompt: 0, completion: 0, total: 0 };
let todaySnapshot = emptyToday;

function readTodayTokens() {
  const summary = getUsageSummary('today');
  if (summary.promptTokens === todaySnapshot.prompt && summary.completionTokens === todaySnapshot.completion && summary.totalTokens === todaySnapshot.total) return todaySnapshot;
  todaySnapshot = { prompt: summary.promptTokens, completion: summary.completionTokens, total: summary.totalTokens };
  return todaySnapshot;
}

function subscribeTodayTokens(listener: () => void) {
  window.addEventListener(USAGE_LOG_EVENT, listener);
  return () => window.removeEventListener(USAGE_LOG_EVENT, listener);
}

function useTodayTokens() {
  return useSyncExternalStore(subscribeTodayTokens, readTodayTokens, () => emptyToday);
}

function tokenText(value: number) {
  return value.toLocaleString('zh-CN');
}

function floatStyle(place: PetFloatPlacement | undefined) {
  return place ? { left: place.left, top: place.top } : undefined;
}

export function AppPetHost() {
  const preferences = usePetPreferences();
  const feed = useSyncExternalStore(subscribePetFeed, getPetFeed, () => null);
  const today = useTodayTokens();
  const busy = useAppStore((state) => state.generationTasks.some((task) => task.status === 'IN_PROGRESS'));
  const settingsOpen = useAppStore((state) => state.currentView === 'settings');
  const flash = usePetFlash();
  const reduced = useMediaQuery('(prefers-reduced-motion: reduce)');
  const [menu, setMenu] = useState(false);
  const [look, setLook] = useState<number | null>(null);
  const [sheet, setSheet] = useState<{ id: string; url: string } | null>(null);
  const [version, setVersion] = useState<PetSpriteVersion>(2);
  const [floats, setFloats] = useState({ chip: CHIP_BOX, menu: MENU_BOX });
  const menuRef = useRef<HTMLDivElement>(null);
  const chipRef = useRef<HTMLButtonElement>(null);
  const pose = resolvePetPose({ feedPhase: feed?.phase, flash, busy });
  const shown = preferences.visible && preferences.petId !== 'none' && !settingsOpen;
  const sprite = preferences.petId !== 'beike';
  const anchor = usePetAnchor(Boolean(shown && feed?.enabled && feed.open), () => { setMenu(false); feed?.setOpen(false); });
  const size = PET_SIZES[preferences.size];
  const drop = useFileDropZone({
    onFiles: (files) => { if (feed?.enabled) feed.onFiles(files); },
    disabled: !feed?.enabled || feed.phase === 'uploading' || feed.phase === 'analyzing',
  });
  const chipBox = feed?.enabled ? floats.chip : null;
  const menuBox = menu ? floats.menu : null;
  const placed = anchor.frame ? petStackLayout(anchor.frame.point, anchor.frame.size, anchor.frame.bounds, [chipBox, menuBox].filter((box): box is PetFloatBox => Boolean(box))) : [];
  const chipPlace = chipBox ? placed[0] : undefined;
  const menuPlace = menuBox ? placed[chipBox ? 1 : 0] : undefined;

  useEffect(() => { if (!shown) setMenu(false); }, [shown]);
  useEffect(() => { if (sprite) feed?.onDragging(drop.isDragging); }, [drop.isDragging, feed, sprite]);
  useEffect(() => {
    if (!sprite || !shown) return undefined;
    let cancel = false;
    petSheetURL(preferences.petId).then((url) => {
      if (!cancel) setSheet((current) => current?.id === preferences.petId && current.url === url ? current : { id: preferences.petId, url });
    }).catch(() => { if (!cancel) setSheet(null); });
    return () => { cancel = true; };
  }, [preferences.petId, sprite, shown]);
  useEffect(() => {
    if (!shown || pose !== 'idle' || reduced || version !== 2 || !sprite) { setLook(null); return undefined; }
    const track = (event: PointerEvent) => {
      const rect = anchor.anchorRef.current?.getBoundingClientRect();
      if (!rect) return;
      const next = pointerLookIndex(event.clientX - (rect.left + rect.width / 2), event.clientY - (rect.top + rect.height / 2), 72);
      setLook((current) => current === next ? current : next);
    };
    window.addEventListener('pointermove', track);
    return () => window.removeEventListener('pointermove', track);
  }, [shown, pose, reduced, version, sprite, anchor.anchorRef]);
  useEffect(() => {
    if (!menu) return undefined;
    const close = (event: Event) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (menuRef.current?.contains(target) || anchor.anchorRef.current?.contains(target)) return;
      setMenu(false);
    };
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setMenu(false); };
    window.addEventListener('pointerdown', close, true);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', close, true);
      window.removeEventListener('keydown', onKey);
    };
  }, [menu, anchor.anchorRef]);
  useLayoutEffect(() => {
    const read = (node: HTMLElement | null, fallback: PetFloatBox): PetFloatBox => (
      node && node.offsetWidth > 0 && node.offsetHeight > 0 ? { width: node.offsetWidth, height: node.offsetHeight } : fallback
    );
    setFloats((current) => {
      const next = { chip: read(chipRef.current, current.chip), menu: read(menuRef.current, current.menu) };
      if (next.chip.width === current.chip.width && next.chip.height === current.chip.height && next.menu.width === current.menu.width && next.menu.height === current.menu.height) return current;
      return next;
    });
  }, [menu, feed?.enabled, feed?.modelLabel, today.prompt, today.completion, today.total]);

  if (!shown || typeof document === 'undefined') return null;
  const activate = () => {
    if (feed?.enabled) { setMenu(false); feed.setOpen(!feed.open); return; }
    setMenu((open) => !open);
  };
  const openMenu = (event: { preventDefault: () => void }) => { event.preventDefault(); setMenu(true); feed?.setOpen(false); };
  const lookIndex = pose === 'idle' ? look : null;
  const visualPose: PetPose = lookIndex === null ? pose : 'look';
  const panel = anchor.panelStyle;
  const petHeight = Math.round(size * 208 / 192);
  return createPortal(
    <div ref={anchor.rootRef} className="pointer-events-none fixed inset-0 z-40 p-[calc(16px+env(safe-area-inset-top))] pr-[calc(16px+env(safe-area-inset-right))] pb-[calc(16px+env(safe-area-inset-bottom))] pl-[calc(16px+env(safe-area-inset-left))]">
      {feed?.enabled && feed.open && (
        <div ref={anchor.panelRef} data-panel-side={panel?.side} className="pointer-events-auto absolute z-10 overflow-y-auto overscroll-contain rounded-3xl [&>section]:w-full" style={panel ? { left: panel.left, top: panel.top, width: panel.width, maxHeight: panel.maxHeight } : { visibility: 'hidden' }}>
          {feed.panel}
        </div>
      )}
      <div ref={anchor.anchorRef} className="pointer-events-auto absolute" style={anchor.anchorStyle}>
        {sprite ? (
          <button type="button" {...drop.dropZoneProps} {...anchor.pointerProps} onClick={activate} onContextMenu={openMenu} aria-label="桌宠" style={{ width: size, height: petHeight }} className={`relative block touch-none border-0 bg-transparent p-0 ${anchor.moving ? 'cursor-grabbing' : 'cursor-grab'}`}>
            {sheet?.id === preferences.petId ? <PetSprite src={sheet.url} version={version} pose={visualPose} lookIndex={lookIndex} size={size} paused={reduced} onVersion={setVersion} /> : <span className="text-xs text-slate-400">桌宠加载中</span>}
          </button>
        ) : (
          <BeikePet phase={beikePhaseFor(pose, feed?.phase)} label={feed?.enabled ? '投喂封面样张' : '桌宠'} disabled={!feed?.enabled || feed.phase === 'uploading' || feed.phase === 'analyzing'} onOpen={activate} onFiles={(files) => { if (feed?.enabled) feed.onFiles(files); }} onDragging={feed?.onDragging} moving={anchor.moving} size={size} onContextMenu={openMenu} pointerProps={anchor.pointerProps} />
        )}
      </div>
      {feed?.enabled && chipPlace && (
        <button ref={chipRef} type="button" onClick={() => { setMenu(false); feed.setOpen(true); }} aria-expanded={feed.open} className="pointer-events-auto absolute z-10 max-w-[min(18rem,calc(100vw-32px))] truncate rounded-full border border-violet-200 bg-white/95 px-3 py-1 text-[11px] font-bold text-violet-800 shadow-sm dark:border-violet-300/20 dark:bg-[#16161a] dark:text-violet-100" style={floatStyle(chipPlace)}>{feed.modelLabel}</button>
      )}
      {menu && menuPlace && (
        <div ref={menuRef} role="menu" className="pointer-events-auto absolute z-10 w-44 overflow-hidden rounded-2xl border border-slate-200 bg-white py-1 text-sm shadow-xl dark:border-white/10 dark:bg-[#1b1b1e]" style={floatStyle(menuPlace)}>
          <div className="space-y-1 border-b border-slate-100 px-3 py-2 text-xs text-slate-500 dark:border-white/10 dark:text-slate-400">
            <p className="font-semibold text-slate-800 dark:text-slate-100">今日 Token</p>
            <p className="flex justify-between gap-3"><span>输入</span><span className="tabular-nums text-slate-800 dark:text-slate-100">{tokenText(today.prompt)}</span></p>
            <p className="flex justify-between gap-3"><span>输出</span><span className="tabular-nums text-slate-800 dark:text-slate-100">{tokenText(today.completion)}</span></p>
            <p className="flex justify-between gap-3 font-semibold text-slate-800 dark:text-slate-100"><span>合计</span><span className="tabular-nums">{tokenText(today.total)}</span></p>
          </div>
          <button type="button" role="menuitem" className={menuItemClass} onClick={() => { setMenu(false); updatePetPreferences({ visible: false }); }}>隐藏桌宠</button>
        </div>
      )}
    </div>,
    document.body,
  );
}
