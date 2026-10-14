export type WorkflowCapability = {
  id: string;
  /** Upstream model ID stays bare; routeId distinguishes equal IDs on separate gateways. */
  routeId?: string;
  enabled?: boolean;
  channel?: 'comfly' | 'openai' | 'deepseek' | 'lianchi' | (string & {});
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
  isAssistant?: boolean;
  isDistill?: boolean;
  isThinking?: boolean;
  isCustom?: boolean;
};
