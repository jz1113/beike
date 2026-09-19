import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  downloadSingleVideo,
  downloadSingleZip,
  downloadBatchSuccessTasks,
  downloadCsvTemplate,
} from '../collectorDownloads';
import * as apiClient from '@/lib/apiClient';
import * as desktopDownload from '@/lib/desktopDownload';
import * as downloadMedia from '@/lib/downloadMedia';

describe('collectorDownloads — 单视频下载健壮性与多通道自愈', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('未提供视频链接时友好提示并直接返回', async () => {
    const showToast = vi.fn();
    const setDownloading = vi.fn();

    await downloadSingleVideo({ title: '测试条目' }, showToast, setDownloading);

    expect(showToast).toHaveBeenCalledWith(expect.stringContaining('未检测到该条目的可下载视频链接'));
    expect(setDownloading).not.toHaveBeenCalled();
  });

  it('包含 Emoji 和特殊符号的标题能安全截断，且不会切断 UTF-16 代理对', async () => {
    const emojiTitle = '是谁说我像田曦薇啊😅 9J大连美早樱桃🍒 #9J樱桃 #大连美早樱桃';
    const showToast = vi.fn();
    const setDownloading = vi.fn();

    vi.spyOn(apiClient, 'proxyMediaUrl').mockReturnValue('/api/system/proxy-image?url=mock');
    const fakeBlob = new Blob(['mock video content bytes'], { type: 'video/mp4' });
    Object.defineProperty(fakeBlob, 'size', { value: 5000000 });

    vi.spyOn(apiClient, 'apiFetch').mockResolvedValue({
      ok: true,
      headers: new Headers({ 'content-type': 'video/mp4' }),
      blob: async () => fakeBlob,
    } as any);

    const saveSpy = vi.spyOn(desktopDownload, 'saveToDownloadDir').mockResolvedValue('desktop');

    await downloadSingleVideo({ title: emojiTitle, video: 'https://v26-default.365yg.com/video.mp4' }, showToast, setDownloading);

    expect(setDownloading).toHaveBeenCalledWith(true);
    expect(saveSpy).toHaveBeenCalled();
    const savedFilename = saveSpy.mock.calls[0][0];
    expect(savedFilename).toContain('_无水印原视频.mp4');
    expect(savedFilename).not.toMatch(/[\\/:*?"<>|]/);
    expect(savedFilename.includes('是谁说我像田曦薇啊😅')).toBe(true);
    expect(setDownloading).toHaveBeenLastCalledWith(false);
    expect(showToast).toHaveBeenCalledWith(expect.stringContaining('无水印高清原视频'));
  });

  it('代理通道返回拦截 SVG 或小于 1KB 异常时，自动无缝降级走直连通道', async () => {
    const showToast = vi.fn();
    const setDownloading = vi.fn();

    vi.spyOn(apiClient, 'proxyMediaUrl').mockReturnValue('/api/system/proxy-image?url=mock');

    const svgBlob = new Blob(['<svg>Blocked</svg>'], { type: 'image/svg+xml' });
    vi.spyOn(apiClient, 'apiFetch').mockResolvedValue({
      ok: true,
      headers: new Headers({ 'content-type': 'image/svg+xml' }),
      blob: async () => svgBlob,
    } as any);

    const directVideoBlob = new Blob(['real mp4 content'], { type: 'video/mp4' });
    Object.defineProperty(directVideoBlob, 'size', { value: 8000000 });
    const directFetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      blob: async () => directVideoBlob,
    } as any);

    const saveSpy = vi.spyOn(desktopDownload, 'saveToDownloadDir').mockResolvedValue('desktop');

    await downloadSingleVideo(
      { title: '直连自愈测试', video: 'https://v26-default.365yg.com/real-video.mp4' },
      showToast,
      setDownloading
    );

    expect(directFetchSpy).toHaveBeenCalled();
    expect(saveSpy).toHaveBeenCalledWith(expect.stringContaining('直连自愈测试'), directVideoBlob);
    expect(setDownloading).toHaveBeenLastCalledWith(false);
    expect(showToast).toHaveBeenCalledWith(expect.stringContaining('成功下载'));
  });

  it('两路网络通道均超时或失败时，优雅唤起外部链接并在 finally 重置下载状态', async () => {
    const showToast = vi.fn();
    const setDownloading = vi.fn();

    vi.spyOn(apiClient, 'proxyMediaUrl').mockReturnValue('/api/system/proxy-image?url=mock');
    vi.spyOn(apiClient, 'apiFetch').mockRejectedValue(new Error('Network timeout'));
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('CORS blocked'));
    const openExternalSpy = vi.spyOn(downloadMedia, 'openExternalUrl').mockResolvedValue();

    await downloadSingleVideo(
      { title: '防盗链阻断测试', video: 'https://v26-default.365yg.com/protected.mp4' },
      showToast,
      setDownloading
    );

    expect(openExternalSpy).toHaveBeenCalledWith('https://v26-default.365yg.com/protected.mp4');
    expect(showToast).toHaveBeenCalledWith(expect.stringContaining('已在新标签页为您打开视频播放/下载地址'));
    expect(setDownloading).toHaveBeenLastCalledWith(false);
  });

  it('downloadCsvTemplate 成功生成并下载 CSV 模板', () => {
    const showToast = vi.fn();
    const saveSpy = vi.spyOn(desktopDownload, 'saveToDownloadDir').mockResolvedValue('desktop');

    downloadCsvTemplate(showToast);

    expect(saveSpy).toHaveBeenCalledWith(
      '全渠道商品批量采集导入模板.csv',
      expect.any(Blob)
    );
    expect(showToast).toHaveBeenCalledWith(expect.stringContaining('已下载「全渠道商品批量采集导入模板.csv」'));
  });

  it('downloadBatchSuccessTasks 无成功任务时提示并直接返回', async () => {
    const showToast = vi.fn();
    const setExporting = vi.fn();

    await downloadBatchSuccessTasks(
      [{ id: '1', url: 'https://example.com', status: 'pending' }],
      showToast,
      setExporting
    );

    expect(showToast).toHaveBeenCalledWith(expect.stringContaining('当前没有已采集成功的商品'));
    expect(setExporting).not.toHaveBeenCalled();
  });

  it('downloadBatchSuccessTasks 成功打包分卷并触发下载', async () => {
    const showToast = vi.fn();
    const setExporting = vi.fn();
    const fakeZipBlob = new Blob(['mock zip'], { type: 'application/zip' });

    vi.spyOn(apiClient, 'apiFetch').mockResolvedValue({
      ok: true,
      blob: async () => fakeZipBlob,
    } as any);
    const saveSpy = vi.spyOn(desktopDownload, 'saveToDownloadDir').mockResolvedValue('desktop');

    await downloadBatchSuccessTasks(
      [
        { id: '1', url: 'https://example.com/1', title: '测试商品1', status: 'success', images: ['https://img.com/1.jpg'] },
        { id: '2', url: 'https://example.com/2', title: '测试商品2', status: 'success', video: 'https://vid.com/2.mp4' },
      ],
      showToast,
      setExporting
    );

    expect(setExporting).toHaveBeenCalledWith(true);
    expect(saveSpy).toHaveBeenCalledWith(
      expect.stringContaining('全渠道批量采集成果包'),
      fakeZipBlob
    );
    expect(showToast).toHaveBeenCalledWith(expect.stringContaining('成功分卷打包下载完成'));
    expect(setExporting).toHaveBeenLastCalledWith(false);
  });

  it('downloadSingleZip 没有媒体时友好提示', async () => {
    const showToast = vi.fn();
    const setDownloading = vi.fn();

    await downloadSingleZip({ title: '空媒体' }, showToast, setDownloading);

    expect(showToast).toHaveBeenCalledWith(expect.stringContaining('没有可供下载的图片或视频'));
    expect(setDownloading).not.toHaveBeenCalled();
  });
});
