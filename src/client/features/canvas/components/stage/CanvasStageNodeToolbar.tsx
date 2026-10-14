import { CanvasGridSplit } from '../CanvasGridSplit';
import { drawingGeometry } from '../../model/drawingGeometry';
import '../../canvasMediaToolbar.css';
import { CanvasLayerDecomposition } from '../CanvasLayerDecomposition';
import { LightingIcon, MultiAngleIcon } from '@client/shared/icons';
import { downloadMediaOrOpen } from '@client/shared/media/downloadMedia';
import { Check, Download, Edit2, Image as ImageIcon, Maximize2, MessageSquare, Video as VideoIcon } from 'lucide-react';
import { calculateDisplayResolution } from '../../model/canvasNodeHelpers';
import type { CanvasStageNodeProps } from './canvasStageNodeTypes';

interface Props extends CanvasStageNodeProps {
  isSelected: boolean;
  isGenerating: boolean;
}

export function CanvasStageNodeToolbar({
  node, isSelected, isGenerating, editingNodeTitleId, tempNodeTitle, projectId,
  setTempNodeTitle, setEditingNodeTitleId, handleSaveNodeTitle, handleStartEditNodeTitle,
  handleAddNodeToComposer, setLightingModalNode, setMultiAngleModalNode, setPreviewMedia,
}: Props) {
  return (
    <>
      {!isGenerating && node.type !== 'file' && (
        <div
          style={node.type === 'drawing' ? { left: '50%', right: 'auto', width: drawingGeometry(node).width, transform: 'translateX(-50%)' } : undefined}
          className={`absolute -top-6 left-0 right-0 z-20 flex items-center justify-between text-xs text-slate-500 select-none px-0.5 transition-opacity duration-150 ${
            ['image', 'video', 'audio'].includes(node.type) || isSelected || editingNodeTitleId === node.id
              ? 'opacity-100 pointer-events-auto'
              : 'opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto'
          }`}
          onClick={(e) => e.stopPropagation()}
        >
          {editingNodeTitleId === node.id ? (
            <div className="flex items-center gap-1 bg-white shadow-xs border border-indigo-400 rounded px-1.5 py-0.5 z-30">
              <input
                autoFocus
                type="text"
                value={tempNodeTitle}
                onChange={(e) => setTempNodeTitle(e.target.value)}
                onBlur={() => handleSaveNodeTitle(node.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSaveNodeTitle(node.id);
                  if (e.key === 'Escape') setEditingNodeTitleId(null);
                }}
                className="text-xs text-slate-800 focus:outline-none w-32"
              />
              <button type="button" onClick={() => handleSaveNodeTitle(node.id)} className="p-0.5 text-indigo-600 hover:text-indigo-800 cursor-pointer" title="保存">
                <Check className="w-3 h-3" />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 text-slate-500 hover:text-slate-800 transition-colors group/title">
              {node.type === 'video' || node.generationKind === 'video' ? (
                <VideoIcon className="w-3.5 h-3.5 text-slate-400 group-hover/title:text-slate-600" />
              ) : (
                <ImageIcon className="w-3.5 h-3.5 text-slate-400 group-hover/title:text-slate-600" />
              )}
              <span onClick={(e) => handleStartEditNodeTitle(node, e)} title="点击重命名" className="font-medium truncate max-w-[160px] cursor-pointer hover:text-indigo-600">
                {node.title || (node.type === 'video' ? '视频大图预览' : '图片大图预览')}
              </span>
              <button type="button" onClick={(e) => handleStartEditNodeTitle(node, e)} className="opacity-0 group-hover/title:opacity-100 p-0.5 hover:text-indigo-600 text-slate-400 transition-opacity cursor-pointer" title="点击重命名">
                <Edit2 className="w-2.5 h-2.5" />
              </button>
            </div>
          )}
          <div className="text-[11px] font-mono text-slate-400 tracking-tight flex items-center gap-1">
            <span>{node.type !== 'drawing' || node.imageUrl || node.videoUrl ? calculateDisplayResolution(node) : ''}</span>
          </div>
        </div>
      )}

      {!isGenerating && ['image', 'video'].includes(node.type) && !node.missingMedia && (
        <div
          className={`canvas-node-toolbar canvas-media-toolbar absolute -top-[76px] left-1/2 -translate-x-1/2 z-30 transition-all duration-150 flex items-center gap-1 px-2 py-1.5 rounded-full bg-white/95 backdrop-blur-md text-slate-700 shadow-[0_4px_16px_rgba(15,23,42,0.08)] border border-slate-200/90 text-xs whitespace-nowrap select-none ${
            isSelected
              ? 'opacity-100 translate-y-0 pointer-events-auto'
              : 'opacity-0 translate-y-1 pointer-events-none group-hover:opacity-100 group-hover:translate-y-0 group-hover:pointer-events-auto'
          }`}
          role="toolbar"
          aria-label="素材操作"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            onClick={(e) => handleAddNodeToComposer(node, e)}
            disabled={node.missingMedia || !((node.type === 'video' || node.generationKind === 'video') ? node.videoUrl : node.imageUrl)}
            title="添加到画布底部输入框"
            aria-label="添加到对话"
            className="group/btn relative w-8 h-8 rounded-xl hover:bg-slate-100 text-slate-700 hover:text-slate-900 transition-colors flex items-center justify-center cursor-pointer active:scale-95 disabled:opacity-30 disabled:pointer-events-none"
          >
            <MessageSquare className="w-4 h-4" />
            <span className="absolute -top-9 left-1/2 -translate-x-1/2 px-2.5 py-1 rounded-lg bg-white/98 text-slate-800 text-[11px] font-medium opacity-0 group-hover/btn:opacity-100 transition-all duration-150 scale-95 group-hover/btn:scale-100 pointer-events-none whitespace-nowrap shadow-[0_4px_16px_rgba(0,0,0,0.08)] border border-slate-200/90 z-40">
              添加到对话
            </span>
          </button>
          {node.type === 'image' && (
            <>
              <div className="w-px h-3.5 bg-slate-200 mx-0.5 shrink-0" />
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setLightingModalNode(node); }}
                title="打开3D打光效果调节"
                aria-label="打光"
                className="group/btn relative w-8 h-8 rounded-xl hover:bg-slate-100 text-slate-700 hover:text-slate-900 transition-colors flex items-center justify-center cursor-pointer active:scale-95"
              >
                <LightingIcon className="w-4 h-4 shrink-0 pointer-events-none" />
                <span className="absolute -top-9 left-1/2 -translate-x-1/2 px-2.5 py-1 rounded-lg bg-white/98 text-slate-800 text-[11px] font-medium opacity-0 group-hover/btn:opacity-100 transition-all duration-150 scale-95 group-hover/btn:scale-100 pointer-events-none whitespace-nowrap shadow-[0_4px_16px_rgba(0,0,0,0.08)] border border-slate-200/90 z-40">打光</span>
              </button>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setMultiAngleModalNode(node); }}
                title="打开多角度环绕编辑器"
                aria-label="多角度"
                className="group/btn relative w-8 h-8 rounded-xl hover:bg-slate-100 text-slate-700 hover:text-slate-900 transition-colors flex items-center justify-center cursor-pointer active:scale-95"
              >
                <MultiAngleIcon className="w-4 h-4 shrink-0 pointer-events-none" />
                <span className="absolute -top-9 left-1/2 -translate-x-1/2 px-2.5 py-1 rounded-lg bg-white/98 text-slate-800 text-[11px] font-medium opacity-0 group-hover/btn:opacity-100 transition-all duration-150 scale-95 group-hover/btn:scale-100 pointer-events-none whitespace-nowrap shadow-[0_4px_16px_rgba(0,0,0,0.08)] border border-slate-200/90 z-40">多角度</span>
              </button>
              <CanvasLayerDecomposition node={node} projectId={projectId} />
              <CanvasGridSplit node={node} projectId={projectId} />
            </>
          )}
          {((node.type === 'image' && node.imageUrl) || (node.type === 'video' && node.videoUrl)) && (
            <>
              <div className="w-px h-3.5 bg-slate-200 mx-0.5 shrink-0" />
              <button
                type="button"
                title="下载素材"
                aria-label="下载素材"
                className="group/btn relative w-8 h-8 rounded-xl hover:bg-slate-100 text-slate-700 hover:text-slate-900 transition-colors flex items-center justify-center cursor-pointer active:scale-95"
                onClick={() => {
                  const url = (node.type === 'video' || node.generationKind === 'video') ? node.videoUrl! : node.imageUrl!;
                  void downloadMediaOrOpen(url, `${node.title || '画布素材'}.${node.type === 'video' ? 'mp4' : 'png'}`).catch(console.error);
                }}
              >
                <Download className="w-4 h-4" />
                <span className="absolute -top-9 left-1/2 -translate-x-1/2 px-2.5 py-1 rounded-lg bg-white/98 text-slate-800 text-[11px] font-medium opacity-0 group-hover/btn:opacity-100 transition-all duration-150 scale-95 group-hover/btn:scale-100 pointer-events-none whitespace-nowrap shadow-[0_4px_16px_rgba(0,0,0,0.08)] border border-slate-200/90 z-40">下载素材</span>
              </button>
              <button
                type="button"
                title="预览素材"
                aria-label="预览素材"
                className="group/btn relative w-8 h-8 rounded-xl hover:bg-slate-100 text-slate-700 hover:text-slate-900 transition-colors flex items-center justify-center cursor-pointer active:scale-95"
                onClick={() => setPreviewMedia({
                  url: (node.type === 'video' || node.generationKind === 'video') ? node.videoUrl! : node.imageUrl!,
                  type: node.type === 'video' ? 'video' : 'image',
                })}
              >
                <Maximize2 className="w-4 h-4" />
                <span className="absolute -top-9 left-1/2 -translate-x-1/2 px-2.5 py-1 rounded-lg bg-white/98 text-slate-800 text-[11px] font-medium opacity-0 group-hover/btn:opacity-100 transition-all duration-150 scale-95 group-hover/btn:scale-100 pointer-events-none whitespace-nowrap shadow-[0_4px_16px_rgba(0,0,0,0.08)] border border-slate-200/90 z-40">预览素材</span>
              </button>
            </>
          )}
        </div>
      )}
    </>
  );
}
