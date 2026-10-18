import type { Dispatch, SetStateAction } from 'react';
import type { AssetLibrarySlim } from '@shared/domain/assets/assetLibraryTypes';
import type { AssetProductCategory, PromptAlbum } from '@shared/domain/assets/assetOrganization';
import type { ActionCategoryId } from '@shared/domain/products/productCategory';
import type { AssetSubTab } from '../model/assetPromptConstants';
import type { GalleryAtomType } from '../model/assetGalleryLabels';
import type { AssetDetailModalProps } from './AssetDetailModal';
import type { AssetEditModalProps } from './AssetEditModal';
import type { DeconstructModalProps } from './DeconstructModal';
import type { TagEditModalProps } from './TagEditModal';
import { AssetDetailModal } from './AssetDetailModal';
import { AssetEditModal } from './AssetEditModal';
import { AssetPromptSpecModal } from './AssetPromptSpecModal';
import DeconstructModal from './DeconstructModal';
import { FullPromptGroupPreview } from './FullPromptGroupPreview';
import { AtomicAssetPreview } from './AtomicAssetPreview';
import { TagEditModal } from './TagEditModal';
import SubCategoryManagerModal from '@client/shared/modals/SubCategoryManagerModal';

type GroupPreview = { item: AssetLibrarySlim; listPosition?: number; initialIndex?: number } | null;
type AtomPreview = { item: AssetLibrarySlim; type: GalleryAtomType; displayLabel: string } | null;

interface Props {
  activeSubTab: AssetSubTab;
  copiedId: string | null;
  promptGroupCategories: AssetProductCategory[];
  promptGroupAlbums: PromptAlbum[];
  detail: {
    item: AssetDetailModalProps['detailItem'];
    loading: boolean;
    imageIndex: number;
    setItem: (value: AssetDetailModalProps['detailItem']) => void;
    setImageIndex: (value: number) => void;
    onDelete: AssetDetailModalProps['onDeleteAsset'];
    onApply: AssetDetailModalProps['onApplyToWorkshop'];
    getText: AssetDetailModalProps['getAssetPreviewText'];
  };
  edit: {
    item: AssetEditModalProps['editingItem'];
    setItem: AssetEditModalProps['setEditingItem'];
    isUpdating: boolean;
    onSave: () => void;
    tagItem: TagEditModalProps['item'];
    setTagItem: (value: TagEditModalProps['item']) => void;
    onSaveTag: TagEditModalProps['onSave'];
  };
  preview: {
    group: GroupPreview;
    setGroup: Dispatch<SetStateAction<GroupPreview>>;
    atom: AtomPreview;
    setAtom: Dispatch<SetStateAction<AtomPreview>>;
    zoomUrl: string | null;
    setZoomUrl: (value: string | null) => void;
    onCopy: (text: string, id: string) => void;
  };
  panels: {
    specOpen: boolean;
    setSpecOpen: (value: boolean) => void;
    subcategoryOpen: boolean;
    setSubcategoryOpen: (value: boolean) => void;
    actionCategory: ActionCategoryId | 'all';
    queueApi: DeconstructModalProps['queueApi'];
    xhsImport: DeconstructModalProps['xhsImport'];
    showToast: (message: string) => void;
  };
}

