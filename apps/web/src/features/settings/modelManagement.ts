import { comflyTokenPrice } from './comflyReferencePrice';
import { isMultimodalWorkflowModel, workflowModelRouteId } from '@beike/domain/workflowModels';
import type { WorkflowModel } from './settingsShared';
import { type ComflyPriceMap } from './multimodalPriceSort';

export type ModelChannel = NonNullable<WorkflowModel['channel']>;
export type CapabilityFilter = 'all' | 'multimodal' | 'image' | 'video';
export type ModelDisplaySort = 'configured' | 'name' | 'price';
export const MODEL_CHANNELS: { id: ModelChannel; name: string; serviceId: string }[] = [
  { id: 'comfly', name: 'Comfly 网关', serviceId: 'comfly_gateway' },
  { id: 'openai', name: 'OpenAI / Responses', serviceId: 'openai_official' },
  { id: 'lianchi', name: '联池图像', serviceId: 'lianchi_images' },
];
export function modelChannel(model: Pick<WorkflowModel, 'channel' | 'id'>): ModelChannel {
  return model.channel ?? (model.id === 'openai/gpt-image-2' ? 'lianchi' : 'comfly');
}
export function channelName(channel: ModelChannel): string {
  return MODEL_CHANNELS.find(item => item.id === channel)!.name;
}
export function matchesCapability(model: WorkflowModel, filter: CapabilityFilter): boolean {
  return filter === 'all' || (filter === 'image' ? model.isImage : filter === 'video' ? model.isVideo : isMultimodalWorkflowModel(model));
}
/** Display-only: never mutate or persist the incoming call order. Unknown prices stay last. */
export function selectModelRows(models: readonly WorkflowModel[], options: {
  channel: ModelChannel | 'all'; capability: CapabilityFilter; query: string;
  status: 'all' | 'enabled' | 'disabled'; sort: ModelDisplaySort; prices?: ComflyPriceMap | null;
}): WorkflowModel[] {
  const query = options.query.trim().toLowerCase();
  return models.filter(model =>
    (options.channel === 'all' || modelChannel(model) === options.channel)
    && matchesCapability(model, options.capability)
    && (options.status === 'all' || (model.enabled !== false) === (options.status === 'enabled'))
    && (!query || [model.id, model.name, channelName(modelChannel(model))].some(value => value?.toLowerCase().includes(query)))
  ).sort((a, b) => {
    if (options.sort === 'name') return (a.name || a.id).localeCompare(b.name || b.id, 'zh-CN');
    if (options.sort !== 'price') return 0;
    const score = (m: WorkflowModel) => {
      const price = modelChannel(m) === 'comfly' && isMultimodalWorkflowModel(m) ? comflyTokenPrice(m.id, options.prices) : undefined;
      return price ? price.promptPer1k + price.completionPer1k : null;
    };
    const aPrice = score(a), bPrice = score(b);
    return aPrice === null ? (bPrice === null ? 0 : 1) : bPrice === null ? -1 : aPrice - bPrice;
  });
}
/** Restore only one channel's built-in entries; preserve custom routes and all other channels. */
export function restoreChannelPresets(current: readonly WorkflowModel[], presets: readonly WorkflowModel[], channel: ModelChannel): WorkflowModel[] {
  const presetIds = new Set(presets.filter(model => modelChannel(model) === channel).map(workflowModelRouteId));
  const remaining = current.filter(model => modelChannel(model) !== channel || model.isCustom || !presetIds.has(workflowModelRouteId(model)));
  const existing = new Set(remaining.map(workflowModelRouteId));
  return [...remaining, ...presets.filter(model => modelChannel(model) === channel && !existing.has(workflowModelRouteId(model)))];
}
export function formatModelPrice(value: number): string {
  return Number.isFinite(value) ? new Intl.NumberFormat('en-US', { maximumFractionDigits: 8 }).format(value) : '—';
}
