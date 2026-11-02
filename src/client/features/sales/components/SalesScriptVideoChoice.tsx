import { FileText, Info, Layers } from 'lucide-react';
import type { SalesProductionPlanState } from '../model/salesProductionDraft';
import { SalesSettingsChoice } from './SalesSettingsChoice';

interface Props {
  plan: SalesProductionPlanState;
  hasScript: boolean;
  depthUrl?: string;
  disabled: boolean;
  onSelect: (choice: 'none' | 'depth') => void;
}

export function SalesScriptVideoChoice({ plan, hasScript, depthUrl, disabled, onSelect }: Props) {
  const selected = plan.imitationMode === 'depth_imitation' && plan.scriptVideoReference === 'depth' ? 'depth' : 'none';
  const hasDepth = Boolean(depthUrl?.trim());
  const hint = !hasScript ? '先选用参考脚本，再设置动作参考。'
    : !hasDepth ? '当前脚本尚未关联深度视频，可在脚本资产库中补充。'
      : '两种方式均使用所选商品、人物和场景图片，深度视频仅参考动作与运镜。';
  return <>
    <div className="sales-settings-choices" role="group" aria-label="动作参考">
      <SalesSettingsChoice icon={<FileText size={17} aria-hidden />} title="仅按脚本"
        description="按脚本的分镜与动作描述生成。" selected={selected === 'none'}
        disabled={disabled || !hasScript} onSelect={() => onSelect('none')} />
      <SalesSettingsChoice icon={<Layers size={17} aria-hidden />} title="脚本＋深度视频"
        description="结合脚本关联的深度视频，参考动作、节奏与运镜。" selected={selected === 'depth'}
        disabled={disabled || !hasScript || !hasDepth} badge={hasScript && !hasDepth ? '深度视频未就绪' : undefined}
        onSelect={() => onSelect('depth')} />
    </div>
    <p className="sales-settings-note" role="status"><Info size={14} aria-hidden /><span>{hint}</span></p>
  </>;
}
