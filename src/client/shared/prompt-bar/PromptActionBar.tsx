import { Plus, ArrowUp } from 'lucide-react';
import { densityComposerPad, composerContainer } from '@client/shared/ui/layoutClasses';
import { RichPromptInput } from './RichPromptInput';
import { PromptBarAtMenu } from './controls/PromptBarAtMenu';
import PromptBarBrandHero from './PromptBarBrandHero';
import PromptBarRefMediaPanel from './media/PromptBarRefMediaPanel';
import { PromptBarControlsRow } from './controls/PromptBarControlsRow';
import { usePromptActionBar, type PromptActionBarOptions } from './hooks/usePromptActionBar';

export type { SubjectItem } from './promptBarConstants';

export default function PromptActionBar(props: PromptActionBarOptions) {
  const {
    store,
    containerRef,
    handleComposerFocus,
    handleContainerBlur,
    anyDropdownOpen,
    isFloatingDock,
    shouldShowBrandHero,
    isExpanded,
    useTopStrip,
    media,
    videoFrames,
    showInlinePolaroid,
    isGenerateDock,
    isComposerExpanded,
    richInputRef,
    handleComposerKeyDown,
    placeholder,
    isUp,
    isDepthMode,
    modeMenu,
    modeButtonClass,
    handleModeSwitch,
    modelMenu,
    activeVideoModelObj,
    activeImageModelObj,
    availableVideoModels,
    availableImageModels,
    depthStyleMenu,
    depthQualityMenu,
    videoRefModeMenu,
    activeVideoRefModeObj,
    aspectMenu,
    activeVideoRatioObj,
    activeImageRatioObj,
    currentW,
    currentH,
    durationMenu,
    videoDurationBounds,
    handleSendPrompt,
    canSend,
    isSubmitting,
    fileAccept,
    toastMsg,
  } = usePromptActionBar(props);
  const {
    quickGenMode,
    quickDepthStyle,
    setQuickDepthStyle,
    quickDepthQuality,
    setQuickDepthQuality,
    quickPrompt,
    setQuickPrompt,
    quickRefImages,
    quickModel,
    setQuickModel,
    quickAspectId,
    setQuickAspectId,
    quickQuality,
    setQuickQuality,
    quickCount,
    setQuickCount,
    quickVideoModel,
    setQuickVideoModel,
    quickVideoDuration,
    setQuickVideoDuration,
    quickVideoResolution,
    setQuickVideoResolution,
    quickVideoAspectId,
    setQuickVideoAspectId,
    quickVideoRefMode,
    setQuickVideoRefMode,
    quickVideoFirstFrame,
    quickVideoLastFrame,
    setQuickVideoFirstFrame,
    setQuickVideoLastFrame,
    swapVideoFirstLastFrames,
    quickVideoMultiFrames,
    removeQuickVideoMultiFrame,
    quickVideoCount,
    setQuickVideoCount,
  } = store;

  return (
    <div
      ref={containerRef}
      data-prompt-composer
      onFocusCapture={handleComposerFocus}
      onBlur={handleContainerBlur}
      className={`w-full relative ${anyDropdownOpen ? 'z-40' : 'z-20'} ${!isFloatingDock ? composerContainer : ''}`}
    >
      {shouldShowBrandHero && <PromptBarBrandHero />}

      <div
        {...media.dropZoneProps}
        className={`w-full transition-[background-color,border-color,box-shadow,border-radius] duration-200 ease-out relative ${
          anyDropdownOpen ? 'z-40' : 'z-20'
        } group/composer ${
          isExpanded
            ? `bg-white border border-slate-200/90 shadow-none rounded-2xl ${
                isFloatingDock ? 'pt-3 px-3 sm:px-3.5 pb-2 flex flex-col gap-2.5 sm:gap-3' : `${densityComposerPad} flex flex-col gap-2.5 sm:gap-3`
              }`
            : 'bg-white/95 backdrop-blur-xl border border-slate-200/90 shadow-[0_8px_30px_rgba(0,0,0,0.06)] rounded-full px-3.5 py-1.5 sm:py-2 flex flex-col hover:border-slate-300'
        }`}
      >
        {isExpanded ? (
          <div className="flex flex-col gap-2.5 sm:gap-3 h-full animate-fade-in">
            {/* 🌟 展开面板（参考图3）：点击全部展开后在顶部展示全功能面板 */}
            {(useTopStrip || (media.isExpandedRefImages && quickRefImages.length > 0)) && (
              <div className="pb-2">
                <PromptBarRefMediaPanel
                  layout="strip"
                  quickGenMode={quickGenMode}
                  quickVideoRefMode={quickVideoRefMode}
                  quickVideoFirstFrame={quickVideoFirstFrame}
                  quickVideoLastFrame={quickVideoLastFrame}
                  quickVideoMultiFrames={quickVideoMultiFrames}
                  quickRefImages={quickRefImages}
                  isExpandedRefImages={media.isExpandedRefImages}
                  setIsExpandedRefImages={media.setIsExpandedRefImages}
                  setQuickVideoFirstFrame={setQuickVideoFirstFrame}
                  setQuickVideoLastFrame={setQuickVideoLastFrame}
                  swapVideoFirstLastFrames={swapVideoFirstLastFrames}
                  removeQuickVideoMultiFrame={removeQuickVideoMultiFrame}
                  removeQuickRefImage={media.handleRemoveRefImage}
                  onUploadClick={() => media.fileInputRef.current?.click()}
                  onFirstFrameClick={() => videoFrames.firstFrameInputRef.current?.click()}
                  onLastFrameClick={() => videoFrames.lastFrameInputRef.current?.click()}
                  onMultiFrameClick={() => videoFrames.multiFrameInputRef.current?.click()}
                  refImagesContainerRef={media.refImagesContainerRef}
                  onMouseEnterRefImages={media.handleMouseEnterRefImages}
                  onMouseLeaveRefImages={media.handleMouseLeaveRefImages}
                  resolveMediaFile={media.resolveMediaFile}
                  resolveMediaKind={media.resolveMediaKind}
                  allSubjects={media.allSubjects}
                  onSelectSubject={media.handleSelectSubject}
                  onClearAll={media.handleClearAllRefImages}
                />
              </div>
            )}

            <div className="flex items-start w-full relative">
              {showInlinePolaroid && !media.isExpandedRefImages && (
                <div className="shrink-0 relative z-20">
                  <PromptBarRefMediaPanel
                    layout="sidebar"
                    frameExpanded={!isGenerateDock && isComposerExpanded}
                    quickGenMode={quickGenMode}
                    quickVideoRefMode={quickVideoRefMode}
                    quickVideoFirstFrame={quickVideoFirstFrame}
                    quickVideoLastFrame={quickVideoLastFrame}
                    quickVideoMultiFrames={quickVideoMultiFrames}
                    quickRefImages={quickRefImages}
                    isExpandedRefImages={media.isExpandedRefImages}
                    setIsExpandedRefImages={media.setIsExpandedRefImages}
                    setQuickVideoFirstFrame={setQuickVideoFirstFrame}
                    setQuickVideoLastFrame={setQuickVideoLastFrame}
                    swapVideoFirstLastFrames={swapVideoFirstLastFrames}
                    removeQuickVideoMultiFrame={removeQuickVideoMultiFrame}
                    removeQuickRefImage={media.handleRemoveRefImage}
                    onUploadClick={() => media.fileInputRef.current?.click()}
                    onFirstFrameClick={() => videoFrames.firstFrameInputRef.current?.click()}
                    onLastFrameClick={() => videoFrames.lastFrameInputRef.current?.click()}
                    onMultiFrameClick={() => videoFrames.multiFrameInputRef.current?.click()}
                    refImagesContainerRef={media.refImagesContainerRef}
                    onMouseEnterRefImages={media.handleMouseEnterRefImages}
                    onMouseLeaveRefImages={media.handleMouseLeaveRefImages}
                    resolveMediaFile={media.resolveMediaFile}
                    resolveMediaKind={media.resolveMediaKind}
                    allSubjects={media.allSubjects}
                    onSelectSubject={media.handleSelectSubject}
                    onClearAll={media.handleClearAllRefImages}
                  />
                </div>
              )}

              <div className="flex-1 min-w-0 relative z-10 overflow-x-hidden scrollbar-none no-scrollbar">
                <RichPromptInput
                  ref={richInputRef}
                  variant={isGenerateDock ? 'default' : 'composer'}
                  expanded={!isGenerateDock && isComposerExpanded}
                  value={quickPrompt}
                  onChange={setQuickPrompt}
                  onKeyDown={handleComposerKeyDown}
                  onPasteFiles={media.handlePasteFiles}
                  placeholder={placeholder}
                  allSubjects={media.allSubjects}
                  quickRefImages={quickRefImages}
                  onTriggerAtMenu={(pos, query) => {
                    media.setCursorPosition(pos);
                    media.setAtMenuQuery(query || '');
                    media.setAtMenuTrigger('input');
                    media.setShowAtMenu(true);
                  }}
                  onCloseAtMenu={() => {
                    if (media.atMenuTrigger === 'input') {
                      media.setShowAtMenu(false);
                      media.setAtMenuTrigger(null);
                    }
                  }}
                />
              </div>
            </div>

            {/* 🌟 键盘输入 @ 触发时：紧贴输入框下方展现（图 1 同款高级空态/列表） */}
            {media.showAtMenu && media.atMenuTrigger === 'input' && (
              <PromptBarAtMenu
                atMenuRef={media.atMenuRef}
                anchorRef={containerRef}
                isUp={isUp}
                atMenuQuery={media.atMenuQuery}
                allSubjects={media.allSubjects}
                activeSubjects={media.activeSubjects}
                onCreateSubjectClick={() => media.createSubjectInputRef.current?.click()}
                onSelectSubject={media.handleSelectSubject}
              />
            )}

            <PromptBarControlsRow
              isUp={isUp}
              anyDropdownOpen={anyDropdownOpen}
              quickGenMode={quickGenMode}
              isDepthMode={isDepthMode}
              modeMenu={modeMenu}
              modeButtonClass={modeButtonClass}
              handleModeSwitch={handleModeSwitch}
              modelMenu={modelMenu}
              activeVideoModelObj={activeVideoModelObj}
              activeImageModelObj={activeImageModelObj}
              availableVideoModels={availableVideoModels}
              availableImageModels={availableImageModels}
              quickVideoModel={quickVideoModel}
              quickModel={quickModel}
              quickVideoDuration={quickVideoDuration}
              setQuickVideoModel={setQuickVideoModel}
              setQuickVideoDuration={setQuickVideoDuration}
              setQuickModel={setQuickModel}
              quickDepthStyle={quickDepthStyle}
              setQuickDepthStyle={setQuickDepthStyle}
              depthStyleMenu={depthStyleMenu}
              quickDepthQuality={quickDepthQuality}
              setQuickDepthQuality={setQuickDepthQuality}
              depthQualityMenu={depthQualityMenu}
              videoRefModeMenu={videoRefModeMenu}
              activeVideoRefModeObj={activeVideoRefModeObj}
              quickVideoRefMode={quickVideoRefMode}
              setQuickVideoRefMode={setQuickVideoRefMode}
              aspectMenu={aspectMenu}
              activeVideoRatioObj={activeVideoRatioObj}
              quickVideoResolution={quickVideoResolution}
              quickVideoCount={quickVideoCount}
              activeImageRatioObj={activeImageRatioObj}
              quickQuality={quickQuality}
              quickCount={quickCount}
              quickVideoAspectId={quickVideoAspectId}
              setQuickVideoAspectId={setQuickVideoAspectId}
              setQuickVideoResolution={setQuickVideoResolution}
              setQuickVideoCount={setQuickVideoCount}
              quickAspectId={quickAspectId}
              setQuickAspectId={setQuickAspectId}
              setQuickQuality={setQuickQuality}
              setQuickCount={setQuickCount}
              currentW={currentW}
              currentH={currentH}
              durationMenu={durationMenu}
              videoDurationBounds={videoDurationBounds}
              quickPrompt={quickPrompt}
              setQuickPrompt={setQuickPrompt}
              media={media}
              richInputRef={richInputRef}
              handleSendPrompt={handleSendPrompt}
              canSend={canSend}
              isSubmitting={isSubmitting}
            />
          </div>
        ) : (
          /* 🌟 当处于常态折叠状态时 (!isExpanded，严格参考画布常态设计) */
          <div className="flex items-center gap-2.5 sm:gap-3 w-full">
            {/* 左侧微倾斜参考素材插槽 (对齐截图2红框) */}
            <div className="shrink-0 flex items-center justify-center">
              <button
                type="button"
                onClick={() => media.fileInputRef.current?.click()}
                className="w-[34px] h-[40px] -rotate-6 hover:rotate-0 hover:scale-105 active:scale-95 rounded-[7px] border border-slate-200/90 bg-slate-50/90 hover:bg-slate-100 flex flex-col items-center justify-center transition-all cursor-pointer shadow-2xs group/mini-add shrink-0"
                title="上传参考素材"
              >
                <Plus className="w-3.5 h-3.5 text-slate-400 group-hover/mini-add:text-slate-700 stroke-[1.8] transition-colors" />
              </button>
            </div>

            {/* 中间单行输入区 (极简占位提示) */}
            <div className="flex-1 min-w-0 relative z-10 overflow-x-hidden scrollbar-none no-scrollbar flex items-center">
              <RichPromptInput
                ref={richInputRef}
                variant="composer"
                expanded={false}
                singleLine={true}
                value={quickPrompt}
                onChange={setQuickPrompt}
                onKeyDown={handleComposerKeyDown}
                onPasteFiles={media.handlePasteFiles}
                placeholder={
                  quickGenMode === 'video'
                    ? 'Seedance 2.0全能参考，上传参考、输入文字或 @ 主体'
                    : placeholder
                }
                allSubjects={media.allSubjects}
                quickRefImages={quickRefImages}
                onTriggerAtMenu={(pos, query) => {
                  media.setCursorPosition(pos);
                  media.setAtMenuQuery(query || '');
                  media.setAtMenuTrigger('input');
                  media.setShowAtMenu(true);
                }}
                onCloseAtMenu={() => {
                  if (media.atMenuTrigger === 'input') {
                    media.setShowAtMenu(false);
                    media.setAtMenuTrigger(null);
                  }
                }}
              />
            </div>

            {/* 右侧圆形发送按钮 (对齐截图2红框) */}
            <div className="shrink-0 flex items-center">
              <button
                type="button"
                onClick={handleSendPrompt}
                disabled={!canSend}
                className={`w-8 h-8 rounded-full flex items-center justify-center transition-all select-none active:scale-95 shrink-0 ${
                  canSend
                    ? 'bg-slate-900 hover:bg-black text-white shadow-2xs cursor-pointer'
                    : 'bg-[#E3E5EB] text-slate-400 cursor-not-allowed'
                }`}
                title={
                  quickGenMode === 'depth-image'
                    ? '生成深度图片'
                    : quickGenMode === 'depth-video'
                      ? '生成深度动作捕捉'
                      : quickGenMode === 'video'
                        ? '开始生成视频'
                        : '立即生成图片'
                }
              >
                <ArrowUp className="w-4 h-4 stroke-[2.2]" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 隐藏的系统文件选择器与拖拽入口 */}
      <input
        ref={media.fileInputRef}
        type="file"
        accept={fileAccept}
        multiple={!isDepthMode}
        className="hidden"
        onChange={media.handleFileUpload}
      />
      <input
        ref={media.createSubjectInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={media.handleCreateSubject}
      />
      <input
        ref={videoFrames.firstFrameInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={videoFrames.handleUploadFirstFrame}
      />
      <input
        ref={videoFrames.lastFrameInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={videoFrames.handleUploadLastFrame}
      />
      <input
        ref={videoFrames.multiFrameInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={videoFrames.handleUploadMultiFrame}
      />

      {toastMsg && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[80] px-4 py-2.5 rounded-2xl bg-slate-900 text-white text-xs font-medium shadow-xl">
          {toastMsg}
        </div>
      )}
    </div>
  );
}
