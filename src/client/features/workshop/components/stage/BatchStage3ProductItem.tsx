import React, { useState, useRef, useLayoutEffect, useMemo } from 'react';
import {
  Loader2,
  Trash2,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
} from 'lucide-react';
import { BatchProductItem } from '../../model/batchTypes';
import BatchShotGrid from '../BatchShotGrid';
import BatchStatusBadge from '../BatchStatusBadge';
import { BatchStage3ShotCard } from './BatchStage3ShotCard';
import { proxyMediaUrl } from '@client/shared/api/apiClient';
import { getSharedAssetLabels, getShotAssetLabels } from '../../model/assetPresentation';
import { fullPromptGroupLabel } from '@shared/domain/assets/fullPromptGroupLabel';
import { stableAssetCode } from '@shared/domain/assets/assetSampling';
import { getCachedAssetsSync } from '@client/shared/api/assetLibraryCache';

export interface BatchStage3ProductItemProps {
  isGridMode?: boolean;
  onUpdateGridPrompt?: (value: string) => void;
  item: BatchProductItem;
  itemIdx: number;
  isAnalyzingAll: boolean;
  expandedShots: Record<string, boolean>;
  copiedShotKey: string | null;
  toggleShotExpand: (key: string) => void;
  expandAllCurrentItemShots: (item: BatchProductItem) => void;
  copyShotPrompt: (prompt: string, key: string) => void;
  onUpdatePrompt: (shotIdx: number, newVal: string) => void;
  onAnalyzeSingle: () => void;
  handleRemoveItem: (id: string) => void;
  onPreviewImage?: (url: string) => void;
}

