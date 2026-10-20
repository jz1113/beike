import { createElement, Fragment } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { BeikePet } from './BeikePet';
import type { BeikePetPhase } from './beikeMotion';

const props = { label: '投喂封面样张', onOpen: () => {}, onFiles: () => {} };
const render = (phase: BeikePetPhase, disabled = false) => renderToStaticMarkup(createElement(BeikePet, { ...props, phase, disabled }));

describe('cover feed monster artwork', () => {
  it('uses self-contained vector shading with unique paint ids for each instance', () => {
    const html = renderToStaticMarkup(createElement(Fragment, null,
      createElement(BeikePet, { ...props, phase: 'idle' }),
      createElement(BeikePet, { ...props, phase: 'analyzing' })));
    const ids = [...html.matchAll(/id="([^"]+)"/g)].map((match) => match[1]);
    const paints = [...html.matchAll(/url\(#([^)]+)\)/g)].map((match) => match[1]);
    expect(ids).toHaveLength(8);
    expect(new Set(ids).size).toBe(ids.length);
    expect(paints.every((paint) => ids.includes(paint))).toBe(true);
    expect(html).not.toContain('<image');
    expect(html).not.toContain('<filter');
  });

  it.each(['idle', 'uploading', 'analyzing', 'success', 'partial', 'error'] as const)('keeps the %s pet accessible and its panel openable', (phase) => {
    const html = render(phase, true);
    expect(html).toContain('aria-label="投喂封面样张"');
    expect(html).toContain(`data-phase="${phase}"`);
    expect(html).not.toContain('disabled=""');
    expect(html).toContain('aria-hidden="true"');
  });

  it('uses a transparent frameless button and highlights the character for keyboard focus', () => {
    const html = render('dragging');
    const buttonClass = html.match(/<button[^>]*class="([^"]+)"/)?.[1];
    expect(buttonClass).toContain('bg-transparent');
    expect(buttonClass).toContain('touch-none');
    expect(buttonClass).not.toMatch(/ring-|bg-violet|rounded-/);
    expect(html).toContain('group-focus-visible:drop-shadow-');
    expect(html).not.toContain('draggable="true"');
  });

  it('shows a tongue only for feeding and preserves distinct terminal expressions', () => {
    const tongue = 'M56 82Q60 79 64 82Q60 87 56 82';
    expect(render('uploading')).toContain(tongue);
    expect(render('dragging')).toContain(tongue);
    expect(render('idle')).not.toContain(tongue);
    expect(render('success')).toContain('饱啦');
    expect(render('partial')).toContain('待核对');
    expect(render('error')).toContain('重试');
  });
});
