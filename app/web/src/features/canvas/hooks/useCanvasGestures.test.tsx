// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import type React from 'react';
import { useCanvasGestures } from './useCanvasGestures';
import type { CanvasProject, CanvasNode } from '../types';
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
it('removes global drag handlers on unmount without persisting a stale drag', () => {
  const update = vi.fn();
  const project = { id:'p',nodes:[] } as unknown as CanvasProject;
  const node = {id:'n',x:0,y:0} as CanvasNode;
  const {result,unmount}=renderHook(()=>useCanvasGestures(project,update,vi.fn()));
  const remove=vi.spyOn(window,'removeEventListener');
  act(()=>result.current.handleNodeDragStart(node,{target:document.createElement('div'),clientX:0,clientY:0,preventDefault(){},stopPropagation(){}} as unknown as React.MouseEvent));
  unmount();
  expect(remove.mock.calls.some(([event])=>event==='mousemove')).toBe(true);
  expect(remove.mock.calls.some(([event])=>event==='mouseup')).toBe(true);
  window.dispatchEvent(new MouseEvent('mousemove',{clientX:100,clientY:100}));
  window.dispatchEvent(new MouseEvent('mouseup'));
  expect(update).not.toHaveBeenCalled();
});
it('keeps zoom bounded and resets the view', () => {
  const {result}=renderHook(()=>useCanvasGestures(undefined,vi.fn(),vi.fn()));
  act(()=>result.current.handleZoom(100)); expect(result.current.zoom).toBe(2.5);
  act(()=>result.current.handleZoom(-100)); expect(result.current.zoom).toBe(.1);
  act(()=>result.current.handleResetView()); expect(result.current.zoom).toBe(1);
  expect(result.current.pan).toEqual({x:0,y:0});
});
