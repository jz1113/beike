import { EXTENDED_IMAGE_RATIO_ITEMS, IMAGE_RATIO_ITEMS } from '../../promptBarConstants';
import type { ImageInferenceStrength, ImageQualityTier, ImageResolutionOption } from '../../promptBarPreferencesTypes';
import { AspectRatioCardGroup } from './AspectRatioCardGroup';

const ASPECT_OPTIONS = IMAGE_RATIO_ITEMS.map((item) => ({ id: item.id, label: item.label }));

const RESOLUTIONS: ImageResolutionOption[] = ['1K', '2K', '4K'];

const QUALITIES: { id: ImageQualityTier; label: string; desc: string }[] = [
  { id: 'low', label: 'Low', desc: '更快出图，适合先看构图。' },
  { id: 'medium', label: 'Medium', desc: '速度和细节比较均衡。' },
  { id: 'high', label: 'High', desc: '更多精修，画面细节更清楚。' },
  { id: 'xhigh', label: 'XHigh', desc: '超高精修，适合复杂光影与精细排版。' },
  { id: 'max', label: 'Max', desc: '最高画质档位，最大限度还原细节。' },
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
  allowedQualities?: ImageQualityTier[];
  allowedAspectRatios?: string[];
  strengthMode?: 'quality' | 'prompt-extend' | 'none';
  compact?: boolean;
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
  allowedQualities,
  allowedAspectRatios,
  strengthMode = 'none',
  compact = false,
  onAspect,
  onResolution,
  onStrength,
  onQuality,
}: Props) {
  const extraAspectOptions = EXTENDED_IMAGE_RATIO_ITEMS.filter(
    (item) => allowedAspectRatios?.includes(item.id),
  );
  const rewriteActive: ImageInferenceStrength = strength === 'low' || strength === 'medium' ? strength : 'high';
  const rewriteDescription = REWRITE_STRENGTHS.find((item) => item.id === rewriteActive)?.desc || REWRITE_STRENGTHS[2].desc;
  const visibleQualities = allowedQualities?.length
    ? QUALITIES.filter((item) => allowedQualities.includes(item.id))
    : QUALITIES.slice(0, 3);
  const activeQuality = visibleQualities.some((item) => item.id === quality) ? quality : 'high';
  const qualityDescription = visibleQualities.find((item) => item.id === activeQuality)?.desc || QUALITIES[2].desc;
  const showResolution = !allowedResolutions || allowedResolutions.length > 0;
  const hasSecondaryTier = strengthMode === 'quality' || strengthMode === 'prompt-extend';

  const resolutionBlock = showResolution ? (
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
  ) : null;

  const qualityBlock = strengthMode === 'quality' ? (
    <div className="space-y-1.5">
      <div className="text-xs font-medium text-slate-500 dark:text-slate-400">画质</div>
      <div className="flex gap-1 p-1 bg-slate-100/80 dark:bg-white/5 rounded-2xl">
        {visibleQualities.map((item) => (
          <button key={item.id} type="button" title={item.desc} onClick={() => onQuality(item.id)} className={choiceClass(activeQuality === item.id)}>
            {item.label}
          </button>
        ))}
      </div>
      {!compact && <p className="px-1 text-[11px] leading-relaxed text-slate-400 dark:text-slate-500">{qualityDescription}</p>}
    </div>
  ) : null;

  const rewriteBlock = strengthMode === 'prompt-extend' ? (
    <div className="space-y-1.5">
      <div className="text-xs font-medium text-slate-500 dark:text-slate-400">提示词改写</div>
      <div className="flex gap-1 p-1 bg-slate-100/80 dark:bg-white/5 rounded-2xl">
        {REWRITE_STRENGTHS.map((item) => (
          <button key={item.id} type="button" title={item.desc} onClick={() => onStrength(item.id)} className={choiceClass(rewriteActive === item.id)}>
            {item.label}
          </button>
        ))}
      </div>
      {!compact && <p className="px-1 text-[11px] leading-relaxed text-slate-400 dark:text-slate-500">{rewriteDescription}</p>}
    </div>
  ) : null;

  return (
    <div className={compact ? 'space-y-3' : 'space-y-4'}>
      <div className="space-y-1.5">
        <div className="text-xs font-medium text-slate-500 dark:text-slate-400">画面比例</div>
        <AspectRatioCardGroup value={aspect} onChange={onAspect} options={ASPECT_OPTIONS} />
        {extraAspectOptions.length > 0 && (
          <div className="flex gap-1 p-1 bg-slate-100/80 dark:bg-white/5 rounded-2xl">
            {extraAspectOptions.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => onAspect(item.id)}
                className={choiceClass(aspect === item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {compact && showResolution && hasSecondaryTier ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {resolutionBlock}
          {qualityBlock}
          {rewriteBlock}
        </div>
      ) : (
        <>
          {resolutionBlock}
          {qualityBlock}
          {rewriteBlock}
        </>
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
