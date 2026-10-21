export interface WorkflowModel {
  id: string;
  routeId?: string;
  /** Whether this route is offered in business model selectors; capabilities remain unchanged. */
  enabled?: boolean;
  channel?: 'comfly' | 'openai' | 'deepseek' | 'lianchi' | (string & {});
  providerId?: string;
  customBaseUrl?: string;
  customApiKey?: string;
  apiTemplate?: string;
  textProtocol?: import('@shared/domain/models/textProtocol').TextProtocol;
  name: string;
  shortName: string;
  badge?: string;
  desc?: string;
  isMultimodal?: boolean;
  isImage: boolean;
  isVideo: boolean;
  isVision?: boolean;
  isAssistant?: boolean;
  isDistill?: boolean;
  isThinking?: boolean;
  isCustom?: boolean;
}
