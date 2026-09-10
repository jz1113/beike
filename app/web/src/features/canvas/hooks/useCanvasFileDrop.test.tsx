// @vitest-environment happy-dom
import { render, fireEvent, createEvent, waitFor, cleanup } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { useCanvasFileDrop } from './useCanvasFileDrop';
import { persistCanvasMedia } from '../canvasMediaImport';
import { useCanvasStore } from '../store/useCanvasStore';
vi.mock('../canvasMediaImport', () => ({ persistCanvasMedia: vi.fn() }));
afterEach(() => { cleanup(); vi.resetAllMocks(); });
function DropZone() { const state = useCanvasFileDrop('drop', {x:20,y:40}, 2); return <div data-testid="drop" {...state.dropProps}>{state.errors.join(',')}</div>; }
it('imports multiple files at zoom-corrected drop coordinates and continues after a failed file', async () => {
  useCanvasStore.setState({ projects:[{id:'drop',title:'test',createdAt:1,updatedAt:1,nodes:[]}] });
  vi.mocked(persistCanvasMedia).mockResolvedValueOnce({type:'image',imageUrl:'/storage/a.png',x:0,y:0,width:300,height:400}).mockRejectedValueOnce(new Error('不支持的格式')).mockResolvedValueOnce({type:'video',videoUrl:'/storage/c.mp4',x:0,y:0,width:300,height:480});
  const {getByTestId}=render(<DropZone />);
  const event = createEvent.drop(getByTestId('drop'),{dataTransfer:{files:[new File(['a'],'a.png'),new File(['b'],'b.txt'),new File(['c'],'c.mp4')]}});
  Object.defineProperties(event, { clientX: {value:220}, clientY: {value:240} });
  fireEvent(getByTestId('drop'), event);
  let targetProject: any;
  await waitFor(() => {
    targetProject = useCanvasStore.getState().projects.find(p => p.id === 'drop');
    expect(targetProject?.nodes).toHaveLength(2);
  });
  expect(targetProject.nodes[0]).toMatchObject({type:'image',x:100,y:100});
  expect(targetProject.nodes[1]).toMatchObject({type:'video',x:764,y:100});
  expect(getByTestId('drop').textContent).toContain('b.txt：不支持的格式');
});
