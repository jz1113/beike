import { useCallback, useLayoutEffect, useRef, useState, type MouseEvent, type PointerEvent, type RefObject } from 'react';
import {
  avoidPetObstacles, clampPetPosition, PET_DRAG_THRESHOLD, petPanelLayout, readPetPosition, writePetPosition,
  type PetBounds, type PetPoint, type PetSize,
} from './petGeometry';

type Obstacle = PetPoint & PetSize;

/** Track composers and critical operation panels, including lazy route mounts. */
export function usePetObstacles(rootRef: RefObject<HTMLDivElement | null>, enabled: boolean) {
  const [obstacles, setObstacles] = useState<Obstacle[]>([]);
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!enabled || !root || typeof document === 'undefined') return;
    let composers: Element[] = [];
    const measure = () => {
      const rect = root.getBoundingClientRect();
      const sx = rect.width / root.clientWidth || 1;
      const sy = rect.height / root.clientHeight || 1;
      const next = composers.flatMap(composer => {
        const box = composer.getBoundingClientRect();
        return box.width > 0 && box.height > 0 ? [{
          x: (box.left - rect.left) / sx, y: (box.top - rect.top) / sy,
          width: box.width / sx, height: box.height / sy,
        }] : [];
      });
      setObstacles(previous => JSON.stringify(previous) === JSON.stringify(next) ? previous : next);
    };
    const resize = new ResizeObserver(measure);
    resize.observe(root);
    const sync = () => {
      const next = Array.from(document.querySelectorAll('[data-prompt-composer], [data-pet-obstacle]'));
      if (next.length === composers.length && next.every((node, index) => node === composers[index])) return;
      composers.forEach(node => resize.unobserve(node));
      composers = next;
      composers.forEach(node => resize.observe(node));
      measure();
    };
    sync();
    const mutations = new MutationObserver(sync);
    mutations.observe(document.body, { childList: true, subtree: true });
    window.addEventListener('resize', measure);
    window.visualViewport?.addEventListener('resize', measure);
    window.visualViewport?.addEventListener('scroll', measure);
    return () => {
      resize.disconnect(); mutations.disconnect();
      window.removeEventListener('resize', measure);
      window.visualViewport?.removeEventListener('resize', measure);
      window.visualViewport?.removeEventListener('scroll', measure);
    };
  }, [rootRef, enabled]);
  return obstacles;
}

type Geometry = { point: PetPoint; size: PetSize; bounds: PetBounds; panelHeight: number };
type Gesture = { id: number; x: number; y: number; origin: PetPoint; moved: boolean; target: HTMLButtonElement };

function persist(point: PetPoint, key?: string) {
  try { writePetPosition(window.localStorage, point, key); } catch { /* Storage getter can also fail. */ }
}

