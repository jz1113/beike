import { X } from 'lucide-react';
import CanvasAssetImportModal from './CanvasAssetImportModal';
import CanvasLightingModal, { type LightingParams } from './CanvasLightingModal';
import { CanvasMultiAngleModal, type MultiAngleParams } from '@client/shared/modals/multiAngle';
import { proxyMediaUrl } from '@client/shared/api/apiClient';
import type { CanvasNode } from '../model/types';
import type { GenerationTask } from '@client/store/appStoreTypes';
import type { RefObject, MutableRefObject } from 'react';

interface Props {
  showAssetModal: boolean;
  assetModalTab: 'image' | 'video';
  imageAssets: GenerationTask[];
  videoAssets: GenerationTask[];
  setShowAssetModal: (open: boolean) => void;
  handleConfirmImportAssets: (tasks: GenerationTask[]) => void;
  replacementNodeRef: MutableRefObject<string | null>;
  fileInputRef: RefObject<HTMLInputElement | null>;
  previewMedia: { url: string; type: 'image' | 'video' } | null;
  setPreviewMedia: (media: { url: string; type: 'image' | 'video' } | null) => void;
  lightingModalNode: CanvasNode | null;
  setLightingModalNode: (node: CanvasNode | null) => void;
  handleApplyLighting: (params: LightingParams, options?: { model?: string; quality?: string; aspectRatio?: string }) => void;
  multiAngleModalNode: CanvasNode | null;
  setMultiAngleModalNode: (node: CanvasNode | null) => void;
  handleApplyMultiAngle: (params: MultiAngleParams, options?: { model?: string; quality?: string; aspectRatio?: string }) => void;
}

export function CanvasEditorOverlays(p: Props) {
  return (
    <>
      <CanvasAssetImportModal
        isOpen={p.showAssetModal}
        modalTab={p.assetModalTab}
        tasks={p.assetModalTab === 'image' ? p.imageAssets : p.videoAssets}
        onClose={() => p.setShowAssetModal(false)}
        onConfirmImport={p.handleConfirmImportAssets}
        onUploadLocalFile={() => { p.replacementNodeRef.current = null; p.fileInputRef.current?.click(); }}
      />
      {p.previewMedia && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-6 animate-in fade-in duration-150 select-none"
          onClick={() => p.setPreviewMedia(null)}
        >
          <div className="relative max-w-5xl max-h-[90vh] flex items-center justify-center" onClick={(e) => e.stopPropagation()}>
            {p.previewMedia.type === 'video' ? (
              <video src={proxyMediaUrl(p.previewMedia.url) || p.previewMedia.url} controls autoPlay className="max-w-full max-h-[85vh] rounded-2xl" />
            ) : (
              <img src={proxyMediaUrl(p.previewMedia.url) || p.previewMedia.url} alt="素材全屏预览" className="max-w-full max-h-[85vh] object-contain rounded-2xl shadow-2xl select-none" />
            )}
            <button type="button" onClick={() => p.setPreviewMedia(null)} className="absolute -top-12 right-0 w-9 h-9 rounded-full bg-white/20 hover:bg-white/30 text-white flex items-center justify-center cursor-pointer transition-colors backdrop-blur-md" title="关闭预览">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}
      <CanvasLightingModal isOpen={!!p.lightingModalNode} onClose={() => p.setLightingModalNode(null)} node={p.lightingModalNode} onSubmit={p.handleApplyLighting} />
      <CanvasMultiAngleModal isOpen={!!p.multiAngleModalNode} onClose={() => p.setMultiAngleModalNode(null)} node={p.multiAngleModalNode} onSubmit={p.handleApplyMultiAngle} />
    </>
  );
}
