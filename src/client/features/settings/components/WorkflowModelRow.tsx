import { ArrowUp, ArrowDown, GripVertical } from 'lucide-react';
import type { DragEventHandler } from 'react';
import { ComflyModelPrice } from './ComflyModelPrice';
import type { ComflyPriceMap } from '../model/multimodalPriceSort';
import { getModelIcon } from '@client/shared/ui/ModelIcons';
import { isMultimodalWorkflowModel, workflowModelRouteId } from '@shared/domain/models/workflowModels';
import { isApprovedModel } from '@shared/domain/models/modelCatalog';
import { channelName, modelChannel } from '../model/modelManagement';
import type { WorkflowModel } from './settingsShared';

export default function WorkflowModelRow({ model, prices, isDefault, onToggleEnabled, onDeleteModel, showChannel = true, onMoveUp, onMoveDown, reorderEnabled, onDragStart, onDragOver, onDrop, onDragEnd, dropTarget }: {
  model: WorkflowModel;
  reorderEnabled?: boolean;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  onDragStart?: DragEventHandler<HTMLButtonElement>;
  onDragOver?: DragEventHandler<HTMLTableRowElement>;
  onDrop?: DragEventHandler<HTMLTableRowElement>;
  onDragEnd?: DragEventHandler<HTMLButtonElement>;
  dropTarget?: boolean;
  prices?: ComflyPriceMap | null;
  isDefault: boolean;
  showChannel?: boolean;
  onToggleEnabled: (id: string) => void;
  onDeleteModel: (id: string) => void;
}) {
  const routeId = workflowModelRouteId(model);
  const channel = modelChannel(model);
  const multimodal = isMultimodalWorkflowModel(model);
  const supported = isApprovedModel(channel === 'deepseek' ? routeId : model.id) && (channel !== 'openai' || multimodal);
  return (
    <tr className={`border-t border-slate-100 hover:bg-slate-50/70 ${dropTarget ? 'bg-indigo-50 outline outline-1 outline-indigo-300' : ''}`} data-model-route={routeId} onDragOver={onDragOver} onDrop={onDrop}>
      <td className="px-4 py-3 min-w-56 max-w-80">
        <div className="flex items-start gap-2.5">
          {reorderEnabled && <div className="settings-row-order">
            <button type="button" draggable onDragStart={onDragStart} onDragEnd={onDragEnd} aria-label={`拖动排序 ${model.name || model.id}`} title="拖动排序；也可使用上下按钮" className="cursor-grab active:cursor-grabbing"><GripVertical className="h-4 w-4" /></button>
            <div className="flex"><button type="button" disabled={!onMoveUp} onClick={onMoveUp} aria-label={`上移 ${model.name || model.id}`} title="上移"><ArrowUp className="h-3 w-3" /></button><button type="button" disabled={!onMoveDown} onClick={onMoveDown} aria-label={`下移 ${model.name || model.id}`} title="下移"><ArrowDown className="h-3 w-3" /></button></div>
          </div>}
          <div className="mt-0.5 w-8 h-8 shrink-0 rounded-lg flex items-center justify-center bg-transparent">{getModelIcon(model.id, 'w-4 h-4')}</div>
          <div className="min-w-0">
            <div className="font-semibold text-sm text-slate-900 break-words">{model.name || model.id}</div>
            <div className="text-[11px] text-slate-500 font-mono break-all mt-0.5" title={routeId}>{model.id}</div>
            {isDefault && <span className="text-[10px] text-indigo-600">默认选择{model.enabled === false ? ' · 已停用，请重新选择' : ''}</span>}
            {!supported && <span className="block text-[10px] text-amber-700">未纳入业务支持目录</span>}
          </div>
        </div>
      </td>
      {showChannel && <td className="px-3 py-3 text-xs text-slate-600 whitespace-nowrap">{channelName(channel)}</td>}
      <td className="px-3 py-3"><div className="flex flex-wrap gap-1 text-[11px]">
        {multimodal && <span className="px-2 py-1 rounded-md bg-indigo-50 text-indigo-700">{model.channel === 'deepseek' && !model.isVision ? '文本对话' : '多模态'}</span>}
        {model.isImage && <span className="px-2 py-1 rounded-md bg-amber-50 text-amber-700">生图</span>}
        {model.isVideo && <span className="px-2 py-1 rounded-md bg-sky-50 text-sky-700">视频</span>}
        {!multimodal && !model.isImage && !model.isVideo && <span className="text-slate-400">未识别</span>}
      </div></td>
      <td className="px-3 py-3 text-xs text-slate-600">
        {channel === 'comfly' ? <ComflyModelPrice id={model.id} prices={prices} /> : <span className="text-slate-400">以渠道账单为准</span>}
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
