import {expect,it} from 'vitest';
import {fitCanvasNodes} from '../hooks/useCanvasGestures';
import type {CanvasNode} from '../types';
it('centers distant and negative-coordinate assets in the usable viewport', () => {
  for (const x of [-5000,10000]) {
    const node: CanvasNode = {id:'a',type:'image',x,y:8000,width:600,height:400,createdAt:1};
    const view = fitCanvasNodes([node],1200,900);
    expect(node.x * view.zoom + view.pan.x).toBeGreaterThanOrEqual(80);
    expect((node.x+node.width) * view.zoom + view.pan.x).toBeLessThanOrEqual(1120);
    expect(node.y * view.zoom + view.pan.y).toBeGreaterThanOrEqual(80);
    expect((node.y+node.height) * view.zoom + view.pan.y).toBeLessThanOrEqual(760);
  }
});
it('fits large material bounds and leaves an empty canvas at its default view', () => {
  expect(fitCanvasNodes([],1200,900)).toEqual({pan:{x:0,y:0},zoom:1});
  const node: CanvasNode = {id:'a',type:'image',x:3000,y:3000,width:8000,height:4000,createdAt:1};
  expect(fitCanvasNodes([node],1200,900).zoom).toBeLessThan(1);
});
