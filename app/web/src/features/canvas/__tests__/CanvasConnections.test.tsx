import {cleanup, fireEvent, render, screen} from '@testing-library/react';
import {afterEach, expect, it} from 'vitest';
import {CanvasConnections} from '../components/CanvasConnections';
import {useCanvasStore} from '../store/useCanvasStore';
import type {CanvasNode} from '../types';
afterEach(cleanup);
it('limits hover attraction to twenty-four pixels and resets before connecting', () => {
  const source: CanvasNode = {id:'s',title:'素材',type:'image',imageUrl:'/image.png',x:0,y:0,width:250,height:250,createdAt:1};
  render(<CanvasConnections nodes={[source]} projectId="p" zoom={1} />);
  const button = screen.getByRole('button',{name:'从此图片连线 素材'});
  fireEvent.mouseMove(button,{clientX:100,clientY:100,buttons:0});
  const dx = parseFloat(button.style.getPropertyValue('--handle-offset-x'));
  const dy = parseFloat(button.style.getPropertyValue('--handle-offset-y'));
  expect(Math.hypot(dx,dy)).toBeCloseTo(24);
  fireEvent.mouseLeave(button);
  expect(button.style.getPropertyValue('--handle-offset-x')).toBe('0px');
  fireEvent.mouseDown(button);
  expect(button.style.getPropertyValue('--handle-offset-y')).toBe('0px');
});
it('offers a drawing node on blank drop and creates it connected at transformed coordinates', () => {
  const source: CanvasNode = {id:'s',title:'素材',type:'image',imageUrl:'/image.png',x:0,y:0,width:250,height:250,createdAt:1};
  useCanvasStore.setState({projects:[{id:'p',title:'test',createdAt:1,updatedAt:1,nodes:[source]}]});
  render(<div data-testid="canvas-viewport"><CanvasConnections nodes={[source]} projectId="p" zoom={0.5} /></div>);
  fireEvent.mouseDown(screen.getByRole('button',{name:'从此图片连线 素材'}));
  fireEvent.mouseUp(screen.getByTestId('canvas-viewport'),{button:0,clientX:400,clientY:300});
  expect(screen.getByRole('menu',{name:'添加节点'})).toBeTruthy();
  fireEvent.click(screen.getByRole('menuitem',{name:'绘图'}));
  expect(useCanvasStore.getState().projects[0].nodes[1]).toMatchObject({type:'drawing',referenceNodeIds:['s'],x:748,y:460});
  expect(screen.queryByRole('menu')).toBeNull();
});
it('connects image output to drawing input, deduplicates, and cleans up on source deletion', () => {
  const source: CanvasNode = {id:'source', title:'素材', type:'image', imageUrl:'/image.png', x:0,y:0,width:250,height:250,createdAt:1};
  const target: CanvasNode = {id:'target', title:'绘图', type:'drawing', x:500,y:0,width:560,height:500,createdAt:1};
  useCanvasStore.setState({projects:[{id:'p',title:'test',createdAt:1,updatedAt:1,nodes:[source,target]}]});
  const {rerender} = render(<CanvasConnections nodes={[source,target]} projectId="p" zoom={0.5} />);
  fireEvent.mouseDown(screen.getByRole('button',{name:'从此图片连线 素材'}));
  fireEvent.mouseUp(screen.getByRole('button',{name:'连接参考图到 绘图'}));
  let nodes = useCanvasStore.getState().projects[0].nodes;
  expect(nodes[1].referenceNodeIds).toEqual(['source']);
  rerender(<CanvasConnections nodes={nodes} projectId="p" zoom={0.5} />);
  expect(screen.getByRole('button',{name:'从此图片连线 素材'}).style.getPropertyValue('--port-opacity')).toBe('0');
  expect(screen.getByRole('button',{name:'连接参考图到 绘图'}).style.getPropertyValue('--port-opacity')).toBe('0');
  rerender(<CanvasConnections nodes={nodes} projectId="p" zoom={0.5} />);
  expect(screen.getByLabelText('画布参考连线').querySelector('path')).not.toBeNull();
  fireEvent.click(screen.getByRole('button',{name:'从此图片连线 素材'}));
  fireEvent.click(screen.getByRole('button',{name:'连接参考图到 绘图'}));
  expect(useCanvasStore.getState().projects[0].nodes[1].referenceNodeIds).toEqual(['source']);
  rerender(<CanvasConnections nodes={nodes} projectId="p" zoom={0.5} />);
  expect(screen.getByRole('button',{name:'从此图片连线 素材'}).style.getPropertyValue('--port-opacity')).toBe('0');
  expect(screen.getByRole('button',{name:'连接参考图到 绘图'}).style.getPropertyValue('--port-opacity')).toBe('0');
  expect(screen.getByLabelText('画布参考连线').querySelector('path')).not.toBeNull();
  useCanvasStore.getState().deleteNode('p','source');
  nodes = useCanvasStore.getState().projects[0].nodes;
  expect(nodes[0].referenceNodeIds).toEqual([]);
});

