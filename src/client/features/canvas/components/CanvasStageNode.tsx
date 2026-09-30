import { CanvasResizeHandle } from './CanvasResizeHandle';
import { CanvasStageNodeMedia } from './CanvasStageNodeMedia';
import { CanvasStageNodeToolbar } from './CanvasStageNodeToolbar';
import type { CanvasStageNodeProps } from './canvasStageNodeTypes';

export type { CanvasStageNodeProps };

export function CanvasStageNode(props: CanvasStageNodeProps) {
  const {
    node, projectId, zoom, selectedNodeId, draggingNodeId, draggingNodePos,
    editingDrawingId, drawingPress, setSelectedNodeId, setEditingDrawingId,
    handleNodeDragStart, updateNode,
  } = props;
  if (node.layerHidden) return null;
  const isSelected = props.multiSelected ?? selectedNodeId === node.id;
  const isCurrentDragging = draggingNodeId === node.id;
  const isGenerating = node.status === 'generating' && !node.imageUrl && !node.videoUrl;
  const displayX = isCurrentDragging && draggingNodePos ? draggingNodePos.x : node.x;
  const displayY = isCurrentDragging && draggingNodePos ? draggingNodePos.y : node.y;

  return (
    <div
      key={node.id}
      data-canvas-node-id={node.id}
      data-canvas-group-id={node.groupId}
      tabIndex={-1}
      className={`canvas-node-card [&:has(>[data-layer-editor])_.canvas-node-toolbar]:invisible absolute ${node.type === 'drawing' ? 'pointer-events-none outline-none' : 'pointer-events-auto'} flex flex-col group transition-[outline,box-shadow,opacity] duration-150 select-none ${
        node.type === 'drawing'
          ? (isSelected ? 'z-20' : 'z-10')
          : isSelected
            ? (['file', 'image', 'video', 'audio'].includes(node.type) ? 'outline outline-1 outline-slate-400 outline-offset-2 z-20' : 'outline outline-2 outline-indigo-400 outline-offset-2 z-20 shadow-xl')
            : 'hover:outline hover:outline-1 hover:outline-slate-400/60 hover:outline-offset-1 z-10'
      } rounded-2xl ${isCurrentDragging ? 'cursor-grabbing select-none' : ''}`}
      style={{
        zIndex: node.type === 'frame' ? 1 : node.layerGroupId ? 10 + (node.layerOrder || 0) : undefined,
        left: `${displayX}px`,
        top: `${displayY}px`,
        width: `${node.width}px`,
        transition: isCurrentDragging ? 'none' : 'outline 0.15s, box-shadow 0.15s',
        willChange: isCurrentDragging ? 'left, top' : undefined,
      }}
      onMouseDown={(e) => {
        // Dragging prevents the browser's default focus change; leave text editing explicitly.
        if (e.button === 0 && !(e.target as HTMLElement).closest('button,input,textarea,select,a,video,audio,[contenteditable]:not([contenteditable="false"]),[tabindex="0"]')) {
          e.currentTarget.focus({ preventScroll: true });
        }
        if (node.type === 'drawing') drawingPress.current = { x: e.clientX, y: e.clientY };
        handleNodeDragStart(node, e);
      }}
      onClick={(e) => {
        e.stopPropagation();
        if (props.handleNodeClick) props.handleNodeClick(node, e); else setSelectedNodeId(node.id);
        if (node.type === 'drawing') {
          const press = drawingPress.current;
          setEditingDrawingId(!node.layerLocked && !node.groupId && !e.shiftKey && (!press || Math.hypot(e.clientX - press.x, e.clientY - press.y) < 5) ? node.id : null);
          drawingPress.current = null;
        } else {
          setEditingDrawingId(null);
        }
      }}
      onDoubleClick={event => {
        if (node.type !== 'drawing' || node.layerLocked || (event.target as HTMLElement).closest('button,input,textarea,video,audio')) return;
        event.stopPropagation();
        setEditingDrawingId(node.id);
      }}
    >
      {isSelected && !node.layerLocked && (['image','video','prompt','note','frame'].includes(node.type)) && !isGenerating && !node.missingMedia && (
        <CanvasResizeHandle width={node.width} height={node.height} zoom={zoom} onResize={(size) => updateNode(projectId, node.id, size)} />
      )}
      {!['prompt','note','frame'].includes(node.type) && <CanvasStageNodeToolbar {...props} isSelected={isSelected} isGenerating={isGenerating} />}
      <CanvasStageNodeMedia {...props} isSelected={isSelected} isGenerating={isGenerating} isCurrentDragging={isCurrentDragging} editingDrawingId={editingDrawingId} />
    </div>
  );
}
