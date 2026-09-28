import type { AssistantTaskState, AssistantRunMode, ReferenceScope } from '@shared/domain/assistant/taskPolicy';
/** Domain types used by the Zustand app store (and UI that consumes them). */

import type { DepthVideoStyle } from '@shared/domain/media/depthVideo';
import type { AssistantItem } from '@shared/domain/assistant/types';
import type { GenerationTask as ContractGenerationTask, GenerationMediaType } from '@shared/contracts/generate';

export type { GenerationMediaType };
export type GenerationTask = ContractGenerationTask & {
  depthStyle?: DepthVideoStyle;
};

export interface ChatSession {
  id: string;
  title: string;
  createdAt: number;
  isPinned?: boolean;
  tasks: GenerationTask[];
}

export interface MediaAttachment {
  /** Stable alias used by assistant image mentions, independent of attachment order. */
  mentionName?: string;
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
