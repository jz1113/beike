import { drawingGeometry } from './canvasNodeFactory';
import type { CanvasNode, CanvasEdge, CanvasPortType, CanvasPortraitTextureSettings, NodeRunHistory } from './types';

export const PORTRAIT_TEXTURE_GROUPS = [
  {
    key: 'subject_scene_fusion',
    title: '人景融合',
    options: ['轻度对齐', '自然融合', '深度融合'] as const,
    default: '自然融合' as const,
    intents: {
      轻度对齐: '人物与背景仅做轻度贴合，尽量保持原图空间关系和边缘，不做场景重绘',
      自然融合: '人物与场景自然贴合，边缘过渡干净，保持原图空间关系，避免重绘背景',
      深度融合: '人物更深地融入环境光与景深，仍不改变构图、身份与背景主体',
    },
  },
  {
    key: 'lighting_fusion',
    title: '光影融合',
    options: ['柔和补光', '自然匹配', '氛围强化'] as const,
    default: '自然匹配' as const,
    intents: {
      柔和补光: '对人物做柔和补光，提亮暗部但不改变场景主光方向',
      自然匹配: '人物受光与场景光方向、色温、对比自然统一',
      氛围强化: '强化人物与场景的光影氛围，保留原图光位逻辑，避免戏剧化改脸',
    },
  },
  {
    key: 'skin_texture',
    title: '皮肤',
    options: ['清透修饰', '自然肤质', '真实肌理'] as const,
    default: '自然肤质' as const,
    intents: {
      清透修饰: '皮肤清透修饰，去掉油光与明显瑕疵，保留基本肤质，禁止厚磨皮',
      自然肤质: '皮肤质感自然，保留毛孔与细微纹理，去除油光与明显瑕疵，不过度磨皮',
      真实肌理: '强化真实肌理与毛孔细节，避免塑料感、滤镜感和过度锐化',
    },
  },
  {
    key: 'surface_texture',
    title: '纹理',
    options: ['柔和纹理', '自然纹理', '颗粒质感'] as const,
    default: '自然纹理' as const,
    intents: {
      柔和纹理: '服装与表面纹理略作柔化，避免脏噪和压缩颗粒',
      自然纹理: '服装、发丝与材质保持自然真实细节，避免塑料感',
      颗粒质感: '保留轻微胶片颗粒与材质层次，但不脏、不糊',
    },
  },
  {
    key: 'sharpness',
    title: '锐度',
    options: ['柔焦', '标准清晰', '高清锐化'] as const,
    default: '标准清晰' as const,
    intents: {
      柔焦: '整体略柔，五官仍可辨，避免糊成一张',
      标准清晰: '五官立体、眼神光清晰，发丝边缘干净',
      高清锐化: '提升细节清晰度，避免过锐白边和数字锐化伪影',
    },
  },
] as const;

export const DEFAULT_PORTRAIT_TEXTURE: Required<CanvasPortraitTextureSettings> = {
  isActive: true,
  subject_scene_fusion: '自然融合',
  lighting_fusion: '自然匹配',
  skin_texture: '自然肤质',
  surface_texture: '自然纹理',
  sharpness: '标准清晰',
};

export function buildPortraitTexturePrompt(
  settings?: CanvasPortraitTextureSettings | null,
  note?: string,
): string {
  if (!settings?.isActive) return '';
  const trimmed = (note || '').trim();
  const parts: string[] = ['对参考图人像进行质感优化。'];
  if (trimmed) parts.push(`补充要求：${trimmed}。`);
  for (const group of PORTRAIT_TEXTURE_GROUPS) {
    const rawVal = settings[group.key] as string | undefined;
    const val = (group.options as readonly string[]).includes(rawVal || '') ? rawVal! : group.default;
    const intent = (group.intents as Record<string, string>)[val] || val;
    parts.push(`${group.title}采用${val}，${intent}。`);
  }
  parts.push('保持人物身份、年龄、脸型、五官、发型、服装与构图不变，不改变背景主体关系，不得出现文字与水印。');
  return parts.join('');
}

