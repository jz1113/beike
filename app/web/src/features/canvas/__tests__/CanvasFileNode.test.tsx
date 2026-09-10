import { fireEvent, render, screen, cleanup, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { CanvasFileNode } from '../components/CanvasFileNode';
import { persistCanvasMedia } from '../canvasMediaImport';
vi.mock('../canvasMediaImport', () => ({ persistCanvasMedia: vi.fn() }));
afterEach(() => { cleanup(); vi.resetAllMocks(); });
it('uploads a selected file and keeps the existing node position', async () => {
  vi.mocked(persistCanvasMedia).mockResolvedValue({type:'image',imageUrl:'/storage/image.png',title:'image',x:0,y:0,width:300,height:400});
  const save=vi.fn();
  render(<CanvasFileNode onUpload={save} />);
  fireEvent.change(screen.getByLabelText('选择素材文件'), {target:{files:[new File(['bytes'],'image.png',{type:'image/png'})]}});
  await waitFor(() => expect(save).toHaveBeenCalled());
  expect(save.mock.calls[0][0]).toMatchObject({type:'image',imageUrl:'/storage/image.png'});
  expect(save.mock.calls[0][0]).not.toHaveProperty('x');
});
it('shows an upload failure without replacing the node and supports paste retry', async () => {
  vi.mocked(persistCanvasMedia).mockRejectedValueOnce(new Error('网络不可用')).mockResolvedValueOnce({type:'audio',audioUrl:'/storage/a.mp3',x:0,y:0,width:300,height:400});
  const save=vi.fn();
  render(<CanvasFileNode onUpload={save} />);
  const files=[new File(['bytes'],'a.mp3',{type:'audio/mpeg'})];
  fireEvent.drop(screen.getByLabelText('文件上传节点'),{dataTransfer:{files}});
  await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('网络不可用'));
  expect(save).not.toHaveBeenCalled();
  fireEvent.paste(screen.getByLabelText('文件上传节点'),{clipboardData:{files}});
  await waitFor(() => expect(save).toHaveBeenCalledWith(expect.objectContaining({audioUrl:'/storage/a.mp3'})));
});
