import type { CanvasNode } from './types';
import type { LightingParams } from './lighting';
import type { MultiAngleParams } from '@client/shared/modals/multiAngle';

export function calculateDisplayResolution(node: CanvasNode) {
  if (node.type === 'drawing') {
    if ((node.imageUrl || node.videoUrl) && node.resultWidth && node.resultHeight) {
      return `${node.resultWidth} × ${node.resultHeight}`;
    }
    if (node.status === 'generating' && node.generationSize) {
      return node.generationSize.replace(/[x*]/, ' × ');
    }
    return (node.drawing?.aspect || (node.generationKind === 'video' ? '16:9' : '1:1')).replace(':', ' : ');
  }
  if (node.resultWidth && node.resultHeight) return `${node.resultWidth} × ${node.resultHeight}`;
  return '';

}

const LIGHT_DIR_MAP: Record<string, string> = {
  left: '左侧',
  top: '顶部',
  right: '右侧',
  front: '前方',
  bottom: '底部',
  back: '后方',
};

const ANGLE_PRESET_MAP: Record<string, string> = {
  custom: '自定义',
  fisheye: '鱼眼视角',
  tilted: '倾斜视角',
  'front-high': '正面俯拍',
  'front-low': '正面仰拍',
  'pano-high': '全景俯拍',
  back: '背面视角',
};

function derivedPlacement(source: CanvasNode, options: { model?: string; quality?: string; aspectRatio?: string }) {
  const quality = options.quality === '1K' || options.quality === 'low' ? 'low'
    : options.quality === '4K' || options.quality === 'high' ? 'high' : 'medium';
  return {
    type: 'drawing' as const,
    generationKind: 'image' as const,
    drawing: { model: options.model || '', quality, aspect: options.aspectRatio || 'smart', count: 1, references: source.imageUrl ? [source.imageUrl] : [] },
    x: source.x + source.width + 48,
    y: source.y,
    width: source.width,
    height: source.height,
    referenceImageUrl: source.imageUrl,
  };
}

export function buildLightingDerivedNode(
  source: CanvasNode,
  params: LightingParams,
  options?: { model?: string; quality?: string; aspectRatio?: string },
) {
  const selectedModel = options?.model || params.model;
  const dirName = LIGHT_DIR_MAP[params.mainLight] || params.mainLight;
  const lightDesc = `主光:${dirName}, 光源位置:(${params.lightCoords.x}%, ${params.lightCoords.y}%), 亮度:${params.brightness}%, 光色:${params.color === 'original' ? '白光' : params.color}, 轮廓光:${params.rimLight ? '开启' : '关闭'}, 智能光照:${params.smartMode ? '开启' : '关闭'}`;
  return {
    ...derivedPlacement(source, { ...params, ...options }),
    title: `${source.title || (source.type === 'video' ? '视频素材' : '图片素材')} (打光)`,
    content: `以 @图片1 为参考，保持主体身份、形状、材质与构图，重新生成指定光照的图片。${lightDesc}。光源坐标以${params.viewMode === 'front' ? '正面' : '透视'}视图为准，真实呈现光影和反射。`,
    model: selectedModel,
  };
}

export function buildMultiAngleDerivedNode(
  source: CanvasNode,
  params: MultiAngleParams,
  options?: { model?: string; quality?: string; aspectRatio?: string },
) {
  const selectedModel = options?.model || params.model;
  const angleLabel = ANGLE_PRESET_MAP[params.preset] || '多角度';
  const angleDesc = `视角:${angleLabel}, 水平环绕:${params.azimuth}°, 垂直俯仰:${params.elevation}°, 景别:${params.shotScale}${params.promptEnabled && params.prompt ? `, 补充要求:${params.prompt}` : ''}`;
  return {
    ...derivedPlacement(source, { ...params, ...options }),
    title: `${source.title || (source.type === 'video' ? '视频素材' : '图片素材')} (${angleLabel})`,
    content: `以 @图片1 为参考，保持主体身份、形状与材质，生成同一主体的新镜头角度。${angleDesc}。0° 水平角为正面，180° 为背面；正俯仰为俯视，负俯仰为仰视。`,
    model: selectedModel,
  };
}