export function AssetLibraryDialogs({ activeSubTab, copiedId, promptGroupCategories, promptGroupAlbums, detail, edit, preview, panels }: Props) {
  return (
    <>
      <AssetDetailModal
        detailItem={detail.item}
        activeSubTab={activeSubTab}
        detailLoading={detail.loading}
        detailActiveImageIndex={detail.imageIndex}
        copiedId={copiedId}
        onClose={() => detail.setItem(null)}
        onSelectImageIndex={detail.setImageIndex}
        onZoomImage={(url) => {
          if (activeSubTab === 'full_prompt' && detail.item) {
            preview.setGroup({ item: detail.item, listPosition: detail.item.listPosition, initialIndex: detail.imageIndex });
            detail.setItem(null);
          } else {
            preview.setZoomUrl(url);
          }
        }}
        onCopyPrompt={preview.onCopy}
        onOpenTagEdit={(item) => edit.setTagItem({ ...item })}
        onDeleteAsset={detail.onDelete}
        onApplyToWorkshop={detail.onApply}
        getAssetPreviewText={detail.getText}
      />
      <AssetEditModal
        editingItem={edit.item}
        productCategories={promptGroupCategories}
        albums={promptGroupAlbums}
        setEditingItem={edit.setItem}
        activeSubTab={activeSubTab}
        isUpdating={edit.isUpdating}
        onSave={edit.onSave}
        onClose={() => edit.setItem(null)}
      />
      <AssetPromptSpecModal isOpen={panels.specOpen} onClose={() => panels.setSpecOpen(false)} showToast={panels.showToast} />
      <DeconstructModal queueApi={panels.queueApi} xhsImport={panels.xhsImport} showToast={panels.showToast} />
      <SubCategoryManagerModal
        isOpen={panels.subcategoryOpen}
        onClose={() => panels.setSubcategoryOpen(false)}
        defaultCategoryId={panels.actionCategory !== 'all' && panels.actionCategory !== 'universal' ? panels.actionCategory : 'jewelry'}
      />
      {preview.group && (
        <FullPromptGroupPreview
          key={preview.group.item.id}
          item={preview.group.item}
          productCategories={promptGroupCategories}
          albums={promptGroupAlbums}
          listPosition={preview.group.listPosition}
          initialIndex={preview.group.initialIndex}
          copiedId={copiedId}
          onCopyPrompt={preview.onCopy}
          onApplyToWorkshop={(item) => { detail.onApply(item); preview.setGroup(null); }}
          onOpenTagEdit={(item) => { preview.setGroup(null); edit.setTagItem({ ...item }); }}
          onOpenEdit={(item) => { preview.setGroup(null); edit.setItem({ ...item }); }}
          onClose={() => preview.setGroup(null)}
        />
      )}
      {preview.atom && (
        <AtomicAssetPreview
          key={preview.atom.item.id}
          item={preview.atom.item}
          type={preview.atom.type}
          displayLabel={preview.atom.displayLabel}
          copiedId={copiedId}
          onCopyPrompt={preview.onCopy}
          onApplyToWorkshop={(item) => { detail.onApply(item); preview.setAtom(null); }}
          onOpenTagEdit={(item) => { preview.setAtom(null); edit.setTagItem({ ...item }); }}
          onClose={() => preview.setAtom(null)}
        />
      )}
      {preview.zoomUrl && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-8 bg-black/85 backdrop-blur-md animate-in fade-in duration-200 cursor-zoom-out select-none"
          onClick={() => preview.setZoomUrl(null)}
        >
          <div className="relative max-w-5xl max-h-[92vh] flex flex-col items-center cursor-default" onClick={(event) => event.stopPropagation()}>
            <div className="w-full flex items-center justify-between pb-3 text-white/80">
              <span className="text-xs font-medium text-white/60 bg-white/10 px-2.5 py-1 rounded-full backdrop-blur-xs dark:bg-[#18191c]/95">原图高清预览 (按 Esc 或点击背景关闭)</span>
              <button type="button" onClick={() => window.open(preview.zoomUrl!, '_blank')} className="px-3 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-white/90 text-xs font-medium cursor-pointer dark:bg-[#18191c]/95" title="在新标签页打开">新标签页打开</button>
            </div>
            <div className="relative rounded-2xl overflow-hidden shadow-2xl border border-white/15 bg-black/40">
              <img src={preview.zoomUrl} alt="参考原图大图" className="max-w-full max-h-[80vh] sm:max-h-[84vh] object-contain rounded-2xl" />
            </div>
          </div>
        </div>
      )}
      {edit.tagItem && (
        <TagEditModal
          item={edit.tagItem}
          activeSubTab={activeSubTab}
          onClose={() => edit.setTagItem(null)}
          onSave={edit.onSaveTag}
          isUpdating={edit.isUpdating}
        />
      )}
    </>
  );
}
