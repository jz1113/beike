import type { CanvasNode } from '../types';
import type { LightingParams } from '../components/CanvasLightingModal';
import type { MultiAngleParams } from '@/shared/modals/multiAngle';

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
  if (node.type === 'video') return '1080 × 1920';
  const baseW = node.width || 360;
  const baseH = node.height || 360;
  const ratio = baseW / baseH;
  if (Math.abs(ratio - 1) < 0.15) return '1440 × 1440';
  if (ratio > 1.3) return '1920 × 1080';
  if (ratio < 0.8) return '1080 × 1440';
  return `${Math.round(baseW * 4)} × ${Math.round(baseH * 4)}`;
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

function derivedPlacement(source: CanvasNode) {
  return {
    type: source.type,
    imageUrl: source.imageUrl,
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
  const lightDesc = `主光:${dirName}, 亮度:${params.brightness}%${params.color !== 'original' ? `, 光色:${params.color}` : ''}${params.rimLight ? ', 轮廓光:开启' : ''}${selectedModel ? `, 模型:${selectedModel}` : ''}`;
  return {
    ...derivedPlacement(source),
    title: `${source.title || (source.type === 'video' ? '视频素材' : '图片素材')} (打光)`,
    content: `${source.content ? `${source.content}, ` : ''}[3D打光: ${lightDesc}]`,
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
  const angleDesc = `视角:${angleLabel}, 水平:${params.azimuth}°, 垂直:${params.elevation}°, 景别:${params.shotScale}${params.promptEnabled && params.prompt ? `, 提示词:${params.prompt}` : ''}${selectedModel ? `, 模型:${selectedModel}` : ''}`;
  return {
    ...derivedPlacement(source),
    title: `${source.title || (source.type === 'video' ? '视频素材' : '图片素材')} (${angleLabel})`,
    content: `${source.content ? `${source.content}, ` : ''}[多角度视角: ${angleDesc}]`,
    model: selectedModel,
  };
}
