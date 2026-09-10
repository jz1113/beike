import {
  ArrowDown,
  ArrowUp,
  Bot,
  ChevronsUp,
  GripVertical,
  Palette,
  Trash2,
  Video,
} from 'lucide-react';
import { getModelIcon } from '@/shared/ui/ModelIcons';
import { isMultimodalWorkflowModel } from '@beike/shared/workflowModels';
import { settingsCapabilityPill } from '@/shared/ui/layoutClasses';
import type { WorkflowModel } from './settingsShared';

export interface WorkflowModelRowProps {
  model: WorkflowModel;
  index: number;
  isFirst: boolean;
  isLast: boolean;
  isDragged: boolean;
  isDragOver: boolean;
  onDragStart: (e: React.DragEvent, modelId: string) => void;
  onDragOver: (e: React.DragEvent, modelId: string) => void;
  onDrop: (e: React.DragEvent, modelId: string) => void;
  onMoveModel: (modelId: string, direction: 'up' | 'down' | 'top') => void;
  onToggleCapability: (
    modelId: string,
    field: 'isMultimodal' | 'isImage' | 'isVideo' | 'isVision' | 'isAssistant' | 'isDistill' | 'isThinking',
  ) => void;
  onDeleteModel: (modelId: string) => void;
}

export default function WorkflowModelRow({
  model: m,
  index,
  isFirst,
  isLast,
  isDragged,
  isDragOver,
  onDragStart,
  onDragOver,
  onDrop,
  onMoveModel,
  onToggleCapability,
  onDeleteModel,
}: WorkflowModelRowProps) {
  const isMultimodal = isMultimodalWorkflowModel(m);

  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, m.id)}
      onDragOver={(e) => onDragOver(e, m.id)}
      onDrop={(e) => onDrop(e, m.id)}
      className={`px-3 py-2 hover:bg-slate-50/90 transition-all flex flex-col @[480px]/settings-panel:flex-row @[480px]/settings-panel:items-center justify-between gap-1.5 @[480px]/settings-panel:gap-2 group select-none ${
        isDragged ? 'opacity-40 bg-slate-100' : ''
      } ${isDragOver ? 'border-t-2 border-indigo-500 bg-indigo-50/30' : ''}`}
    >
      {/* 左侧：序号、模型图标与 ID/名称 */}
      <div className="flex items-center gap-1.5 min-w-0 flex-1 overflow-hidden">
        <div
          className="flex items-center gap-0.5 text-slate-300 group-hover:text-slate-500 cursor-grab active:cursor-grabbing flex-shrink-0"
          title="按住拖拽调整模型优先级"
        >
          <GripVertical className="w-3 h-3" />
          <span className="font-mono text-[10px] font-bold text-slate-400 w-4 text-center">
            #{index + 1}
          </span>
        </div>

        <div className="w-6 h-6 rounded-lg bg-white border border-slate-200/80 flex items-center justify-center flex-shrink-0 shadow-2xs">
          {getModelIcon(m.id, 'w-3.5 h-3.5')}
        </div>

        <div className="min-w-0 flex-1 flex items-center gap-1 overflow-hidden">
          <span
            className="font-mono text-slate-900 font-bold text-xs truncate"
            title={m.id}
          >
            {m.id}
          </span>
          {m.name && m.name !== m.id && (
            <span className="text-[11px] text-slate-400 truncate hidden @[520px]/settings-panel:inline" title={m.name}>
              ({m.name})
            </span>
          )}
          {m.badge && (
            <span className="text-[9px] px-1 py-0.2 rounded bg-slate-100 text-slate-500 font-medium shrink-0 hidden @[520px]/settings-panel:inline">
              {m.badge}
            </span>
          )}
        </div>
      </div>

      {/* 右侧操作区：排序微调箭头 + 三大能力开关 + 移出 */}
      <div className="flex items-center flex-wrap justify-end gap-1 shrink-0 @[480px]/settings-panel:flex-nowrap">
        <div className="flex items-center gap-0.5 border-r border-slate-200 pr-1 mr-0.5">
          <button
            type="button"
            disabled={isFirst}
            onClick={() => onMoveModel(m.id, 'top')}
            className="w-5.5 h-5.5 rounded text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 flex items-center justify-center transition-colors disabled:opacity-20 disabled:hover:bg-transparent disabled:cursor-not-allowed cursor-pointer"
            title="置顶（设为第 1 优先级）"
          >
            <ChevronsUp className="w-3 h-3" />
          </button>
          <button
            type="button"
            disabled={isFirst}
            onClick={() => onMoveModel(m.id, 'up')}
            className="w-5.5 h-5.5 rounded text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 flex items-center justify-center transition-colors disabled:opacity-20 disabled:hover:bg-transparent disabled:cursor-not-allowed cursor-pointer"
            title="上移一位"
          >
            <ArrowUp className="w-3 h-3" />
          </button>
          <button
            type="button"
            disabled={isLast}
            onClick={() => onMoveModel(m.id, 'down')}
            className="w-5.5 h-5.5 rounded text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 flex items-center justify-center transition-colors disabled:opacity-20 disabled:hover:bg-transparent disabled:cursor-not-allowed cursor-pointer"
            title="下移一位"
          >
            <ArrowDown className="w-3 h-3" />
          </button>
        </div>

        <button
          type="button"
          onClick={() => onToggleCapability(m.id, 'isMultimodal')}
          className={`${settingsCapabilityPill} ${
            isMultimodal
              ? 'bg-indigo-50 text-indigo-700 border-indigo-300 shadow-2xs font-bold'
              : 'bg-transparent text-slate-300 border-transparent hover:bg-slate-100 hover:text-slate-600 hover:border-slate-200'
          }`}
          title="多模态大模型 (涵盖视觉审图、逆向提炼、分镜策划与AI对话)"
        >
          <Bot className={`w-3 h-3 ${isMultimodal ? 'text-indigo-600' : 'text-slate-300'}`} />
          <span className="hidden @[600px]/settings-panel:inline">多模态</span>
        </button>

        <button
          type="button"
          onClick={() => onToggleCapability(m.id, 'isImage')}
          className={`${settingsCapabilityPill} ${
            m.isImage
              ? 'bg-amber-50 text-amber-700 border-amber-300 shadow-2xs font-bold'
              : 'bg-transparent text-slate-300 border-transparent hover:bg-slate-100 hover:text-slate-600 hover:border-slate-200'
          }`}
          title="商业生图能力 (Step 3 绘图)"
        >
          <Palette className={`w-3 h-3 ${m.isImage ? 'text-amber-600' : 'text-slate-300'}`} />
          <span className="hidden @[600px]/settings-panel:inline">生图</span>
        </button>

        <button
          type="button"
          onClick={() => onToggleCapability(m.id, 'isVideo')}
          className={`${settingsCapabilityPill} ${
            m.isVideo
              ? 'bg-sky-50 text-sky-700 border-sky-300 shadow-2xs font-bold'
              : 'bg-transparent text-slate-300 border-transparent hover:bg-slate-100 hover:text-slate-600 hover:border-slate-200'
          }`}
          title="视频生成能力 (首页/即梦视频)"
        >
          <Video className={`w-3 h-3 ${m.isVideo ? 'text-sky-600' : 'text-slate-300'}`} />
          <span className="hidden @[600px]/settings-panel:inline">视频</span>
        </button>

        <button
          type="button"
          onClick={() => onDeleteModel(m.id)}
          className="w-5.5 h-5.5 rounded text-slate-300 hover:text-red-600 hover:bg-red-50 flex items-center justify-center transition-colors cursor-pointer"
          title="移出此模型"
        >
          <Trash2 className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
}
