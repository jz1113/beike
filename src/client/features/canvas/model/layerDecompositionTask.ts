import { apiFetch, proxyMediaUrl, readClientStorageConfig, storageConfigHeaders } from '@client/shared/api/apiClient';
import { getWorkspaceSecret } from '@client/shared/api/workspaceClient';
import { readReportedUsage, recordMediaTaskUsage } from '@client/shared/utils/modelUsage';
import { createUsageScope, usageDigest, type UsageScope } from '@client/shared/utils/usageScope';
import { saveCanvasProjects, useCanvasStore } from '../store/useCanvasStore';
import type { CanvasNode } from './types';

export interface DecomposedLayer {
  url: string;
  name: string;
  zIndex: number;
  width: number;
  height: number;
  bounds?: [number, number, number, number];
  placement?: 'separate';
}

export function parseDecomposedLayers(value: unknown): DecomposedLayer[] {
  let data = (value as { data?: unknown })?.data;
  if (data && !Array.isArray(data) && typeof data === 'object') data = (data as { data?: unknown }).data;
  if (!Array.isArray(data) || data.length < 2 || data.length > 17) {
    throw new Error('接口未返回底图和独立图层，请确认网关支持图层拆分');
  }
  const separate = data.every(item => item && item.z_index === undefined && item.bounding_box === undefined);
  const result = data
    .map((item, index): DecomposedLayer => {
      if (!item || typeof item !== 'object') throw new Error('图层响应无效');
      if (separate) {
        const url = item.url || (item.b64_json ? `data:image/png;base64,${item.b64_json}` : '');
        if (typeof url !== 'string' || !/^(https?:\/\/|data:image\/png;base64,)/.test(url)) throw new Error('图层图片地址无效');
        const size = typeof item.size === 'string' ? item.size.match(/^(\d+)x(\d+)$/) : null;
        return { url, name: item.name || `图层 ${index + 1}`, zIndex: index, width: size ? +size[1] : 0, height: size ? +size[2] : 0, placement: 'separate' };
      }
      const size = typeof item.size === 'string' ? item.size.match(/^(\d+)x(\d+)$/) : null;
      const url = item.url || (item.b64_json ? `data:image/png;base64,${item.b64_json}` : '');
      const bounds = item.bounding_box?.absolute;
      if (!size || !Number.isInteger(item.z_index) || item.z_index < 0 || !/^(https?:\/\/|data:image\/png;base64,)/.test(url)) {
        throw new Error('图层响应缺少有效的图片、尺寸或叠放顺序');
      }
      if (item.z_index > 0 && (!Array.isArray(bounds) || bounds.length !== 4 || !bounds.every(Number.isFinite) || bounds[2] <= bounds[0] || bounds[3] <= bounds[1])) {
        throw new Error('图层响应缺少有效位置坐标');
      }
      if (+size[1] <= 0 || +size[2] <= 0) throw new Error('图层尺寸无效');
      return { url, name: item.name || (item.z_index === 0 ? '底图' : `图层 ${item.z_index}`), zIndex: item.z_index, width: +size[1], height: +size[2], ...(bounds ? { bounds } : {}) };
    })
    .sort((a, b) => a.zIndex - b.zIndex);
  if (result[0].zIndex !== 0 || new Set(result.map(layer => layer.zIndex)).size !== result.length) {
    throw new Error('图层缺少底图或叠放顺序重复');
  }
  return result;
}

interface LayerOperation {
  id: string;
  input: string;
  status: 'pending' | 'completed' | 'rejected';
  scope?: UsageScope;
}

const blocked = () => new Error('原图层分离结果待核对，请保留原操作并查询回执；不会重新提交');
const validId = (id: unknown): id is string => typeof id === 'string' && /^[\w-]{1,256}$/.test(id);
const slot = (projectId: string, nodeId: string) => {
  if (!projectId || !nodeId || typeof localStorage === 'undefined') throw blocked();
  return 'beike.canvas.layer-operation.v1:' + usageDigest(JSON.stringify([getWorkspaceSecret(), projectId, nodeId]));
};

