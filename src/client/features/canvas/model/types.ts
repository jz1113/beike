export interface NodeRunHistory {
  id: string;
  taskId?: string;
  imageUrl?: string;
  videoUrl?: string;
  audioUrl?: string;
  prompt?: string;
  model?: string;
  status: 'generating' | 'success' | 'error';
  createdAt: number;
}

export type CanvasPortType = 'image' | 'video' | 'audio' | 'prompt' | 'any';

export type CanvasLocalTool = 'video-input' | 'shot-breakdown' | 'image-tile' | 'table-editor-node';

export type CanvasPriorityTool = 'rh-app' | 'rh-comfy' | 'gen-3d' | 'director-3d' | 'video-analyze' | 'script-parse' | 'global-perspective' | 'jimeng-super-resolution' | 'motion-control';

export interface CanvasProviderField {
  nodeId: string;
  fieldName: string;
  fieldValue: string;
  sourceId?: string;
}

export interface CanvasPortraitTextureSettings {
  isActive?: boolean;
  subject_scene_fusion?: '轻度对齐' | '自然融合' | '深度融合';
  lighting_fusion?: '柔和补光' | '自然匹配' | '氛围强化';
  skin_texture?: '清透修饰' | '自然肤质' | '真实肌理';
  surface_texture?: '柔和纹理' | '自然纹理' | '颗粒质感';
  sharpness?: '柔焦' | '标准清晰' | '高清锐化';
}

export interface CanvasCinemaConfig {
  cameraId?: string | null;
  lensId?: string | null;
  focalLengthId?: string | null;
  apertureId?: string | null;
}

export interface CanvasSpecializedSettings {
  target?: string;
  fields?: CanvasProviderField[];
  textured?: boolean;
  threeDModel?: string;
  threeDMaterial?: 'geometry' | 'texture' | 'pbr';
  upscaleResolution?: '2k' | '4k' | '8k';
  upscaleProvider?: string;
  upscaleDetail?: number;
  pitch?: number;
  fov?: number;
  scriptConstraints?: string;
  scriptAssets?: { characters: string[]; scenes: string[]; props: string[] };
  scriptRows?: Array<{ scene: string; imagePrompt: string; videoPrompt: string }>;
  operation?: string;
  taskId?: string;
  taskStatus?: 'pending' | 'done' | 'failed';
  outputs?: Array<{url: string; extension: string}>;
  smartBuild?: boolean;
  objects?: Array<{ label: string; x: number; z: number; width: number; height: number; depth: number; color: string }>;
  yaw?: number;
  audioModel?: string;
  audioMode?: 'voice' | 'music' | 'sfx';
  voicePreset?: string;
  lyricMode?: string;
  voiceSubMode?: string;
  speechSpeed?: number;
  speechPitch?: number;
  speechEmotion?: string;
  cloneVoiceId?: string;
  cloneAudioUrl?: string;
  cloneAudioName?: string;
}

export type CanvasQuickNodeType =
  | CanvasPriorityTool
  | 'smart-build'
  | CanvasLocalTool
  | 'prompt'
  | 'video-prompt-optimizer'
  | 'file'
  | 'image-generation'
  | 'video-generation'
  | 'audio'
  | 'storyboard-node'
  | 'storyboard-chart-node'
  | 'video-timeline'
  | 'doodle-canvas'
  | 'compare'
  | 'save'
  | 'preview';

export interface CanvasTimelineClip {
  id: string;
  nodeId?: string;
  url: string;
  title?: string;
  mediaType?: 'video' | 'image' | 'audio';
  duration: number;
  trimStart?: number;
  trimEnd?: number;
}

export interface CanvasDoodleStroke {
  id: string;
  points: Array<{ x: number; y: number }>;
  color: string;
  width: number;
}

export interface CanvasFreeTextBox {
  id: string;
  x: number;
  y: number;
  text: string;
  color?: string;
  fontSize?: number;
}

export interface CanvasStudioGroup {
  id: string;
  title?: string;
  color?: string;
  nodeIds: string[];
  stackMode?: 'none' | 'card';
  stackRestoreLayout?: Record<string, { x: number; y: number }>;
}

export interface CanvasEdge {
  id: string;
  sourceNodeId: string;
  sourceHandle?: string;
  targetNodeId: string;
  targetHandle?: string;
  createdAt?: number;
}

