import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { persistCanvasMedia } from '../canvasMediaImport';
import { CanvasDrawingNode } from '../components/CanvasDrawingNode';
import { useCanvasStore } from '../store/useCanvasStore';
import { useAppStore } from '@/store/useAppStore';
import type { CanvasNode } from '../types';
vi.mock('@beike/domain/workflowModels', async importOriginal => ({ ...await importOriginal<typeof import('@beike/domain/workflowModels')>(), readWorkflowModelsFromStorage: () => [], getEnabledVideoModelsFromSettings: () => [{id:'video-test',name:'Video',supportedDurations:[5],supportedResolutions:['720P'],supportedAspectRatios:['16:9']}], getEnabledImageModelsFromSettings: () => [{id:'gpt-image-2',name:'GPT Image 2'}] }));
vi.mock('../canvasMediaImport', () => ({ persistCanvasMedia: vi.fn() }));
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
it('queues current image generation tasks with node settings and rejects duplicate submit', () => {
  const node: CanvasNode = {id:'draw',type:'drawing',content:'A blue ceramic cup',x:100,y:100,width:560,height:500,createdAt:1,drawing:{model:'gpt-image-2',quality:'medium',aspect:'1:1',count:2,references:['https://example.com/ref.jpg']}};
  const reference: CanvasNode = {id:'ref',type:'image',imageUrl:'https://example.com/linked.jpg',x:0,y:0,width:250,height:250,createdAt:1};
  node.referenceNodeIds = ['ref'];
  useCanvasStore.setState({projects:[{id:'p',title:'test',createdAt:1,updatedAt:1,nodes:[node,reference]}]});
  const enqueue = vi.spyOn(useAppStore.getState(), 'addBatchGenerationTasks').mockImplementation(() => {});
  render(<CanvasDrawingNode selected node={node} projectId="p" nodes={[node,reference]} />);
  fireEvent.click(screen.getByRole('button',{name:'开始绘图'}));
  expect(enqueue).toHaveBeenCalledTimes(1);
  const tasks = enqueue.mock.calls[0][0];
  expect(tasks).toHaveLength(2);
  expect(tasks[0]).toMatchObject({model:'gpt-image-2',prompt:'A blue ceramic cup'});
  expect(JSON.stringify(tasks[0])).toContain('https://example.com/ref.jpg');
  expect(JSON.stringify(tasks[0])).toContain('https://example.com/linked.jpg');
  expect(useCanvasStore.getState().projects[0].nodes[0]).toMatchObject({taskId:tasks[0].id,status:'generating'});
  fireEvent.click(screen.getByRole('button',{name:'开始绘图'}));
  expect(enqueue).toHaveBeenCalledTimes(1);
});
it('empty prompts cannot enqueue a paid generation', () => {
  const node: CanvasNode = {id:'empty',type:'drawing',x:0,y:0,width:560,height:500,createdAt:1};
  render(<CanvasDrawingNode selected node={node} projectId="p" nodes={[node]} />);
  expect((screen.getByRole('button',{name:'开始绘图'}) as HTMLButtonElement).disabled).toBe(true);
});
it('selects generation count from the compact menu and closes it', () => {
  const node: CanvasNode = {id:'count',type:'drawing',x:0,y:0,width:560,height:500,createdAt:1,drawing:{model:'gpt-image-2',quality:'medium',aspect:'1:1',count:1,references:[]}};
  useCanvasStore.setState({projects:[{id:'p',title:'test',createdAt:1,updatedAt:1,nodes:[node]}]});
  render(<CanvasDrawingNode selected node={node} projectId="p" nodes={[node]} />);
  const trigger=screen.getByRole('button',{name:'绘图张数'});
  fireEvent.click(trigger);
  expect(screen.getByRole('menuitemradio',{name:'1×'}).getAttribute('aria-checked')).toBe('true');
  fireEvent.click(screen.getByRole('menuitemradio',{name:'4×'}));
  expect(useCanvasStore.getState().projects[0].nodes[0].drawing?.count).toBe(4);
  expect(screen.queryByRole('menu',{name:'选择生成张数'})).toBeNull();
  expect(document.activeElement).toBe(trigger);
});

it('keeps the idle node compact and restores the saved prompt when selected',()=>{
 const node:CanvasNode={id:'compact',type:'drawing',content:'保留的提示词',x:0,y:0,width:560,height:500,createdAt:1};
 const {rerender}=render(<CanvasDrawingNode node={node} projectId="p" nodes={[node]}/>);
 expect(screen.queryByLabelText('绘图编辑面板')).toBeNull();
 expect(screen.getByTestId('drawing-preview')).toBeTruthy();
 rerender(<CanvasDrawingNode selected node={node} projectId="p" nodes={[node]}/>);
 expect(screen.getByLabelText('绘图编辑面板')).toBeTruthy();
 expect(screen.getByText('保留的提示词')).toBeTruthy();
 rerender(<CanvasDrawingNode node={node} projectId="p" nodes={[node]}/>);
 expect(screen.queryByLabelText('绘图编辑面板')).toBeNull();
});