function read(key: string): LayerOperation | undefined {
  const raw = localStorage.getItem(key);
  if (!raw) return;
  const value = JSON.parse(raw) as LayerOperation;
  if (!value || !validId(value.id) || typeof value.input !== 'string' || !['pending', 'completed', 'rejected'].includes(value.status)) throw blocked();
  if (value.scope && (value.scope.workspaceId !== usageDigest(getWorkspaceSecret() || 'local') || value.scope.mediaType !== 'image' || !/^[a-f0-9]{64}$/.test(value.scope.channelId) || typeof value.scope.epoch !== 'string')) throw blocked();
  return value;
}

function write(key: string, value: LayerOperation) {
  const raw = JSON.stringify(value);
  localStorage.setItem(key, raw);
  if (localStorage.getItem(key) !== raw) throw blocked();
}

/** Unknown operations own the source across tabs, refreshes and input changes. */
async function reserveLayerOperation(projectId: string, nodeId: string, input: string, proposedId: string, previousId?: string, recoveryOnly = false) {
  try {
    const key = slot(projectId, nodeId);
    if (!validId(proposedId) || previousId && !validId(previousId)) throw blocked();
    const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined;
    if (!locks?.request) throw new Error('浏览器无法安全获取跨页面图层分离锁，未提交');
    const locked = <T>(fn: () => T) => locks.request(key, { mode: 'exclusive' }, fn);
    const reserved = await locked(() => {
      const saved = read(key);
      if (recoveryOnly && saved && previousId && saved.id !== previousId) throw blocked();
      if (saved && (recoveryOnly || saved.status === 'pending' || saved.input === input && saved.status === 'completed')) return { receipt: saved, fresh: false };
      const legacyId = !saved ? previousId : undefined;
      if (recoveryOnly && !legacyId) throw blocked();
      const receipt: LayerOperation = { id: legacyId || proposedId, input, status: 'pending', ...(!legacyId && !recoveryOnly ? {scope:createUsageScope('image','seedream-v5-pro/layer-decomposition',{})} : {}) };
      write(key, receipt);
      return { receipt, fresh: !legacyId && !recoveryOnly };
    });
    return { ...reserved, assertWorkspace: () => { if (slot(projectId, nodeId) !== key) throw blocked(); }, settle: (status: LayerOperation['status']) => locked(() => {
      const saved = read(key);
      if (saved?.id !== reserved.receipt.id) throw blocked();
      if (saved.status === 'completed' && status !== 'completed') return;
      write(key, { ...saved, status });
    }) };
  } catch (error) {
    throw new Error(error instanceof Error ? error.message : blocked().message);
  }
}

function readLayerResult(data: Record<string, unknown>): DecomposedLayer[] {
  if (!Array.isArray(data.layers)) throw new Error('图层响应无效');
  const layers = data.layers as DecomposedLayer[];
  parseDecomposedLayers({data:layers.map(layer=>layer?.placement==='separate' ? {url:layer.url} : {
    url:layer?.url,size:`${layer?.width}x${layer?.height}`,z_index:layer?.zIndex,bounding_box:layer?.bounds?{absolute:layer.bounds}:undefined,
  })});
  return layers;
}

/** One paid decomposition, independent of how many layers it produces. */
export function recordLayerUsage(data: Record<string, unknown>, original: UsageScope | undefined, operationId: string, httpOk: boolean) {
  if (!original || original.workspaceId !== usageDigest(getWorkspaceSecret() || 'local') || typeof data.model !== 'string'
    || typeof data.usageChannelId !== 'string' || !/^[a-f0-9]{64}$/.test(data.usageChannelId)) return;
  let complete = false;
  if (httpOk && data.success === true && data.submissionUnknown !== true) {
    try { complete = readLayerResult(data).length > 0; } catch { /* Paid invalid output has no successful media. */ }
  }
  if (!complete && !readReportedUsage(data.usage)) return;
  recordMediaTaskUsage({modelId:data.model,type:'image',scope:{...original,channelId:data.usageChannelId},localTaskId:operationId,
    success:complete,mediaCount:complete?1:0,billableCount:1,usage:data.usage});
}

