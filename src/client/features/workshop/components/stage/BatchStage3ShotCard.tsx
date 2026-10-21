import React from 'react';
import {
  Camera,
  Copy,
  Check,
  Pencil,
  ChevronUp,
  Image as ImageIcon,
  Hand,
  User,
} from 'lucide-react';
import { formatAssetBadgeText } from '../BatchAssetTag';
import { getShotAssetLabels } from '../../model/assetPresentation';

export interface BatchStage3ShotCardProps {
  shot: {
    sourcePrompt?: string;
    sourceReferenceImageUrl?: string;
    assembly_source?: 'group_skeleton' | 'architecture' | 'fallback';
    scene?: string;
    shot_type?: 'model_shot' | 'hand_held_only' | 'pure_product';
    shot_no?: number;
    title?: string;
    camera_focal_length?: string;
    has_human?: boolean;
    prompt: string;
    applied_scene?: string;
    applied_outfit?: string;
    applied_action?: string;
    applied_persona?: string;
    resultStatus?: 'current' | 'superseded';
  };
  shotIdx: number;
  shotKey: string;
  isExpanded: boolean;
  isCopied: boolean;
  toggleShotExpand: (key: string) => void;
  copyShotPrompt: (prompt: string, key: string) => void;
  onUpdatePrompt: (newVal: string) => void;
  productPersona?: string;
  sharedAssets?: { scene?: string; outfit?: string; persona?: string };
}

