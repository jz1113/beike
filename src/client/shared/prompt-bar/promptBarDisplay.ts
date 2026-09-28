import type { QuickGenMode } from '@shared/domain/media/depthVideo';
import { resolveGptImageSizeForModel } from '@shared/domain/models/modelAdapters/image/gptImageSafeSizes';

/**
 * 解析输入框提示文案 (Placeholder)
 */
export function resolvePromptPlaceholder(params: {
  isDepthMode: boolean;
  quickGenMode: QuickGenMode;
  quickVideoRefMode: string;
  isGenerateDock: boolean;
  hasRefMedia?: boolean;
}): string {
  const { isDepthMode, quickGenMode, quickVideoRefMode, isGenerateDock, hasRefMedia } = params;

  // 🌟 当已有参考素材时，精准还原即梦图2原版操作指引文案
  if (hasRefMedia) {
    if (isGenerateDock) {
      return quickGenMode === 'image'
        ? '结合参考、输入文字或 @ 参考内容，描述你想如何调整图片。'
        : '使用 @ 快速调用参考内容...';
    }
    return '使用 @ 快速调用参考内容，例如：@图片1 模仿 @视频1 的动作，参考 @视频1 的镜头节奏';
  }

  if (isDepthMode) {
    return quickGenMode === 'depth-image'
      ? '上传一张图片，提取空间深度图'
      : '上传一段视频，生成深度动作捕捉';
  }
  if (quickGenMode === 'video') {
    if (quickVideoRefMode === 'multi_frame') {
      return '请添加智能多帧的镜头';
    }
    if (quickVideoRefMode === 'first_last_frame') {
      return isGenerateDock
        ? '描述画面内容与运动过程...'
        : '输入文字，描述你想创作的画面内容、运动过程...';
    }
    // 🌟 用户明确要求将“上传最多50个参考素材...”长文字删掉
    return '';
  }
  return isGenerateDock
    ? '上传参考图、输入文字或 @ 主体...'
    : '上传参考图、输入文字或 @ 主体，描述你想生成的图片。';
}

/**
 * 解析文件选择器接受的 MIME 类型
 */
export function resolveFileAccept(quickGenMode: QuickGenMode): string {
  if (quickGenMode === 'depth-image') return 'image/*';
  if (quickGenMode === 'depth-video') return 'video/*';
  return 'image/*,video/*';
}

/**
 * 解析模式选择按钮的视觉样式类
 */
export function resolveModeButtonClass(params: {
  quickGenMode: QuickGenMode;
  isDepthMode: boolean;
  showModeDropdown: boolean;
}): string {
  const { quickGenMode, isDepthMode, showModeDropdown } = params;
  if (quickGenMode === 'video') {
    return showModeDropdown
      ? 'bg-cyan-50/70 text-cyan-800 shadow-none'
      : 'bg-transparent hover:bg-slate-50 text-cyan-600 shadow-none';
  }
  if (isDepthMode) {
    return showModeDropdown
      ? 'bg-violet-50/70 text-violet-800 shadow-none'
      : 'bg-transparent hover:bg-slate-50 text-violet-600 shadow-none';
  }
  return showModeDropdown
    ? 'bg-sky-50/70 text-sky-800 shadow-none'
    : 'bg-transparent hover:bg-slate-50 text-sky-600 shadow-none';
}

/**
 * 判断是否在左侧边栏展示参考媒体
 */
export function hasSidebarRefMedia(params: {
  isDepthMode: boolean;
  quickGenMode: QuickGenMode;
  quickVideoRefMode: string;
  hasRefImages: boolean;
}): boolean {
  const { isDepthMode, quickGenMode, quickVideoRefMode, hasRefImages } = params;
  if (isDepthMode) {
    return hasRefImages;
  }
  if (quickGenMode === 'image') {
    return hasRefImages;
  }
  return !['first_last_frame', 'multi_frame'].includes(quickVideoRefMode) && hasRefImages;
}

/**
 * 判断是否使用顶部参考条
 */
export function resolveUseTopStrip(params: {
  isDepthMode: boolean;
  quickGenMode: QuickGenMode;
  quickVideoRefMode: string;
  isCompactLayout: boolean;
  hasSidebarRefMedia: boolean;
}): boolean {
  const { isDepthMode, quickGenMode, quickVideoRefMode, isCompactLayout, hasSidebarRefMedia } = params;
  return (
    !isDepthMode && (
      (quickGenMode === 'video' && quickVideoRefMode === 'first_last_frame')
      || (quickGenMode === 'video' && quickVideoRefMode === 'multi_frame')
      || (isCompactLayout && hasSidebarRefMedia)
    )
  );
}

/**
 * 根据比例与画质计算出图分辨率数值
 */
export function calculateImageDimensions(params: {
  quickModel?: string;
  quickAspectId: string;
  quickQuality: string;
  baseRatio: { w: number; h: number };
}): { w: number; h: number; sizeStr: string } {
  const { quickModel, quickAspectId, quickQuality, baseRatio } = params;
  if (quickModel?.toLowerCase().includes('gpt-image')) {
    const sizeStr = resolveGptImageSizeForModel(
      quickAspectId,
      quickModel,
      (quickQuality || 'high') as 'high' | 'medium' | 'low'
    );
    const [w, h] = sizeStr.split('x').map(Number);
    return { w, h, sizeStr };
  }
  let multiplier = 1;
  if (quickQuality === 'low') multiplier = 0.75;
  if (quickQuality === 'medium') multiplier = 1.0;
  if (quickQuality === 'high') multiplier = 1.5;
  const w = Math.round(baseRatio.w * multiplier);
  const h = Math.round(baseRatio.h * multiplier);
  return { w, h, sizeStr: `${w}x${h}` };
}
