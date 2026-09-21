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
  const isSelected = selectedNodeId === node.id;
  const isCurrentDragging = draggingNodeId === node.id;
  const isGenerating = node.status === 'generating' && !node.imageUrl && !node.videoUrl;
  const displayX = isCurrentDragging && draggingNodePos ? draggingNodePos.x : node.x;
  const displayY = isCurrentDragging && draggingNodePos ? draggingNodePos.y : node.y;

  return (
    <div
      key={node.id}
      className={`canvas-node-card [&:has(>[data-layer-editor])_.canvas-node-toolbar]:invisible absolute pointer-events-auto flex flex-col group transition-[outline,box-shadow,opacity] duration-150 select-none ${
        node.type === 'drawing'
          ? (isSelected ? 'z-20' : 'z-10')
          : isSelected
            ? 'outline outline-2 outline-indigo-400 outline-offset-2 z-20 shadow-xl'
            : 'hover:outline hover:outline-1 hover:outline-indigo-400/40 hover:outline-offset-1 z-10'
      } rounded-2xl ${isCurrentDragging ? 'cursor-grabbing select-none' : ''}`}
      style={{
        zIndex: node.layerGroupId ? 10 + (node.layerOrder || 0) : undefined,
        left: `${displayX}px`,
        top: `${displayY}px`,
        width: `${node.width}px`,
        transition: isCurrentDragging ? 'none' : 'outline 0.15s, box-shadow 0.15s',
        willChange: isCurrentDragging ? 'left, top' : undefined,
      }}
      onMouseDown={(e) => {
        if (node.type === 'drawing') drawingPress.current = { x: e.clientX, y: e.clientY };
        if (node.layerLocked) { e.stopPropagation(); setSelectedNodeId(node.id); }
        else handleNodeDragStart(node, e);
      }}
      onClick={(e) => {
        e.stopPropagation();
        setSelectedNodeId(node.id);
        if (node.type === 'drawing') {
          const press = drawingPress.current;
          setEditingDrawingId(!press || Math.hypot(e.clientX - press.x, e.clientY - press.y) < 5 ? node.id : null);
          drawingPress.current = null;
        }
      }}
    >
      {isSelected && !node.layerLocked && (node.type === 'image' || node.type === 'video') && !isGenerating && !node.missingMedia && (
        <CanvasResizeHandle width={node.width} height={node.height} zoom={zoom} onResize={(size) => updateNode(projectId, node.id, size)} />
      )}
      <CanvasStageNodeToolbar {...props} isSelected={isSelected} isGenerating={isGenerating} />
      <CanvasStageNodeMedia {...props} isSelected={isSelected} isGenerating={isGenerating} isCurrentDragging={isCurrentDragging} editingDrawingId={editingDrawingId} />
    </div>
  );
}
