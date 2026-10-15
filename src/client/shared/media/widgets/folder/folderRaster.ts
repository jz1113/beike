import type { Geometry } from './folderTypes';
import { backPath } from './folderMath';

const roundedRect = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
) => {
  const r = Math.max(0, Math.min(radius, width / 2, height / 2));
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
};

const offsetWithin = (element: HTMLElement, root: HTMLElement): [number, number] | null => {
  let x = 0;
  let y = 0;
  let node: HTMLElement | null = element;
  while (node && node !== root) {
    x += node.offsetLeft;
    y += node.offsetTop;
    node = node.offsetParent as HTMLElement | null;
  }
  return node === root ? [x, y] : null;
};

const isClear = (color: string) => !color || color === 'transparent' || /rgba?\([^)]*[,/]\s*0\s*\)$/.test(color);

const drawText = (
  ctx: CanvasRenderingContext2D,
  element: Element,
  x: number,
  y: number,
  width: number,
  style: CSSStyleDeclaration
) => {
  const text = Array.from(element.childNodes)
    .filter(node => node.nodeType === 3)
    .map(node => node.textContent)
    .join('')
    .trim();
  if (!text) return;
  const size = parseFloat(style.fontSize) || 12;
  const lineHeight = parseFloat(style.lineHeight) || size * 1.2;
  const left = x + (parseFloat(style.paddingLeft) || 0);
  const top = y + (parseFloat(style.paddingTop) || 0);
  const room = width - (parseFloat(style.paddingLeft) || 0) - (parseFloat(style.paddingRight) || 0);
  ctx.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
  ctx.fillStyle = style.color;
  ctx.textBaseline = 'middle';
  const fit = (line: string) => {
    if (ctx.measureText(line).width <= room) return line;
    let cut = line;
    while (cut.length > 1 && ctx.measureText(`${cut}…`).width > room) cut = cut.slice(0, -1);
    return `${cut.trimEnd()}…`;
  };
  if (style.whiteSpace === 'nowrap') {
    ctx.fillText(fit(text), left, top + lineHeight / 2);
    return;
  }
  let line = '';
  let row = 0;
  text.split(/\s+/).forEach(word => {
    const next = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(next).width > room) {
      ctx.fillText(line, left, top + lineHeight * (row + 0.5));
      row += 1;
      line = word;
    } else {
      line = next;
    }
  });
  if (line) ctx.fillText(line, left, top + lineHeight * (row + 0.5));
};

export const renderCard = (node: HTMLElement, dpr: number, skipImages: boolean) => {
  const width = Math.max(1, node.offsetWidth);
  const height = Math.max(1, node.offsetHeight);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width * dpr));
  canvas.height = Math.max(1, Math.round(height * dpr));
  const pending: HTMLImageElement[] = [];
  const ctx = canvas.getContext('2d');
  if (!ctx) return { canvas, pending };
  ctx.scale(dpr, dpr);
  const paint = (element: HTMLElement, x: number, y: number) => {
    const style = getComputedStyle(element);
    if (style.display === 'none' || style.visibility === 'hidden') return;
    const w = element.offsetWidth;
    const h = element.offsetHeight;
    const radius = parseFloat(style.borderTopLeftRadius) || 0;
    const opacity = element !== node && Number.isFinite(parseFloat(style.opacity)) ? parseFloat(style.opacity) : 1;
    ctx.save();
    ctx.globalAlpha *= opacity;
    if (!isClear(style.backgroundColor)) {
      ctx.fillStyle = style.backgroundColor;
      roundedRect(ctx, x, y, w, h, radius);
      ctx.fill();
    }
    if (style.overflow !== 'visible') {
      roundedRect(ctx, x, y, w, h, radius);
      ctx.clip();
    }
    if (element instanceof HTMLImageElement) {
      if (!element.complete || !element.naturalWidth) pending.push(element);
      else if (!skipImages) {
        const ratio = Math.max(w / element.naturalWidth, h / element.naturalHeight);
        const sw = w / ratio;
        const sh = h / ratio;
        ctx.drawImage(element, (element.naturalWidth - sw) / 2, (element.naturalHeight - sh) / 2, sw, sh, x, y, w, h);
      }
    } else {
      drawText(ctx, element, x, y, w, style);
      Array.from(element.children).forEach(child => {
        const at = offsetWithin(child as HTMLElement, node);
        if (at) paint(child as HTMLElement, at[0], at[1]);
      });
    }
    ctx.restore();
  };
  paint(node, 0, 0);
  return { canvas, pending };
};

export const rasterFolderBack = (g: Geometry, top: string, bottom: string, dpr: number) => {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(g.w * dpr));
  canvas.height = Math.max(1, Math.round((g.tabH + g.h) * dpr));
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  ctx.scale(dpr, dpr);
  const fill = ctx.createLinearGradient(0, 0, 0, g.tabH + g.h);
  fill.addColorStop(0, top);
  fill.addColorStop(1, bottom);
  ctx.fillStyle = fill;
  ctx.fill(new Path2D(backPath(g)));
  return canvas;
};
