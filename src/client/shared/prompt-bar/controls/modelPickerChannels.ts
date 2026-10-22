export const DEFAULT_MODEL_CHANNEL = '默认';

export function modelChannel(model: { provider?: string }): string {
  return model.provider?.trim() || DEFAULT_MODEL_CHANNEL;
}

/** Channels keep first-seen order. An empty provider is the default channel. */
export function listModelChannels<T extends { provider?: string }>(models: readonly T[]): string[] {
  const channels: string[] = [];
  for (const model of models) {
    const channel = modelChannel(model);
    if (!channels.includes(channel)) channels.push(channel);
  }
  return channels;
}

export function modelsInChannel<T extends { provider?: string }>(models: readonly T[], channel: string): T[] {
  return models.filter((model) => modelChannel(model) === channel);
}
