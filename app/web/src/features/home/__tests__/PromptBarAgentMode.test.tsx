// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import React from 'react';
import PromptBarModeSelector from '../components/prompt-bar/controls/PromptBarModeSelector';
import { PromptBarControlsRow } from '../components/prompt-bar/controls/PromptBarControlsRow';

describe('主页 PromptBar 四大创作模式测试（彻底移除 AI 助手）', () => {
  beforeEach(() => {
    cleanup();
  });

  describe('PromptBarModeSelector 纯净四大模式', () => {
    it('下拉菜单中仅提供图片生成、视频生成、深度图片、深度视频，且无 AI 助手选项', () => {
      const handleSelectMode = vi.fn();
      const mockMenuRef = { current: null };

      render(
        <PromptBarModeSelector
          isUp={true}
          quickGenMode="image"
          isDepthMode={false}
          isOpen={true}
          onToggle={vi.fn()}
          menuRef={mockMenuRef}
          modeButtonClass="test-btn"
          onSelectMode={handleSelectMode}
        />
      );

      // 下拉菜单应不包含 AI 助手
      expect(screen.queryByText(/AI 助手/)).toBeNull();

      // 应包含四种常规创作模式（外层按钮 + 菜单项可能同时存在图片生成）
      expect(screen.getAllByText('图片生成').length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText('视频生成')).toBeTruthy();
      expect(screen.getByText('深度图片')).toBeTruthy();
      expect(screen.getByText('深度视频')).toBeTruthy();

      // 点击视频模式正常切换
      fireEvent.click(screen.getByText('视频生成'));
      expect(handleSelectMode).toHaveBeenCalledWith('video');
    });

    it('当处于图片/视频/深度模式时，模式按钮文案展示正确', () => {
      const { unmount } = render(
        <PromptBarModeSelector
          isUp={true}
          quickGenMode="video"
          isDepthMode={false}
          isOpen={false}
          onToggle={vi.fn()}
          menuRef={{ current: null }}
          modeButtonClass="test-btn"
          onSelectMode={vi.fn()}
        />
      );
      expect(screen.getByText('视频生成')).toBeTruthy();
      unmount();

      render(
        <PromptBarModeSelector
          isUp={true}
          quickGenMode="depth-image"
          isDepthMode={true}
          isOpen={false}
          onToggle={vi.fn()}
          menuRef={{ current: null }}
          modeButtonClass="test-btn"
          onSelectMode={vi.fn()}
        />
      );
      expect(screen.getByText('深度图片')).toBeTruthy();
    });
  });

  describe('PromptBarControlsRow 控件显示与发送按钮', () => {
    it('在正常生图模式下渲染模型选择器与图片比例，不再出现“已连接 AI 助手”', () => {
      render(
        <PromptBarControlsRow
          isUp={true}
          quickGenMode="image"
          isDepthMode={false}
          modeMenu={{ isOpen: false, toggle: vi.fn(), ref: { current: null } }}
          modeButtonClass=""
          handleModeSwitch={vi.fn()}
          modelMenu={{ isOpen: false, setIsOpen: vi.fn(), ref: { current: null } }}
          activeVideoModelObj={null}
          activeImageModelObj={{ id: 'gpt-image-1', name: 'GPT Image' }}
          availableVideoModels={[]}
          availableImageModels={[{ id: 'gpt-image-1', name: 'GPT Image' }]}
          quickVideoModel=""
          quickModel="gpt-image-1"
          quickVideoDuration={5}
          setQuickVideoModel={vi.fn()}
          setQuickVideoDuration={vi.fn()}
          setQuickModel={vi.fn()}
          quickDepthStyle="mocap"
          setQuickDepthStyle={vi.fn()}
          depthStyleMenu={{ isOpen: false, setIsOpen: vi.fn(), ref: { current: null } }}
          quickDepthQuality="standard"
          setQuickDepthQuality={vi.fn()}
          depthQualityMenu={{ isOpen: false, setIsOpen: vi.fn(), ref: { current: null } }}
          videoRefModeMenu={{ isOpen: false, setIsOpen: vi.fn(), ref: { current: null } }}
          activeVideoRefModeObj={null}
          quickVideoRefMode="omni"
          setQuickVideoRefMode={vi.fn()}
          aspectMenu={{ isOpen: false, toggle: vi.fn(), ref: { current: null } }}
          activeVideoRatioObj={null}
          quickVideoResolution="720P"
          quickVideoCount={1}
          activeImageRatioObj={{ id: '1:1', label: '1:1' }}
          quickQuality="4K"
          quickCount={1}
          quickVideoAspectId="16:9"
          setQuickVideoAspectId={vi.fn()}
          setQuickVideoResolution={vi.fn()}
          setQuickVideoCount={vi.fn()}
          quickAspectId="1:1"
          setQuickAspectId={vi.fn()}
          setQuickQuality={vi.fn()}
          setQuickCount={vi.fn()}
          currentW={1024}
          currentH={1024}
          durationMenu={{ isOpen: false, setIsOpen: vi.fn(), ref: { current: null } }}
          videoDurationBounds={{ min: 3, max: 10 }}
          quickPrompt="一张美丽的风景"
          setQuickPrompt={vi.fn()}
          media={{}}
          richInputRef={{ current: null }}
          handleSendPrompt={vi.fn()}
          canSend={true}
          isSubmitting={false}
        />
      );

      // 不应包含“已连接 AI 助手”
      expect(screen.queryByText(/已连接 AI 助手/)).toBeNull();

      // 正常模式发送按钮 title 为立即生成图片
      const sendBtn = screen.getByTitle('立即生成图片');
      expect(sendBtn).toBeTruthy();
    });
  });
});