export function usePetAnchor(panelOpen: boolean, onDragStart: () => void, canvas = false, enabled = true) {
  const key = canvas ? "beike.pet.canvas.position.v1" : undefined;
  const rootRef = useRef<HTMLDivElement>(null);
  const anchorRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const obstacles = usePetObstacles(rootRef, enabled);
  const geometry = useRef<Geometry | null>(null);
  const gesture = useRef<Gesture | null>(null);
  const suppressClick = useRef(false);
  const scale = useRef({ x: 1, y: 1 });
  const [layout, setLayout] = useState<Geometry | null>(null);
  const [moving, setMoving] = useState(false);

  const update = useCallback((next: Geometry) => {
    geometry.current = next;
    setLayout((previous) => JSON.stringify(previous) === JSON.stringify(next) ? previous : next);
  }, []);
  const finish = useCallback((cancelled = false) => {
    const active = gesture.current;
    if (!active) return;
    gesture.current = null;
    suppressClick.current = active.moved || cancelled;
    setMoving(false);
    if (active.moved && geometry.current) persist(geometry.current.point, key);
    if (active.target.hasPointerCapture(active.id)) active.target.releasePointerCapture(active.id);
  }, [key]);

  useLayoutEffect(() => {
    const root = rootRef.current;
    const anchor = anchorRef.current;
    if (!enabled || !root || !anchor) return;
    const measure = () => {
      const rect = root.getBoundingClientRect();
      const pet = anchor.getBoundingClientRect();
      if (!rect.width || !rect.height || !pet.width) return;
      const sx = rect.width / root.clientWidth || 1;
      const sy = rect.height / root.clientHeight || 1;
      scale.current = { x: sx, y: sy };
      const css = getComputedStyle(root);
      const viewport = window.visualViewport;
      const left = (viewport?.offsetLeft ?? 0) - rect.left;
      const top = (viewport?.offsetTop ?? 0) - rect.top;
      const bounds: PetBounds = {
        width: (left + (viewport?.width ?? window.innerWidth)) / sx,
        height: (top + (viewport?.height ?? window.innerHeight)) / sy,
        left: left / sx + (parseFloat(css.paddingLeft) || 16),
        top: top / sy + (parseFloat(css.paddingTop) || 16),
        right: parseFloat(css.paddingRight) || 16, bottom: parseFloat(css.paddingBottom) || 16,
      };
      const size = { width: pet.width / sx, height: pet.height / sy };
      let point = geometry.current?.point;
      if (!point) {
        try { point = readPetPosition(window.localStorage, key) ?? undefined; } catch { /* Use default position. */ }
      }
      point = clampPetPosition(point ?? { x: Infinity, y: canvas ? (bounds.height - size.height) / 2 : Infinity }, size, bounds);
      const content = panelRef.current?.firstElementChild;
      const panelHeight = content ? content.getBoundingClientRect().height / sy : 380;
      const previous = geometry.current;
      update({ point, size, bounds, panelHeight });
      persist(point, key);
      // Opening or closing the panel must not interrupt a pointer gesture.
      const resized = previous && (JSON.stringify(previous.bounds) !== JSON.stringify(bounds) || JSON.stringify(previous.size) !== JSON.stringify(size));
      if (resized && gesture.current) finish(true);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(root);
    observer.observe(anchor);
    if (panelRef.current?.firstElementChild) observer.observe(panelRef.current.firstElementChild);
    window.addEventListener('resize', measure);
    window.visualViewport?.addEventListener('resize', measure);
    window.visualViewport?.addEventListener('scroll', measure);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', measure);
      window.visualViewport?.removeEventListener('resize', measure);
      window.visualViewport?.removeEventListener('scroll', measure);
    };
  }, [panelOpen, finish, update, canvas, key, enabled]);

  useLayoutEffect(() => () => {
    const active = gesture.current;
    gesture.current = null;
    if (active?.target.hasPointerCapture(active.id)) active.target.releasePointerCapture(active.id);
  }, []);

  const pointerProps = {
    onPointerDown(event: PointerEvent<HTMLButtonElement>) {
      if (event.button !== 0 || event.isPrimary === false || gesture.current || !geometry.current) return;
      suppressClick.current = false;
      try { event.currentTarget.setPointerCapture(event.pointerId); } catch { return; }
      gesture.current = {
        id: event.pointerId, x: event.clientX, y: event.clientY,
        origin: avoidPetObstacles(geometry.current.point, geometry.current.size, geometry.current.bounds, obstacles), moved: false, target: event.currentTarget,
      };
    },
    onPointerMove(event: PointerEvent<HTMLButtonElement>) {
      const active = gesture.current;
      const current = geometry.current;
      if (!active || active.id !== event.pointerId || !current) return;
      const dx = event.clientX - active.x;
      const dy = event.clientY - active.y;
      if (!active.moved && Math.hypot(dx, dy) < PET_DRAG_THRESHOLD) return;
      event.preventDefault();
      if (!active.moved) {
        active.moved = true;
        setMoving(true);
        onDragStart();
      }
      update({ ...current, point: clampPetPosition({
        x: active.origin.x + dx / scale.current.x, y: active.origin.y + dy / scale.current.y,
      }, current.size, current.bounds) });
    },
    onPointerUp(event: PointerEvent<HTMLButtonElement>) {
      if (gesture.current?.id === event.pointerId) finish();
    },
    onPointerCancel(event: PointerEvent<HTMLButtonElement>) {
      if (gesture.current?.id === event.pointerId) finish(true);
    },
    onLostPointerCapture(event: PointerEvent<HTMLButtonElement>) {
      if (gesture.current?.id === event.pointerId) finish(true);
    },
    onClickCapture(event: MouseEvent<HTMLButtonElement>) {
      if (!suppressClick.current || event.detail === 0) return;
      suppressClick.current = false;
      event.preventDefault();
      event.stopPropagation();
    },
  };
  const placed = layout ? avoidPetObstacles(layout.point, layout.size, layout.bounds, obstacles) : null;
  return {
    rootRef, anchorRef, panelRef, moving, pointerProps,
    frame: layout && placed ? { point: placed, size: layout.size, bounds: layout.bounds } : null,
    anchorStyle: placed ? { left: placed.x, top: placed.y } : { right: 16, bottom: 16 },
    panelStyle: layout && placed ? petPanelLayout(placed, layout.size, layout.bounds, layout.panelHeight) : undefined,
  };
}
