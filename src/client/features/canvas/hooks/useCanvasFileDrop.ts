import { useState, type DragEvent } from 'react';
import { persistCanvasMedia } from '../model/canvasMediaImport';
import { useCanvasStore } from '../store/useCanvasStore';

export function useCanvasFileDrop(projectId: string, pan: { x: number; y: number }, zoom: number) {
  const [dragging, setDragging] = useState(false);
  const [pending, setPending] = useState(0);
  const [errors, setErrors] = useState<string[]>([]);
  const onDragOver = (event: DragEvent<HTMLDivElement>) => {
    if (!Array.from(event.dataTransfer.types || []).includes('Files')) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
    setDragging(true);
  };
  const onDrop = async (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault(); event.stopPropagation(); setDragging(false);
    const files = Array.from(event.dataTransfer.files || []);
    if (!files.length) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = (event.clientX - rect.left - pan.x) / zoom;
    const y = (event.clientY - rect.top - pan.y) / zoom;
    setErrors([]);
    setPending(value => value + files.length);
    for (const [index, file] of files.entries()) {
      try {
        const media = await persistCanvasMedia(file, 0, 0);
        useCanvasStore.getState().addNode(projectId, { ...media, x: Math.round(x + (index % 3) * 332), y: Math.round(y + Math.floor(index / 3) * 512) });
      } catch (error) {
        setErrors(previous => [...previous, `${file.name}：${error instanceof Error ? error.message : '上传失败，请重试'}`]);
      } finally { setPending(value => value - 1); }
    }
  };
  return { dragging, pending, errors, dismissErrors: () => setErrors([]), dropProps: {
    onDragOver,
    onDragLeave: (event: DragEvent<HTMLDivElement>) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false); },
    onDrop,
  } };
}
