import { IMAGE_RATIO_ITEMS } from '../../promptBarConstants';
import type { ImageInferenceStrength, ImageQualityTier, ImageResolutionOption } from '../../promptBarPreferencesTypes';
import { AspectRatioCardGroup } from './AspectRatioCardGroup';

const ASPECT_OPTIONS = IMAGE_RATIO_ITEMS.map((item) => ({ id: item.id, label: item.label }));

const RESOLUTIONS: ImageResolutionOption[] = ['1K', '2K', '4K'];

const QUALITIES: { id: ImageQualityTier; label: string; desc: string }[] = [
  { id: 'low', label: 'Low', desc: '更快出图，适合先看构图。' },
  { id: 'medium', label: 'Medium', desc: '速度和细节比较均衡。' },
  { id: 'high', label: 'High', desc: '更多精修，画面细节更清楚。' },
];

const REWRITE_STRENGTHS: { id: ImageInferenceStrength; label: string; desc: string }[] = [
  { id: 'low', label: '不改写', desc: '关闭提示词改写，按原文出图。' },
  { id: 'medium', label: '改写', desc: '开启提示词改写，不启用思考。' },
  { id: 'high', label: '改写+思考', desc: '提示词改写和思考模式都开启。' },
];

interface Props {
  aspect: string;
  resolution: ImageResolutionOption;
  strength: ImageInferenceStrength;
  quality: ImageQualityTier;
  allowedResolutions?: ImageResolutionOption[];
  strengthMode?: 'quality' | 'prompt-extend' | 'none';
  onAspect: (aspect: string) => void;
  onResolution: (resolution: ImageResolutionOption) => void;
  onStrength: (strength: ImageInferenceStrength) => void;
  onQuality: (quality: ImageQualityTier) => void;
}

function choiceClass(selected: boolean) {
  return `flex-1 py-1.5 px-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
    selected
      ? 'bg-white dark:bg-white/15 text-slate-950 dark:text-white shadow-xs'
      : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
  }`;
}

export function PromptBarImageTab({
  aspect,
  resolution,
  strength,
  quality,
  allowedResolutions,
  strengthMode = 'none',
  onAspect,
  onResolution,
  onStrength,
  onQuality,
}: Props) {
  const rewriteActive: ImageInferenceStrength = strength === 'low' || strength === 'medium' ? strength : 'high';
  const rewriteDescription = REWRITE_STRENGTHS.find((item) => item.id === rewriteActive)?.desc || REWRITE_STRENGTHS[2].desc;
  const qualityDescription = QUALITIES.find((item) => item.id === quality)?.desc || QUALITIES[2].desc;
  const showResolution = !allowedResolutions || allowedResolutions.length > 0;

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <div className="text-xs font-medium text-slate-500 dark:text-slate-400">画面比例</div>
        <AspectRatioCardGroup value={aspect} onChange={onAspect} options={ASPECT_OPTIONS} />
      </div>

      {showResolution && (
        <div className="space-y-1.5">
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400">{strengthMode === 'prompt-extend' ? '输出尺寸' : '图片分辨率'}</div>
          <div className="flex gap-1 p-1 bg-slate-100/80 dark:bg-white/5 rounded-2xl">
            {RESOLUTIONS.map((item) => {
              const disabled = Boolean(allowedResolutions && !allowedResolutions.includes(item));
              return (
                <button key={item} type="button" disabled={disabled} onClick={() => onResolution(item)} className={`${choiceClass(resolution === item)} ${disabled ? 'cursor-not-allowed opacity-40' : ''}`}>
                  {item}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {strengthMode === 'quality' && (
        <div className="space-y-1.5">
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400">画质</div>
          <div className="flex gap-1 p-1 bg-slate-100/80 dark:bg-white/5 rounded-2xl">
            {QUALITIES.map((item) => (
              <button key={item.id} type="button" onClick={() => onQuality(item.id)} className={choiceClass(quality === item.id)}>
                {item.label}
              </button>
            ))}
          </div>
          <p className="px-1 text-[11px] leading-relaxed text-slate-400 dark:text-slate-500">{qualityDescription}</p>
        </div>
      )}

      {strengthMode === 'prompt-extend' && (
        <div className="space-y-1.5">
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400">提示词改写</div>
          <div className="flex gap-1 p-1 bg-slate-100/80 dark:bg-white/5 rounded-2xl">
            {REWRITE_STRENGTHS.map((item) => (
              <button key={item.id} type="button" onClick={() => onStrength(item.id)} className={choiceClass(rewriteActive === item.id)}>
                {item.label}
              </button>
            ))}
          </div>
          <p className="px-1 text-[11px] leading-relaxed text-slate-400 dark:text-slate-500">{rewriteDescription}</p>
        </div>
      )}
    </div>
  );
}

export function imageResolutionLabel(quality: string): ImageResolutionOption {
  if (quality === 'low') return '1K';
  if (quality === 'medium') return '2K';
  return '4K';
}

export function qualityForResolution(resolution: ImageResolutionOption): 'low' | 'medium' | 'high' {
  if (resolution === '1K') return 'low';
  if (resolution === '2K') return 'medium';
  return 'high';
}

export function imageQualityLabel(quality: string): string {
  return QUALITIES.find((item) => item.id === quality)?.label || 'High';
}

export function promptRewriteStrengthLabel(strength: ImageInferenceStrength): string {
  if (strength === 'low') return '不改写';
  if (strength === 'medium') return '改写';
  return '改写+思考';
}
