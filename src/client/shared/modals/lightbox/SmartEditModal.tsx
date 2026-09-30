import { useSmartEditState } from './useSmartEditState';
import { SmartEditToolbar } from './SmartEditToolbar';
import type { SmartEditModalProps } from './smartEditTypes';
export type { MarkerPoint, DragBox, SmartEditModalProps } from './smartEditTypes';
import React from 'react';
import {
  X,
  MapPin,
  Crop,
  Minus,
  ArrowUp,
  Sparkles,
  ChevronDown,
  Check,
} from 'lucide-react';
import { getModelIcon } from '../../ui/ModelIcons';
import '@shared/domain/models/workflowModels';

export const SmartEditModal: React.FC<SmartEditModalProps> = ({
  isOpen,
  onClose,
  imageUrl,
  originalPrompt = '',
  onSubmitSmartEdit,
  quickModel,
  quickQuality,
  quickAspectId,
  onChangeQuickModel,
  onChangeQuickQuality,
  onChangeQuickAspectId,
}) => {
  const {
    markers, activeMarkerId, setActiveMarkerId, history, historyIndex, zoomLevel, prompt, setPrompt,
    editMode, setEditMode, isDrawingBox, currentDragBox, currentImgSrc, hasImgError, handleImgLoadError,
    availableImageModels, selectedModelId, selectedQuality, selectedAspectId,
    showModelDropdown, setShowModelDropdown, showSizeDropdown, setShowSizeDropdown,
    modelDropdownRef, sizeDropdownRef, activeModelObj, handleSelectModel, handleSelectQuality,
    handleSelectAspect, imageContainerRef, handleClickImage, handleMouseDown, handleMouseMove,
    handleMouseUp, handleRemoveMarker, handleUndo, handleRedo, handleZoomIn, handleZoomOut,
    canSubmit, handleSubmit,
  } = useSmartEditState({
    isOpen, onClose, imageUrl, originalPrompt, onSubmitSmartEdit, quickModel, quickQuality, quickAspectId,
    onChangeQuickModel, onChangeQuickQuality, onChangeQuickAspectId,
  });

  if (!isOpen) return null;

  const activeMarker = markers.find((m) => m.id === activeMarkerId);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-xs p-3 sm:p-6 select-none animate-fade-in"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-4xl bg-white rounded-3xl shadow-2xl border border-slate-200 flex flex-col max-h-[92vh] overflow-hidden p-4 sm:p-6 space-y-3 sm:space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <SmartEditToolbar
          editMode={editMode} setEditMode={setEditMode} historyIndex={historyIndex}
          historyLength={history.length} zoomLevel={zoomLevel} handleUndo={handleUndo}
          handleRedo={handleRedo} handleZoomIn={handleZoomIn} handleZoomOut={handleZoomOut}
          onClose={onClose}
        />

        {/* 🌟 2. 中间大图交互工作区（100% 纯净无遮挡，任何工具条均不压在图片上） */}
        <div className="relative flex-1 min-h-[360px] sm:min-h-[440px] bg-slate-50/80 rounded-2xl overflow-hidden flex items-center justify-center border border-slate-200/60 p-3 sm:p-4 group">
          {/* 图像视口 */}
          <div
            ref={imageContainerRef}
            onClick={handleClickImage}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            className={`relative max-h-[58vh] max-w-full inline-block transition-transform duration-150 origin-center select-none ${
              editMode === 'box' ? 'cursor-crosshair' : 'cursor-crosshair'
            }`}
            style={{
              transform: `scale(${zoomLevel / 100})`,
            }}
          >
            {/* 主图片 */}
            {!hasImgError && currentImgSrc ? (
              <img
                src={currentImgSrc}
                alt={originalPrompt || "编辑原图"}
                onError={handleImgLoadError}
                draggable={false}
                className="max-h-[56vh] max-w-full object-contain block pointer-events-none rounded-xl shadow-xs"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="w-[380px] h-[380px] flex flex-col items-center justify-center text-slate-400 gap-2 bg-slate-200/60 rounded-xl">
                <Sparkles className="w-8 h-8 opacity-40" />
                <span className="text-xs">图片加载中或暂时不可用</span>
              </div>
            )}

            {/* 🌟 正在框选过程中的实时高光预览选区 */}
            {isDrawingBox && currentDragBox && (
              <div
                className="absolute z-30 border-2 border-dashed border-[#007AFF] bg-[#007AFF]/20 rounded-lg pointer-events-none transition-none shadow-sm"
                style={{
                  left: `${currentDragBox.x}%`,
                  top: `${currentDragBox.y}%`,
                  width: `${currentDragBox.width}%`,
                  height: `${currentDragBox.height}%`,
                }}
              >
                <div className="absolute -top-6 left-0 px-1.5 py-0.5 rounded bg-[#007AFF] text-white text-[10px] font-bold font-mono">
                  框选区域
                </div>
              </div>
            )}

            {/* 🌟 渲染已创建的标记点与框选区域 */}
            {markers.map((marker) => {
              const isActive = activeMarkerId === marker.id;

              // 🌟 1. 矩形框选区域渲染
              if (marker.type === 'box') {
                return (
                  <div
                    key={marker.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      setActiveMarkerId(marker.id);
                    }}
                    className={`absolute z-20 rounded-lg transition-all cursor-pointer ${
                      isActive
                        ? 'border-2 border-[#007AFF] bg-[#007AFF]/25 ring-2 ring-[#007AFF]/30 shadow-md'
                        : 'border-2 border-dashed border-[#007AFF] bg-[#007AFF]/15 hover:bg-[#007AFF]/25'
                    }`}
                    style={{
                      left: `${marker.x}%`,
                      top: `${marker.y}%`,
                      width: `${marker.width}%`,
                      height: `${marker.height}%`,
                    }}
                  >
                    {/* 左上角序号徽标 */}
                    <div className="absolute -top-3 -left-3 flex items-center gap-1 bg-[#007AFF] text-white px-1.5 py-0.5 rounded-full text-[10px] font-bold shadow-md">
                      <Crop className="w-2.5 h-2.5" />
                      <span>{marker.index}</span>
                    </div>

                    {/* 右上角删除按钮 */}
                    <button
                      type="button"
                      onClick={(e) => handleRemoveMarker(marker.id, e)}
                      className="absolute -top-2.5 -right-2.5 w-5 h-5 rounded-full bg-slate-900/80 hover:bg-black text-white flex items-center justify-center shadow-sm cursor-pointer opacity-80 hover:opacity-100 transition-opacity"
                      title="删除此框选区域"
                    >
                      <X className="w-3 h-3 stroke-[2.5]" />
                    </button>
                  </div>
                );
              }

              // 🌟 2. 水滴标记点渲染 (point)
              return (
                <div
                  key={marker.id}
                  onClick={(e) => {
                    e.stopPropagation();
                    setActiveMarkerId(marker.id);
                  }}
                  className="absolute z-20 -translate-x-1/2 -translate-y-full group/marker cursor-pointer animate-scale-up"
                  style={{ left: `${marker.x}%`, top: `${marker.y}%` }}
                >
                  <div className="relative flex items-center justify-center">
                    <div
                      className={`w-7 h-7 rounded-full flex items-center justify-center shadow-lg border-2 border-white transition-transform ${
                        isActive
                          ? 'bg-[#007AFF] text-white scale-110 ring-2 ring-[#007AFF]/40'
                          : 'bg-[#007AFF]/90 hover:bg-[#007AFF] text-white'
                      }`}
                    >
                      <span className="text-[12px] font-bold leading-none font-mono">
                        {marker.index}
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={(e) => handleRemoveMarker(marker.id, e)}
                      className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-slate-900/80 hover:bg-black text-white flex items-center justify-center shadow-sm cursor-pointer opacity-80 group-hover/marker:opacity-100 transition-opacity"
                      title="删除此标记点"
                    >
                      <Minus className="w-2.5 h-2.5 stroke-[3]" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* 🌟 3. 底部输入框与参数栏 */}
        <div className="shrink-0 bg-white rounded-2xl border border-slate-200/90 p-2.5 sm:p-3 shadow-xs space-y-2">
          <div className="flex items-center gap-2">
            {/* 当前选中标记/框选徽标胶囊 */}
            {markers.length > 0 && (
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-slate-100/90 text-slate-800 text-xs font-medium shrink-0 border border-slate-200/80">
                <div className="w-4 h-4 rounded-full overflow-hidden bg-slate-200 shrink-0">
                  <img
                    src={currentImgSrc}
                    alt="选区"
                    className="w-full h-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                </div>
                <div className="flex items-center gap-1 bg-[#007AFF] text-white px-1.5 py-0.5 rounded-full text-[9px] font-bold leading-none font-mono">
                  {activeMarker?.type === 'box' ? (
                    <Crop className="w-2.5 h-2.5" />
                  ) : (
                    <MapPin className="w-2.5 h-2.5" />
                  )}
                  <span>{activeMarker?.index || 1}</span>
                </div>
              </div>
            )}

            {/* 提示词输入框 */}
            <input
              type="text"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmit();
                }
              }}
              placeholder={
                editMode === 'box'
                  ? '按住鼠标在图片上拖拽即可框选区域，描述修改需求，如：把框选区域的文字去掉...'
                  : '点击图片放置标记点，描述你想如何调整该位置，如：把头发换成粉色...'
              }
              className="flex-1 bg-transparent text-[13px] text-slate-800 placeholder:text-slate-400 focus:outline-none min-w-0"
            />

            {/* 参数与提交按钮组 */}
            <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
              {/* 模型选择下拉框 */}
              <div className="relative" ref={modelDropdownRef}>
                <button
                  type="button"
                  onClick={() => {
                    setShowModelDropdown((prev) => !prev);
                    setShowSizeDropdown(false);
                  }}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-[11px] font-medium transition-all cursor-pointer border ${
                    showModelDropdown
                      ? 'bg-slate-100 border-slate-300 text-slate-950 shadow-2xs'
                      : 'bg-slate-100/80 hover:bg-slate-100 border-slate-200/60 text-slate-700'
                  }`}
                  disabled={!availableImageModels.length}
                  title={availableImageModels.length ? "点击切换生图模型" : "请在设置中启用生图模型"}
                >
                  <div className="w-3.5 h-3.5 flex items-center justify-center shrink-0">
                    {getModelIcon(selectedModelId, 'w-3.5 h-3.5')}
                  </div>
                  <span className="truncate max-w-[90px] sm:max-w-[130px] inline-block font-semibold">
                    {activeModelObj.shortName || activeModelObj.name}
                  </span>
                  <ChevronDown className="w-3 h-3 opacity-60 shrink-0 ml-0.5" />
                </button>

                {/* 模型下拉浮层 */}
                {showModelDropdown && (
                  <div className="absolute right-0 bottom-full mb-2 w-52 py-1.5 rounded-2xl bg-white border border-slate-200 shadow-xl z-50 flex flex-col text-xs text-slate-700 animate-in fade-in zoom-in-95 duration-100">
                    <div className="px-3 py-1 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                      生图模型配置
                    </div>
                    {availableImageModels.map((m) => {
                      const isSelected = m.id === selectedModelId;
                      return (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => handleSelectModel(m.id)}
                          className={`flex items-center justify-between px-3 py-2 text-left font-medium transition-colors cursor-pointer ${
                            isSelected
                              ? 'bg-indigo-50/80 text-indigo-700'
                              : 'hover:bg-slate-50 text-slate-700'
                          }`}
                        >
                          <div className="flex items-center gap-2 truncate">
                            <div className="w-4 h-4 flex items-center justify-center shrink-0">
                              {getModelIcon(m.id, 'w-4 h-4')}
                            </div>
                            <span className="truncate">{m.shortName || m.name}</span>
                          </div>
                          {isSelected && <Check className="w-3.5 h-3.5 text-indigo-600 shrink-0" />}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* 画质与比例控制 */}
              <div className="relative" ref={sizeDropdownRef}>
                <button
                  type="button"
                  onClick={() => {
                    setShowSizeDropdown((prev) => !prev);
                    setShowModelDropdown(false);
                  }}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-[11px] font-medium transition-all cursor-pointer border ${
                    showSizeDropdown
                      ? 'bg-slate-100 border-slate-300 text-slate-950 shadow-2xs'
                      : 'bg-slate-100/80 hover:bg-slate-100 border-slate-200/60 text-slate-700'
                  }`}
                  title="点击切换尺寸与分辨率"
                  aria-label="点击切换尺寸与分辨率"
                >
                  <span className="font-bold text-slate-900">{selectedQuality}</span>
                  <span className="text-slate-300">·</span>
                  <span className="font-mono text-slate-600">{selectedAspectId}</span>
                  <ChevronDown className="w-3 h-3 opacity-60 shrink-0" />
                </button>

                {/* 尺寸下拉浮层 */}
                {showSizeDropdown && (
                  <div className="absolute right-0 bottom-full mb-2 w-48 p-2 rounded-2xl bg-white border border-slate-200 shadow-xl z-50 flex flex-col gap-2 animate-in fade-in zoom-in-95 duration-100">
                    <div>
                      <span className="block text-[10px] font-bold text-slate-400 mb-1">清晰度 / 分辨率</span>
                      <div className="grid grid-cols-3 gap-1">
                        {(['1K', '2K', '4K'] as const).map((q) => (
                          <button
                            key={q}
                            type="button"
                            aria-label={`清晰度 ${q}`}
                            onClick={() => handleSelectQuality(q)}
                            className={`py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                              selectedQuality === q
                                ? 'bg-slate-900 text-white shadow-2xs'
                                : 'bg-slate-100 text-slate-600 hover:bg-slate-200/70'
                            }`}
                          >
                            {q}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <span className="block text-[10px] font-bold text-slate-400 mb-1">输出尺寸比例</span>
                      <div className="grid grid-cols-3 gap-1">
                        {['1:1', '3:4', '4:3', '9:16', '16:9'].map((aspect) => (
                          <button
                            key={aspect}
                            type="button"
                            onClick={() => handleSelectAspect(aspect)}
                            className={`py-1 rounded-lg text-xs font-mono font-medium transition-all cursor-pointer ${
                              selectedAspectId === aspect
                                ? 'bg-indigo-50 text-indigo-700 font-bold border border-indigo-200'
                                : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
                            }`}
                          >
                            {aspect}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* 提交生成按钮 */}
              <button
                type="button"
                onClick={handleSubmit}
                disabled={!canSubmit}
                className={`flex items-center gap-1.5 px-4 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer shadow-xs ${
                  canSubmit
                    ? 'bg-slate-900 hover:bg-black text-white hover:scale-105 active:scale-95 shadow-md shadow-slate-900/20'
                    : 'bg-slate-100 text-slate-400 cursor-not-allowed'
                }`}
                title={canSubmit ? '提交智能改图任务' : availableImageModels.length ? '请先输入局部改图描述' : '请在设置中启用生图模型'}
              >
                <span>生成</span>
                <ArrowUp className="w-3.5 h-3.5 stroke-[2.5]" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SmartEditModal;