const isProviderTool = (node: CanvasNode) => node.studioSubType === 'rh-app' || node.studioSubType === 'rh-comfy';
const isImageTool = (node: CanvasNode) => isProviderTool(node) || node.studioSubType === 'director-3d' || node.studioSubType === 'global-perspective' || node.studioSubType === 'jimeng-super-resolution' || node.studioSubType === 'video-input' || node.studioSubType === 'image-tile';
export const isTextSource = (node: CanvasNode) => node.type === 'prompt' || (node.type === 'note' && !isImageTool(node) && node.studioSubType !== 'shot-breakdown' && node.studioSubType !== 'gen-3d');
export const canReference = (node: CanvasNode) => Boolean(node.generationKind !== 'video' && node.imageUrl && !node.missingMedia && (node.type === 'image' || node.type === 'drawing' || isImageTool(node)));
export const canReferenceVideo = (node: CanvasNode) => Boolean(node.videoUrl && !node.missingMedia && (node.type === 'video' || node.generationKind === 'video' || isProviderTool(node)));
export const canReferenceAudio = (node: CanvasNode) => Boolean(node.audioUrl && (node.type === 'audio' || isProviderTool(node) || Boolean(node.drawing?.audio)));
export const canConnect = (node: CanvasNode) =>
  node.type === 'file' || node.type === 'image' || node.type === 'video' || node.type === 'audio' ||
  node.type === 'note' || isTextSource(node) || node.type === 'drawing' || node.type === 'compare' || node.type === 'preview' ||
  canReference(node) || canReferenceVideo(node) || canReferenceAudio(node);
export const referenceReady = (node: CanvasNode) => isTextSource(node) ? Boolean(node.content?.trim()) : canReference(node) || canReferenceVideo(node) || canReferenceAudio(node) || node.type === 'compare';

export interface CanvasPortDefinition {
  id: string;
  label: string;
  type: CanvasPortType;
  position: 'left' | 'right' | 'top' | 'bottom';
  offsetY?: number;
}

export function getNodeOutputPorts(node: CanvasNode): CanvasPortDefinition[] {
  if (node.studioSubType === 'shot-breakdown') return [];
  if (node.studioSubType === 'gen-3d') return [{id:'output-model', label:'3D 模型', type:'any', position:'right'}];
  if (isProviderTool(node)) {
    const type = node.videoUrl ? 'video' : node.audioUrl ? 'audio' : node.imageUrl ? 'image' : 'any';
    return [{id:'output-provider', label:'生成结果', type, position:'right'}];
  }
  if (isTextSource(node)) {
    return [{ id: 'output-text', label: '提示词文本', type: 'prompt', position: 'right' }];
  }
  if (node.type === 'audio') {
    return [{ id: 'output-audio', label: '音频流', type: 'audio', position: 'right' }];
  }
  if (node.type === 'video' || node.generationKind === 'video') {
    return [
      { id: 'output-video', label: '视频流', type: 'video', position: 'right' },
      { id: 'output-video-audio', label: '原声分轨', type: 'audio', position: 'bottom' },
    ];
  }
  if (node.type === 'compare') {
    return [{ id: 'output-compare', label: '对比产物', type: 'image', position: 'right' }];
  }
  if (node.type === 'preview') {
    return [{ id: 'output-preview', label: '透传监控流', type: 'any', position: 'right' }];
  }
  if (node.type === 'save') {
    return [];
  }
  // Default image source or image drawing
  return [{ id: 'output-image', label: '图像输出', type: 'image', position: 'right' }];
}

