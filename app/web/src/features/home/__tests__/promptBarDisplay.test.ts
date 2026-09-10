import { describe, it, expect } from 'vitest';
import {
  resolvePromptPlaceholder,
  resolveFileAccept,
  resolveModeButtonClass,
  hasSidebarRefMedia,
  resolveUseTopStrip,
  calculateImageDimensions,
} from '../utils/promptBarDisplay';

describe('promptBarDisplay 纯函数测试', () => {
  describe('resolvePromptPlaceholder', () => {
    it('处理深度图与深度视频', () => {
      expect(resolvePromptPlaceholder({
        isDepthMode: true,
        quickGenMode: 'depth-image',
        quickVideoRefMode: 'omni',
        isGenerateDock: false,
      })).toBe('上传一张图片，提取空间深度图');

      expect(resolvePromptPlaceholder({
        isDepthMode: true,
        quickGenMode: 'depth-video',
        quickVideoRefMode: 'omni',
        isGenerateDock: false,
      })).toBe('上传一段视频，生成深度动作捕捉');
    });

    it('处理常规生图模式', () => {
      expect(resolvePromptPlaceholder({
        isDepthMode: false,
        quickGenMode: 'image',
        quickVideoRefMode: 'omni',
        isGenerateDock: false,
      })).toBe('上传参考图、输入文字或 @ 主体，描述你想生成的图片。');

      expect(resolvePromptPlaceholder({
        isDepthMode: false,
        quickGenMode: 'image',
        quickVideoRefMode: 'omni',
        isGenerateDock: true,
      })).toBe('上传参考图、输入文字或 @ 主体...');
    });

    it('处理视频多模式', () => {
      expect(resolvePromptPlaceholder({
        isDepthMode: false,
        quickGenMode: 'video',
        quickVideoRefMode: 'multi_frame',
        isGenerateDock: false,
      })).toBe('请添加智能多帧的镜头');

      expect(resolvePromptPlaceholder({
        isDepthMode: false,
        quickGenMode: 'video',
        quickVideoRefMode: 'first_last_frame',
        isGenerateDock: true,
      })).toBe('描述画面内容与运动过程...');

      // 🌟 用户明确要求删掉“上传最多50个参考素材...”长文字，全能参考模式下不显示该文字
      expect(resolvePromptPlaceholder({
        isDepthMode: false,
        quickGenMode: 'video',
        quickVideoRefMode: 'omni',
        isGenerateDock: false,
      })).toBe('');

      // 🌟 当导入了参考素材时，对齐即梦图1原版引导操作文案
      expect(resolvePromptPlaceholder({
        isDepthMode: false,
        quickGenMode: 'image',
        quickVideoRefMode: 'omni',
        isGenerateDock: false,
        hasRefMedia: true,
      })).toBe('使用 @ 快速调用参考内容，例如：@图片1 模仿 @视频1 的动作，音色参考 @音频1');

      expect(resolvePromptPlaceholder({
        isDepthMode: false,
        quickGenMode: 'image',
        quickVideoRefMode: 'omni',
        isGenerateDock: true,
        hasRefMedia: true,
      })).toBe('结合参考、输入文字或 @ 参考内容，描述你想如何调整图片。');

    });
  });

  describe('resolveFileAccept', () => {
    it('正确区分图片、视频与混合', () => {
      expect(resolveFileAccept('depth-image')).toBe('image/*');
      expect(resolveFileAccept('depth-video')).toBe('video/*');
      expect(resolveFileAccept('image')).toBe('image/*,video/*');
      expect(resolveFileAccept('video')).toBe('image/*,video/*');
    });
  });

  describe('resolveModeButtonClass', () => {
    it('正确根据模式和展开状态返回颜色样式', () => {
      expect(resolveModeButtonClass({
        quickGenMode: 'video',
        isDepthMode: false,
        showModeDropdown: true,
      })).toContain('bg-cyan-50/70');

      expect(resolveModeButtonClass({
        quickGenMode: 'video',
        isDepthMode: false,
        showModeDropdown: false,
      })).toContain('text-cyan-600');

      expect(resolveModeButtonClass({
        quickGenMode: 'depth-image',
        isDepthMode: true,
        showModeDropdown: true,
      })).toContain('bg-violet-50/70');

      expect(resolveModeButtonClass({
        quickGenMode: 'image',
        isDepthMode: false,
        showModeDropdown: false,
      })).toContain('text-sky-600');
    });
  });

  describe('hasSidebarRefMedia 与 resolveUseTopStrip', () => {
    it('精确判断边栏参考与顶部横条逻辑', () => {
      expect(hasSidebarRefMedia({
        isDepthMode: false,
        quickGenMode: 'image',
        quickVideoRefMode: 'omni',
        hasRefImages: true,
      })).toBe(true);

      expect(hasSidebarRefMedia({
        isDepthMode: true,
        quickGenMode: 'depth-image',
        quickVideoRefMode: 'omni',
        hasRefImages: true,
      })).toBe(true);

      expect(hasSidebarRefMedia({
        isDepthMode: false,
        quickGenMode: 'video',
        quickVideoRefMode: 'first_last_frame',
        hasRefImages: true,
      })).toBe(false);

      expect(resolveUseTopStrip({
        isDepthMode: false,
        quickGenMode: 'video',
        quickVideoRefMode: 'first_last_frame',
        isCompactLayout: false,
        hasSidebarRefMedia: false,
      })).toBe(true);

      expect(resolveUseTopStrip({
        isDepthMode: true,
        quickGenMode: 'depth-image',
        quickVideoRefMode: 'omni',
        isCompactLayout: false,
        hasSidebarRefMedia: true,
      })).toBe(false);
    });
  });

  describe('calculateImageDimensions', () => {
    it('根据倍率计算正确尺寸', () => {
      const base = { w: 1024, h: 1024 };
      const low = calculateImageDimensions({
        quickAspectId: '1:1',
        quickQuality: 'low',
        baseRatio: base,
      });
      expect(low.w).toBe(768);
      expect(low.sizeStr).toBe('768x768');

      const med = calculateImageDimensions({
        quickAspectId: '1:1',
        quickQuality: 'medium',
        baseRatio: base,
      });
      expect(med.w).toBe(1024);
      expect(med.sizeStr).toBe('1024x1024');

      const high = calculateImageDimensions({
        quickAspectId: '1:1',
        quickQuality: 'high',
        baseRatio: base,
      });
      expect(high.w).toBe(1536);
      expect(high.sizeStr).toBe('1536x1536');
    });
  });
});