it('anchors established connections to card edges at different zoom levels', () => {
  const source: CanvasNode = {id:'s',type:'image',imageUrl:'/image.png',x:100,y:40,width:250,height:200,createdAt:1};
  const target: CanvasNode = {id:'t',type:'drawing',x:600,y:300,width:560,height:500,referenceNodeIds:['s'],createdAt:1};
  const {rerender} = render(<CanvasConnections nodes={[source,target]} projectId="p" zoom={0.5} />);
  const path = () => screen.getByLabelText('画布参考连线').querySelector('path')?.getAttribute('d');
  expect(path()).toBe('M 350 140 C 545 140, 545 440, 740 440');
  rerender(<CanvasConnections nodes={[source,target]} projectId="p" zoom={2} />);
  expect(path()).toBe('M 350 140 C 545 140, 545 440, 740 440');
});

it('reveals only the hovered port and hides it when the pointer leaves', () => {
  const source: CanvasNode = {id:'s',title:'素材',type:'image',imageUrl:'/image.png',x:0,y:0,width:250,height:250,createdAt:1};
  const target: CanvasNode = {id:'t',title:'绘图',type:'drawing',x:500,y:0,width:560,height:500,referenceNodeIds:['s'],createdAt:1};
  render(<CanvasConnections nodes={[source,target]} projectId="p" zoom={1} />);
  const buttons = screen.getAllByRole('button');
  for (const button of buttons) {
    expect(button.style.getPropertyValue('--port-opacity')).toBe('0');
    fireEvent.mouseEnter(button);
    expect(button.style.getPropertyValue('--port-opacity')).toBe('1');
    expect(buttons.find(other => other !== button)!.style.getPropertyValue('--port-opacity')).toBe('0');
    fireEvent.mouseLeave(button);
    expect(button.style.getPropertyValue('--port-opacity')).toBe('0');
  }
});

it('connects an ungenerated drawing output and rejects a reverse cycle', () => {
  const source: CanvasNode = {id:'s',title:'上游',type:'drawing',x:0,y:0,width:560,height:500,createdAt:1};
  const target: CanvasNode = {id:'t',title:'下游',type:'drawing',x:800,y:0,width:560,height:500,createdAt:1};
  useCanvasStore.setState({projects:[{id:'p',title:'test',createdAt:1,updatedAt:1,nodes:[source,target]}]});
  const {rerender} = render(<CanvasConnections nodes={[source,target]} projectId="p" zoom={1} />);
  const output = screen.getByRole('button',{name:'从此图片连线 上游'});
  expect(output.style.getPropertyValue('--port-opacity')).toBe('0');
  fireEvent.mouseEnter(output);
  expect(output.style.getPropertyValue('--port-opacity')).toBe('1');
  fireEvent.mouseDown(output);
  fireEvent.mouseUp(screen.getByRole('button',{name:'连接参考图到 下游'}));
  const nodes = useCanvasStore.getState().projects[0].nodes;
  expect(nodes[1].referenceNodeIds).toEqual(['s']);
  rerender(<CanvasConnections nodes={nodes} projectId="p" zoom={1} />);
  fireEvent.mouseDown(screen.getByRole('button',{name:'从此图片连线 下游'}));
  fireEvent.mouseUp(screen.getByRole('button',{name:'连接参考图到 上游'}));
  expect(useCanvasStore.getState().projects[0].nodes[0].referenceNodeIds).toBeUndefined();
});

it('connects when released at the drawing border without targeting the plus button',()=>{
 const source:CanvasNode={id:'s',type:'image',imageUrl:'/image.png',x:0,y:0,width:200,height:200,createdAt:1};
 const target:CanvasNode={id:'t',type:'drawing',x:400,y:50,width:560,height:500,createdAt:1};
 useCanvasStore.setState({projects:[{id:'p',title:'test',nodes:[source,target],createdAt:1,updatedAt:1}]});
 render(<CanvasConnections nodes={[source,target]} projectId="p" zoom={1}/>);
 fireEvent.mouseDown(screen.getByRole('button',{name:'从此图片连线 s'}),{button:0});
 fireEvent.mouseUp(window,{button:0,clientX:535,clientY:190});
 expect(useCanvasStore.getState().projects[0].nodes[1].referenceNodeIds).toEqual(['s']);
});
