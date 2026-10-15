import type { EngineState, Settings, Renderer, Scene } from './folderTypes';
import { clamp, chain, move, stretch, turnX, turnY, turnZ, multiply, toCss, LAYERS } from './folderMath';
import { rasterFolderBack as paintBack, renderCard as rasterize } from './folderRaster';

export interface DomElements {
  root: HTMLDivElement;
  back: HTMLDivElement | null;
  front: HTMLDivElement | null;
  shade: HTMLSpanElement | null;
  ground: HTMLSpanElement | null;
  cast: HTMLSpanElement | null;
  glass: HTMLCanvasElement | null;
  items: (HTMLDivElement | null)[];
}

export const refreshFolderContent = (
  state: EngineState,
  renderer: Renderer,
  s: Settings,
  itemRefs: (HTMLDivElement | null)[],
  invalidate: () => void
) => {
  if (
    state.content.key === s.content &&
    state.content.entries === s.entries &&
    state.content.renderer === renderer
  ) {
    return;
  }
  state.content = { key: s.content, entries: s.entries, renderer };
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const keys = new Set(['back']);
  renderer.upload('back', paintBack(s.g, s.insideTop, s.insideBottom, dpr));
  itemRefs.slice(0, s.count).forEach((node, index) => {
    if (!node) return;
    const key = `item-${index}`;
    keys.add(key);
    let result = rasterize(node, dpr, false);
    try {
      renderer.upload(key, result.canvas);
    } catch {
      result = rasterize(node, dpr, true);
      renderer.upload(key, result.canvas);
    }
    result.pending.forEach(image => image.addEventListener('load', invalidate, { once: true }));
  });
  renderer.prune(keys);
};

