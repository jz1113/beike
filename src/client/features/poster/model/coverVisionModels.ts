import { isVisionCapableModel } from '@shared/domain/prompts/vision';
import {
  readEffectiveModalityModels,
  readStoredApiProviders,
  resolveModalityModelRoute,
  type ModalityModelRoute,
} from '@shared/domain/models/modalityStorage';
import { configuredTextProtocol, resolveTextProtocol, type ResolvedTextProtocol } from '@shared/domain/models/textProtocol';
import { isOpenAIModelRouteId } from '@shared/domain/models/workflowModels';

export interface CoverVisionModel {
  selectionId: string;
  modelId: string;
  name: string;
  channel: string;
  textProtocol: ResolvedTextProtocol;
  unavailable: boolean;
}

export function listCoverVisionModels(): CoverVisionModel[] {
  const read = readEffectiveModalityModels('chat');
  if (!read.configured) return [];
  const providers = readStoredApiProviders();
  return read.models.flatMap((item) => {
    if (!isVisionCapableModel(item.modelId) || isOpenAIModelRouteId(item.modelId) || isOpenAIModelRouteId(item.id)) return [];
    const provider = item.channelId ? providers.find((candidate) => candidate.id === item.channelId) : undefined;
    const channel = item.channelId ? provider?.name || '渠道已移除' : '';
    return [{
      selectionId: item.id,
      modelId: item.modelId,
      name: item.name || item.modelId,
      channel,
      textProtocol: resolveTextProtocol(item.modelId, configuredTextProtocol(item)),
      unavailable: Boolean(item.channelId && !provider),
    }];
  });
}

export function coverVisionModelLabel(model: CoverVisionModel | undefined) {
  if (!model) return '选择反推模型';
  return model.channel ? `${model.name} · ${model.channel}` : model.name;
}

export function coverVisionPickerModels(models: CoverVisionModel[]) {
  return models.filter((model) => !model.unavailable).map((model) => ({
    id: model.selectionId,
    upstreamId: model.modelId,
    name: coverVisionModelLabel(model),
    desc: '封面视觉反推',
    ...(model.channel ? { provider: model.channel } : {}),
  }));
}

export function resolveCoverVisionRoute(selectionId: string): ModalityModelRoute {
  const read = readEffectiveModalityModels('chat');
  if (!read.configured) throw new Error('还没有同步可用的反推模型，请先在设置中同步');
  const item = read.models.find((candidate) => candidate.id === selectionId);
  if (!item) throw new Error('所选反推模型已失效，请重新选择');
  if (!isVisionCapableModel(item.modelId) || isOpenAIModelRouteId(item.modelId) || isOpenAIModelRouteId(item.id)) {
    throw new Error('所选模型不能读取封面图片');
  }
  if (item.channelId && !readStoredApiProviders().some((provider) => provider.id === item.channelId)) {
    throw new Error('所选模型的渠道已移除，请重新选择');
  }
  const route = resolveModalityModelRoute('chat', item.id);
  if (route.modelId !== item.modelId) throw new Error('所选反推模型已失效，请重新选择');
  return route;
}
