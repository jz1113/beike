import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import {
  X,
  Maximize2,
  Square,
  Smartphone,
  Tv,
  Monitor,
  ImageOff,
} from 'lucide-react';
import { proxyMediaUrl } from '@client/shared/api/apiClient';
import { useAppStore } from '@client/store';
import { useAppTheme } from '@client/shared/hooks/useAppTheme';
import { LightboxGenConfigToolbar } from '../../shared/modals/lightbox/LightboxGenConfigToolbar';

export interface OutpaintModalProps {
  isOpen: boolean;
  onClose: () => void;
  imageUrl: string;
  originalPrompt?: string;
  onSubmitOutpaint: (params: {
    ratio: string;
    scale: number;
    prompt: string;
    model: string;
    quality: string;
  }) => void;
}

interface RatioOption {
  id: string;
  label: string;
  widthRatio: number;
  heightRatio: number;
  Icon: React.ComponentType<{ className?: string }>;
}

const RATIO_OPTIONS: RatioOption[] = [
  { id: 'original', label: '原比例', widthRatio: 3, heightRatio: 4, Icon: Maximize2 },
  { id: '1:1', label: '1:1', widthRatio: 1, heightRatio: 1, Icon: Square },
  { id: '9:16', label: '9:16', widthRatio: 9, heightRatio: 16, Icon: Smartphone },
  { id: '4:3', label: '4:3', widthRatio: 4, heightRatio: 3, Icon: Tv },
  { id: '16:9', label: '16:9', widthRatio: 16, heightRatio: 9, Icon: Monitor },
];

function checkerboardStyle(isDark: boolean): React.CSSProperties {
  const square = isDark ? '#3f3f46' : '#e8e8e8';
  const board = isDark ? '#27272a' : '#f5f5f5';
  return {
    backgroundImage: `linear-gradient(45deg, ${square} 25%, transparent 25%), linear-gradient(-45deg, ${square} 25%, transparent 25%), linear-gradient(45deg, transparent 75%, ${square} 75%), linear-gradient(-45deg, transparent 75%, ${square} 75%)`,
    backgroundSize: '14px 14px',
    backgroundPosition: '0 0, 0 7px, 7px -7px, -7px 0px',
    backgroundColor: board,
  };
}

/** 画布可用区域最大尺寸 */
const CANVAS_MAX_W = 560;
const CANVAS_MAX_H = 380;

