import { useState, type DragEvent } from 'react';
import { FolderUp, Image, Upload } from 'lucide-react';
import { getFilesFromDataTransfer } from '../../model/assetFolderImport';
import type { DeconstructQueueApi } from '../../hooks/useDeconstructQueue';

export function DeconstructLocalImport({ queueApi, disabled }: {
  queueApi: DeconstructQueueApi;
  disabled: boolean;
}) {
  const { queue, fileInputRef, folderInputRef, processFilesOrFolders } = queueApi;
  const [dragging, setDragging] = useState(false);
  const hasImages = queue.length > 0;
  const handleDrop = async (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    if (disabled) return;
    const files = await getFilesFromDataTransfer(event.dataTransfer);
    if (files.length > 0) processFilesOrFolders(files);
  };

  return (
    <>
      <div
        onDragOver={event => { event.preventDefault(); if (!disabled) setDragging(true); }}
        onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false); }}
        onDrop={handleDrop}
        className={`deconstruct-dropzone ${hasImages ? 'deconstruct-dropzone-compact' : ''} ${dragging && !disabled ? 'is-dragging' : ''}`}
      >
        {!hasImages && (
          <div aria-hidden="true" className="deconstruct-image-stack">
            <span><Image size={27} strokeWidth={1.2} /></span>
            <span><Image size={27} strokeWidth={1.2} /></span>
            <span><Image size={30} strokeWidth={1.2} /></span>
          </div>
        )}
        <h3 >{dragging ? '松开即可添加参考图' : hasImages ? '继续添加参考图' : '拖入图片，收集你的灵感'}</h3>
        <p >支持图片与整个文件夹，按顺序自动整理成组</p>
        <div className="deconstruct-local-actions">
          <button type="button" onClick={() => fileInputRef.current?.click()} disabled={disabled}
            className="deconstruct-action-button deconstruct-upload-button">
            <Upload className="h-4 w-4" />{hasImages ? '追加图片' : '选择图片'}
          </button>
          <button type="button" onClick={() => folderInputRef.current?.click()} disabled={disabled}
            className="deconstruct-action-button deconstruct-secondary-action">
            <FolderUp className="h-4 w-4" />{hasImages ? '追加文件夹' : '选择文件夹'}
          </button>
        </div>
      </div>
      <input ref={fileInputRef} type="file" disabled={disabled} multiple accept="image/*" className="hidden"
        onChange={event => {
          if (event.target.files?.length) processFilesOrFolders(event.target.files);
          event.target.value = '';
        }}
      />
      <input ref={folderInputRef} type="file" disabled={disabled} className="hidden"
        // @ts-expect-error webkitdirectory is standard for folder inputs
        webkitdirectory=""
        onChange={event => {
          if (event.target.files?.length) processFilesOrFolders(event.target.files);
          event.target.value = '';
        }}
      />
    </>
  );
}
