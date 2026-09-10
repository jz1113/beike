import { describe, it, expect } from 'vitest';
import { isInteractiveElement } from '../windowDrag';

describe('windowDrag isInteractiveElement', () => {
  it('should identify html buttons and inputs as interactive', () => {
    const btn = document.createElement('button');
    const input = document.createElement('input');
    expect(isInteractiveElement(btn)).toBe(true);
    expect(isInteractiveElement(input)).toBe(true);
  });

  it('should identify SVG and path elements inside buttons as interactive', () => {
    const btn = document.createElement('button');
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    svg.appendChild(path);
    btn.appendChild(svg);
    document.body.appendChild(btn);

    // SVGPathElement and SVGSVGElement are instances of SVGElement, not HTMLElement
    expect(isInteractiveElement(svg)).toBe(true);
    expect(isInteractiveElement(path)).toBe(true);

    document.body.removeChild(btn);
  });

  it('should identify elements with data-no-drag and data-tauri-drag-region="false"', () => {
    const nav = document.createElement('nav');
    nav.setAttribute('data-no-drag', '');
    const div = document.createElement('div');
    nav.appendChild(div);
    document.body.appendChild(nav);

    expect(isInteractiveElement(nav)).toBe(true);
    expect(isInteractiveElement(div)).toBe(true);

    document.body.removeChild(nav);
  });

  it('should return false for non-interactive elements like plain div or aside', () => {
    const aside = document.createElement('aside');
    aside.setAttribute('data-tauri-drag-region', '');
    const plainDiv = document.createElement('div');
    aside.appendChild(plainDiv);
    document.body.appendChild(aside);

    expect(isInteractiveElement(aside)).toBe(false);
    expect(isInteractiveElement(plainDiv)).toBe(false);

    document.body.removeChild(aside);
  });
});