export const BatchStage3ShotCard: React.FC<BatchStage3ShotCardProps> = ({
  shot,
  shotIdx,
  shotKey,
  isExpanded,
  isCopied,
  toggleShotExpand,
  copyShotPrompt,
  onUpdatePrompt,
  productPersona,
  sharedAssets,
}) => {
  const labels = getShotAssetLabels(shot, productPersona);
  const sceneBadge = sharedAssets?.scene ? undefined : labels.scene;
  const outfitBadge = sharedAssets?.outfit ? undefined : labels.outfit;
  const actionBadge = shot.applied_action;
  const personaBadge = sharedAssets?.persona ? undefined : labels.persona;
  const hasTags = sceneBadge || outfitBadge || actionBadge || personaBadge;
  const handOnly = shot.shot_type === 'hand_held_only';
  const portrait = !handOnly && shot.shot_type !== 'pure_product' && (shot.shot_type === 'model_shot' || shot.has_human === true);
  const undecided = !handOnly && shot.shot_type !== 'pure_product' && !portrait && shot.has_human !== false;

  return (
    <div
      className="bg-white rounded-xl border border-slate-200
                 hover:border-indigo-200 transition-colors duration-200
                 overflow-hidden dark:bg-[#18191c] dark:border-white/10 dark:hover:border-indigo-400/40"
    >
      {shot.sourcePrompt && <details className="border-b border-slate-100 px-4 py-2 text-[11px] text-slate-500 dark:border-white/10 dark:text-slate-400">
        <summary className="cursor-pointer">核对样本原始反推词</summary>
        <p className="mt-2 max-h-48 overflow-y-auto whitespace-pre-wrap leading-6 select-text">{shot.sourcePrompt}</p>
      </details>}
      {/* 标题区 */}
      <div className="p-4 space-y-3">
        {/* 分镜标题与元数据 */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            {/* 渐变SHOT编号徽章 */}
            <span className="px-2.5 py-1 rounded-lg text-xs font-semibold text-slate-600
                           bg-slate-100 shrink-0 flex items-center gap-1 dark:text-slate-300 dark:bg-white/10">
              <Camera className="w-3 h-3" />
              镜头 {shot.shot_no ?? shotIdx + 1}
            </span>
            {shot.resultStatus === 'superseded' ? (
              <span className="rounded-lg bg-amber-50 px-2 py-1 text-[10px] font-bold text-amber-700">需重做</span>
            ) : null}
            <span
              className="text-sm font-bold text-slate-800 truncate dark:text-slate-100"
              title={shot.title}
            >
              {shot.title}
            </span>
          </div>
          {/* 元数据徽章 */}
          <div className="flex items-center gap-2 flex-wrap justify-end">
            {shot.camera_focal_length && (
              <span className="px-2 py-0.5 rounded-md bg-slate-100 text-xs text-slate-600 flex items-center gap-1 dark:text-slate-300 dark:bg-white/10">
                <Camera className="w-3 h-3" />
                {shot.camera_focal_length
                  .replace(/iPhone\s*/i, '')
                  .replace(/镜头/g, '')}
              </span>
            )}
            <span className={`px-2 py-0.5 rounded-md text-xs font-semibold flex items-center gap-1 ${
              portrait
                ? 'bg-violet-50 text-violet-700' 
                : 'bg-slate-100 text-slate-600 dark:text-slate-300 dark:bg-white/10'
            }`}>
              {portrait ? (
                <>
                  <User className="w-3 h-3" />
                  模特
                </>
              ) : handOnly ? (
                <>
                  <Hand className="w-3 h-3" />
                  仅手部
                </>
              ) : undecided ? (
                <>
                  <ImageIcon className="w-3 h-3" />
                  待判定
                </>
              ) : (
                <>
                  <ImageIcon className="w-3 h-3" />
                  静物
                </>
              )}
            </span>
          </div>
        </div>

        {/* 资产库标签区 */}
        {hasTags && (
          <div className="bg-slate-50/70 rounded-lg p-2.5 space-y-2 dark:bg-white/5">
            {sceneBadge && (
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded">
                  场景
                </span>
                <span className="text-xs text-slate-600 truncate dark:text-slate-300">
                  {formatAssetBadgeText(sceneBadge)}
                </span>
              </div>
            )}
            {outfitBadge && (
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold text-sky-600 bg-sky-50 px-1.5 py-0.5 rounded">
                  穿搭
                </span>
                <span className="text-xs text-slate-600 truncate dark:text-slate-300">
                  {formatAssetBadgeText(outfitBadge)}
                </span>
              </div>
            )}
            {actionBadge && (
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold text-purple-600 bg-purple-50 px-1.5 py-0.5 rounded">
                  动作
                </span>
                <span className="text-xs text-slate-600 truncate dark:text-slate-300">
                  {formatAssetBadgeText(actionBadge)}
                </span>
              </div>
            )}
            {personaBadge && (
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">
                  人设
                </span>
                <span className="text-xs text-slate-600 truncate dark:text-slate-300">
                  {formatAssetBadgeText(personaBadge)}
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 提示词内容区 */}
      <div className="border-t border-slate-100/80 dark:border-white/10">
        {isExpanded ? (
          /* 展开编辑模式 */
          <div className="p-4 bg-slate-50 space-y-3 dark:bg-white/5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Pencil className="w-3.5 h-3.5 text-indigo-500" />
                <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                  提示词编辑
                </span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-[10px] font-mono text-slate-400">
                  {(shot.prompt || '').length} 字符
                </span>
                {/* 收起按钮 */}
                <button
                  type="button"
                  onClick={() => toggleShotExpand(shotKey)}
                  className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-700 transition-colors dark:text-slate-400 dark:hover:bg-white/10 dark:bg-white/10"
                  title="收起"
                >
                  <ChevronUp className="w-4 h-4" />
                </button>
              </div>
            </div>
            <textarea
              aria-label={`镜头 ${shot.shot_no ?? shotIdx + 1} 提示词`}
              rows={6}
              value={shot.prompt}
              placeholder="正在装配提示词..."
              onChange={(e) => onUpdatePrompt(e.target.value)}
              className="soft-textarea w-full min-h-40 resize-y p-3 text-sm text-slate-800 leading-7 placeholder:text-slate-400 dark:text-slate-100 dark:placeholder:text-slate-500"
            />
          </div>
        ) : (
          /* 折叠展示模式 */
          <div className="p-4 space-y-3">
            <p className="text-sm text-slate-600 line-clamp-4 leading-7 whitespace-pre-wrap dark:text-slate-300">
              {shot.prompt ? (shot.prompt.length > 600 ? `${shot.prompt.slice(0, 600)}…` : shot.prompt) : '暂无提示词'}
            </p>
            <div className="flex items-center justify-between pt-1">
              <span className="text-[10px] font-mono text-slate-400">
                {(shot.prompt || '').length} 字符
              </span>
              <div className="flex items-center gap-2">
                {/* 复制按钮 */}
                <button
                  type="button"
                  onClick={() => copyShotPrompt(shot.prompt || '', shotKey)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1.5 
                             transition-all ${
                               isCopied 
                                 ? 'bg-emerald-50 text-emerald-700' 
                                 : 'bg-slate-100 text-slate-600 hover:bg-indigo-50 hover:text-indigo-600 dark:bg-white/10 dark:text-slate-300 dark:hover:bg-white/15 dark:hover:text-indigo-300'
                             }`}
                  title="复制提示词"
                >
                  {isCopied ? (
                    <>
                      <Check className="w-3 h-3" />
                      已复制
                    </>
                  ) : (
                    <>
                      <Copy className="w-3 h-3" />
                      复制
                    </>
                  )}
                </button>
                {/* 展开编辑按钮 */}
                <button
                  type="button"
                  onClick={() => toggleShotExpand(shotKey)}
                  className="px-3 py-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-semibold
                           flex items-center gap-1.5 transition-colors"
                  title="展开编辑"
                >
                  <Pencil className="w-3 h-3" />
                  展开微调
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
