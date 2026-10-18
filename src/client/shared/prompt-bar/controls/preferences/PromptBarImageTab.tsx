import { IMAGE_RATIO_ITEMS } from '../../promptBarConstants';
import type { ImageInferenceStrength, ImageResolutionOption } from '../../promptBarPreferencesTypes';
import { AspectRatioCardGroup } from './AspectRatioCardGroup';

const ASPECT_OPTIONS = IMAGE_RATIO_ITEMS.map((item) => ({ id: item.id, label: item.label }));

const RESOLUTIONS: ImageResolutionOption[] = ['1K', '2K', '4K'];

const STRENGTHS: { id: ImageInferenceStrength; label: string; desc: string }[] = [
  { id: 'low', label: 'Low', desc: '更快出图，适合先看构图。' },
  { id: 'medium', label: 'Medium', desc: '速度和细节比较均衡。' },
  { id: 'high', label: 'High', desc: '更多精修，画面细节更清楚。' },
  { id: 'xhigh', label: 'XHigh', desc: '最高细节，生成会更慢。' },
];

interface Props {
  aspect: string;
  resolution: ImageResolutionOption;
  strength: ImageInferenceStrength;
  onAspect: (aspect: string) => void;
  onResolution: (resolution: ImageResolutionOption) => void;
  onStrength: (strength: ImageInferenceStrength) => void;
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
  onAspect,
  onResolution,
  onStrength,
}: Props) {
  const active = strength === 'max' ? 'xhigh' : strength;
  const description = STRENGTHS.find((item) => item.id === active)?.desc || STRENGTHS[0].desc;

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <div className="text-xs font-medium text-slate-500 dark:text-slate-400">画面比例</div>
        <AspectRatioCardGroup value={aspect} onChange={onAspect} options={ASPECT_OPTIONS} />
      </div>

      <div className="space-y-1.5">
        <div className="text-xs font-medium text-slate-500 dark:text-slate-400">图片分辨率</div>
        <div className="flex gap-1 p-1 bg-slate-100/80 dark:bg-white/5 rounded-2xl">
          {RESOLUTIONS.map((item) => (
            <button key={item} type="button" onClick={() => onResolution(item)} className={choiceClass(resolution === item)}>
              {item}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-1.5">
        <div className="text-xs font-medium text-slate-500 dark:text-slate-400">推理强度</div>
        <div className="flex gap-1 p-1 bg-slate-100/80 dark:bg-white/5 rounded-2xl">
          {STRENGTHS.map((item) => (
            <button key={item.id} type="button" onClick={() => onStrength(item.id)} className={choiceClass(active === item.id)}>
              {item.label}
            </button>
          ))}
        </div>
        <p className="px-1 text-[11px] leading-relaxed text-slate-400 dark:text-slate-500">{description}</p>
      </div>
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

export function inferenceStrengthLabel(strength: ImageInferenceStrength): string {
  return STRENGTHS.find((item) => item.id === (strength === 'max' ? 'xhigh' : strength))?.label || 'Low';
}
