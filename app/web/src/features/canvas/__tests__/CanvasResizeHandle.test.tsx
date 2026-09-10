import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { CanvasResizeHandle, resizeMedia } from '../components/CanvasResizeHandle';
afterEach(cleanup);
it('accounts for canvas zoom and retains aspect ratio', () => {
  expect(resizeMedia(400,200,100,50,0.5)).toEqual({width:600,height:300});
  expect(resizeMedia(400,200,-10000,-10000,1)).toEqual({width:160,height:80});
  expect(resizeMedia(400,200,10000,10000,1)).toEqual({width:2400,height:1200});
});
it('supports keyboard resizing without bubbling to the canvas', () => {
  const resize = vi.fn();
  const parent = vi.fn();
  render(<div onKeyDown={parent}><CanvasResizeHandle width={400} height={200} zoom={1} onResize={resize} /></div>);
  fireEvent.keyDown(screen.getByRole('button',{name:'调整素材大小'}),{key:'ArrowRight'});
  expect(resize.mock.calls[0][0].width).toBeCloseTo(410);
  expect(resize.mock.calls[0][0].height).toBeCloseTo(205);
  expect(parent).not.toHaveBeenCalled();
});
