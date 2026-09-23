import { getApprovedModel } from '@beike/domain/modelCatalog';
import { inferWorkflowCapabilitiesFromId } from '@beike/domain/workflowModels';
import type { GatewayModelItem } from './GatewayModelModal';

/** CC Switch/Codex catalog is a local model list, not an authentication file. */
export function parseCodexCatalog(raw: unknown): GatewayModelItem[] {
  const entries = raw && typeof raw === 'object' && 'models' in raw ? (raw as { models: unknown }).models : null;
  if (!Array.isArray(entries)) throw new Error('请选择含 models 数组的 CC Switch/Codex 模型目录 JSON');
  const seen = new Set<string>();
  const models = entries.flatMap((entry): GatewayModelItem[] => {
    const id = typeof entry === 'string' ? entry.trim()
      : entry && typeof entry === 'object'
        ? String((entry as { slug?: unknown; id?: unknown; model?: unknown }).slug
          || (entry as { id?: unknown }).id
          || (entry as { model?: unknown }).model || '').trim()
        : '';
    if (!id || seen.has(id)) return [];
    seen.add(id);
    const item = entry && typeof entry === 'object' ? entry as { display_name?: unknown; displayName?: unknown } : {};
    const approved = getApprovedModel(id);
    const caps = inferWorkflowCapabilitiesFromId(id);
    const name = approved?.name || (typeof item.display_name === 'string' ? item.display_name
      : typeof item.displayName === 'string' ? item.displayName : id);
    return [{
      id, name, shortName: approved?.shortName || name,
      category: caps.isImage ? 'image' : caps.isVideo ? 'video' : caps.isAudio ? 'audio' : caps.isEmbedding ? 'embedding' : 'text',
      isVision: caps.isVision, isThinking: caps.isThinking, isImage: caps.isImage,
      isVideo: caps.isVideo, isAudio: caps.isAudio, isEmbedding: caps.isEmbedding,
      isTool: false, owned_by: 'openai', isCustom: false,
      supported: Boolean(approved?.capability === 'multimodal' && /^gpt-(?:5\.6|6)(?:-|$)/i.test(id)),
    }];
  });
  if (models.length === 0) throw new Error('目录中没有可读取的模型 ID');
  return models;
}
