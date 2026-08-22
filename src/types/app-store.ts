/** Domain types used by the Zustand app store (and UI that consumes them). */

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
  mediaType?: 'image' | 'video'; // 🌟 媒体类型：图片生图 or 视频生成
  videoDuration?: number; // 视频时长 (秒: 4, 5, 8, 10)
  videoResolution?: string; // 视频分辨率 ('720P' | '1080P' | '4K')
  videoRefMode?: string; // 视频参考模式 ('omni' | 'first_last_frame' | ...)
  productImageUrl?: string; // 🌟 该分镜绑定的具体商品实物图（正面/背面/侧面/细节）
  referenceImageUrl?: string;
  referenceImages?: string[]; // 🌟 多参考素材/首尾帧列表
  images?: string[]; // 🌟 多模态引用素材列表
  useReferenceImage: boolean;
  status: 'IDLE' | 'IN_PROGRESS' | 'SUCCESS' | 'FAILURE';
  progress: string;
  taskId?: string;
  dbId?: string;
  resultUrl?: string;
  failReason?: string;
  createdAt?: number;
}

export interface ChatSession {
  id: string;
  title: string;
  createdAt: number;
  isPinned?: boolean;
  tasks: GenerationTask[];
}

export interface MediaAttachment {
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
  id?: string;
  itemId: string;
  platform: string;
  title: string;
  price?: number | string;
  category?: string;
  picUrl?: string;
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
  }>;
  /** 请求失败标记（用于展示「重新执行」） */
  error?: boolean;
  /** 流式生成阶段提示（准备/规划/生成中） */
  streamingStatus?: string;
}

export interface AssistantSession {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: AssistantMessage[];
}