export function getNodeInputPorts(node: CanvasNode): CanvasPortDefinition[] {
  if (isProviderTool(node) || node.studioSubType === 'gen-3d' || node.studioSubType === 'director-3d') {
    return [{id:'input-context', label:'连接参考素材', type:'any', position:'left'}];
  }
  if (node.studioSubType === 'global-perspective' || node.studioSubType === 'jimeng-super-resolution') {
    return [{id:'input-ref-image', label:'参考图片', type:'image', position:'left'}];
  }
  if (node.studioSubType === 'motion-control') return [
    {id:'input-ref-image', label:'角色图片', type:'image', position:'left', offsetY:75},
    {id:'input-video-ref', label:'动作参考视频', type:'video', position:'left', offsetY:135},
    {id:'input-prompt', label:'补充描述', type:'prompt', position:'left', offsetY:195},
  ];
  if (node.studioSubType === 'script-parse') {
    return [{id:'input-script', label:'原始剧本', type:'prompt', position:'left'}];
  }
  if (node.studioSubType === 'video-analyze') {
    return [{id:'input-video-ref', label:'参考视频', type:'video', position:'left'}];
  }
  if (node.studioSubType === 'video-input' || node.studioSubType === 'shot-breakdown') {
    return [{ id: 'input-video-ref', label: '参考视频', type: 'video', position: 'left' }];
  }
  if (node.studioSubType === 'image-tile') {
    return [{ id: 'input-ref-image', label: '待拼接图片', type: 'image', position: 'left' }];
  }
  if (node.studioSubType === 'table-editor-node') {
    return [{ id: 'input-context', label: '参考素材与文本', type: 'any', position: 'left' }];
  }

  if (node.type === 'compare') {
    return [
      { id: 'input-compare-before', label: '原图/修前', type: 'image', position: 'left', offsetY: 60 },
      { id: 'input-compare-after', label: '对比图/修后', type: 'image', position: 'left', offsetY: 120 },
    ];
  }
  if (node.type === 'save') {
    return [
      { id: 'input-save-media', label: '待导出媒体', type: 'any', position: 'left', offsetY: 80 },
    ];
  }
  if (node.type === 'preview') {
    return [
      { id: 'input-preview-media', label: '视频/画面流', type: 'any', position: 'left', offsetY: 80 },
    ];
  }
  if (node.type === 'prompt' || node.type === 'note') {
    return [
      { id: 'input-context', label: '参考素材与上下文', type: 'any', position: 'left', offsetY: 60 },
    ];
  }
  if (node.type === 'audio') {
    return [
      { id: 'input-script', label: '配音文本/参考音频', type: 'any', position: 'left', offsetY: 60 },
    ];
  }
  if (node.type === 'image' || node.type === 'video' || node.type === 'file') {
    return [
      { id: 'input-media', label: '参考素材输入', type: 'any', position: 'left' },
    ];
  }
  if (node.type !== 'drawing') return [];
  if (node.generationKind === 'video') {
    return [
      { id: 'input-prompt', label: '提示词', type: 'prompt', position: 'left', offsetY: 30 },
      { id: 'input-first-frame', label: '首帧/垫图', type: 'image', position: 'left', offsetY: 70 },
      { id: 'input-video-ref', label: '参考视频', type: 'video', position: 'left', offsetY: 110 },
      { id: 'input-audio', label: '伴奏/音效', type: 'audio', position: 'left', offsetY: 150 },
    ];
  }
  return [
    { id: 'input-prompt', label: '提示词', type: 'prompt', position: 'left', offsetY: 40 },
    { id: 'input-ref-image', label: '参考垫图', type: 'image', position: 'left', offsetY: 90 },
  ];
}

export function syncEdgesWithNodeReferences(nodes: CanvasNode[], existingEdges?: CanvasEdge[]): CanvasEdge[] {
  const edgeMap = new Map<string, CanvasEdge>();
  (existingEdges || []).forEach(edge => {
    edgeMap.set(`${edge.sourceNodeId}->${edge.targetNodeId}`, edge);
  });

  const synced: CanvasEdge[] = [];
  const nodeMap = new Map(nodes.map(n => [n.id, n]));

  nodes.forEach(target => {
    (target.referenceNodeIds || []).forEach(sourceId => {
      const source = nodeMap.get(sourceId);
      if (!source) return;
      const key = `${sourceId}->${target.id}`;
      const existing = edgeMap.get(key);
      if (existing) {
        synced.push(existing);
      } else {
        const outPorts = getNodeOutputPorts(source);
        const inPorts = getNodeInputPorts(target);
        synced.push({
          id: `edge-${sourceId}-${target.id}`,
          sourceNodeId: sourceId,
          sourceHandle: outPorts[0]?.id || 'output',
          targetNodeId: target.id,
          targetHandle: inPorts.find(p => p.type === outPorts[0]?.type)?.id || inPorts[0]?.id || 'input',
          createdAt: Date.now(),
        });
      }
    });
  });

  return synced;
}

