/**
 * 模型适配层类型：统一网关入口 + 按模型差异化 payload / 端点候选
 * 文档（网站接口详情.md）里的「各模型单独页」多数仍指向同一 URL，差异在 body。
 */

export type MediaKind = 'image' | 'video';

export interface GatewayEndpoints {
  /** 提交任务的候选 URL（按优先级） */
  submit: string[];
  /** 查询任务的候选 URL 模板，用 {taskId} 占位 */
  query: string[];
}

export interface ImageAdapterInput {
  model: string;
  prompt: string;
  size?: string;
  quality?: string;
  n?: number;
  hasHuman?: boolean;
  shotType?: string;
  /** 已转码的参考图（主图 + 多图） */
  images?: string[];
  primaryImage?: string;
  productImage?: string;
  faceImage?: string;
  sceneImage?: string;
  compositionImage?: string;
  preferEdits?: boolean;
  /** 爆款复刻：启用防穿帮负向词与 @图片槽位兜底 */
  socialMode?: boolean;
  /** Hub 快速生图：不注入工坊守卫与电商长负向词 */
  plainMode?: boolean;
}

export interface ImageAdapterResult {
  family: string;
  modelId: string;
  useEdits: boolean;
  payload: Record<string, unknown>;
  endpoints: (baseUrl: string) => GatewayEndpoints;
}

export interface VideoAdapterInput {
  model: string;
  prompt: string;
  duration?: number;
  aspectRatio?: string;
  resolution?: string;
  images?: string[];
  videos?: string[];
  firstFrame?: string;
  lastFrame?: string;
  refMode?: string;
  watermark?: boolean;
  audio?: boolean;
  fps?: number;
  seed?: number;
  cameraMotion?: string;
  character?: string;
  storyboard?: unknown;
}

export interface VideoAdapterResult {
  family: string;
  modelId: string;
  payload: Record<string, unknown>;
  endpoints: (baseUrl: string) => GatewayEndpoints;
}

export interface ImageModelAdapter {
  id: string;
  match: (modelId: string) => boolean;
  build: (input: ImageAdapterInput) => ImageAdapterResult;
}

export interface VideoModelAdapter {
  id: string;
  match: (modelId: string) => boolean;
  build: (input: VideoAdapterInput) => VideoAdapterResult;
}