export async function prepareLayerImage(url: string) {
  const response = await apiFetch(proxyMediaUrl(url));
  if (!response.ok) throw new Error('无法读取原图');
  const blob = await response.blob();
  if (blob.size > 30 * 1024 * 1024) throw new Error('原图不能超过 30MB');
  const bitmap = await createImageBitmap(blob);
  try {
    const pixels = bitmap.width * bitmap.height;
    if (pixels < 512 * 512 || pixels > 6000 * 6000 || bitmap.width / bitmap.height > 16 || bitmap.height / bitmap.width > 16) throw new Error('图片总像素需在 512×512 至 6000×6000 之间，宽高比不超过 16:1');
    const canvas = document.createElement('canvas'); canvas.width=bitmap.width; canvas.height=bitmap.height;
    const context = canvas.getContext('2d'); if (!context) throw new Error('无法读取图片像素');
    context.drawImage(bitmap,0,0);
    const data = canvas.toDataURL('image/png');
    if (data.length > 42_000_000) throw new Error('转换后的 PNG 超过 30MB，请缩小图片');
    return data;
  } finally {bitmap.close();}
}

export async function runLayerDecompositionTask(projectId:string, source:CanvasNode, prepare:()=>Promise<string>, prompt:string, operation:string, recoveryOnly = false) {
  const store=useCanvasStore.getState();
  if (!store.projects.some(p=>p.id===projectId)) return;
  let id=`layer-task-${operation}`;
  let reserved: Awaited<ReturnType<typeof reserveLayerOperation>> | undefined;
  let dispatched = false;
  let retryAllowed = false;
  try {
    const legacy = store.projects.find(p=>p.id===projectId)?.nodes.find(n=>n.layerTask && (n.layerSourceNodeId === source.id || n.referenceNodeIds?.includes(source.id)));
    reserved = await reserveLayerOperation(projectId, source.id, usageDigest(JSON.stringify([source.imageUrl,prompt])), operation,
      legacy?.layerOperationId || (legacy?.id.startsWith('layer-task-') ? legacy.id.slice('layer-task-'.length) : recoveryOnly ? operation : undefined), recoveryOnly);
    id=`layer-task-${reserved.receipt.id}`;
    const initial = useCanvasStore.getState();
    if (!initial.projects.find(p=>p.id===projectId)?.nodes.some(n=>n.id===id)) {
      initial.addNode(projectId,{id,type:'image',title:`${source.title || '图片'} · 图层分离`,x:source.x+source.width+80,y:source.y,width:source.width,height:source.height,status:'generating',referenceNodeIds:[source.id],referenceImageUrl:source.imageUrl,model:'seedream-v5-pro/layer-decomposition',content:prompt,layerTask:true,layerOperationId:reserved.receipt.id,layerSourceNodeId:source.id,layerPrompt:prompt});
    }
    reserved.assertWorkspace();
    let response: Response;
    if (reserved.fresh) {
      const image=await prepare();
      await saveCanvasProjects();
      reserved.assertWorkspace();
      dispatched = true;
      response=await apiFetch('/api/generate/layer-decomposition',{method:'POST',headers:{'Content-Type':'application/json','x-idempotency-key':reserved.receipt.id,...storageConfigHeaders()},body:JSON.stringify({model:'seedream-v5-pro/layer-decomposition',image,prompt,size:'auto',storageConfig:readClientStorageConfig()})});
    } else {
      response=await apiFetch('/api/generate/layer-decomposition?operationKey='+encodeURIComponent(reserved.receipt.id),{cache:'no-store'});
    }
    const result=await response.json();
    reserved.assertWorkspace();
    if (result.operationKey && result.operationKey !== reserved.receipt.id) throw new Error('原操作回执标识不一致');
    recordLayerUsage(result, reserved.receipt.scope, reserved.receipt.id, response.ok);
    if(!response.ok || !result.success || result.submissionUnknown === true) {
      if (result.submissionRejected === true && result.submissionUnknown !== true) { await reserved.settle('rejected'); retryAllowed = true; }
      throw new Error(result.error || '原图层分离结果待核对；请查询原回执，不会重新提交');
    }
    const layers = readLayerResult(result);
    await reserved.settle('completed');
    reserved.assertWorkspace();
    const current=useCanvasStore.getState();
    const target=current.projects.find(p=>p.id===projectId)?.nodes.find(n=>n.id===id);
    if(!target)return;
    const outputs = [...layers].sort((a, b) => a.zIndex - b.zIndex);
    outputs.forEach((layer, index) => {
      const width = target.width;
      const height = layer.width > 0 && layer.height > 0
        ? width * layer.height / layer.width
        : target.height || width;
      const fields = {
        imageUrl: layer.url,
        status: 'success' as const,
        width,
        height,
        title: `${source.title || '图片'} · ${layer.name}`,
        layerTask: false,
        layerRetryAllowed: false,
        referenceNodeIds: [source.id],
      };
      if (index === 0) {
        current.updateNode(projectId, id, fields);
        return;
      }
      const outputId = `${id}-layer-${layer.zIndex}`;
      if (current.projects.find(p => p.id === projectId)?.nodes.some(n => n.id === outputId)) return;
      current.addNode(projectId, {
        ...fields,
        id: outputId,
        type: 'image',
        x: target.x + index * (width + 40),
        y: target.y,
        model: 'seedream-v5-pro/layer-decomposition',
      });
    });
  } catch(error) {
    if (!reserved) throw error;
    try { reserved.assertWorkspace(); } catch { return; }
    if (reserved.fresh && !dispatched) {
      try { await reserved.settle('rejected'); retryAllowed = true; } catch { /* Failed settlement remains unknown. */ }
    }
    const current = useCanvasStore.getState();
    const target = current.projects.find(p=>p.id===projectId)?.nodes.find(n=>n.id===id);
    if (target?.status !== 'success') current.updateNode(projectId,id,{status:'error',layerRetryAllowed:retryAllowed,content:(error instanceof Error?error.message:'图层拆分失败')+(retryAllowed ? '；尚未提交或已明确拒绝，可重试拆分' : '；请查询原回执，不要重新提交')});
  }
}

