import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useSyncExternalStore } from 'react';
import type { PetPose, PetSpriteVersion } from '@shared/domain/pets/atlas';
import { pointerLookIndex } from '@shared/domain/pets/atlas';
import { resolvePetPose } from '@shared/domain/pets/activity';
import { queueSettingsSection } from '@shared/domain/settings/settingsNavigationStorage';
import { useFileDropZone } from '@client/shared/hooks/useFileDropZone';
import { useMediaQuery } from '@client/shared/hooks/useMediaQuery';
import { useAppStore } from '@client/store';
import { BeikePet } from '@client/shared/pets/BeikePet';
import { getPetFeed, subscribePetFeed } from '@client/shared/pets/petFeed';
import { PET_SIZES, beikePhaseFor, updatePetPreferences, usePetPreferences } from '@client/shared/pets/petPreferences';
import { petSheetURL } from '@client/shared/pets/petClient';
import { PetSprite } from '@client/shared/pets/PetSprite';
import { usePetAnchor } from '@client/shared/pets/usePetAnchor';

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

export function AppPetHost() {
  const preferences = usePetPreferences();
  const feed = useSyncExternalStore(subscribePetFeed, getPetFeed, () => null);
  const navigateToSettings = useAppStore((state) => state.navigateToSettings);
  const busy = useAppStore((state) => state.generationTasks.some((task) => task.status === 'IN_PROGRESS'));
  const settingsOpen = useAppStore((state) => state.currentView === 'settings');
  const flash = usePetFlash();
  const reduced = useMediaQuery('(prefers-reduced-motion: reduce)');
  const [menu, setMenu] = useState(false);
  const [look, setLook] = useState<number | null>(null);
  const [sheet, setSheet] = useState<{ id: string; url: string } | null>(null);
  const [version, setVersion] = useState<PetSpriteVersion>(2);
  const pose = resolvePetPose({ feedPhase: feed?.phase, flash, busy });
  const shown = preferences.visible && preferences.petId !== 'none' && !settingsOpen;
  const sprite = preferences.petId !== 'beike';
  const anchor = usePetAnchor(Boolean(shown && feed?.enabled && feed.open), () => { setMenu(false); feed?.setOpen(false); });
  const size = PET_SIZES[preferences.size];
  const drop = useFileDropZone({
    onFiles: (files) => { if (feed?.enabled) feed.onFiles(files); },
    disabled: !feed?.enabled || feed.phase === 'uploading' || feed.phase === 'analyzing',
  });

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

  if (!shown || typeof document === 'undefined') return null;
  const activate = () => { if (feed?.enabled) feed.setOpen(!feed.open); else setMenu((open) => !open); };
  const openMenu = (event: { preventDefault: () => void }) => { event.preventDefault(); setMenu(true); feed?.setOpen(false); };
  const openSettings = () => { setMenu(false); queueSettingsSection('pet'); navigateToSettings(); };
  const lookIndex = pose === 'idle' ? look : null;
  const visualPose: PetPose = lookIndex === null ? pose : 'look';
  const panel = anchor.panelStyle;
  return createPortal(
    <div ref={anchor.rootRef} className="pointer-events-none fixed inset-0 z-40 p-[calc(16px+env(safe-area-inset-top))] pr-[calc(16px+env(safe-area-inset-right))] pb-[calc(16px+env(safe-area-inset-bottom))] pl-[calc(16px+env(safe-area-inset-left))]">
      {feed?.enabled && feed.open && (
        <div ref={anchor.panelRef} data-panel-side={panel?.side} className="pointer-events-auto absolute overflow-y-auto overscroll-contain rounded-3xl [&>section]:w-full" style={panel ? { left: panel.left, top: panel.top, width: panel.width, maxHeight: panel.maxHeight } : { visibility: 'hidden' }}>
          {feed.panel}
        </div>
      )}
      <div ref={anchor.anchorRef} className="pointer-events-none absolute flex max-w-[min(18rem,calc(100vw-32px))] flex-col items-end gap-3 pb-1" style={anchor.anchorStyle}>
        {menu && (
          <div role="menu" className="pointer-events-auto w-36 overflow-hidden rounded-2xl border border-slate-200 bg-white py-1 text-sm shadow-xl dark:border-white/10 dark:bg-[#1b1b1e]">
            <button type="button" role="menuitem" className="block w-full px-3 py-2 text-left hover:bg-slate-50 dark:hover:bg-white/5" onClick={openSettings}>桌宠设置</button>
            <button type="button" role="menuitem" className="block w-full px-3 py-2 text-left hover:bg-slate-50 dark:hover:bg-white/5" onClick={() => { setMenu(false); updatePetPreferences({ visible: false }); }}>隐藏桌宠</button>
          </div>
        )}
        {feed?.enabled && <button type="button" onClick={() => feed.setOpen(true)} aria-expanded={feed.open} className="pointer-events-auto max-w-full truncate rounded-full border border-violet-200 bg-white/95 px-3 py-1 text-[11px] font-bold text-violet-800 shadow-sm dark:border-violet-300/20 dark:bg-[#16161a] dark:text-violet-100">{feed.modelLabel}</button>}
        <div className="pointer-events-auto">
          {sprite ? (
            <button type="button" {...drop.dropZoneProps} {...anchor.pointerProps} onClick={activate} onContextMenu={openMenu} aria-label="桌宠" style={{ width: size, height: Math.round(size * 208 / 192) }} className={`relative block touch-none border-0 bg-transparent p-0 ${anchor.moving ? 'cursor-grabbing' : 'cursor-grab'}`}>
              {sheet?.id === preferences.petId ? <PetSprite src={sheet.url} version={version} pose={visualPose} lookIndex={lookIndex} size={size} paused={reduced} onVersion={setVersion} /> : <span className="text-xs text-slate-400">桌宠加载中</span>}
            </button>
          ) : (
            <BeikePet phase={beikePhaseFor(pose, feed?.phase)} label={feed?.enabled ? '投喂封面样张' : '桌宠'} disabled={!feed?.enabled || feed.phase === 'uploading' || feed.phase === 'analyzing'} onOpen={activate} onFiles={(files) => { if (feed?.enabled) feed.onFiles(files); }} onDragging={feed?.onDragging} moving={anchor.moving} size={size} onContextMenu={openMenu} pointerProps={anchor.pointerProps} />
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
