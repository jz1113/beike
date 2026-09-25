import { getModelIcon } from '@/shared/ui/ModelIcons';
import { isMultimodalWorkflowModel, workflowModelRouteId } from '@beike/domain/workflowModels';
import { isApprovedModel } from '@beike/domain/modelCatalog';
import { channelName, formatModelPrice, modelChannel } from './modelManagement';
import type { WorkflowModel } from './settingsShared';

export default function WorkflowModelRow({ model, price, isDefault, onToggleEnabled, onDeleteModel }: {
  model: WorkflowModel;
  price?: { promptPer1k?: number; completionPer1k?: number };
  isDefault: boolean;
  onToggleEnabled: (id: string) => void;
  onDeleteModel: (id: string) => void;
}) {
  const routeId = workflowModelRouteId(model);
  const channel = modelChannel(model);
  const multimodal = isMultimodalWorkflowModel(model);
  const supported = isApprovedModel(model.id) && (channel !== 'openai' || multimodal);
  const hasPrice = channel === 'comfly' && multimodal && price?.promptPer1k !== undefined && price.completionPer1k !== undefined;
  return (
    <tr className="border-t border-slate-100 hover:bg-slate-50/70" data-model-route={routeId}>
      <td className="px-4 py-3 min-w-56 max-w-80">
        <div className="flex items-start gap-2.5">
          <div className="mt-0.5 w-8 h-8 shrink-0 rounded-lg border border-slate-200 flex items-center justify-center bg-white">{getModelIcon(model.id, 'w-4 h-4')}</div>
          <div className="min-w-0">
            <div className="font-semibold text-sm text-slate-900 break-words">{model.name || model.id}</div>
            <div className="text-[11px] text-slate-500 font-mono break-all mt-0.5" title={routeId}>{model.id}</div>
            {isDefault && <span className="text-[10px] text-indigo-600">默认选择{model.enabled === false ? ' · 已停用，请重新选择' : ''}</span>}
            {!supported && <span className="block text-[10px] text-amber-700">未纳入业务支持目录</span>}
          </div>
        </div>
      </td>
      <td className="px-3 py-3 text-xs text-slate-600 whitespace-nowrap">{channelName(channel)}</td>
      <td className="px-3 py-3"><div className="flex gap-1 text-[11px] whitespace-nowrap">
        {multimodal && <span className="px-2 py-1 rounded-md bg-indigo-50 text-indigo-700">多模态</span>}
        {model.isImage && <span className="px-2 py-1 rounded-md bg-amber-50 text-amber-700">生图</span>}
        {model.isVideo && <span className="px-2 py-1 rounded-md bg-sky-50 text-sky-700">视频</span>}
        {!multimodal && !model.isImage && !model.isVideo && <span className="text-slate-400">未识别</span>}
      </div></td>
      <td className="px-3 py-3 text-xs text-slate-600 whitespace-nowrap">
        {hasPrice ? <><div className="font-mono">{formatModelPrice(price.promptPer1k!)} / {formatModelPrice(price.completionPer1k!)}</div><div className="text-[10px] text-slate-400 mt-1">฿ / 1K token · 输入 / 输出</div></> : <span className="text-slate-400">未提供</span>}
      </td>
      <td className="px-3 py-3 whitespace-nowrap">
        <button type="button" role="switch" aria-checked={model.enabled !== false} aria-label={`${model.name || model.id} · ${channelName(channel)}：在选择器中启用`}
          onClick={() => onToggleEnabled(routeId)} className={`px-2.5 py-1 rounded-full text-xs font-medium ${model.enabled === false ? 'bg-slate-100 text-slate-500' : 'bg-emerald-50 text-emerald-700'}`}>
          {model.enabled === false ? '已停用' : '已启用'}
        </button>
      </td>
      <td className="px-3 py-3 text-right">
        <button type="button" onClick={() => onDeleteModel(routeId)} aria-label={`移出 ${model.name || model.id} · ${channelName(channel)}`} className="text-xs text-slate-500 hover:text-rose-600 rounded-lg px-2 py-1 hover:bg-rose-50">移出</button>
      </td>
    </tr>
  );
}