const MemoizedProductItem = React.memo(function ProductItem({
  isGridMode = false,
  onUpdateGridPrompt,
  item,
  itemIdx,
  isAnalyzingAll,
  expandedShots,
  copiedShotKey,
  toggleShotExpand,
  expandAllCurrentItemShots,
  copyShotPrompt,
  onUpdatePrompt,
  onAnalyzeSingle,
  handleRemoveItem,
  onPreviewImage,
}: BatchStage3ProductItemProps) {
  const [editingGrid, setEditingGrid] = useState(false);
  const [showShotSummary, setShowShotSummary] = useState(false);
  const coverImg = item.selectedProductImages[0] || item.coverImage || '';
  const hasPrompts = item.prompts && item.prompts.length > 0;
  const sharedAssets = getSharedAssetLabels(item.prompts || [], item.applied_persona);
  const sourceGroupNumber = item.appliedFullPromptDisplayNumber
    ?? getCachedAssetsSync('full_prompt').find(group => group.id === item.appliedFullPromptId)?.displayNumber;
  const sourceGroupName = sourceGroupNumber
    ? fullPromptGroupLabel(sourceGroupNumber)
    : item.appliedFullPromptId ? `#${stableAssetCode('R', item.appliedFullPromptId)}` : '未编号图组';

  return (
    <div style={{ contentVisibility: 'auto', containIntrinsicSize: 'auto 240px' }} className="p-4 sm:p-5 space-y-4 bg-transparent border border-slate-200/60 rounded-2xl dark:border-white/10">
      {/* 商品行头部信息 */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <button
            type="button"
            onClick={() => coverImg && onPreviewImage?.(coverImg)}
            className="relative w-16 h-16 rounded-xl border border-slate-100 overflow-hidden shrink-0 bg-slate-50 hover:opacity-90 transition-opacity cursor-pointer dark:bg-white/5 dark:border-white/10"
          >
            <img
              src={coverImg ? proxyMediaUrl(coverImg, { thumb: true, width: 160 }) : undefined}
              alt={item.title}
              className="w-full h-full object-contain"
              loading="lazy"
            />
          </button>

          <div className="min-w-0 space-y-0.5">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[11px] font-mono text-slate-400">
                #{itemIdx + 1}
              </span>
              <h4
                className="text-sm font-semibold text-slate-900 truncate max-w-[min(65vw,640px)] dark:text-slate-100"
                title={item.title}
              >
                {item.title}
              </h4>
              {item.isAnalyzing ? (
                <BatchStatusBadge variant="analyzing" spinning>
                  AI 分析优化中
                </BatchStatusBadge>
              ) : item.analysisError ? (
                <span className="text-[11px] text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full">分析失败</span>
              ) : hasPrompts && item.analyzedSuccess ? (
                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded">
                  <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                  提示词已就绪
                </span>
              ) : (
                <span className="text-[11px] text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full dark:text-slate-400 dark:bg-white/10">待分析</span>
              )}
            </div>

            <div className="flex items-center gap-2 flex-wrap text-[11px] text-slate-500 dark:text-slate-400">
              <span>SKU: {item.itemId}</span>
              <span>·</span>
              <span>已选 {item.selectedProductImages.length} 张图</span>
              {hasPrompts && (
                <>
                  <span>·</span>
                  <span>{item.prompts.length} 个镜头</span>
                </>
              )}
              {hasPrompts && item.appliedFullPromptId && (
                <>
                  <span>·</span>
                  <span className="inline-flex max-w-full flex-wrap items-center gap-1.5" title={`母本原名称：${item.appliedFullPromptTitle || '未命名'}；资产 ID：${item.appliedFullPromptId}`}>
                    <span>{item.appliedFullPromptSelectionMode === 'auto' ? '轮询使用' : '固定使用'}</span>
                    <strong className="text-indigo-700">{sourceGroupName}</strong>
                  </span>
                  {item.appliedFullPromptAppearance && <span className={`rounded px-1.5 py-0.5 font-medium ${item.appliedFullPromptAppearance === 'human' ? 'bg-violet-50 text-violet-700' : 'bg-slate-100 text-slate-600 dark:text-slate-300 dark:bg-white/10'}`}>
                    {item.appliedFullPromptAppearance === 'human' ? '含人物镜头' : item.appliedFullPromptAppearance === 'product' ? '全组无人物' : '出镜待判定'}
                  </span>}
                  {item.appliedFullPromptSelectionMode === 'auto' && typeof item.appliedFullPromptEligibleCount === 'number' && typeof item.appliedFullPromptInventoryCount === 'number' && (
                    <span className="text-slate-500 dark:text-slate-400">本商品可轮询 {item.appliedFullPromptEligibleCount} / 库存 {item.appliedFullPromptInventoryCount} 母版</span>
                  )}
                </>
              )}
            </div>
          </div>
        </div>

        {/* 行右侧动作 */}
        <div className="flex items-center gap-2 shrink-0">
          {hasPrompts && !isGridMode && (
            <button
              type="button"
              onClick={() => expandAllCurrentItemShots(item)}
              className="text-[11px] font-semibold text-slate-500 hover:text-slate-800 px-2 py-1 rounded cursor-pointer dark:hover:text-slate-100 dark:text-slate-400"
            >
              全部展开
            </button>
          )}
          <button
            type="button"
            disabled={item.isAnalyzing || isAnalyzingAll}
            onClick={onAnalyzeSingle}
            className="px-2.5 py-1 rounded text-xs font-bold text-slate-700 hover:bg-slate-100 flex items-center gap-1 cursor-pointer disabled:opacity-40 dark:text-slate-200 dark:hover:bg-white/10"
            title="重新由 AI 视觉模型分析并打磨此商品"
          >
            {item.isAnalyzing ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-600" />
            ) : (
              <RefreshCw className="w-3 h-3 text-slate-500 dark:text-slate-400" />
            )}
            <span>{item.isAnalyzing ? '分析中' : hasPrompts ? '重新分析' : '分析商品'}</span>
          </button>

          <button
            type="button"
            onClick={() => handleRemoveItem(item.id)}
            className="p-1 rounded text-slate-400 hover:text-rose-600 cursor-pointer"
            title="移除此商品"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* 异常警示 */}
      {item.analysisError && (
        <div className="p-2.5 rounded-lg bg-amber-50 text-amber-800 text-xs flex items-center justify-between gap-3 border-l-2 border-amber-500">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
            <span>{item.analysisError}</span>
          </div>
          <button
            type="button"
            disabled={item.isAnalyzing || isAnalyzingAll}
            onClick={onAnalyzeSingle}
            className="px-2.5 py-1 rounded bg-amber-100 hover:bg-amber-200 text-amber-900 text-xs font-bold cursor-pointer shrink-0"
          >
            重试分析
          </button>
        </div>
      )}

      {Object.values(sharedAssets).some(Boolean) && (
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-xl bg-slate-50 px-4 py-3 text-xs text-slate-600 dark:text-slate-300 dark:bg-white/5">
          <span className="font-semibold text-slate-800 dark:text-slate-100">实际共用内容</span>
          {sharedAssets.scene && <span className="max-w-full truncate" title={sharedAssets.scene}>场景 · {sharedAssets.scene}</span>}
          {sharedAssets.outfit && <span className="max-w-full truncate" title={sharedAssets.outfit}>穿搭 · {sharedAssets.outfit}</span>}
          {sharedAssets.persona && <span className="max-w-full truncate" title={sharedAssets.persona}>人设 · {sharedAssets.persona}</span>}
        </div>
      )}

      {hasPrompts && item.appliedFullPromptId && !sharedAssets.scene && (
        <p className="text-xs text-slate-500 dark:text-slate-400">每款商品使用上方母组，场景按镜头绑定；展开分镜结构可核对实际场景与光线。</p>
      )}

      {/* 共用资产只在商品级展示，分镜保留差异信息。 */}
      {hasPrompts && isGridMode ? (
        <section className="rounded-xl border border-indigo-100 bg-slate-50/60 p-4 space-y-3 dark:bg-white/5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h5 className="text-sm font-semibold text-slate-900 dark:text-slate-100">四宫格 · 整组生成提示词</h5>
              <p className="text-xs text-slate-500 mt-1 dark:text-slate-400">一次生成四宫格图片；下方整组提示词用于实际生图。</p>
            </div>
            <div className="flex gap-3 text-xs text-indigo-600">
              <button type="button" disabled={!item.gridPrompt} onClick={() => copyShotPrompt(item.gridPrompt || '', `${item.id}-grid`)}>
                {copiedShotKey === `${item.id}-grid` ? '已复制' : '复制整组'}
              </button>
              <button type="button" disabled={item.isAnalyzing || isAnalyzingAll || !item.gridPrompt} onClick={() => setEditingGrid(!editingGrid)}>{editingGrid ? '完成编辑' : '编辑提示词'}</button>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2" aria-label="本组四镜场景与动作概要">
            {item.prompts.slice(0, 4).map((shot, index) => {
              const scene = getShotAssetLabels(shot).scene || shot.scene || '未标注场景';
              const action = shot.action || shot.applied_action || '未标注动作';
              return <div key={index} className="min-w-0 rounded-lg border border-indigo-100/70 bg-transparent p-2.5 text-[11px] leading-5 text-slate-600 dark:text-slate-300">
                <p className="truncate font-semibold text-slate-800 dark:text-slate-100" title={shot.title || ''}>{index + 1}. {shot.title || `镜头 ${index + 1}`}</p>
                <p className="line-clamp-2" title={scene}>场景：{scene}</p>
                <p className="line-clamp-2" title={action}>动作：{action}</p>
              </div>;
            })}
          </div>
          {editingGrid ? (
            <textarea aria-label="整组生成提示词" value={item.gridPrompt || ''}
              disabled={item.isAnalyzing || isAnalyzingAll}
              onChange={event => onUpdateGridPrompt?.(event.target.value)}
              className="soft-textarea w-full min-h-64 p-4 text-sm leading-7" />
          ) : (
            <p className="text-sm leading-7 text-slate-600 whitespace-pre-wrap line-clamp-5 dark:text-slate-300">
              {item.gridPrompt ? `${item.gridPrompt.slice(0, 600)}${item.gridPrompt.length > 600 ? '…' : ''}` : '此商品暂无整组提示词，请重新分析后再生成四宫格。'}
            </p>
          )}
          <div className="flex justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>{(item.gridPrompt || '').length} 字符 · 编辑自动保留在当前批次</span>
            <button type="button" onClick={() => setShowShotSummary(!showShotSummary)}>{showShotSummary ? '收起分镜结构' : '查看分镜结构'}</button>
          </div>
          {showShotSummary && <div className="grid grid-cols-2 gap-2 border-t pt-3">
            {item.prompts.map((shot, index) => <div key={index} className="text-xs text-slate-600 p-3 bg-white rounded-lg space-y-1 dark:text-slate-300 dark:bg-[#18191c]">
              <p className="font-medium">{index + 1}. {shot.title || `分镜 ${index + 1}`} · {shot.camera_focal_length || '母本机位'}</p>
              <p className="line-clamp-3" title={getShotAssetLabels(shot).scene}>场景：{getShotAssetLabels(shot).scene || '未记录'}</p>
              <p>光线：{shot.lighting_type || '未记录'}</p>
            </div>)}
          </div>}
        </section>
      ) : hasPrompts ? (
        <BatchShotGrid cols="2" className="gap-4">
          {item.prompts.map((shot, shotIdx) => {
            const shotKey = `${item.id}-${shotIdx}`;
            return (
              <BatchStage3ShotCard
                key={shotIdx}
                shot={shot}
                shotIdx={shotIdx}
                shotKey={shotKey}
                isExpanded={Boolean(expandedShots[shotKey])}
                isCopied={copiedShotKey === shotKey}
                toggleShotExpand={toggleShotExpand}
                copyShotPrompt={copyShotPrompt}
                onUpdatePrompt={(val) => onUpdatePrompt(shotIdx, val)}
                productPersona={item.applied_persona}
                sharedAssets={sharedAssets}
              />
            );
          })}
        </BatchShotGrid>
      ) : item.isAnalyzing ? (
        <div role="status" className="p-3 flex items-center gap-3 bg-indigo-50/50 rounded-xl">
          <Loader2 className="w-4 h-4 animate-spin text-indigo-600 shrink-0" />
          <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">
            正在分析材质与构图，生成分镜提示词…
          </p>
        </div>
      ) : !item.analysisError ? (
        <div className="px-3 py-2.5 bg-slate-50 rounded-xl dark:bg-white/5">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {isAnalyzingAll ? '已加入分析队列，等待处理…' : '图片已准备好。点击上方「批量分析商品」，或单独分析此商品。'}
          </p>
        </div>
      ) : null}
    </div>
  );
});

// Parent batch progress recreates action closures. Keep actions current without
// invalidating the heavy card when this product's data has not changed.
export function BatchStage3ProductItem(props: BatchStage3ProductItemProps) {
  const latest = useRef(props);
  useLayoutEffect(() => { latest.current = props; });
  const actions = useMemo(() => ({
    onUpdateGridPrompt: (value: string) => latest.current.onUpdateGridPrompt?.(value),
    toggleShotExpand: (key: string) => latest.current.toggleShotExpand(key),
    expandAllCurrentItemShots: (item: BatchProductItem) => latest.current.expandAllCurrentItemShots(item),
    copyShotPrompt: (prompt: string, key: string) => latest.current.copyShotPrompt(prompt, key),
    onUpdatePrompt: (index: number, value: string) => latest.current.onUpdatePrompt(index, value),
    onAnalyzeSingle: () => latest.current.onAnalyzeSingle(),
    handleRemoveItem: (id: string) => latest.current.handleRemoveItem(id),
    onPreviewImage: (url: string) => latest.current.onPreviewImage?.(url),
  }), []);
  return <MemoizedProductItem {...props} {...actions} />;
}
