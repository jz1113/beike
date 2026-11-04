import { afterEach, expect, it, vi } from 'vitest';
import JSZip from 'jszip';
import { apiFetch } from './apiClient';
import { saveToDownloadDir } from '../media/saveDownload';
import { exportZipDownload } from './exportZipDownload';

vi.mock('./apiClient', () => ({ apiFetch: vi.fn() }));
vi.mock('../media/saveDownload', () => ({ saveToDownloadDir: vi.fn(async () => 'browser') }));
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });

it('exports same-origin canvas media locally while keeping remote storage URLs unchanged', async () => {
  vi.stubGlobal('window', { location: { origin:'https://app.example' } });
  const zip = new JSZip();
  zip.file('image.png', new Uint8Array([1,2,3]));
  vi.mocked(apiFetch).mockResolvedValue(new Response(await zip.generateAsync({type:'arraybuffer'}), {
    headers:{'Content-Type':'application/zip','X-Export-Total':'2','X-Export-Succeeded':'1','X-Export-Failed':'1'},
  }));
  const payload = {images:[
    {url:'https://app.example/storage/local/result.png?version=1',filename:'result.png'},
    {url:'https://remote.example/storage/result.mp4',filename:'result.mp4'},
  ]};
  const result = await exportZipDownload(payload, 'media.zip', vi.fn());
  const submitted = JSON.parse(String(vi.mocked(apiFetch).mock.calls[0][1]?.body));
  expect(submitted.images[0].url).toBe('/storage/local/result.png?version=1');
  expect(submitted.images[1].url).toBe(payload.images[1].url);
  expect(payload.images[0].url).toBe('https://app.example/storage/local/result.png?version=1');
  expect(result).toMatchObject({total:2,succeeded:1,failed:1,partial:true});
  expect(saveToDownloadDir).toHaveBeenCalledOnce();
});