export interface CanvasNode {
  promptOptimization?: import('@client/shared/agent/videoPromptOptimizer').VideoPromptOptimization;
  generationIntent?: import('@client/store/appStoreTypes').GenerationTask;
  /** Original StudioScene node snapshot retained for lossless round-trip serialization. */
  studioRaw?: StudioScene['nodes'][number];
  id: string;
  taskId?: string;
  promptOperationId?:string;
  promptRecoveryRequired?:boolean;
  textOperationId?: string;
  textRecoveryRequired?: boolean;
  speechOperationId?: string;
  speechRecoveryRequired?: boolean;
  layerTask?: boolean;
  layerOperationId?: string;
  layerRetryAllowed?: boolean;
  layerPrompt?: string;
  layerSourceNodeId?: string;
  resultWidth?: number;
  resultHeight?: number;
  generationSize?: string;
  layerHidden?: boolean;
  layerLocked?: boolean;
  groupId?: string;
  isFoldLeader?: boolean;
  foldedInGroupId?: string;
  foldedCount?: number;
  referenceNodeIds?: string[];
  runs?: NodeRunHistory[];
  activeRunIndex?: number;
  missingMedia?: boolean;
  mediaUpload?: boolean;
  highlighted?: boolean;
  colorPins?: string[];
  activeUploadTool?: string | null;
  uploadToolOrder?: string[];
  type: 'image' | 'video' | 'audio' | 'file' | 'drawing' | 'prompt' | 'note' | 'group' | 'frame' | 'compare' | 'save' | 'preview';
  specialized?: CanvasSpecializedSettings;
  modelUrl?: string;
  studioSubType?: CanvasLocalTool | CanvasPriorityTool | 'video-prompt-optimizer' | 'storyboard-node' | 'storyboard-chart-node' | 'video-timeline' | 'doodle-canvas';
  inpaintMaskUrl?: string;
  timelineSnap?: boolean;
  timelineClips?: CanvasTimelineClip[];
  doodleStrokes?: CanvasDoodleStroke[];
  storyboardChart?: { columns: number; rowHeight: number };
  storyboardShots?: Array<{ id: string; shotNumber: string; cameraAngle: string; movement: string; description: string; imageUrl?: string }>;
  compareMode?: 'split' | 'side-by-side' | 'overlay' | 'tap';
  compareBeforeUrl?: string;
  compareAfterUrl?: string;
  compareSplit?: number;
  saveFormat?: 'png' | 'jpg' | 'mp4' | 'zip';
  savePrefix?: string;
  previewFit?: 'contain' | 'cover';
  previewAutoPlay?: boolean;
  generationKind?: 'image' | 'video';
  drawing?: {
    optimizePrompt?: boolean;
    duration?: number;
    refMode?: string;
    model: string;
    quality: string;
    generationQuality?: 'max' | 'xhigh' | 'high' | 'medium' | 'low';
    backgroundMode?: 'auto' | 'transparent';
    customWidth?: number;
    customHeight?: number;
    base64Output?: boolean;
    aspect: string;
    count: number;
    references: string[];
    audio?: boolean;
    contextIrEnabled?: boolean;
    portraitTexture?: CanvasPortraitTextureSettings;
    cinemaConfig?: CanvasCinemaConfig;
  };
  audioUrl?: string;
  title?: string;
  content?: string;
  textPrompt?: string;
  textModel?: string;
  textColor?: string;
  textHtml?: string;
  textBackground?: string;
  textAutoHeight?: boolean;
  textWebSearch?: boolean;
  textBase64Image?: boolean;
  textApiFormat?: 'openai-compatible' | 'gemini-official';
  textTier?: 'Pro' | 'Flash';
  textReasoningEffort?: 'auto' | 'low' | 'medium' | 'high' | 'xhigh' | 'max';
  imageUrl?: string;
  videoUrl?: string;
  referenceImageUrl?: string;
  status?: 'idle' | 'generating' | 'success' | 'error';
  progress?: number;
  x: number;
  y: number;
  width: number;
  height: number;
  aspectRatio?: string;
  model?: string;
  createdAt: number;
}

export interface StudioScene {
  nodes: Array<{ id: string; type: string; [field: string]: unknown }>;
  connections: Array<{ id: string; from: string; to: string; [field: string]: unknown }>;
  groups: unknown[];
  textBoxes: unknown[];
  strokes: unknown[];
  view: { x: number; y: number; zoom: number };
}

export interface CanvasProject {
  nativeCommerce?: { kind: 'sales' | 'workshop' | 'poster'; version: 1; legacyScene?: StudioScene; productKey?: string; legacyRecoveryComplete?: boolean };
  poster?: { version: 1 | 2; hiddenOutputIds?: string[] };
  sales?: { draftId?: string; draft?: unknown; hiddenOutputIds?: string[] };
  workshop?: { batchId?: string; sourceBatchId?: string; hiddenOutputIds?: string[] };
  /** Native editor viewport; independent of the Studio scene viewport. */
  viewport?: { x: number; y: number; zoom: number };
  studioScene?: StudioScene;
  draft?: boolean;
  id: string;
  title: string;
  subtitle?: string;
  thumbnail?: string;
  updatedAt: number;
  createdAt: number;
  nodes: CanvasNode[];
  edges?: CanvasEdge[];
}

export interface CanvasSubject {
  id: string;
  name: string;
  type: 'image' | 'video';
  url: string;
}