export const OutpaintModal: React.FC<OutpaintModalProps> = ({
  isOpen,
  onClose,
  imageUrl,
  originalPrompt = '',
  onSubmitOutpaint,
}) => {
  const { isDark } = useAppTheme();
  const [selectedRatio, setSelectedRatio] = useState<string>('original');
  const [scale, setScale] = useState<number>(1.5);
  const [prompt, setPrompt] = useState<string>('');

  // --- 图片预加载：获取真实宽高 & 加载状态 ---
  const [imgNatW, setImgNatW] = useState(0);
  const [imgNatH, setImgNatH] = useState(0);
  const [imgLoaded, setImgLoaded] = useState(false);
  const [imgError, setImgError] = useState(false);
  const prevUrlRef = useRef('');

  useEffect(() => {
    if (!isOpen || !imageUrl) return;
    // URL 变化时重新加载
    if (prevUrlRef.current === imageUrl && imgLoaded) return;
    prevUrlRef.current = imageUrl;
    setImgLoaded(false);
    setImgError(false);

    const targetSrc = proxyMediaUrl(imageUrl) || imageUrl;
    const img = new Image();
    img.referrerPolicy = 'no-referrer';
    img.onload = () => {
      setImgNatW(img.naturalWidth);
      setImgNatH(img.naturalHeight);
      setImgLoaded(true);
      setImgError(false);
    };
    img.onerror = () => {
      if (targetSrc !== imageUrl && imageUrl) {
        const fallbackImg = new Image();
        fallbackImg.referrerPolicy = 'no-referrer';
        fallbackImg.onload = () => {
          setImgNatW(fallbackImg.naturalWidth);
          setImgNatH(fallbackImg.naturalHeight);
          setImgLoaded(true);
          setImgError(false);
        };
        fallbackImg.onerror = () => {
          setImgNatW(3);
          setImgNatH(4);
          setImgLoaded(false);
          setImgError(true);
        };
        fallbackImg.src = imageUrl;
        return;
      }
      // 回退：用默认 3:4 比例
      setImgNatW(3);
      setImgNatH(4);
      setImgLoaded(false);
      setImgError(true);
    };
    img.src = targetSrc;
  }, [isOpen, imageUrl, imgLoaded]);

  // 重置状态：弹窗打开时
  useEffect(() => {
    if (isOpen) {
      setSelectedRatio('original');
      setScale(1.5);
      setPrompt('');
    }
  }, [isOpen]);

  // --- 计算原图在画布中的基础显示尺寸 ---
  const imgAspect = imgNatW && imgNatH ? imgNatW / imgNatH : 3 / 4;

  const baseImgSize = useMemo(() => {
    // 基础图片尺寸：在画布区域中以最大扩图倍率 (3x) 时外扩框仍能适配为目标
    // 所以基础图片尺寸按画布的 ~35% 来算
    const maxFitW = CANVAS_MAX_W * 0.35;
    const maxFitH = CANVAS_MAX_H * 0.45;

    let w: number, h: number;
    if (imgAspect >= 1) {
      // 横图
      w = Math.min(maxFitW, maxFitH * imgAspect);
      h = w / imgAspect;
    } else {
      // 竖图
      h = Math.min(maxFitH, maxFitW / imgAspect);
      w = h * imgAspect;
    }
    return { w: Math.round(w), h: Math.round(h) };
  }, [imgAspect]);

  // --- 外扩框尺寸计算 ---
  const outpaintInfo = useMemo(() => {
    if (selectedRatio === 'original') {
      return {
        label: `${scale}x`,
        wMul: scale,
        hMul: scale,
      };
    }
    // 非原比例：根据目标比例计算需要的扩展倍率
    const opt = RATIO_OPTIONS.find((r) => r.id === selectedRatio)!;
    const targetAspect = opt.widthRatio / opt.heightRatio;

    let wMul: number, hMul: number;
    if (targetAspect >= imgAspect) {
      // 目标更宽 → 宽度扩展更多
      wMul = targetAspect / imgAspect;
      hMul = 1;
      // 保证最小 1.2x
      if (wMul < 1.2) { wMul = 1.2; hMul = (wMul * imgAspect) / targetAspect; }
    } else {
      // 目标更高 → 高度扩展更多
      hMul = imgAspect / targetAspect;
      wMul = 1;
      if (hMul < 1.2) { hMul = 1.2; wMul = (hMul * targetAspect) / imgAspect; }
    }

    const wLabel = wMul.toFixed(1);
    const hLabel = hMul.toFixed(1);
    return {
      label: `W:${wLabel}x H:${hLabel}x`,
      wMul,
      hMul,
    };
  }, [selectedRatio, scale, imgAspect]);

  // 外扩框的最终像素尺寸（带上限约束）
  const outerBoxSize = useMemo(() => {
    let w = baseImgSize.w * outpaintInfo.wMul;
    let h = baseImgSize.h * outpaintInfo.hMul;

    // 约束到画布范围
    const maxW = CANVAS_MAX_W * 0.92;
    const maxH = CANVAS_MAX_H * 0.88;
    const ratio = Math.min(1, maxW / w, maxH / h);
    w *= ratio;
    h *= ratio;

    return { w: Math.round(w), h: Math.round(h) };
  }, [baseImgSize, outpaintInfo]);

  // 内部图片在外扩框中的实际显示尺寸
  const innerImgSize = useMemo(() => {
    const ratio = Math.min(1, (CANVAS_MAX_W * 0.92) / (baseImgSize.w * outpaintInfo.wMul), (CANVAS_MAX_H * 0.88) / (baseImgSize.h * outpaintInfo.hMul));
    return {
      w: Math.round(baseImgSize.w * ratio),
      h: Math.round(baseImgSize.h * ratio),
    };
  }, [baseImgSize, outpaintInfo]);

  // 联动生图工作台的模型和画质配置
  const storeQuickModel = useAppStore((s) => s.quickModel);
  const storeQuickQuality = useAppStore((s) => s.quickQuality);
  const setQuickModel = useAppStore((s) => s.setQuickModel);
  const setQuickQuality = useAppStore((s) => s.setQuickQuality);

  const qualityToLabel = (q?: string): '1K' | '2K' | '4K' => {
    if (q === 'low') return '1K';
    if (q === 'high') return '4K';
    return '2K';
  };

  const [selectedModelId, setSelectedModelId] = useState<string>(() => {
    return storeQuickModel || 'gpt-image-2';
  });
  const [selectedQuality, setSelectedQuality] = useState<'1K' | '2K' | '4K'>(() => {
    return qualityToLabel(storeQuickQuality);
  });

  useEffect(() => {
    if (isOpen) {
      if (storeQuickModel) setSelectedModelId(storeQuickModel);
      if (storeQuickQuality) setSelectedQuality(qualityToLabel(storeQuickQuality));
    }
  }, [isOpen, storeQuickModel, storeQuickQuality]);

  const handleSelectModel = (id: string) => {
    setSelectedModelId(id);
    setQuickModel(id);
    try {
      localStorage.setItem('ai_image_gen_model', id);
    } catch {}
  };

  const handleSelectQuality = (label: '1K' | '2K' | '4K') => {
    setSelectedQuality(label);
    const q = label === '1K' ? 'low' : label === '4K' ? 'high' : 'medium';
    setQuickQuality(q);
  };

  const handleSubmit = useCallback(() => {
    const normalizedQuality =
      selectedQuality === '1K' ? 'low' : selectedQuality === '4K' ? 'high' : 'medium';

    onSubmitOutpaint({
      ratio: selectedRatio,
      scale,
      prompt,
      model: selectedModelId || 'gpt-image-2',
      quality: normalizedQuality,
    });
    onClose();
  }, [
    selectedRatio,
    scale,
    prompt,
    selectedModelId,
    selectedQuality,
    onSubmitOutpaint,
    onClose,
  ]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-xs p-3 sm:p-6 select-none animate-fade-in"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-[#1B1B1E] text-slate-900 dark:text-[#EDEDED] rounded-3xl p-5 sm:p-6 shadow-2xl dark:shadow-[0_20px_50px_rgba(0,0,0,0.6)] border border-slate-100 dark:border-white/10 max-w-[860px] w-full relative animate-scale-up flex flex-col max-h-[92vh] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 顶部标题栏与关闭键 */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-white/10 shrink-0">
          <h3 className="text-[17px] font-bold text-slate-900 dark:text-white tracking-tight">扩图</h3>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/10 transition-colors cursor-pointer"
            title="关闭 (Esc)"
          >
            <X className="w-5 h-5 stroke-[2.2]" />
          </button>
        </div>

        {/* 中间核心画布与扩图预览框 */}
        <div className="relative flex-1 min-h-[360px] sm:min-h-[440px] max-h-[58vh] bg-[#F8F9FA] dark:bg-[#151518] rounded-2xl my-3 flex flex-col items-center justify-center overflow-hidden border border-slate-100/90 dark:border-white/10 p-6">
          {/* 左上角倍率尺寸标注 */}
          <div className="absolute top-4 left-5 text-[12px] font-mono font-medium text-slate-400 dark:text-slate-500 select-none">
            {outpaintInfo.label}
          </div>

          {/* 扩图外扩框 + 棋盘格 + 居中原图 */}
          <div
            className="relative flex items-center justify-center transition-all duration-300 ease-out border-2 border-slate-900/90 dark:border-white/90 rounded-sm"
            style={{
              width: `${outerBoxSize.w}px`,
              height: `${outerBoxSize.h}px`,
              ...checkerboardStyle(isDark),
            }}
          >
            {/* 8 个黑白控制手柄 */}
            <div className="absolute -top-1.5 -left-1.5 w-3 h-3 bg-white border-2 border-black z-30" />
            <div className="absolute -top-1.5 left-1/2 -translate-x-1/2 w-4 h-1.5 bg-white border-2 border-black z-30" />
            <div className="absolute -top-1.5 -right-1.5 w-3 h-3 bg-white border-2 border-black z-30" />
            <div className="absolute -bottom-1.5 -left-1.5 w-3 h-3 bg-white border-2 border-black z-30" />
            <div className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-4 h-1.5 bg-white border-2 border-black z-30" />
            <div className="absolute -bottom-1.5 -right-1.5 w-3 h-3 bg-white border-2 border-black z-30" />
            <div className="absolute top-1/2 -translate-y-1/2 -left-1.5 w-1.5 h-4 bg-white border-2 border-black z-30" />
            <div className="absolute top-1/2 -translate-y-1/2 -right-1.5 w-1.5 h-4 bg-white border-2 border-black z-30" />

            {/* 居中原始图像 */}
            <div
              className="relative z-10 rounded-sm overflow-hidden shadow-lg select-none flex items-center justify-center"
              style={{
                width: `${innerImgSize.w}px`,
                height: `${innerImgSize.h}px`,
                backgroundColor: isDark ? '#18191c' : '#ffffff',
              }}
            >
              {imgError ? (
                /* 图片加载失败：友好兜底 */
                <div className="flex flex-col items-center justify-center gap-2 text-slate-400">
                  <ImageOff className="w-8 h-8 stroke-[1.5]" />
                  <span className="text-[11px]">图片加载失败</span>
                </div>
              ) : (
                <img
                  src={proxyMediaUrl(imageUrl) || imageUrl}
                  alt={originalPrompt || '原图素材'}
                  className="w-full h-full object-cover"
                  referrerPolicy="no-referrer"
                  onError={(e) => {
                    const target = e.currentTarget;
                    if (target.src !== imageUrl && imageUrl) {
                      target.src = imageUrl;
                    } else {
                      setImgError(true);
                    }
                  }}
                />
              )}
            </div>
          </div>

          {/* 原比例下的快速倍率浮动切换胶囊 */}
          {selectedRatio === 'original' && (
            <div className="absolute bottom-3 inset-x-0 flex items-center justify-center pointer-events-none">
              <div className="flex items-center gap-1.5 p-1 rounded-2xl bg-white/95 dark:bg-[#1B1B1E]/95 backdrop-blur-md shadow-md border border-slate-200/90 dark:border-white/10 pointer-events-auto">
                {[1.5, 2, 3].map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setScale(s)}
                    className={`px-3 py-1 rounded-xl text-xs font-semibold font-mono transition-all cursor-pointer ${
                      scale === s
                        ? 'bg-slate-100 dark:bg-white/15 text-slate-900 dark:text-white shadow-2xs'
                        : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white'
                    }`}
                  >
                    {s}x
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* 底部控制区：比例胶囊行 + 扩图提示词 + 生成按钮 */}
        <div className="shrink-0 space-y-3 pt-1">
          {/* 比例选择胶囊行 */}
          <div className="flex items-center gap-1.5 p-1 rounded-2xl bg-[#F4F5F7] dark:bg-white/5 w-fit">
            {RATIO_OPTIONS.map((opt) => {
              const isSelected = selectedRatio === opt.id;
              const Icon = opt.Icon;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setSelectedRatio(opt.id)}
                  className={`flex flex-col items-center justify-center gap-1 w-14 h-12 rounded-xl transition-all cursor-pointer active:scale-95 ${
                    isSelected
                      ? 'bg-white dark:bg-[#2C2C32] text-slate-900 dark:text-white font-bold shadow-xs'
                      : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white'
                  }`}
                >
                  <Icon className={`w-4 h-4 ${isSelected ? 'stroke-[2.2]' : 'stroke-[1.6]'}`} />
                  <span className="text-[11px] leading-tight">{opt.label}</span>
                </button>
              );
            })}
          </div>

          {/* 扩图提示词输入框与参数配置及生成按钮行 */}
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="flex-1 bg-[#F4F5F7] dark:bg-[#151518] rounded-2xl px-4 py-2 border border-transparent focus-within:border-slate-300 dark:focus-within:border-white/30 focus-within:bg-white dark:focus-within:bg-[#18181b] transition-all">
              <input
                type="text"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleSubmit();
                  }
                }}
                placeholder="描述想要扩图的内容，不填将基于原图生成"
                className="w-full bg-transparent text-[13px] text-slate-800 dark:text-slate-200 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none"
              />
            </div>

            {/* 模型与画质工具条 */}
            <LightboxGenConfigToolbar
              selectedModelId={selectedModelId}
              onSelectModel={handleSelectModel}
              selectedQuality={selectedQuality}
              onSelectQuality={handleSelectQuality}
              selectedAspectId={selectedRatio}
              onSelectAspect={setSelectedRatio}
              hideAspect={true}
            />

            {/* 右下角生成按钮 */}
            <button
              type="button"
              onClick={handleSubmit}
              className="flex items-center justify-center px-5 py-2 rounded-2xl bg-black dark:bg-white hover:bg-slate-800 dark:hover:bg-slate-200 text-white dark:text-slate-900 text-[13px] font-medium transition-all active:scale-95 cursor-pointer shadow-sm shrink-0 min-w-[76px]"
            >
              <span>生成</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default OutpaintModal;
