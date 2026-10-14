import React from 'react';
import {
  X,
  Sparkles,
  Wand2,
  Loader2,
  Cpu,
} from 'lucide-react';
import { normalizeImageUrlToStandardJpg } from '@shared/domain/media/drawing';
import { proxyMediaUrl } from '@client/shared/api/apiClient';
import CategoryManagerModal from './CategoryManagerModal';
import { RecipeEditorPanel } from './style-extract/RecipeEditorPanel';
import { StyleExtractSourcePanel } from './style-extract/StyleExtractSourcePanel';
import { useStyleExtractWorkflow } from './style-extract/useStyleExtractWorkflow';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onRecipeCreated?: (recipe: any) => void;
  initialImages?: string[];
  initialTitle?: string;
}

/**
 * 风格提示词架构推理实验室模态框 (StyleExtractModal)
 * 已完成深度解耦：
 * - 业务状态机、网络解析、多模态调用收敛于 useStyleExtractWorkflow
 * - 图源录入多渠道交互抽离为 StyleExtractSourcePanel
 * - 配方调优编辑器由 RecipeEditorPanel 承载
 */
export default function StyleExtractModal({ isOpen, onClose, onRecipeCreated, initialImages, initialTitle }: Props) {
  const {
    sourceType,
    setSourceType,
    linkInput,
    setLinkInput,
    isParsingLink,
    parsedPostTitle,
    parsedImages,
    urlInput,
    setUrlInput,
    selectedImages,
    setSelectedImages,
    selectedSet,
    visibleCount,
    setVisibleCount,
    extractModel,
    setExtractModel,
    multimodalModels,
    userHint,
    setUserHint,
    extractStepText,
    toastMsg,
    isExtracting,
    extractedRecipe,
    setExtractedRecipe,
    categories,
    isCreatingCategory,
    setIsCreatingCategory,
    isCategoryManagerOpen,
    setIsCategoryManagerOpen,
    newCategoryName,
    setNewCategoryName,
    isSaving,
    detectedLinkCount,
    showToast,
    handleCreateNewCategory,
    handleAutoSelectKeyShots,
    handleToggleImage,
    handleParseLink,
    handleFileUpload,
    styleUploadDropProps,
    handleAddUrls,
    handleStartExtract,
    handleSaveRecipe,
  } = useStyleExtractWorkflow({
    isOpen,
    onClose,
    onRecipeCreated,
    initialImages,
    initialTitle,
  });

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md p-3 sm:p-6 animate-fade-in select-none">
      <div
        className="w-full max-w-4xl bg-white border border-slate-200/90 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[92dvh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-4 sm:px-6 py-4.5 border-b border-slate-100 flex items-center justify-between gap-3 bg-slate-50/70">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 shrink-0 rounded-2xl bg-gradient-to-tr from-pink-500 via-purple-600 to-indigo-600 flex items-center justify-center text-white shadow-md shadow-indigo-500/20">
              <Sparkles className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h3 className="text-base font-bold text-slate-900 flex flex-wrap items-center gap-2">
                提示词架构推理实验室
                <span className="hidden sm:inline-flex text-[11px] font-mono font-bold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200/80">
                  Prompt Architecture Inference
                </span>
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                深度解构参考图集的置景光影与摄影机位，沉淀为该品类专属的通用提示词生成架构
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 shrink-0 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-800 transition-all flex items-center justify-center cursor-pointer"
            title="关闭窗口"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6 custom-scrollbar">
          {/* Step 1: 参考图源采集 */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                <span className="w-5 h-5 rounded-full bg-indigo-600 text-white flex items-center justify-center text-[10px] font-bold">
                  1
                </span>
                选择参考图源渠道
              </span>
              <span className="text-[11px] text-slate-400 font-mono">
                已选 {selectedImages.length} 张参考图
              </span>
            </div>

            {/* 图源交互面板 */}
            <StyleExtractSourcePanel
              sourceType={sourceType}
              setSourceType={setSourceType}
              detectedLinkCount={detectedLinkCount}
              linkInput={linkInput}
              setLinkInput={setLinkInput}
              isParsingLink={isParsingLink}
              handleParseLink={handleParseLink}
              parsedImages={parsedImages}
              parsedPostTitle={parsedPostTitle}
              selectedSet={selectedSet}
              selectedImages={selectedImages}
              setSelectedImages={setSelectedImages}
              handleAutoSelectKeyShots={handleAutoSelectKeyShots}
              visibleCount={visibleCount}
              setVisibleCount={setVisibleCount}
              handleToggleImage={handleToggleImage}
              styleUploadDropProps={styleUploadDropProps}
              handleFileUpload={handleFileUpload}
              urlInput={urlInput}
              setUrlInput={setUrlInput}
              handleAddUrls={handleAddUrls}
              showToast={showToast}
            />

            {/* 待提炼图集底部缩略图预览条 */}
            {selectedImages.length > 0 && (
              <div className="p-3 rounded-2xl bg-indigo-50/60 border border-indigo-100/90 flex items-center justify-between gap-3 animate-fade-in">
                <div className="flex items-center gap-2 overflow-x-auto py-1 custom-scrollbar">
                  <span className="text-[11px] font-bold text-indigo-900 flex-shrink-0">
                    待提炼图集 ({selectedImages.length}张):
                  </span>
                  {selectedImages.slice(0, 16).map((img, idx) => (
                    <div
                      key={idx}
                      className="relative group w-11 h-11 rounded-xl overflow-hidden bg-white border border-slate-200 flex-shrink-0 shadow-2xs"
                    >
                      <img
                        src={normalizeImageUrlToStandardJpg(img) || img}
                        alt=""
                        loading="lazy"
                        decoding="async"
                        referrerPolicy="no-referrer"
                        onError={(e) => {
                          const target = e.currentTarget;
                          if (!target.dataset.hasRetried && img) {
                            target.dataset.hasRetried = 'true';
                            target.src = proxyMediaUrl(img);
                          }
                        }}
                        className="w-full h-full object-cover"
                      />
                      <button
                        type="button"
                        onClick={() => setSelectedImages(selectedImages.filter((_, i) => i !== idx))}
                        className="absolute top-0.5 right-0.5 p-0.5 rounded-full bg-black/60 text-white opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                      >
                        <X className="w-2.5 h-2.5" />
                      </button>
                    </div>
                  ))}
                  {selectedImages.length > 16 && (
                    <div className="px-2.5 py-3 rounded-xl bg-white border border-indigo-200 text-[10px] font-mono font-bold text-indigo-700 flex-shrink-0 shadow-2xs">
                      +{selectedImages.length - 16} 更多
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => setSelectedImages([])}
                  className="text-[11px] text-red-600 hover:text-red-700 font-bold flex-shrink-0 cursor-pointer hover:underline px-1"
                >
                  清空全部
                </button>
              </div>
            )}
          </div>

          {/* Action Trigger Button & Style Prompt */}
          <div className="space-y-2.5">
            <div className="text-[11px] px-1 text-slate-500 font-medium flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-amber-500" />
              <span>
                AI 视觉大模型将全自动深度解析图集的光学画质、空间置景道具与真实光影，沉淀为可复用生图配方。
              </span>
            </div>

            <div className="flex flex-col lg:flex-row items-stretch lg:items-center gap-2">
              <div className="flex items-center gap-2 px-3.5 py-2.5 rounded-2xl bg-white border border-slate-200 shadow-2xs">
                <Cpu className="w-4 h-4 text-indigo-600 flex-shrink-0" />
                <span className="text-[11px] font-bold text-slate-700 whitespace-nowrap">分析模型:</span>
                <select
                  value={extractModel}
                  onChange={(e) => setExtractModel(e.target.value)}
                  className="bg-transparent text-xs font-bold text-indigo-950 outline-none cursor-pointer pr-1"
                >
                  {multimodalModels.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </div>

              <input
                type="text"
                value={userHint}
                onChange={(e) => setUserHint(e.target.value)}
                placeholder="补充风格要求 (可选，例如：突出日落暖灯、胡桃木质感、极简桌面)"
                className="flex-1 px-4 py-3 rounded-2xl bg-slate-50 border border-slate-200 text-xs text-slate-900 placeholder-slate-400 outline-none focus:bg-white focus:border-indigo-500 transition-all shadow-xs"
              />
              <button
                type="button"
                onClick={handleStartExtract}
                disabled={isExtracting || selectedImages.length === 0}
                className="px-6 py-3 rounded-2xl bg-gradient-to-r from-pink-600 via-purple-600 to-indigo-600 hover:from-pink-500 hover:to-indigo-500 text-white text-xs font-bold flex items-center justify-center gap-2 transition-all shadow-lg shadow-indigo-500/20 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0 active:scale-95 btn-shimmer"
              >
                {isExtracting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin text-white" />
                    <span>{extractStepText}</span>
                  </>
                ) : (
                  <>
                    <Wand2 className="w-4 h-4 text-white" />
                    <span>启动 AI 视觉架构推理 ➔</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Step 2: 架构推理结果预览与自定义微调 */}
          {extractedRecipe && (
            <RecipeEditorPanel
              extractedRecipe={extractedRecipe}
              setExtractedRecipe={setExtractedRecipe}
              categories={categories}
              isCreatingCategory={isCreatingCategory}
              setIsCreatingCategory={setIsCreatingCategory}
              newCategoryName={newCategoryName}
              setNewCategoryName={setNewCategoryName}
              handleCreateNewCategory={handleCreateNewCategory}
              setIsCategoryManagerOpen={setIsCategoryManagerOpen}
              handleSaveRecipe={handleSaveRecipe}
              isSaving={isSaving}
              showToast={showToast}
            />
          )}
        </div>
      </div>

      {/* 品类管理与删除弹窗 */}
      <CategoryManagerModal
        isOpen={isCategoryManagerOpen}
        onClose={() => setIsCategoryManagerOpen(false)}
        onCategoriesChanged={(updated) => {
          // 更新品类
          if (extractedRecipe && !updated.some((c) => c.id === extractedRecipe.category)) {
            setExtractedRecipe({ ...extractedRecipe, category: updated[0]?.id || 'general' });
          }
        }}
      />

      {/* Toast 提示 */}
      {toastMsg && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 px-4 py-2 bg-slate-900/90 backdrop-blur-md text-white text-xs font-bold rounded-xl shadow-xl z-50 animate-fade-in border border-white/10">
          {toastMsg}
        </div>
      )}
    </div>
  );
}
