import React, { useState, useMemo, useCallback, useEffect } from 'react';
import {
  X,
  RotateCcw,
  Sparkles,
  ArrowUp,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUpLeft,
  ArrowUpRight,
  ArrowDownLeft,
  ArrowDownRight,
  Circle,
} from 'lucide-react';
import { proxyMediaUrl } from '@/lib/apiClient';
import { useAppStore } from '../../../store';
import { LightboxGenConfigToolbar } from './LightboxGenConfigToolbar';

export interface MultiAngleModalProps {
  isOpen: boolean;
  onClose: () => void;
  imageUrl: string;
  originalPrompt?: string;
  onSubmitNovelView: (params: {
    azimuth: number;
    elevation: number;
    angleName: string;
    model: string;
    quality: string;
    aspectRatio?: string;
  }) => void;
}

interface PresetAngle {
  id: string;
  label: string;
  azimuth: number;
  elevation: number;
  Icon: React.ComponentType<{ className?: string }>;
}

const PRESET_ANGLES: PresetAngle[] = [
  { id: 'top-left', label: '左上', azimuth: 315, elevation: 30, Icon: ArrowDownRight },
  { id: 'top', label: '俯视', azimuth: 0, elevation: 60, Icon: ArrowDown },
  { id: 'top-right', label: '右上', azimuth: 45, elevation: 30, Icon: ArrowDownLeft },
  { id: 'left', label: '左视', azimuth: 270, elevation: 0, Icon: ArrowRight },
  { id: 'front', label: '正视', azimuth: 0, elevation: 0, Icon: Circle },
  { id: 'right', label: '右视', azimuth: 90, elevation: 0, Icon: ArrowLeft },
  { id: 'bottom-left', label: '左下', azimuth: 315, elevation: -30, Icon: ArrowUpRight },
  { id: 'bottom', label: '仰视', azimuth: 0, elevation: -45, Icon: ArrowUp },
  { id: 'bottom-right', label: '右下', azimuth: 45, elevation: -30, Icon: ArrowUpLeft },
];

/** 🌟 3D 拟物立体白色摄像机器组件 (完全对齐图 2：圆润白色倒角立方体机身、立体阴影切面、顶面高光与实时取景液晶屏) */
interface IsometricCameraChassisProps {
  imgSrc: string;
  hasError: boolean;
  azimuth: number;
  elevation: number;
}

