export type ModalityKind = 'chat' | 'image' | 'video' | 'three_d' | 'music' | 'voice' | 'avatar';

export interface ModalityModelItem {
  id: string;
  name: string;
  modality: ModalityKind;
  vendor: string;
  modelId: string;
  apiKey?: string;
  baseUrl?: string;
  isInfrequent?: boolean;
  isCustom?: boolean;
  isDefault?: boolean;
  /** 用户改过显示名后，模型 ID 不再自动改写名称。 */
  namePinned?: boolean;
  /** 同步来源渠道。空值表示全局默认地址，对应服务商配置里的 ApiProvider.id。 */
  channelId?: string;
}

export interface ModalityChannelOption {
  id: string;
  name: string;
  baseUrl: string;
  apiKey: string;
  hasKey: boolean;
}

export interface ModalityGlobalConfig {
  baseUrl: string;
  apiKey: string;
  baseUrlHistory: string[];
  apiKeyHistory: string[];
}

export interface ModalityVendorOption {
  id: string;
  name: string;
  logoKey: string;
  keywords: string[];
}
