import { isMetasoH3 } from '@shared/domain/media/videoChannels';

interface Props {
  model: string;
  baseUrl?: string;
  duration: number;
  contextIrEnabled?: boolean;
  className?: string;
}

export function VideoGenerationCostNotice({ model, baseUrl, duration, contextIrEnabled = true, className }: Props) {
  if (!isMetasoH3(model, baseUrl)) return null;
  return (
    <p role="note" className={className || 'text-xs leading-relaxed text-slate-500 dark:text-slate-400'}>
      {duration > 15
        ? `秘塔 H3：当前选择 ${duration} 秒，已超过本应用 15 秒上限，请缩短时长后生成。`
        : '秘塔 H3：本应用将生成时长限制在 15 秒以内，避免触发超时长翻倍计费。'}
      {contextIrEnabled ? 'Context IR 已开启，0.05 元/次，按原价单独计费。' : 'Context IR 已关闭，本次不收取该项费用。'}
    </p>
  );
}