const IsometricCameraChassis: React.FC<IsometricCameraChassisProps> = ({
  imgSrc,
  hasError,
  azimuth,
  elevation,
}) => {
  // 当摄像机在球体右侧时，水平翻转机身，使摄像机镜头始终朝向中心主图
  const isRightSide = azimuth > 0 && azimuth < 180;

  return (
    <div
      className="relative select-none pointer-events-none transition-all duration-300 ease-out"
      style={{
        transform: `scale(${isRightSide ? '-1, 1' : '1, 1'})`,
      }}
      title={`摄像机方位: 水平 ${azimuth}°, 垂直 ${elevation}°`}
    >
      <div className="relative w-[68px] h-[58px] filter drop-shadow-[0_12px_22px_rgba(15,23,42,0.18)] drop-shadow-[0_3px_6px_rgba(15,23,42,0.08)]">
        <svg viewBox="0 0 76 66" className="w-full h-full">
          <defs>
            {/* 顶面洁白高光受光面渐变 */}
            <linearGradient id="camTopGrad" x1="0%" y1="100%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#FFFFFF" />
              <stop offset="70%" stopColor="#F8FAFC" />
              <stop offset="100%" stopColor="#E2E8F0" />
            </linearGradient>

            {/* 右侧面立体厚度渐变 (银白至阴影灰过渡) */}
            <linearGradient id="camRightGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#E5EAEF" />
              <stop offset="50%" stopColor="#D4DBE6" />
              <stop offset="100%" stopColor="#BAC3D2" />
            </linearGradient>

            {/* 底面背光立体阴影切面渐变 */}
            <linearGradient id="camBottomGrad" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#CBD4E2" />
              <stop offset="100%" stopColor="#9AA6B8" />
            </linearGradient>

            {/* 正面机身白瓷质感渐变 */}
            <linearGradient id="camFrontGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#FFFFFF" />
              <stop offset="70%" stopColor="#F8FAFC" />
              <stop offset="100%" stopColor="#EDF2F7" />
            </linearGradient>

            {/* 屏幕玻璃高反光斜向渐变 (图2标志性的白亮高光) */}
            <linearGradient id="camGlassGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="rgba(255, 255, 255, 0.72)" />
              <stop offset="30%" stopColor="rgba(255, 255, 255, 0.22)" />
              <stop offset="32%" stopColor="rgba(255, 255, 255, 0.0)" />
              <stop offset="100%" stopColor="rgba(255, 255, 255, 0.1)" />
            </linearGradient>

            {/* 屏幕圆角裁切区域 */}
            <clipPath id="cameraScreenClip">
              <rect x="9" y="16.5" width="28" height="21" rx="4.5" transform="rotate(-7 23 27)" />
            </clipPath>
          </defs>

          {/* 1. 3D 底面厚度切角 (向右下方自然延伸) */}
          <path
            d="M 12 43 C 9 45.5 13 47.5 16 48.5 L 50 53 C 54 53.5 56 51 56 47 L 56 34 L 12 40 Z"
            fill="url(#camBottomGrad)"
          />

          {/* 2. 3D 右侧成立体厚度切面 (平滑圆润柱状过渡) */}
          <path
            d="M 45 13.5 C 49 13 54 16 57 19.5 L 63 35 C 65 39.5 62 44 58 47 L 47 52.5 C 44 53.5 45 50 45 46 L 45 19 C 45 15.5 44 14 45 13.5 Z"
            fill="url(#camRightGrad)"
          />

          {/* 3. 3D 顶面受光面 (洁白无瑕，向右上方后退) */}
          <path
            d="M 13 14 C 10 12 14 10 17 9.5 L 42 4.5 C 47 3.5 51 5.5 54 8 L 60 19 C 55 16 50 13.5 45 13.8 L 13 17.5 C 9.5 16.5 11 15 13 14 Z"
            fill="url(#camTopGrad)"
          />

          {/* 4. 正面圆润白瓷机壳 (前置微透视角度) */}
          <rect
            x="6"
            y="12"
            width="38"
            height="30"
            rx="8"
            fill="url(#camFrontGrad)"
            stroke="#E2E7F0"
            strokeWidth="0.8"
            transform="rotate(-7 25 27)"
          />

          {/* 5. 屏幕内嵌黑色金属边框 */}
          <rect
            x="8.5"
            y="16"
            width="29"
            height="22"
            rx="5"
            fill="#090D17"
            stroke="#1E293B"
            strokeWidth="0.6"
            transform="rotate(-7 23 27)"
          />

          {/* 6. 屏幕取景原图 (实时同步缩略画面) */}
          <g clipPath="url(#cameraScreenClip)">
            {!hasError && imgSrc ? (
              <image
                href={imgSrc}
                x="7"
                y="14"
                width="32"
                height="25"
                preserveAspectRatio="xMidYMid slice"
                transform="rotate(-7 23 27)"
              />
            ) : (
              <rect x="0" y="0" width="76" height="66" fill="#0F172A" />
            )}
          </g>

          {/* 7. 屏幕玻璃斜角高反光镜面 */}
          <rect
            x="9"
            y="16.5"
            width="28"
            height="21"
            rx="4.5"
            fill="url(#camGlassGrad)"
            pointerEvents="none"
            transform="rotate(-7 23 27)"
          />

          {/* 8. 摄像机微型十字取景标线与状态红点 */}
          <g transform="rotate(-7 23 27)" opacity="0.45" stroke="#FFFFFF" strokeWidth="0.6">
            <line x1="19" y1="27" x2="27" y2="27" />
            <line x1="23" y1="23" x2="23" y2="31" />
          </g>
          <circle cx="34" cy="19" r="0.85" fill="#EF4444" transform="rotate(-7 23 27)" />
        </svg>
      </div>
    </div>
  );
};

