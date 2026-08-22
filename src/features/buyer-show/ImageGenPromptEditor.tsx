'use client';
import {
  Copy,
  Loader2,
  Pencil,
  RotateCcw,
  Save,
  Sparkles,
  Wand2,
  X,
  Zap,
} from 'lucide-react';
import type { GenerationTask } from '@/store/useAppStore';

interface ImageGenPromptEditorProps {
  editingTask: GenerationTask;
  editingPromptText: string;
  setEditingPromptText: (text: string) => void;
  originalPromptText: string;
  workshopMode: string;
  isReconstructingId: string | null;
  onClose: () => void;
  onAppendKeyword: (keyword: string) => void;
  onSavePrompt: () => void;
  onSaveAndGenerate: () => void;
  onReconstructShot: (task: GenerationTask) => void;
  showToast: (msg: string) => void;
}

export default function ImageGenPromptEditor({
  editingTask,
  editingPromptText,
  setEditingPromptText,
  originalPromptText,
  workshopMode,
  isReconstructingId,
  onClose,
  onAppendKeyword,
  onSavePrompt,
  onSaveAndGenerate,
  onReconstructShot,
  showToast,
}: ImageGenPromptEditorProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md p-4 animate-fade-in select-none"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-2xl bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col p-6 space-y-4 animate-scale-up"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 flex-shrink-0 shadow-2xs">
              <Pencil className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono font-bold px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 border border-indigo-200">
                  SHOT {editingTask.shotNo || 1}
                </span>
                <h3 className="text-sm font-bold text-slate-900 truncate">
                  {editingTask.title || '分镜提示词精修'}
                </h3>
              </div>
              <p className="text-[11px] text-slate-500 mt-0.5">
                直接微调修改此分镜的 AI 渲染描述词，随时随地定制画面构图与光影细节
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Quick Enhancement Tags */}
        <div className="space-y-1.5">
          <div className="text-[11px] font-bold text-slate-600 flex items-center gap-1">
            <Sparkles className="w-3.5 h-3.5 text-amber-500" />
            <span>一键注入电商高质感关键词 (点击追加)：</span>
          </div>
          {workshopMode === 'social_face_product_swap' && (
            <p className="text-[10px] text-amber-700/90 leading-relaxed">
              爆款复刻：构图/动作以本镜参考图为准；已绑定正脸时请优先追加光影与质感类关键词，避免改写姿态导致与参考图错位。
            </p>
          )}
          <div className="flex items-center gap-1.5 flex-wrap">
            {(workshopMode === 'social_face_product_swap'
              ? [
                  { label: '🚫 严格双臂防3只手', text: '全景严格仅见左手与右手两只手臂与双手，双手共10根手指，严禁多出第三只手臂与悬空手' },
                  { label: '📱 手机实拍微噪点', text: '真实手机后置主摄拍摄，轻微自然噪点颗粒感，超高清实拍质感' },
                  { label: '💡 柔和窗边自然光', text: '窗边柔和自然漫射光，通透立体光影，无刺眼高光，色彩温润' },
                  { label: '🌿 真实皮肤毛孔', text: '皮肤清透带有真实毛孔微纹理，发丝细节清晰自然，无塑料磨皮感' },
                  { label: '🔍 浅景深背景微虚化', text: '大光圈浅景深，主体轮廓清晰锐利，背景自然柔和虚化' },
                ]
              : [
                  { label: '🚫 严格双臂防3只手', text: '全景严格仅见左手与右手两只手臂与双手，双手共10根手指，严禁多出第三只手臂与悬空手' },
                  { label: '🪞 低机位对镜自拍', text: '低机位对镜自拍镜面反射视角，左手单手在镜前握持手机对镜拍摄，右手自然抬起搭在后脑发丝处' },
                  { label: '📱 手机实拍微噪点', text: '真实手机后置主摄拍摄，轻微自然噪点颗粒感，超高清实拍质感' },
                  { label: '💡 柔和窗边自然光', text: '窗边柔和自然漫射光，通透立体光影，无刺眼高光，色彩温润' },
                  { label: '🌿 真实皮肤毛孔', text: '皮肤清透带有真实毛孔微纹理，发丝细节清晰自然，无塑料磨皮感' },
                  { label: '☕ 生活化日常摆拍', text: '生活化真实桌面场景，随性摆放，富有生活烟火气息，非商业摄影棚假图' },
                  { label: '🔍 浅景深背景微虚化', text: '大光圈浅景深，主体轮廓清晰锐利，背景自然柔和虚化' },
                ]
            ).map((chip, i) => (
              <button
                key={i}
                type="button"
                onClick={() => onAppendKeyword(chip.text)}
                className="px-2.5 py-1 rounded-xl bg-slate-100 hover:bg-indigo-50 hover:text-indigo-700 hover:border-indigo-200 border border-slate-200/80 text-[11px] font-medium text-slate-700 transition-all cursor-pointer flex items-center gap-1"
              >
                <span>{chip.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Textarea Editor */}
        <div className="relative">
          <textarea
            value={editingPromptText}
            onChange={e => setEditingPromptText(e.target.value)}
            rows={6}
            placeholder="输入或修改分镜提示词..."
            className="w-full p-4 rounded-2xl bg-slate-50 border border-slate-200 focus:bg-white focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 text-xs sm:text-sm text-slate-800 font-mono leading-relaxed outline-none transition-all resize-y min-h-[140px]"
          />
          <div className="absolute bottom-3 right-3 text-[10px] text-slate-400 font-mono bg-white/90 px-2 py-0.5 rounded-md border border-slate-200/60 shadow-2xs">
            {editingPromptText.length} 字符
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between pt-2 border-t border-slate-100">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                navigator.clipboard.writeText(editingPromptText);
                showToast('📋 提示词已复制到剪贴板');
              }}
              className="px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <Copy className="w-3.5 h-3.5" />
              <span>复制词</span>
            </button>

            <button
              type="button"
              onClick={() => setEditingPromptText(originalPromptText)}
              className="px-3 py-2 rounded-xl bg-white hover:bg-slate-100 text-slate-600 border border-slate-200 text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
              title="恢复为本次打开时的原始内容"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>恢复初始</span>
            </button>

            <button
              type="button"
              disabled={isReconstructingId === editingTask.id}
              onClick={() => onReconstructShot(editingTask)}
              className="px-3 py-2 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
              title="让视觉大模型重新规划此分镜机位与描述"
            >
              {isReconstructingId === editingTask.id ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Wand2 className="w-3.5 h-3.5 text-indigo-600" />
              )}
              <span>AI 重构机位</span>
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onSavePrompt}
              className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold transition-all cursor-pointer shadow-sm flex items-center gap-1.5"
            >
              <Save className="w-3.5 h-3.5" />
              <span>保存修改</span>
            </button>

            <button
              type="button"
              onClick={onSaveAndGenerate}
              className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition-all cursor-pointer shadow-sm flex items-center gap-1.5"
            >
              <Zap className="w-3.5 h-3.5 text-amber-300" />
              <span>保存并立即渲染</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