export const writeFolderDom = (
  state: EngineState,
  s: Settings,
  dom: DomElements,
  renderer: Renderer | null,
  invalidate: () => void
) => {
  const { root, back, front, shade, ground, cast, glass, items } = dom;
  const { w, h, tabH, frontTop, frontH, docW, docH, scale, book: isBook } = s.g;
  const pivotX = w / 2;
  const pivotY = tabH + h / 2;
  const theta = state.front.value;
  const angle = (theta * Math.PI) / 180;
  const unfold = isBook ? clamp(-theta / 180, 0, 1) : 0;
  const shift = (w / 2) * unfold * (1 - state.anchor.value);
  const zoom = (1 + state.lift.value * 0.012) * state.squash.value * (0.94 + 0.06 * state.appear);
  root.style.opacity = state.appear < 0.999 ? state.appear.toFixed(3) : '';
  const desk = chain(
    move(pivotX, pivotY),
    turnX(state.rx.value),
    turnY(state.ry.value),
    stretch(zoom, zoom),
    move(-pivotX, -pivotY)
  );
  const folder = multiply(desk, move(shift, 0));
  const flipped = isBook && theta < -90;
  const frontZ = flipped ? '3' : '40';

  if (back) {
    back.style.transform = toCss(folder);
    back.style.setProperty('--folder-gutter', unfold.toFixed(3));
    back.style.setProperty(
      '--folder-label',
      (isBook ? 1 : 1 - clamp((-theta - 18) / 26, 0, 1)).toFixed(3)
    );
  }

  const frontMatrix = isBook
    ? chain(folder, move(0, frontTop, 2 * scale * (1 - unfold)), turnY(theta))
    : chain(folder, move(0, tabH + h, 2 * scale), turnX(theta), move(0, -frontH));

  if (front) {
    front.style.transform = toCss(frontMatrix);
    front.style.zIndex = frontZ;
    front.setAttribute('data-face', flipped ? 'inner' : 'outer');
    const glint = !s.glass && isBook ? Math.max(0, Math.sin(-angle)) * 0.22 : 0;
    const dim = isBook ? Math.max(0, -Math.sin(-angle)) * 0.35 : Math.max(0, -Math.sin(-angle)) * 0.2;
    front.style.setProperty('--folder-glint', glint.toFixed(3));
    front.style.setProperty('--folder-dim', dim.toFixed(3));
  }

  if (shade) {
    const darkness = isBook ? Math.sin(clamp(-angle, 0, Math.PI)) * 0.45 : 0;
    shade.style.transform = toCss(folder);
    shade.style.opacity = darkness.toFixed(3);
  }

  if (ground) {
    const shadowDesk = multiply(desk, move(shift * 0.6, tabH + h));
    const shadowScale = isBook
      ? stretch(1 + unfold * 0.65, 1 - unfold * 0.2)
      : stretch(1 + Math.abs(Math.sin(angle)) * 0.2, 1);
    ground.style.transform = toCss(multiply(shadowDesk, shadowScale));
  }

  const rise = isBook ? Math.max(0, Math.sin(-angle)) : 0;
  if (cast) {
    cast.style.transform = toCss(
      chain(folder, move(w * rise * 0.12, frontTop + h * rise * 0.04), stretch(Math.cos(angle), 1))
    );
    cast.style.opacity = isBook ? (flipped ? 1 - rise * 0.7 : 0).toFixed(3) : '0';
  }

  const matrices: { index: number; matrix: number[]; layer: number; alpha: number; inside: boolean }[] = [];
  const outs: number[] = [];
  state.items.forEach((item, index) => {
    if (item.place === 'out') outs.push(index);
  });
  outs.sort((a, b) => state.items[a].outOrder - state.items[b].outOrder);

  state.items.forEach((item, index) => {
    const node = items[index];
    const z = 3 * scale + item.z.value + item.hover.value * 26 * scale;
    const matrix = chain(
      desk,
      move(item.x.value + item.mx.value, item.y.value + item.my.value, z),
      turnY(item.ry.value),
      turnZ(item.r.value),
      stretch(item.s.value, item.s.value),
      move(-docW / 2, -docH / 2)
    );
    let layer = 10 + s.count - item.rank;
    if (item.layer === 'inside' && state.phase === 'open' && state.hoveredItem === index) layer = 30;
    if (item.layer === 'out') layer = LAYERS.out + outs.indexOf(index);
    if (item.layer === 'drag') layer = LAYERS.drag;
    if (item.layer === 'focus') layer = LAYERS.focus;
    matrices.push({ index, matrix, layer, alpha: clamp(item.alpha.value, 0, 1), inside: item.layer === 'inside' });
    if (!node) return;
    node.style.transform = toCss(matrix);
    node.style.zIndex = String(layer);
    node.style.setProperty('--folder-lift', clamp(item.hover.value, 0, 2.4).toFixed(3));
    node.style.opacity = item.alpha.value < 0.995 ? Math.max(0, item.alpha.value).toFixed(3) : '';
  });

  if (glass && renderer) {
    refreshFolderContent(state, renderer, s, items, invalidate);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const scene: Scene = {
      dpr,
      depth: s.depth,
      origin: [pivotX, pivotY],
      view: s.view,
      layers: [
        { key: 'back', matrix: folder, width: w, height: tabH + h, alpha: 1 },
        ...matrices
          .filter(m => m.inside)
          .map(m => ({
            key: `item-${m.index}`,
            matrix: m.matrix,
            width: docW,
            height: docH,
            alpha: m.alpha,
          })),
      ],
      glass: {
        matrix: frontMatrix,
        width: w,
        height: frontH,
        radii: isBook ? [0, s.g.r, s.g.r, 0] : [s.g.r, s.g.r, s.g.r, s.g.r],
        spine: isBook ? 0 : 0,
        bleed: isBook ? 3 * scale : 0,
        morph: isBook ? unfold : 0,
        insideTop: s.insideTone[0],
        insideBottom: s.insideTone[1],
        tabRatio: tabH / (tabH + h),
        gutter: [14 * scale, unfold],
        bevel: 8 * scale,
        strength: 28 * scale,
        split: isBook ? 0 : 2 * scale,
        lens: 0.08,
        frost: s.frost * 7 * scale,
        tint: [...s.tint.map(v => v / 255), s.light ? 0.38 : 0.24],
        haze: s.light ? 0.08 : 0.04,
        dim: s.light ? 0.03 : 0.1,
        glint: !isBook ? Math.max(0, Math.sin(-angle)) * 0.16 : 0,
        shine: 0.85,
        light: [0.35, 0.93],
      },
    };
    renderer.render(scene);
  }
};
