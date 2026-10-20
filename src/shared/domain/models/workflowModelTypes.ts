import type { TextProtocol } from './textProtocol';

export type WorkflowCapability = {
  textProtocol?: TextProtocol;
  apiTemplate?: string;
  customBaseUrl?: string;
  customApiKey?: string;
  id: string;
  /** Upstream model ID stays bare; routeId distinguishes equal IDs on separate gateways. */
  routeId?: string;
  enabled?: boolean;
  channel?: 'comfly' | 'openai' | 'deepseek' | 'lianchi' | (string & {});
  /** 服务商配置中的 ApiProvider.id，用于按渠道取地址和 Key。 */
  providerId?: string;
  name?: string;
  shortName?: string;
  provider?: string;
  badge?: string;
  desc?: string;
  description?: string;
  isMultimodal?: boolean;
  isImage?: boolean;
  isVideo?: boolean;
  isVision?: boolean;
  isAudio?: boolean;
  isAssistant?: boolean;
  isDistill?: boolean;
  isThinking?: boolean;
  isCustom?: boolean;
};
