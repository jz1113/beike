// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import FeedBatchHeader from '../FeedBatchHeader';

describe('FeedBatchHeader', () => {
  beforeEach(() => {
    cleanup();
  });

  it('正确渲染标题、模型、画幅和分辨率，并且不再渲染详细信息按钮', () => {
    render(
      <FeedBatchHeader
        displayBatchTitle="动漫原画群像，内容一切随机"
        batchPrompt="动漫原画群像，内容一切随机"
        isBatchVideo={false}
        displayModel="GPT Image 2"
        displayRatio="3:4"
        displayQuality="4K"
      />,
    );

    expect(screen.getByText('动漫原画群像，内容一切随机')).toBeInTheDocument();
    expect(screen.getByText('GPT Image 2')).toBeInTheDocument();
    expect(screen.getByText('3:4')).toBeInTheDocument();
    expect(screen.getByText('4K')).toBeInTheDocument();

    // 验证未传入 onShowDetails 时不渲染详细信息
    expect(screen.queryByText('详细信息')).not.toBeInTheDocument();
    expect(screen.queryByTitle('查看详细生成参数')).not.toBeInTheDocument();
  });

  it('多角度模式下，展示图3同款[多角度]胶囊与[image]原图微缩参考胶囊，支持点击放大原图', async () => {
    const handlePreviewSource = vi.fn();
    const handleShowDetails = vi.fn();

    render(
      <FeedBatchHeader
        displayBatchTitle="多角度视角转换(俯视)"
        batchPrompt="【全新单视角摄影转换】宝可梦小智和喷火龙合照"
        isBatchVideo={false}
        displayModel="图片 5.0 Lite"
        displayRatio="3:4"
        displayQuality="2K"
        isMultiAngle={true}
        angleName="俯视"
        sourceImageUrl="https://example.com/pokemon-ash.png"
        onPreviewSourceImage={handlePreviewSource}
        onShowDetails={handleShowDetails}
      />,
    );

    // 验证多角度专属胶囊
    expect(screen.getByText('多角度 · 俯视')).toBeInTheDocument();

    // 验证原图 image 胶囊
    expect(screen.getByText('image')).toBeInTheDocument();
    const refImg = screen.getByAltText('原参考图');
    expect(refImg).toHaveAttribute('src', 'https://example.com/pokemon-ash.png');

    // 验证参数规格
    expect(screen.getByText('图片 5.0 Lite')).toBeInTheDocument();
    expect(screen.getByText('3:4')).toBeInTheDocument();
    expect(screen.getByText('2K')).toBeInTheDocument();

    // 验证详细信息按钮
    expect(screen.getByText('详细信息')).toBeInTheDocument();

    // 点击原图参考胶囊
    const imgBtn = screen.getByTitle('基于此原图生成，点击查看基准原图');
    imgBtn.click();
    expect(handlePreviewSource).toHaveBeenCalledWith('https://example.com/pokemon-ash.png');

    // 点击详细信息按钮
    const detailsBtn = screen.getByTitle('查看生成提示词与详细机位参数');
    detailsBtn.click();
    expect(handleShowDetails).toHaveBeenCalledTimes(1);
  });

  it('智能改图模式下，展示[智能改图]胶囊与[原图]胶囊，支持点击放大原图', async () => {
    const handlePreviewSource = vi.fn();

    render(
      <FeedBatchHeader
        displayBatchTitle="智能改图"
        batchPrompt="【智能局部图像编辑任务】"
        isBatchVideo={false}
        displayModel="GPT Image 2"
        displayRatio="3:4"
        displayQuality="4K"
        isSmartEdit={true}
        sourceImageUrl="https://example.com/original-anime.png"
        onPreviewSourceImage={handlePreviewSource}
      />,
    );

    // 验证智能改图专属胶囊与原图胶囊
    expect(screen.getByText('智能改图')).toBeInTheDocument();
    expect(screen.getByText('原图')).toBeInTheDocument();

    const refImg = screen.getByAltText('原参考图');
    expect(refImg).toHaveAttribute('src', 'https://example.com/original-anime.png');

    // 点击原图胶囊
    const imgBtn = screen.getByTitle('基于此原图局部重绘，点击查看基准原图');
    imgBtn.click();
    expect(handlePreviewSource).toHaveBeenCalledWith('https://example.com/original-anime.png');
  });
});