export const MultiAngleModal: React.FC<MultiAngleModalProps> = ({
  isOpen,
  onClose,
  imageUrl,
  originalPrompt = '',
  onSubmitNovelView,
}) => {
  const [azimuth, setAzimuth] = useState<number>(0); // 水平方位角 0 ~ 360°
  const [elevation, setElevation] = useState<number>(0); // 垂直俯仰角 -60 ~ 80°

  // 🌟 当前图片代理与多级容灾加载（解决破损问号 [?]，确保图 2 效果）
  const resolvedInitialImg = useMemo(() => {
    if (!imageUrl) return '';
    return proxyMediaUrl(imageUrl) || imageUrl;
  }, [imageUrl]);

  const [currentImgSrc, setCurrentImgSrc] = useState<string>(resolvedInitialImg);
  const [hasImgError, setHasImgError] = useState<boolean>(false);

  useEffect(() => {
    if (imageUrl) {
      setCurrentImgSrc(proxyMediaUrl(imageUrl) || imageUrl);
      setHasImgError(false);
    } else {
      setCurrentImgSrc('');
      setHasImgError(false);
    }
  }, [imageUrl]);

  const handleImgLoadError = useCallback(() => {
    if (currentImgSrc !== imageUrl && imageUrl) {
      // 代理地址加载异常时回退直接加载原始 imageUrl
      setCurrentImgSrc(imageUrl);
    } else {
      setHasImgError(true);
    }
  }, [currentImgSrc, imageUrl]);

  // 联动生图工作台的模型和尺寸配置
  const storeQuickModel = useAppStore((s) => s.quickModel);
  const storeQuickQuality = useAppStore((s) => s.quickQuality);
  const storeQuickAspectId = useAppStore((s) => s.quickAspectId);
  const setQuickModel = useAppStore((s) => s.setQuickModel);
  const setQuickQuality = useAppStore((s) => s.setQuickQuality);
  const setQuickAspectId = useAppStore((s) => s.setQuickAspectId);

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
  const [selectedAspectId, setSelectedAspectId] = useState<string>(() => {
    return storeQuickAspectId || 'smart';
  });

  useEffect(() => {
    if (isOpen) {
      if (storeQuickModel) setSelectedModelId(storeQuickModel);
      if (storeQuickQuality) setSelectedQuality(qualityToLabel(storeQuickQuality));
      if (storeQuickAspectId) setSelectedAspectId(storeQuickAspectId);
    }
  }, [isOpen, storeQuickModel, storeQuickQuality, storeQuickAspectId]);

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

  const handleSelectAspect = (aspectId: string) => {
    setSelectedAspectId(aspectId);
    setQuickAspectId(aspectId);
  };

  // 判定当前角度是否匹配某个预设
  const activePreset = useMemo(() => {
    return PRESET_ANGLES.find(
      (p) => Math.abs(p.azimuth - azimuth) < 5 && Math.abs(p.elevation - elevation) < 5,
    );
  }, [azimuth, elevation]);

  const handleSelectPreset = useCallback((preset: PresetAngle) => {
    setAzimuth(preset.azimuth);
    setElevation(preset.elevation);
  }, []);

  const handleReset = useCallback(() => {
    setAzimuth(0);
    setElevation(0);
  }, []);

  const handleSubmit = useCallback(() => {
    const angleName = activePreset?.label || `${azimuth}° / ${elevation}°`;
    const normalizedQuality =
      selectedQuality === '1K' ? 'low' : selectedQuality === '4K' ? 'high' : 'medium';

    onSubmitNovelView({
      azimuth,
      elevation,
      angleName,
      model: selectedModelId || 'gpt-image-2',
      quality: normalizedQuality,
      aspectRatio: selectedAspectId,
    });
    onClose();
  }, [
    activePreset,
    azimuth,
    elevation,
    selectedModelId,
    selectedQuality,
    selectedAspectId,
    onSubmitNovelView,
    onClose,
  ]);

  // 🌟 计算 3D 观察球上的微型相机屏幕投影坐标 (外环安全轨道算法，确保各机位与中心图片保持良好通透间距)
  const cameraPos = useMemo(() => {
    const Rx = 118; // 水平外轨半轴 (px)
    const Ry = 114; // 垂直外轨半轴 (px)
    const RyFront = 92; // 平视正前方外轨偏置 (px)

    const radA = (azimuth * Math.PI) / 180;

    // 1. 水平 X: 由 azimuth 方位角主导，在极点处经线微收拢，避免两极畸变
    const converge = Math.cos(((elevation * 0.4) * Math.PI) / 180);
    let x = Rx * Math.sin(radA) * converge;

    // 2. 垂直 Y: 由 elevation 仰角主导 (负仰角向下/仰视，正仰角向上/俯视)
    let yElev = 0;
    if (elevation >= 0) {
      // 俯视 0° ~ 80°，在 60° 达到标称顶端外轨 (-114px)
      const t = elevation / 60;
      yElev = -Ry * Math.pow(t, 0.82);
    } else {
      // 仰视 -60° ~ 0°，在 -45° 达到标称底端外轨 (+114px)
      const t = Math.abs(elevation) / 45;
      yElev = Ry * Math.pow(t, 0.82);
    }

    // 3. 平视赤道前沿分量：在平视 (elevation 接近 0) 时提供正前方舒适外环轨道 (+92px)，不挡中心主图
    const blendEquator = Math.max(0, 1 - Math.pow(Math.abs(elevation) / 28, 1.2));
    const yEquator = RyFront * Math.cos(radA) * blendEquator;

    let y = yElev * (1 - blendEquator * 0.4) + yEquator;

    // 4. 安全避障软外推：保证任意手动滑块输入下，摄像机机身绝不贴近或遮挡中心原图
    const safeRx = 92;
    const safeRy = 94;
    const normDist = Math.sqrt(Math.pow(x / safeRx, 2) + Math.pow(y / safeRy, 2));
    if (normDist < 1.0) {
      const push = 1.0 / Math.max(0.01, normDist);
      x *= push;
      y *= push;
    }

    return { x, y };
  }, [azimuth, elevation]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 select-none animate-fade-in"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-3xl p-6 sm:p-7 shadow-2xl border border-slate-100 max-w-[840px] w-full relative animate-scale-up"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 顶部标题栏与关闭键 */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-100">
          <h3 className="text-[17px] font-bold text-slate-900 tracking-tight">多角度编辑</h3>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
            title="关闭 (Esc)"
          >
            <X className="w-5 h-5 stroke-[2.2]" />
          </button>
        </div>

        {/* 主体两栏布局：左侧 3D 球体视角视口 + 右侧参数方位控制器 */}
        <div className="mt-5 grid grid-cols-1 md:grid-cols-12 gap-6 items-center">
          {/* 左侧 3D 球体视口 */}
          <div className="md:col-span-7 bg-[#F8F9FA] rounded-2xl p-6 relative flex flex-col items-center justify-center min-h-[380px] overflow-hidden border border-slate-100/80">
            {/* 球体外围 4 个微小方位指示箭头 */}
            <div className="absolute top-3 text-slate-300 pointer-events-none">
              <ArrowUp className="w-3.5 h-3.5 stroke-[2.5]" />
            </div>
            <div className="absolute bottom-3 text-slate-300 pointer-events-none">
              <ArrowDown className="w-3.5 h-3.5 stroke-[2.5]" />
            </div>
            <div className="absolute left-3 text-slate-300 pointer-events-none">
              <ArrowLeft className="w-3.5 h-3.5 stroke-[2.5]" />
            </div>
            <div className="absolute right-3 text-slate-300 pointer-events-none">
              <ArrowRight className="w-3.5 h-3.5 stroke-[2.5]" />
            </div>

            {/* 3D 经纬线立体微光球体 (290x290 开阔视界，带柔和立体内发光、淡灰经纬网格) */}
            <div className="relative w-[290px] h-[290px] flex items-center justify-center">
              <svg
                viewBox="0 0 290 290"
                className="absolute inset-0 w-full h-full pointer-events-none"
              >
                <defs>
                  {/* 球体立体微光底色 (径向发光渐变) */}
                  <radialGradient id="sphereMeshGlow" cx="45%" cy="40%" r="55%">
                    <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.85" />
                    <stop offset="60%" stopColor="#F1F5F9" stopOpacity="0.5" />
                    <stop offset="100%" stopColor="#E2E8F0" stopOpacity="0.25" />
                  </radialGradient>
                </defs>

                {/* 球体微光实体底面 */}
                <circle cx="145" cy="145" r="126" fill="url(#sphereMeshGlow)" />

                {/* 外轮廓纤细实线 */}
                <circle
                  cx="145"
                  cy="145"
                  r="126"
                  fill="none"
                  stroke="#CBD5E1"
                  strokeWidth="0.85"
                  strokeOpacity="0.6"
                />

                {/* 纬线网络 (呈不同俯仰角椭圆) */}
                <ellipse cx="145" cy="145" rx="126" ry="42" fill="none" stroke="#CBD5E1" strokeWidth="0.75" strokeOpacity="0.45" />
                <ellipse cx="145" cy="145" rx="126" ry="84" fill="none" stroke="#CBD5E1" strokeWidth="0.75" strokeOpacity="0.45" />
                <ellipse cx="145" cy="110" rx="118" ry="32" fill="none" stroke="#CBD5E1" strokeWidth="0.6" strokeOpacity="0.35" />
                <ellipse cx="145" cy="180" rx="118" ry="32" fill="none" stroke="#CBD5E1" strokeWidth="0.6" strokeOpacity="0.35" />

                {/* 经线网络 (从北极到南极) */}
                <ellipse cx="145" cy="145" rx="42" ry="126" fill="none" stroke="#CBD5E1" strokeWidth="0.75" strokeOpacity="0.45" />
                <ellipse cx="145" cy="145" rx="84" ry="126" fill="none" stroke="#CBD5E1" strokeWidth="0.75" strokeOpacity="0.45" />
              </svg>

              {/* 🌟 1. 中心正立的目标原图卡片 (尺寸优化为 74x100px，饱满立体且为外环留出充足呼吸空间) */}
              <div className="relative z-10 w-[74px] h-[100px] rounded-2xl overflow-hidden shadow-[0_16px_36px_rgba(15,23,42,0.16),0_4px_12px_rgba(15,23,42,0.06)] bg-white select-none transition-transform duration-300">
                {!hasImgError && currentImgSrc ? (
                  <img
                    src={currentImgSrc}
                    alt={originalPrompt || '目标参考图'}
                    className="w-full h-full object-cover block"
                    referrerPolicy="no-referrer"
                    crossOrigin="anonymous"
                    onError={handleImgLoadError}
                  />
                ) : (
                  <div className="w-full h-full bg-slate-100 flex flex-col items-center justify-center text-slate-400 gap-1 p-2">
                    <Sparkles className="w-5 h-5 text-slate-300" />
                    <span className="text-[10px] text-slate-400 font-medium">当前画面</span>
                  </div>
                )}
              </div>

              {/* 🌟 2. 摄像机方位指示器：3D 拟物立体白色摄像机器 (精准运行于外环安全轨道上，绝不贴近或遮挡中心原图) */}
              <div
                className="absolute z-20 transition-all duration-300 ease-out pointer-events-none"
                style={{
                  transform: `translate(${cameraPos.x}px, ${cameraPos.y}px)`,
                }}
              >
                <IsometricCameraChassis
                  imgSrc={currentImgSrc}
                  hasError={hasImgError}
                  azimuth={azimuth}
                  elevation={elevation}
                />
              </div>
            </div>

            {/* 左下角重置参数按钮 */}
            <button
              type="button"
              onClick={handleReset}
              className="absolute bottom-3 left-4 flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-800 transition-colors cursor-pointer py-1 px-2 rounded-lg hover:bg-slate-200/60"
            >
              <span>重置参数</span>
              <RotateCcw className="w-3.5 h-3.5 stroke-[2]" />
            </button>
          </div>

          {/* 右侧摄像机方位控制器 */}
          <div className="md:col-span-5 flex flex-col justify-between h-full space-y-5">
            {/* 摄像机方位 9 宫格预设 */}
            <div>
              <div className="text-[13px] font-bold text-slate-800 mb-3">摄像机方位</div>
              <div className="grid grid-cols-3 gap-2">
                {PRESET_ANGLES.map((preset) => {
                  const isSelected = activePreset?.id === preset.id;
                  const Icon = preset.Icon;
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => handleSelectPreset(preset)}
                      className={`h-9 rounded-xl text-[12px] font-medium transition-all flex items-center justify-center gap-1.5 cursor-pointer active:scale-95 ${
                        isSelected
                          ? 'bg-[#EAECEF] text-slate-900 font-semibold shadow-2xs'
                          : 'bg-[#F4F5F7] hover:bg-[#EAECEF] text-slate-700'
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5 text-slate-600 stroke-[2.2]" />
                      <span>{preset.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 水平与垂直精确滑块控制 */}
            <div className="space-y-4 pt-1">
              {/* 水平方位角滑块 (0° ~ 360°) */}
              <div>
                <div className="flex items-center justify-between text-[12px] text-slate-700 mb-1.5">
                  <span className="font-medium text-slate-800">水平</span>
                  <span className="font-mono text-slate-500 text-[11px]">{azimuth}°</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="360"
                  step="1"
                  value={azimuth}
                  onChange={(e) => setAzimuth(Number(e.target.value))}
                  className="w-full h-1.5 bg-[#E2E8F0] rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow-[0_2px_6px_rgba(0,0,0,0.2)] [&::-webkit-slider-thumb]:border [&::-webkit-slider-thumb]:border-slate-200/80 transition-all"
                />
              </div>

              {/* 垂直俯仰角滑块 (-60° ~ 80°) */}
              <div>
                <div className="flex items-center justify-between text-[12px] text-slate-700 mb-1.5">
                  <span className="font-medium text-slate-800">垂直</span>
                  <span className="font-mono text-slate-500 text-[11px]">{elevation}°</span>
                </div>
                <input
                  type="range"
                  min="-60"
                  max="80"
                  step="1"
                  value={elevation}
                  onChange={(e) => setElevation(Number(e.target.value))}
                  className="w-full h-1.5 bg-[#E2E8F0] rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow-[0_2px_6px_rgba(0,0,0,0.2)] [&::-webkit-slider-thumb]:border [&::-webkit-slider-thumb]:border-slate-200/80 transition-all"
                />
              </div>
            </div>

            {/* 右下角参数配置工具条与生成按钮 */}
            <div className="pt-2 flex items-center justify-between gap-2">
              <LightboxGenConfigToolbar
                selectedModelId={selectedModelId}
                onSelectModel={handleSelectModel}
                selectedQuality={selectedQuality}
                onSelectQuality={handleSelectQuality}
                selectedAspectId={selectedAspectId}
                onSelectAspect={handleSelectAspect}
              />

              <button
                type="button"
                onClick={handleSubmit}
                className="px-5 py-2 rounded-xl bg-black hover:bg-slate-800 text-white text-[13px] font-medium transition-all active:scale-95 cursor-pointer shadow-sm flex items-center justify-center shrink-0 min-w-[76px]"
              >
                <span>生成</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MultiAngleModal;
