import type { QuickGenMode } from '@shared/domain/media/depthVideo';
import { resolveGptImageSizeForModel } from '@shared/domain/models/model-adapters/image/gptImageSafeSizes';
import { t } from '@client/shared/i18n';

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

  if (quickGenMode === 'agent') {
    return t('promptBar.agent');
  }

  // 🌟 当已有参考素材时，精准还原即梦图2原版操作指引文案
  if (hasRefMedia) {
    if (isGenerateDock) {
      return quickGenMode === 'image'
        ? t('promptBar.refMedia')
        : t('promptBar.refMediaVideo');
    }
    return t('promptBar.refMediaVideo');
  }

  if (isDepthMode) {
    return quickGenMode === 'depth-image'
      ? t('promptBar.depthImage')
      : t('promptBar.depthVideo');
  }
  if (quickGenMode === 'video') {
    if (quickVideoRefMode === 'multi_frame') {
      return t('promptBar.videoMultiFrame');
    }
    if (quickVideoRefMode === 'first_last_frame') {
      return t('promptBar.videoFirstLastFrame');
    }
    // 🌟 用户明确要求将“上传最多50个参考素材...”长文字删掉
    return '';
  }
  return isGenerateDock
    ? t('promptBar.imageDock')
    : t('promptBar.imageDefault');
}

/**
 * 解析文件选择器接受的 MIME 类型
 */
export function resolveFileAccept(quickGenMode: QuickGenMode): string {
  if (quickGenMode === 'depth-image') return 'image/*';
  if (quickGenMode === 'depth-video') return 'video/*';
  if (quickGenMode === 'agent') {
    return 'image/*,video/*,audio/*,.pdf,.doc,.docx,.ppt,.pptx,.txt,.md,.csv,.xls,.xlsx';
  }
  return 'image/*,video/*';
}

/**
 * 解析模式选择按钮的视觉样式类
 */
export function resolveModeButtonClass(params: {
  quickGenMode: QuickGenMode;
  isDepthMode?: boolean;
  showModeDropdown: boolean;
}): string {
  const { showModeDropdown } = params;
  return showModeDropdown
    ? 'bg-slate-100 text-slate-900 font-medium'
    : 'bg-transparent hover:bg-slate-100/70 text-slate-700 hover:text-slate-900 font-medium';
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
