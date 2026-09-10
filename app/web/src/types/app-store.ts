import type { AssistantTaskState, AssistantRunMode, ReferenceScope } from '@beike/shared/assistant/taskPolicy';
/** Domain types used by the Zustand app store (and UI that consumes them). */

import type { DepthVideoStyle } from '@beike/shared/depthVideo';
import type { AssistantItem } from '@beike/shared/assistant/types';

export type GenerationMediaType = 'image' | 'video' | 'depth-image' | 'depth-video';

export interface GenerationTask {
  id: string; // unique shot key e.g. "shot-0" or "fast-xxx"
  batchId?: string; // 任务批次ID，支持同一任务批次内多图并排，不同任务换行隔离
  shotNo?: number;
  title: string;
  prompt: string;
  scene?: string; // 🌟 场景机位说明
  camera_focal_length?: string; // 🌟 镜头焦段
  angle?: string; // 🌟 拍摄角度
  lighting_type?: string; // 🌟 采光属性
  expression?: string;
  action?: string;
  model: string;
  size: string;
  quality: string;
  has_human?: boolean; // 🌟 是否包含人物/模特 (false: 纯静物/无人物)
  shot_type?: 'model_shot' | 'hand_held_only' | 'pure_product'; // 🌟 分镜类型
  mediaType?: GenerationMediaType;
  depthStyle?: DepthVideoStyle;
  videoDuration?: number; // 视频时长 (秒: 4, 5, 8, 10)
  videoResolution?: string; // 视频分辨率 ('720P' | '1080P' | '4K')
  videoRefMode?: string; // 视频参考模式 ('omni' | 'first_last_frame' | ...)
  generateAudio?: boolean; // 🌟 视频生成是否开启音频
  productImageUrl?: string; // 🌟 该分镜绑定的具体商品实物图（正面/背面/侧面/细节）
  referenceImageUrl?: string;
  referenceImages?: string[]; // 🌟 多参考素材/首尾帧列表
  images?: string[]; // 🌟 多模态引用素材列表
  useReferenceImage: boolean;
  taskType?: 'multi_angle' | 'smart_edit' | 'outpaint' | 'generation'; // 🌟 细分任务类型
  angleName?: string; // 🌟 多角度名称，如“微俯”、“仰视”
  sourceImageUrl?: string; // 🌟 溯源基准原图（用于多角度、智能编辑对准原图）
  status: 'IDLE' | 'IN_PROGRESS' | 'SUCCESS' | 'FAILURE';
  progress: string;
  taskId?: string;
  dbId?: string;
  resultUrl?: string;
  failReason?: string;
  createdAt?: number;
  sessionId?: string; // 🌟 所属对话会话ID
  sessionTitle?: string; // 🌟 所属对话会话名称
}

export interface ChatSession {
  id: string;
  title: string;
  createdAt: number;
  isPinned?: boolean;
  tasks: GenerationTask[];
}

export interface MediaAttachment {
  id?: string;
  type: 'image' | 'video' | 'document';
  url: string;
  thumbnailUrl?: string;
  name?: string;
  size?: number;
  mime?: string;
  /** 文档抽取出的纯文本（截断后），供聊天注入 */
  extractedText?: string;
}

export interface ProductWidgetData {
  imageSources?: Array<{ url: string; label: string; sourceUrl?: string }>;
  id?: string;
  itemId: string;
  skuId?: string;
  platform: string;
  title: string;
  price?: number | string;
  category?: string;
  picUrl?: string;
  detailUrls?: string;
  mainImages: string[];
  detailImages: string[];
  skuImages: string[];
  allImages: string[];
  props?: Record<string, string>;
  author?: string;
  videoUrl?: string | null;
  coreSpecs?: { label: string; value: string }[];
  sellingPoints?: string[];
  apiUsed?: string;
}

export interface AssistantMessage {
  task?: AssistantTaskState;
  runMode?: AssistantRunMode;
  referenceScope?: ReferenceScope;
  /** 本条消息发送时的技能快照，重试复用原始指令。 */
  usedSkill?: { name: string; skillId: string; systemPrompt: string; allowedTools?: string[] };
  imageBatchSessionId?: string;
  id: string;
  role: 'user' | 'assistant';
  content: string;
  attachments?: MediaAttachment[];
  timestamp: number;
  modelUsed?: string;
  productWidget?: ProductWidgetData; // 🌟 挂载的电商抓取结果与交互式选图卡片
  /** 智能体工具调用轨迹（轻量展示） */
  toolActivity?: Array<{
    name: string;
    displayName: string;
    status: 'running' | 'done' | 'error';
    detail?: string;
    action?: Record<string, unknown>;
    visualImages?: Array<{ url: string; label?: string }>;
  }>;
  /** 模型思考过程（reasoning） */
  thinking?: string;
  /** 流式生成阶段提示（准备/规划/生成中） */
  streamingStatus?: string;
  /** 请求失败标记（用于展示「重新执行」） */
  error?: boolean;
  interruptionReason?: string;
  /**
   * Codex-style 完整 item 列表。新版 UI 直接消费此字段；
   * 旧版组件会自动从 `items` 派生 legacy 字段（content/thinking/toolActivity），
   * 维持单源真相。
   * 仅 assistant 角色会有。
   */
  items?: AssistantItem[];
  /**
   * 当前 turn 的唯一 ID，用于持久化 & 跨会话定位。server 端 `turn/started` 事件携带。
   */
  turnId?: string;
}

export interface AssistantSession {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: AssistantMessage[];
  allowedTools?: string[];
}