it('queues video with references and video parameters in a compact generator', () => {
 const node:CanvasNode={id:'vid',type:'drawing',generationKind:'video',content:'镜头缓慢推进',x:0,y:0,width:560,height:500,createdAt:1,drawing:{model:'video-test',quality:'720P',aspect:'16:9',duration:5,count:1,references:['https://example.com/ref.jpg']}};
 useCanvasStore.setState({projects:[{id:'p',title:'test',createdAt:1,updatedAt:1,nodes:[node]}]});
 const enqueue=vi.spyOn(useAppStore.getState(),'addBatchGenerationTasks').mockImplementation(()=>{});
 render(<CanvasDrawingNode selected node={node} projectId="p" nodes={[node]}/>);
 expect(screen.getByTestId('drawing-preview').style.height).toBe('157.5px');
 fireEvent.click(screen.getByRole('button',{name:'开始生成视频'}));
 expect(enqueue).toHaveBeenCalledTimes(1);
 expect(enqueue.mock.calls[0][0][0]).toMatchObject({model:'video-test',size:'16:9',videoDuration:5,videoResolution:'720P',videoRefMode:'omni'});
 expect(useCanvasStore.getState().projects[0].nodes[0]).toMatchObject({status:'generating',generationKind:'video'});
});

it.each(['image', 'video'] as const)('uploads system references directly into the %s node without adding canvas nodes', async kind => {
  const node: CanvasNode = {id:'upload',type:'drawing',generationKind:kind === 'video' ? 'video' : undefined,x:0,y:0,width:560,height:500,createdAt:1,drawing:{model:'gpt-image-2',quality:'medium',aspect:'1:1',count:1,references:[]}};
  useCanvasStore.setState({projects:[{id:'p',title:'test',createdAt:1,updatedAt:1,nodes:[node]}]});
  vi.mocked(persistCanvasMedia).mockResolvedValue({type:'image',imageUrl:'/uploads/reference.png',x:0,y:0,width:300,height:400});
  render(<CanvasDrawingNode selected node={node} projectId="p" nodes={[node]} />);
  const input = screen.getByLabelText('选择参考素材文件');
  const picker = vi.spyOn(input, 'click');
  fireEvent.click(screen.getByRole('button', {name:'添加参考素材'}));
  expect(picker).toHaveBeenCalledOnce();
  fireEvent.change(input, {target:{files:[new File(['image'], 'reference.png', {type:'image/png'})]}});
  await waitFor(() => expect(useCanvasStore.getState().projects[0].nodes[0].drawing?.references).toEqual(['/uploads/reference.png']));
  expect(useCanvasStore.getState().projects[0].nodes).toHaveLength(1);
  expect(screen.queryByRole('button', {name:'选择画布参考图'})).toBeNull();
});

it('renders video settings popover with 5 sections matching design and updates config', () => {
  const node: CanvasNode = {
    id: 'vid-settings',
    type: 'drawing',
    generationKind: 'video',
    content: '动态运镜',
    x: 0,
    y: 0,
    width: 560,
    height: 500,
    createdAt: 1,
    drawing: {
      model: 'video-test',
      quality: '720P',
      aspect: '16:9',
      duration: 5,
      count: 1,
      refMode: 'omni',
      audio: false,
      references: [],
    },
  };
  useCanvasStore.setState({ projects: [{ id: 'p', title: 'test', createdAt: 1, updatedAt: 1, nodes: [node] }] });
  render(<CanvasDrawingNode selected node={node} projectId="p" nodes={[node]} />);

  const trigger = screen.getByRole('button', { name: '绘图参数' });
  expect(trigger.textContent).toContain('全能参考');
  expect(trigger.textContent).toContain('16:9');
  expect(trigger.textContent).toContain('720p');
  expect(trigger.textContent).toContain('5s');

  fireEvent.click(trigger);
  expect(screen.getByText('生成方式')).toBeTruthy();
  expect(screen.getByText('比例')).toBeTruthy();
  expect(screen.getByText('清晰度')).toBeTruthy();
  expect(screen.getByText('生成时长')).toBeTruthy();
  expect(screen.getByText('生成音频')).toBeTruthy();

  // 验证比例包含 6 个
  expect(screen.getByRole('button', { name: '比例 16:9' })).toBeTruthy();
  expect(screen.getByRole('button', { name: '比例 4:3' })).toBeTruthy();
  expect(screen.getByRole('button', { name: '比例 1:1' })).toBeTruthy();
  expect(screen.getByRole('button', { name: '比例 3:4' })).toBeTruthy();
  expect(screen.getByRole('button', { name: '比例 9:16' })).toBeTruthy();
  expect(screen.getByRole('button', { name: '比例 21:9' })).toBeTruthy();

  // 点击 9:16 切换比例
  fireEvent.click(screen.getByRole('button', { name: '比例 9:16' }));
  expect(useCanvasStore.getState().projects[0].nodes[0].drawing?.aspect).toBe('9:16');

  // 点击开启音频
  fireEvent.click(screen.getByRole('button', { name: '开启' }));
  expect(useCanvasStore.getState().projects[0].nodes[0].drawing?.audio).toBe(true);

  // 点击首尾帧切换参考模式
  fireEvent.click(screen.getByRole('button', { name: '首尾帧' }));
  expect(useCanvasStore.getState().projects[0].nodes[0].drawing?.refMode).toBe('first_last_frame');
});