export function appendNodeRun(
  node: CanvasNode,
  run: Omit<NodeRunHistory, 'id' | 'createdAt'> & { id?: string; createdAt?: number },
): Partial<CanvasNode> {
  const newRun: NodeRunHistory = {
    id: run.id || `run-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    taskId: run.taskId,
    imageUrl: run.imageUrl,
    videoUrl: run.videoUrl,
    audioUrl: run.audioUrl,
    prompt: run.prompt,
    model: run.model,
    status: run.status,
    createdAt: run.createdAt || Date.now(),
  };

  const runs = [newRun, ...(node.runs || [])].slice(0, 20);
  return {
    runs,
    activeRunIndex: 0,
    imageUrl: newRun.imageUrl ?? node.imageUrl,
    videoUrl: newRun.videoUrl ?? node.videoUrl,
    audioUrl: newRun.audioUrl ?? node.audioUrl,
  };
}

export function rollbackNodeRun(node: CanvasNode, runIndex: number): Partial<CanvasNode> | null {
  if (!node.runs || !node.runs[runIndex]) return null;
  const targetRun = node.runs[runIndex];
  return {
    activeRunIndex: runIndex,
    imageUrl: targetRun.imageUrl,
    videoUrl: targetRun.videoUrl,
    audioUrl: targetRun.audioUrl,
  };
}

export function nodeBounds(node: CanvasNode) {
  if (node.type === 'drawing' && (!node.studioSubType || node.studioSubType === 'motion-control')) {
    const size = drawingGeometry(node);
    return { x: node.x + (node.width - size.width) / 2, y: node.y, ...size };
  }
  return { x: node.x, y: node.y, width: node.width, height: node.height };
}

export function isCanvasNodeVisible(node: CanvasNode) {
  return !node.layerHidden && !node.foldedInGroupId;
}

export function canvasNavigationNodes(nodes: CanvasNode[]) {
  return nodes.filter(isCanvasNodeVisible).flatMap(node => {
    const bounds = nodeBounds(node);
    return Object.values(bounds).every(Number.isFinite) && bounds.width > 0 && bounds.height > 0
      ? [{ node, bounds }] : [];
  });
}

export function connectionError(nodes: CanvasNode[], sourceId: string, targetId: string, edges?: { sourceNodeId: string; targetNodeId: string }[]) {
  const source = nodes.find(node => node.id === sourceId);
  const target = nodes.find(node => node.id === targetId);
  const validTargetTypes = ['drawing', 'compare', 'save', 'preview', 'prompt', 'note', 'audio', 'image', 'video', 'file'];
  if (!source || !target || !canConnect(source) || !validTargetTypes.includes(target.type)) {
    return '请选择生成、文本、音频、对比、监视或保存节点作为下一步';
  }
  if (canReferenceVideo(source) && target.type === 'drawing' && target.generationKind !== 'video' && target.studioSubType !== 'video-timeline') {
    return '视频素材请连接到视频生成、智能分析或剪辑节点';
  }
  if (source.layerLocked || target.layerLocked) return '请先解锁节点';
  if (sourceId === targetId) return '不能连接节点自身';
  if (target.referenceNodeIds?.includes(sourceId)) return '这两个节点已经连接';
  const visited = new Set<string>();
  const upstream = (id: string) => {
    const refs = nodes.find(node => node.id === id)?.referenceNodeIds || [];
    const viaEdges = (edges || []).filter(edge => edge.targetNodeId === id).map(edge => edge.sourceNodeId);
    return [...refs, ...viaEdges];
  };
  const reaches = (id: string): boolean => {
    if (id === targetId) return true;
    if (visited.has(id)) return false;
    visited.add(id);
    return upstream(id).some(reaches);
  };
  return reaches(sourceId) ? '这条连线会形成循环，请选择其他节点' : '';
}
export function linkedPrompt(node: CanvasNode, nodes: CanvasNode[]) {
  const upstreamTexts = (node.referenceNodeIds || [])
    .map((id) => nodes.find((item) => item.id === id))
    .filter((item): item is CanvasNode => !!item && isTextSource(item))
    .map((item) => item.content?.trim());
  const portraitPrompt = buildPortraitTexturePrompt(node.drawing?.portraitTexture, node.content);
  return [...upstreamTexts, portraitPrompt || node.content?.trim()].filter(Boolean).join('\n\n');
}
