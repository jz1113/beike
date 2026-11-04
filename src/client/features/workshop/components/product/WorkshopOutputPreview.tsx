import { Image as ImageIcon, Settings2 } from 'lucide-react';
import type { GenerationStrategy } from '../../model/batchTypes';

export function WorkshopOutputPreview({ shotCount, aspect, strategy, pending, collecting, busy, onMode, onSettings }: {
  shotCount: number; aspect: string; strategy: GenerationStrategy;
  pending: number; collecting: boolean; busy: boolean; onMode: (strategy: GenerationStrategy, count: number) => void; onSettings: () => void;
}) {
  return <section className="workshop-preview" aria-label="本批制作预览">
    <header className="workshop-pane-heading"><h2>本批制作预览</h2><button type="button" onClick={onSettings}><Settings2 size={14} />调整输出</button></header>
    <div className="workshop-preview-body">
      <h3>每条图文的交付内容</h3>
      <p>{strategy === 'grid_first' ? '四宫格拆图' : '逐张生成'} · {shotCount} 张配图 · {aspect} · 一份发布文案</p>
      <div role="group" aria-label="本批出图方式" className="workshop-preview-modes">
        {([['grid_first', 4, '四宫格拆图'], ['single_shot', 4, '逐张 · 4 张'], ['single_shot', 8, '逐张 · 8 张']] as const).map(([mode, count, label]) =>
          <button type="button" key={label} disabled={busy} aria-pressed={strategy === mode && shotCount === count}
            onClick={() => onMode(mode, count)}>{label}</button>)}
      </div>
      <div className="workshop-preview-frames" aria-hidden="true">
        {Array.from({ length: shotCount }, (_, index) => <div key={index} style={{ aspectRatio: aspect.replace(':', '/') }}><ImageIcon size={22} /><small>配图 {index + 1}</small></div>)}
      </div>
      <div className="workshop-next-step" role="status"><strong>{collecting ? '正在采集商品图片' : pending ? '商品已加入，等待采集' : '先添加本批商品'}</strong>
        <p>{collecting ? '采集完成后，可逐条选择参考图。' : pending ? '点击「采集商品图片」，完成后即可选图。' : '导入任务表，或切换到「链接添加」粘贴商品链接。采集后在这里选择参考图。'}</p>
      </div>
    </div>
  </section>;
}
