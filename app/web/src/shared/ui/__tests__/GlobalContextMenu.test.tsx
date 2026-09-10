// @vitest-environment happy-dom
import React from 'react';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import GlobalContextMenu from '../GlobalContextMenu';
import * as downloadMediaModule from '@/lib/downloadMedia';

vi.mock('@/lib/downloadMedia', () => ({
  openExternalUrl: vi.fn().mockResolvedValue(undefined),
  downloadMediaOrOpen: vi.fn().mockResolvedValue('desktop'),
  fetchMediaBlob: vi.fn().mockResolvedValue(new Blob(['test'], { type: 'image/png' })),
}));

describe('GlobalContextMenu', () => {
  let clipboardWriteTextMock: any;
  let clipboardWriteMock: any;

  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
    clipboardWriteTextMock = vi.fn().mockResolvedValue(undefined);
    clipboardWriteMock = vi.fn().mockResolvedValue(undefined);

    // Mock navigator.clipboard
    Object.defineProperty(navigator, 'clipboard', {
      value: {
        writeText: clipboardWriteTextMock,
        write: clipboardWriteMock,
        readText: vi.fn().mockResolvedValue('test paste'),
      },
      configurable: true,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('在图片上右键触发 contextmenu 时，阻止原生默认行为并精准呈现保留项，且不包含系统无用项', () => {
    render(
      <div>
        <GlobalContextMenu />
        <div data-testid="card-wrapper">
          <img
            data-testid="test-img"
            src="https://example.com/azhuo/image.png?x-oss-process=image/resize,w_500"
            alt="测试图片"
          />
        </div>
      </div>
    );

    const img = screen.getByTestId('test-img');

    fireEvent.contextMenu(img, {
      clientX: 200,
      clientY: 300,
    });

    // 1. 必须展示用户保留的核心操作项
    expect(screen.getByText('在新窗口中打开图像')).toBeInTheDocument();
    expect(screen.getByText('下载图像')).toBeInTheDocument();
    expect(screen.getByText('拷贝图像')).toBeInTheDocument();
    expect(screen.getByText('拷贝图像链接')).toBeInTheDocument();

    // 2. 绝对不能存在用户要求删除的无用项
    expect(screen.queryByText('拷贝对象')).not.toBeInTheDocument();
    expect(screen.queryByText('查询')).not.toBeInTheDocument();
    expect(screen.queryByText('共享...')).not.toBeInTheDocument();
    expect(screen.queryByText('检查元素')).not.toBeInTheDocument();
    expect(screen.queryByText('自动填充')).not.toBeInTheDocument();
  });

  it('点击“在新窗口中打开图像”能清洗掉缩略图参数并调用 openExternalUrl', async () => {
    render(
      <div>
        <GlobalContextMenu />
        <img
          data-testid="test-img"
          src="https://example.com/azhuo/image.png?x-oss-process=image/resize,w_500"
          alt="测试图片"
        />
      </div>
    );

    const img = screen.getByTestId('test-img');
    fireEvent.contextMenu(img, { clientX: 100, clientY: 100 });

    const openBtn = screen.getByText('在新窗口中打开图像');
    fireEvent.click(openBtn);

    await waitFor(() => {
      expect(downloadMediaModule.openExternalUrl).toHaveBeenCalledWith(
        'https://example.com/azhuo/image.png'
      );
    });
  });

  it('点击“下载图像”能触发 downloadMediaOrOpen', async () => {
    render(
      <div>
        <GlobalContextMenu />
        <img
          data-testid="test-img"
          src="https://example.com/azhuo/image.png"
          alt="高清效果图"
        />
      </div>
    );

    const img = screen.getByTestId('test-img');
    fireEvent.contextMenu(img, { clientX: 100, clientY: 100 });

    const downloadBtn = screen.getByText('下载图像');
    fireEvent.click(downloadBtn);

    await waitFor(() => {
      expect(downloadMediaModule.downloadMediaOrOpen).toHaveBeenCalledWith(
        'https://example.com/azhuo/image.png',
        '高清效果图.png'
      );
    });
  });

  it('点击“拷贝图像链接”能将 URL 写入剪贴板', async () => {
    render(
      <div>
        <GlobalContextMenu />
        <img
          data-testid="test-img"
          src="https://example.com/azhuo/image.png"
          alt="图片"
        />
      </div>
    );

    const img = screen.getByTestId('test-img');
    fireEvent.contextMenu(img, { clientX: 100, clientY: 100 });

    const copyLinkBtn = screen.getByText('拷贝图像链接');
    fireEvent.click(copyLinkBtn);

    await waitFor(() => {
      expect(clipboardWriteTextMock).toHaveBeenCalledWith('https://example.com/azhuo/image.png');
    });
  });

  it('在空白区域右键时，默认行为被阻止，且不展示菜单', () => {
    render(
      <div>
        <GlobalContextMenu />
        <div data-testid="blank-area">
          空白区域
        </div>
      </div>
    );

    const blank = screen.getByTestId('blank-area');
    const evt = new MouseEvent('contextmenu', {
      bubbles: true,
      cancelable: true,
      clientX: 50,
      clientY: 50,
    });
    const preventDefaultSpy = vi.spyOn(evt, 'preventDefault');

    blank.dispatchEvent(evt);

    expect(preventDefaultSpy).toHaveBeenCalled();
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('在包含图片的画布空白背景区域右键时，绝不误弹出图片菜单', () => {
    render(
      <div>
        <GlobalContextMenu />
        <div data-testid="canvas-viewport" className="canvas-viewport relative">
          {/* 画布点阵空白背景层 */}
          <div
            data-testid="canvas-blank-background"
            className="canvas-grid-bg w-full h-full"
          >
            空白网格区域
          </div>
          {/* 画布上的图片节点卡片 */}
          <div className="canvas-node-card absolute" data-testid="canvas-node-1">
            <div className="group/media relative">
              <img
                data-testid="node-cherry-img"
                src="https://example.com/cherry.png"
                alt="车厘子素材"
              />
            </div>
          </div>
        </div>
      </div>
    );

    const blankBg = screen.getByTestId('canvas-blank-background');
    fireEvent.contextMenu(blankBg, { clientX: 600, clientY: 450 });

    // 绝不能出现图片右键菜单
    expect(screen.queryByText('在新窗口中打开图像')).not.toBeInTheDocument();
    expect(screen.queryByText('下载图像')).not.toBeInTheDocument();
    expect(screen.queryByText('拷贝图像')).not.toBeInTheDocument();
    expect(screen.queryByText('拷贝图像链接')).not.toBeInTheDocument();
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('在画布图片卡片上右键时，正确唤起图片功能菜单', () => {
    render(
      <div>
        <GlobalContextMenu />
        <div className="canvas-viewport">
          <div className="canvas-node-card">
            <div className="group/media relative" data-testid="image-card-wrapper">
              <img
                src="https://example.com/cherry.png"
                alt="车厘子素材"
                className="pointer-events-none"
              />
            </div>
          </div>
        </div>
      </div>
    );

    const cardWrapper = screen.getByTestId('image-card-wrapper');
    fireEvent.contextMenu(cardWrapper, { clientX: 150, clientY: 150 });

    expect(screen.getByText('在新窗口中打开图像')).toBeInTheDocument();
    expect(screen.getByText('下载图像')).toBeInTheDocument();
    expect(screen.getByText('拷贝图像')).toBeInTheDocument();
    expect(screen.getByText('拷贝图像链接')).toBeInTheDocument();
  });

  it('在卡片上的控制按钮上右键时，不触发图片菜单', () => {
    render(
      <div>
        <GlobalContextMenu />
        <div className="canvas-node-card">
          <button data-testid="node-btn" type="button">
            旋转素材
          </button>
          <img src="https://example.com/cherry.png" alt="车厘子素材" />
        </div>
      </div>
    );

    const btn = screen.getByTestId('node-btn');
    fireEvent.contextMenu(btn, { clientX: 100, clientY: 100 });

    expect(screen.queryByText('在新窗口中打开图像')).not.toBeInTheDocument();
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('按 Escape 键能够关闭菜单', () => {
    render(
      <div>
        <GlobalContextMenu />
        <img
          data-testid="test-img"
          src="https://example.com/azhuo/image.png"
          alt="图片"
        />
      </div>
    );

    const img = screen.getByTestId('test-img');
    fireEvent.contextMenu(img, { clientX: 100, clientY: 100 });

    expect(screen.getByRole('menu')).toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'Escape' });

    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });
});