/** Recovery is query-only, including legacy nodes whose original receipt may be absent. */
export async function recoverLayerDecompositionTask(projectId: string, node: CanvasNode) {
  const sourceId = node.layerSourceNodeId || node.referenceNodeIds?.[0];
  const source = useCanvasStore.getState().projects.find(p=>p.id===projectId)?.nodes.find(n=>n.id===sourceId)
    || { ...node, id: sourceId || `layer-source-${node.id}`, imageUrl: node.referenceImageUrl };
  try {
    await runLayerDecompositionTask(projectId, source, async () => { throw new Error('恢复只查询原回执'); }, node.content || '', node.layerOperationId || node.id.slice('layer-task-'.length), true);
  } catch (error) {
    useCanvasStore.getState().updateNode(projectId,node.id,{status:'error',content:error instanceof Error ? error.message : '原回执暂时无法读取；不会重新提交'});
  }
}

export async function retryLayerDecompositionTask(projectId: string, node: CanvasNode, prepareImage: (url: string) => Promise<string> = prepareLayerImage) {
  const sourceId = node.layerSourceNodeId || node.referenceNodeIds?.[0];
  const source = useCanvasStore.getState().projects.find(p=>p.id===projectId)?.nodes.find(n=>n.id===sourceId);
  if (!source || !node.referenceImageUrl || typeof node.layerPrompt !== 'string') throw new Error('原图或原拆分要求不可用，请从原图重新打开拆分');
  // The reservation is authoritative: a stale retry button still queries an unknown operation.
  await runLayerDecompositionTask(projectId, { ...source, imageUrl:node.referenceImageUrl }, () => prepareImage(node.referenceImageUrl!), node.layerPrompt, crypto.randomUUID());
}
