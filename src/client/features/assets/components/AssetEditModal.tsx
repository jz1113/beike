import React from 'react';
import { AppearanceAudienceEditor } from './AppearanceAudienceControls';
import { PencilLine, X } from 'lucide-react';
import {
  type PersonaLayers,
  parsePersonaLayers,
  formatPersonaPrompt,
} from '../utils/assetPromptConstants';
import type { AssetProductCategory, PromptAlbum } from '@shared/domain/assets/assetOrganization';
import { PromptGroupCategoryEditor } from './PromptGroupCategoryEditor';

export interface AssetEditModalProps {
  editingItem: any;
  setEditingItem: React.Dispatch<React.SetStateAction<any>>;
  activeSubTab: 'full_prompt' | 'persona' | 'outfit' | 'scene' | 'action';
  productCategories: AssetProductCategory[];
  albums: PromptAlbum[];
  isUpdating: boolean;
  onSave: () => void;
  onClose: () => void;
}

export function AssetEditModal({
  editingItem,
  setEditingItem,
  activeSubTab,
  productCategories,
  albums,
  isUpdating,
  onSave,
  onClose,
}: AssetEditModalProps) {
  if (!editingItem) return null;
  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/15 p-4 backdrop-blur-[2px] animate-in fade-in duration-150">
      <section role="dialog" aria-modal="true" aria-label="编辑提示词资产" className="relative flex max-h-[90vh] w-full max-w-[680px] flex-col overflow-hidden rounded-[20px] border border-slate-200/80 bg-white text-slate-900 shadow-[0_20px_48px_-28px_rgba(15,23,42,0.3)]">
        <header className="flex shrink-0 items-center justify-between gap-5 border-b border-slate-100 px-5 pb-3 pt-4 sm:px-6">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-rose-50 ring-1 ring-rose-100"><PencilLine className="h-3.5 w-3.5 text-rose-500" /></span>
            <h3 className="text-sm font-black tracking-tight">
            编辑提示词资产（
            {activeSubTab === 'full_prompt'
              ? '完整提示词'
              : activeSubTab === 'persona'
                ? '人物'
                : activeSubTab === 'outfit'
                  ? '穿搭'
                  : activeSubTab === 'scene'
                    ? '场景'
                    : '动作'}
            ）
          </h3>
          </div>
          <button onClick={onClose} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700" aria-label="关闭编辑窗口">
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto space-y-3 px-5 py-4 text-xs sm:px-6">
          {(activeSubTab === 'persona' || activeSubTab === 'outfit') && <AppearanceAudienceEditor item={editingItem} type={activeSubTab} onChange={dimensions => setEditingItem({ ...editingItem, dimensions })} />}
          <div>
            <label className="block text-slate-700 font-bold mb-1">标题 / 名称：</label>
            <input
              type="text"
              value={editingItem.title || editingItem.name || ''}
              onChange={(e) =>
                setEditingItem((prev: any) => ({
                  ...prev,
                  title: e.target.value,
                  name: e.target.value,
                }))
              }
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-800 focus:outline-none focus:border-amber-500"
            />
          </div>

          {activeSubTab === 'full_prompt' && (
            <>
              <div>
                <label className="block text-slate-700 font-bold mb-1">所属图集名称：</label>
                <input
                  type="text"
                  value={editingItem.albumName || ''}
                  onChange={(e) =>
                    setEditingItem((prev: any) => ({ ...prev, albumName: e.target.value }))
                  }
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-800 focus:outline-none focus:border-indigo-500"
                />
              </div>
              <PromptGroupCategoryEditor
                item={editingItem}
                categories={productCategories}
                albums={albums}
                onCategoryChange={(next) => setEditingItem((prev: any) => ({
                  ...prev,
                  _productCategoryDirty: true,
                  productCategoryIds: JSON.stringify(next === 'unclassified' ? [] : [next]),
                  isUniversal: false,
                  productSubcategory: null,
                }))}
                onSubcategoryChange={(next) => setEditingItem((prev: any) => ({ ...prev, productSubcategory: next }))}
              />
              <div>
                <label className="block text-slate-700 font-bold mb-1">完整中文生图提示词：</label>
                <textarea
                  rows={4}
                  value={editingItem.reversePromptZh || editingItem.reversePrompt || ''}
                  onChange={(e) =>
                    setEditingItem((prev: any) => ({
                      ...prev,
                      reversePromptZh: e.target.value,
                      reversePrompt: e.target.value,
                    }))
                  }
                  className="soft-textarea w-full px-3 py-2 text-slate-800 font-mono text-xs"
                />
              </div>
            </>
          )}

          {activeSubTab === 'persona' &&
            (() => {
              const layers: PersonaLayers =
                editingItem._personaLayers ||
                parsePersonaLayers(editingItem.description || editingItem.name);
              const updateLayer = (key: keyof PersonaLayers, val: string) => {
                const updated: PersonaLayers = { ...layers, [key]: val };
                const newDesc = formatPersonaPrompt(updated);
                setEditingItem((prev: any) => ({
                  ...prev,
                  _personaLayers: updated,
                  description: newDesc,
                }));
              };
              return (
                <div className="space-y-2.5 p-3 bg-amber-50/50 border border-amber-200/60 rounded-2xl">
                  <span className="font-bold text-amber-900 block text-xs">
                    5 层人物原子分层编辑：
                  </span>
                  <div>
                    <label className="block text-amber-800 font-semibold mb-1">
                      发型长短与造型：
                    </label>
                    <input
                      type="text"
                      value={layers.hairStyle}
                      onChange={(e) => updateLayer('hairStyle', e.target.value)}
                      className="w-full bg-white border border-amber-200 rounded-xl px-3 py-1.5 text-slate-800 focus:outline-none focus:border-amber-500"
                    />
                  </div>
                  <div>
                    <label className="block text-orange-800 font-semibold mb-1">原生发色：</label>
                    <input
                      type="text"
                      value={layers.hairColor}
                      onChange={(e) => updateLayer('hairColor', e.target.value)}
                      className="w-full bg-white border border-amber-200 rounded-xl px-3 py-1.5 text-slate-800 focus:outline-none focus:border-amber-500"
                    />
                  </div>
                  <div>
                    <label className="block text-amber-900 font-semibold mb-1">
                      脸型五官与骨相：
                    </label>
                    <input
                      type="text"
                      value={layers.faceFeatures}
                      onChange={(e) => updateLayer('faceFeatures', e.target.value)}
                      className="w-full bg-white border border-amber-200 rounded-xl px-3 py-1.5 text-slate-800 focus:outline-none focus:border-amber-500"
                    />
                  </div>
                  <div>
                    <label className="block text-emerald-800 font-semibold mb-1">
                      肤质肌理与毛孔：
                    </label>
                    <input
                      type="text"
                      value={layers.skinTexture}
                      onChange={(e) => updateLayer('skinTexture', e.target.value)}
                      className="w-full bg-white border border-emerald-200 rounded-xl px-3 py-1.5 text-slate-800 focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="block text-rose-800 font-semibold mb-1">
                      神态表情与情绪：
                    </label>
                    <input
                      type="text"
                      value={layers.expression}
                      onChange={(e) => updateLayer('expression', e.target.value)}
                      className="w-full bg-white border border-rose-200 rounded-xl px-3 py-1.5 text-slate-800 focus:outline-none focus:border-rose-500"
                    />
                  </div>
                </div>
              );
            })()}

          {activeSubTab === 'scene' && (
            <>
              <div>
                <label className="block text-slate-700 font-bold mb-1">空间硬装与立面建筑：</label>
                <textarea
                  rows={3}
                  value={editingItem.description || ''}
                  onChange={(e) =>
                    setEditingItem((prev: any) => ({ ...prev, description: e.target.value }))
                  }
                  className="soft-textarea w-full px-3 py-2 text-slate-800"
                />
              </div>
              <div>
                <label className="block text-slate-700 font-bold mb-1">采光系统与物理阴影：</label>
                <input
                  type="text"
                  value={editingItem.lighting || ''}
                  onChange={(e) =>
                    setEditingItem((prev: any) => ({ ...prev, lighting: e.target.value }))
                  }
                  className="soft-textarea w-full px-3 py-2 text-slate-800"
                />
              </div>
            </>
          )}

          {activeSubTab === 'outfit' && (
            <>
              <div>
                <label className="block text-slate-700 font-bold mb-1">上装款式：</label>
                <input
                  type="text"
                  value={editingItem.top || ''}
                  onChange={(e) =>
                    setEditingItem((prev: any) => ({ ...prev, top: e.target.value }))
                  }
                  className="soft-textarea w-full px-3 py-2 text-slate-800"
                />
              </div>
              <div>
                <label className="block text-slate-700 font-bold mb-1">下装版型：</label>
                <input
                  type="text"
                  value={editingItem.bottom || ''}
                  onChange={(e) =>
                    setEditingItem((prev: any) => ({ ...prev, bottom: e.target.value }))
                  }
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-800 focus:outline-none focus:border-amber-500"
                />
              </div>
              <div>
                <label className="block text-slate-700 font-bold mb-1">鞋履搭配：</label>
                <input
                  type="text"
                  value={editingItem.shoes || ''}
                  onChange={(e) =>
                    setEditingItem((prev: any) => ({ ...prev, shoes: e.target.value }))
                  }
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-800 focus:outline-none focus:border-amber-500"
                />
              </div>
              <div>
                <label className="block text-slate-700 font-bold mb-1">显白配色：</label>
                <input
                  type="text"
                  value={editingItem.colorPalette || ''}
                  onChange={(e) =>
                    setEditingItem((prev: any) => ({ ...prev, colorPalette: e.target.value }))
                  }
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-800 focus:outline-none focus:border-amber-500"
                />
              </div>
            </>
          )}

          {activeSubTab === 'action' && (
            <>
              <div>
                <label className="block text-slate-700 font-bold mb-1">构图景别与姿态分类：</label>
                <div className="flex flex-wrap gap-1.5 mb-1">
                  {[
                    { label: '半身姿态', shotType: 'half_body', anatomy: '[]' },
                    { label: '面部特写', shotType: 'close_up', anatomy: '["face"]' },
                    { label: '细节特写', shotType: 'macro_detail', anatomy: '[]' },
                    { label: '全身氛围', shotType: 'full_body', anatomy: '[]' },
                    { label: '手部特写', shotType: 'macro_detail', anatomy: '["hands"]' },
                    { label: '项链特写', shotType: 'macro_detail', anatomy: '["necklace"]' },
                    { label: '手镯特写', shotType: 'macro_detail', anatomy: '["wrist"]' },
                  ].map((preset) => {
                    const currentTags = String(editingItem.tags || '');
                    const isCurrent =
                      currentTags.includes(preset.label) ||
                      editingItem.shotType === preset.shotType;
                    return (
                      <button
                        key={preset.label}
                        type="button"
                        onClick={() => {
                          const existingTokens = currentTags
                            .split(/[,，\s]+/)
                            .filter(
                              (t) =>
                                t &&
                                ![
                                  '半身姿态',
                                  '面部特写',
                                  '细节特写',
                                  '全身氛围',
                                  '手部特写',
                                  '项链特写',
                                  '手镯特写',
                                ].includes(t)
                            );
                          existingTokens.unshift(preset.label);
                          setEditingItem((prev: any) => ({
                            ...prev,
                            shotType: preset.shotType,
                            suitableAnatomy: preset.anatomy,
                            tags: existingTokens.join(', '),
                          }));
                        }}
                        className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${
                          isCurrent
                            ? 'bg-purple-600 text-white border-purple-600 shadow-2xs'
                            : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                        }`}
                      >
                        {preset.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">抓拍姿态与肢体动作：</label>
                <textarea
                  rows={3}
                  value={editingItem.action || ''}
                  onChange={(e) =>
                    setEditingItem((prev: any) => ({ ...prev, action: e.target.value }))
                  }
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-800 focus:outline-none focus:border-amber-500"
                />
              </div>
              <div>
                <label className="block text-slate-700 font-bold mb-1">摄影机位与镜头：</label>
                <input
                  type="text"
                  value={editingItem.camera || ''}
                  onChange={(e) =>
                    setEditingItem((prev: any) => ({ ...prev, camera: e.target.value }))
                  }
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-800 focus:outline-none focus:border-amber-500"
                />
              </div>
            </>
          )}

          <div>
            <label className="block text-slate-700 font-bold mb-1">标签（逗号分隔）：</label>
            <input
              type="text"
              value={editingItem.tags || ''}
              onChange={(e) =>
                setEditingItem((prev: any) => ({ ...prev, tags: e.target.value }))
              }
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-800 focus:outline-none focus:border-amber-500"
            />
          </div>
        </div>

        <footer className="flex shrink-0 items-center justify-end gap-2 border-t border-slate-100 bg-slate-50/50 px-5 py-3 sm:px-6">
          <button
            onClick={onClose}
            className="rounded-xl px-3.5 py-2 text-sm font-bold text-slate-500 transition-colors hover:bg-white hover:text-slate-800"
          >
            取消
          </button>
          <button
            onClick={onSave}
            disabled={isUpdating}
            className="rounded-xl bg-slate-950 px-3.5 py-2 text-sm font-bold text-white shadow-sm transition-colors hover:bg-slate-800 disabled:opacity-50"
          >
            {isUpdating ? '保存中...' : '确认保存'}
          </button>
        </footer>
      </section>
    </div>
  );
}
