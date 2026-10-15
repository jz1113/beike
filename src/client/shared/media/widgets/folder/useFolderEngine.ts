import { useEffect, useRef, useState, type RefObject } from 'react';
import type { Bounds, DragState, Engine, ItemState, Renderer, Settings } from './folderTypes';
import { clamp, DROP_TURN } from './folderMath';
import { createEngineState, velocityOf } from './folderSprings';
import { stepFolderFrame } from './folderFrameStepper';
import { writeFolderDom } from './folderDomRenderer';

export interface FolderDomRefs {
  rootRef: RefObject<HTMLDivElement | null>;
  backRef: RefObject<HTMLDivElement | null>;
  frontRef: RefObject<HTMLDivElement | null>;
  groundRef: RefObject<HTMLSpanElement | null>;
  castRef: RefObject<HTMLSpanElement | null>;
  shadeRef: RefObject<HTMLSpanElement | null>;
  glassRef: RefObject<HTMLCanvasElement | null>;
  itemRefs: RefObject<(HTMLDivElement | null)[]>;
}

export const useFolderEngine = (
  refs: FolderDomRefs,
  settingsRef: RefObject<Settings>,
  rendererRef: RefObject<Renderer | null>,
  setOpenRef: RefObject<(next: boolean | ((open: boolean) => boolean)) => void>
) => {
  const engineRef = useRef<Engine | null>(null);
  const [outside, setOutside] = useState<number[]>([]);

  useEffect(() => {
    const root = refs.rootRef.current;
    if (!root) return undefined;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    const state = createEngineState();

    const syncOutside = () => {
      const list: number[] = [];
      state.items.forEach((item, index) => {
        if (item.place === 'out') list.push(index);
      });
      setOutside(prev =>
        prev.length === list.length && prev.every((value, i) => value === list[i]) ? prev : list
      );
    };

    const shiftOf = () => {
      const { g: geometry } = settingsRef.current!;
      return geometry.book ? (geometry.w / 2) * clamp(-state.front.value / 180, 0, 1) : 0;
    };

    const toDesk = (clientX: number, clientY: number) => {
      const box = root.getBoundingClientRect();
      const kx = root.offsetWidth / (box.width || 1);
      const ky = root.offsetHeight / (box.height || 1);
      return [(clientX - box.left) * kx, (clientY - box.top) * ky];
    };

    const clipBounds = (): Bounds => {
      const box = root.getBoundingClientRect();
      let left = 0;
      let top = 0;
      let right = window.innerWidth;
      let bottom = window.innerHeight;
      for (let node = root.parentElement; node && node !== document.body; node = node.parentElement) {
        const computed = getComputedStyle(node);
        if (/(hidden|clip|auto|scroll)/.test(`${computed.overflowX} ${computed.overflowY}`)) {
          const rect = node.getBoundingClientRect();
          left = Math.max(left, rect.left);
          top = Math.max(top, rect.top);
          right = Math.min(right, rect.right);
          bottom = Math.min(bottom, rect.bottom);
          break;
        }
      }
      const kx = root.offsetWidth / (box.width || 1);
      const ky = root.offsetHeight / (box.height || 1);
      return {
        left: (left - box.left) * kx,
        top: (top - box.top) * ky,
        right: (right - box.left) * kx,
        bottom: (bottom - box.top) * ky,
      };
    };

    const overFolder = (x: number, y: number) => {
      const { g: geometry } = settingsRef.current!;
      const shift = shiftOf();
      if (geometry.book) {
        const left = state.front.value < -90 ? shift - geometry.w : shift;
        return x >= left && x <= shift + geometry.w && y >= geometry.tabH * 0.5 && y <= geometry.tabH + geometry.h;
      }
      return x >= 0 && x <= geometry.w && y >= 0 && y <= geometry.tabH + geometry.h;
    };

    const inPocket = (item: ItemState) => {
      const { g: geometry } = settingsRef.current!;
      const halfW = (geometry.docW * item.s.value) / 2;
      const halfH = (geometry.docH * item.s.value) / 2;
      if (geometry.book) {
        if (state.front.value < -60) return false;
        const shift = shiftOf();
        return (
          item.x.value - halfW < shift + geometry.w &&
          item.x.value + halfW > shift &&
          item.y.value + halfH > geometry.tabH &&
          item.y.value - halfH < geometry.tabH + geometry.h
        );
      }
      if (state.front.value < -45) return false;
      return (
        item.y.value + halfH > geometry.frontTop + 4 * geometry.scale &&
        item.x.value + halfW > 0 &&
        item.x.value - halfW < geometry.w
      );
    };

    const write = () => {
      writeFolderDom(
        state,
        settingsRef.current!,
        {
          root,
          back: refs.backRef.current,
          front: refs.frontRef.current,
          shade: refs.shadeRef.current,
          ground: refs.groundRef.current,
          cast: refs.castRef.current,
          glass: refs.glassRef.current,
          items: refs.itemRefs.current,
        },
        rendererRef.current,
        invalidate
      );
    };

    const wake = () => {
      if (!state.raf) {
        state.raf = requestAnimationFrame(now =>
          stepFolderFrame(state, () => settingsRef.current!, now, reduce, inPocket, write, cb => {
            state.raf = requestAnimationFrame(cb);
          })
        );
      }
    };

    const invalidate = () => {
      state.content.key = '';
      wake();
    };

    const drop = (drag: DragState, cancelled: boolean) => {
      const s = settingsRef.current!;
      const item = state.items[drag.index];
      state.receiving = false;
      delete root.dataset.dragging;
      if (!item) return;
      const time = performance.now() / 1000;
      const [vx, vy] = cancelled ? [0, 0] : velocityOf(drag.samples);
      if (overFolder(state.deskX, state.deskY)) {
        const entering = item.place === 'out' || item.elevated;
        item.place = 'inside';
        if (entering && !reduce) {
          item.insertUntil = time + 0.24 / s.speed;
          item.insertFrom = s.g.book ? (state.front.value < -90 ? null : 'side') : 'top';
          if (!item.insertFrom) item.insertUntil = 0;
          state.receiveUntil = item.insertUntil ? item.insertUntil + 0.14 / s.speed : 0;
        }
        item.elevated = false;
        syncOutside();
        s.onItemDrop?.(s.entries[drag.index], drag.index, true);
        return;
      }
      const clip = drag.clip ?? clipBounds();
      const halfW = (s.g.docW * drag.scale) / 2;
      const halfH = (s.g.docH * drag.scale) / 2;
      const x = state.deskX + drag.grabX + clamp(vx, -2400, 2400) * 0.09;
      const y = state.deskY + drag.grabY + clamp(vy, -2400, 2400) * 0.09;
      item.place = 'out';
      item.elevated = true;
      const margin = 8 * s.g.scale;
      const reachX = halfW * 1.08 + margin;
      const reachY = halfH * 1.08 + margin;
      item.outX = clamp(x, clip.left + reachX, Math.max(clip.left + reachX, clip.right - reachX));
      item.outY = clamp(y, clip.top + reachY, Math.max(clip.top + reachY, clip.bottom - reachY));
      item.outR = clamp(item.r.value * 0.5 + clamp(vx, -2400, 2400) * 0.003 + DROP_TURN[drag.index % 6] * 0.6, -12, 12);
      item.outS = drag.scale;
      state.dropCount += 1;
      item.outOrder = state.dropCount;
      syncOutside();
      s.onItemDrop?.(s.entries[drag.index], drag.index, false);
    };

    const onMove = (event: PointerEvent) => {
      const drag = state.drag;
      if (drag && event.pointerId === drag.id) {
        const [x, y] = toDesk(event.clientX, event.clientY);
        state.deskX = x;
        state.deskY = y;
        const now = performance.now();
        drag.samples.push([now, x, y]);
        while (drag.samples.length > 2 && now - drag.samples[0][0] > 100) drag.samples.shift();
        if (!drag.active) {
          const threshold = event.pointerType === 'touch' ? 8 : 4;
          if (Math.hypot(event.clientX - drag.clientX, event.clientY - drag.clientY) > threshold) {
            drag.active = true;
            drag.grabX = (state.items[drag.index]?.x.value ?? 0) - drag.downX;
            drag.grabY = (state.items[drag.index]?.y.value ?? 0) - drag.downY;
            drag.scale =
              state.items[drag.index]?.place === 'out'
                ? state.items[drag.index]!.outS
                : state.items[drag.index]!.s.value;
            drag.clip = clipBounds();
            state.suppressClick = true;
            root.dataset.dragging = '';
          }
        }
        wake();
      }
      if (event.pointerType === 'touch') return;
      const box = root.getBoundingClientRect();
      state.pointerX = clamp(((event.clientX - box.left) / box.width) * 2 - 1, -1.5, 1.5);
      state.pointerY = clamp(((event.clientY - box.top) / box.height) * 2 - 1, -1.5, 1.5);
      const target = (event.target as Element | null)?.closest?.('[data-folder-item]');
      const index = target && root.contains(target) ? Number(target.getAttribute('data-folder-item')) : -1;
      state.hoveredItem = index;
      if (target && index >= 0 && !state.drag?.active) {
        const rect = target.getBoundingClientRect();
        const item = state.items[index];
        if (item) {
          item.localX = clamp(((event.clientX - rect.left) / rect.width) * 2 - 1, -1, 1);
          item.localY = clamp(((event.clientY - rect.top) / rect.height) * 2 - 1, -1, 1);
        }
      }
      if (!state.hovered) {
        state.hovered = true;
        if (settingsRef.current?.openOn === 'hover') setOpenRef.current?.(true);
      }
      wake();
    };

    const onLeave = (event: PointerEvent) => {
      if (event.pointerType === 'touch' || state.drag?.active) return;
      state.hovered = false;
      state.pressed = false;
      state.hoveredItem = -1;
      if (settingsRef.current?.openOn === 'hover') setOpenRef.current?.(false);
      wake();
    };

    const onDown = (event: PointerEvent) => {
      if (event.button > 0) return;
      state.suppressClick = false;
      state.pressed = true;
      wake();
    };

    const onUp = (event: PointerEvent) => {
      state.pressed = false;
      const drag = state.drag;
      if (drag && event.pointerId === drag.id) {
        state.drag = null;
        if (drag.active) drop(drag, event.type === 'pointercancel');
      }
      wake();
    };

    const onDocumentDown = (event: PointerEvent) => {
      if (root.contains(event.target as Node)) return;
      const s = settingsRef.current;
      if (!s) return;
      if (state.focus >= 0) {
        state.focus = -1;
        wake();
      }
      if (s.open && s.closeOnOutsideClick) setOpenRef.current?.(false);
    };

    root.addEventListener('pointermove', onMove);
    root.addEventListener('pointerleave', onLeave);
    root.addEventListener('pointerdown', onDown);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    document.addEventListener('pointerdown', onDocumentDown);

    engineRef.current = {
      wake,
      invalidate,
      consumeClick: () => {
        if (!state.suppressClick) return false;
        state.suppressClick = false;
        return true;
      },
      interactive: index =>
        Boolean(settingsRef.current?.open || state.items[index]?.place === 'out' || state.focus === index),
      select: index => {
        const s = settingsRef.current;
        if (!s) return;
        if (s.zoomOnClick) state.focus = state.focus === index ? -1 : index;
        s.onItemClick?.(s.entries[index], index);
        wake();
      },
      blur: () => {
        if (state.focus < 0) return false;
        state.focus = -1;
        wake();
        return true;
      },
    };
    wake();

    return () => {
      cancelAnimationFrame(state.raf);
      root.removeEventListener('pointermove', onMove);
      root.removeEventListener('pointerleave', onLeave);
      root.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      document.removeEventListener('pointerdown', onDocumentDown);
      engineRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { engineRef, outside };
};
