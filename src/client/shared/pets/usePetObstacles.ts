import { useLayoutEffect, useState, type RefObject } from 'react';
import type { PetPoint, PetSize } from './petGeometry';

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
