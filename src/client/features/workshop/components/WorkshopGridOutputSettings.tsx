import { useEffect, useState } from 'react';
import { OUTPUT_MAX_EDGE, outputAspectLabel, parseOutputDimensions } from '@shared/domain/media/outputDimensions';
import { resolveWorkshopImageSize } from '../model/generation/workshopImageSize';
import { savedWorkshopOutputSize } from '../model/generation/workshopOutputSize';
import type { WorkshopSettingsModalProps } from './settings/workshopSettingsTypes';

const ratios = ['3:4', '1:1', '9:16', '16:9', '4:3', '4:5', '2:3'];
const fieldClass = 'mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-100';

export function WorkshopGridOutputSettings(props: WorkshopSettingsModalProps) {
  const gridSize = resolveWorkshopImageSize(props.selectedAspect, props.selectedImageGenModel, props.selectedQuality);
  const naturalSize = savedWorkshopOutputSize({ gridSize })!;
  const activeSize = props.gridOutputSize || naturalSize;
  const dimensions = parseOutputDimensions(activeSize)!;
  const [width, setWidth] = useState(String(dimensions.width));
  const [height, setHeight] = useState(String(dimensions.height));
  const [error, setError] = useState('');
  useEffect(() => {
    setWidth(String(dimensions.width)); setHeight(String(dimensions.height)); setError('');
  }, [dimensions.width, dimensions.height, props.gridOutputSize]);
  const custom = Boolean(props.gridOutputSize);
  const ratio = outputAspectLabel(dimensions);
  const commit = () => {
    const next = `${width}x${height}`;
    if (!parseOutputDimensions(next)) { setError(`尺寸未保存：宽高须为 1–${OUTPUT_MAX_EDGE} 的整数像素。`); return; }
    setError(''); props.setGridOutputSize(next);
  };
  const natural = parseOutputDimensions(naturalSize)!;
  const changesRatio = Math.abs(dimensions.width / dimensions.height - natural.width / natural.height) > 0.001;
  const enlarges = dimensions.width > natural.width || dimensions.height > natural.height;
  return <div className="mt-4 rounded-xl border border-slate-100 bg-slate-50/70 p-3.5" aria-label="四宫格切图设置">
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <label className="text-xs text-slate-700">切图尺寸
        <select aria-label="切图尺寸" value={custom ? 'custom' : 'original'} className={fieldClass}
          onChange={event => props.setGridOutputSize(event.target.value === 'custom' ? naturalSize : undefined)}>
          <option value="original">原始四等分</option><option value="custom">自定义尺寸</option>
        </select>
      </label>
      <label className="text-xs text-slate-700">切图比例
        <select aria-label="切图比例" disabled={!custom} value={!custom ? 'original' : ratios.includes(ratio) ? ratio : 'custom'} className={fieldClass}
          onChange={event => {
            if (event.target.value === 'custom') return;
            const [w, h] = event.target.value.split(':').map(Number);
            const scale = Math.max(1, Math.floor(Math.max(dimensions.width, dimensions.height) / Math.max(w, h)));
            props.setGridOutputSize(`${w * scale}x${h * scale}`);
          }}>
          {!custom && <option value="original">跟随整图</option>}{ratios.map(value => <option key={value}>{value}</option>)}<option value="custom">自由比例</option>
        </select>
      </label>
      {(['width', 'height'] as const).map(axis => <label key={axis} className="text-xs text-slate-700">{axis === 'width' ? '宽' : '高'}（px）
        <input aria-label={`切图${axis === 'width' ? '宽度' : '高度'}`} type="number" inputMode="numeric" min={1} max={OUTPUT_MAX_EDGE} step={1}
          disabled={!custom} value={axis === 'width' ? width : height} className={fieldClass} aria-invalid={Boolean(error)}
          onChange={event => { (axis === 'width' ? setWidth : setHeight)(event.target.value); setError(''); }} onBlur={commit}
          onKeyDown={event => {
            if (event.key === 'Enter') { event.preventDefault(); commit(); }
            if (event.key === 'Escape') {
              event.stopPropagation(); setWidth(String(dimensions.width)); setHeight(String(dimensions.height)); setError('');
            }
          }} />
      </label>)}
    </div>
    <p className="mt-3 text-[11px] leading-5 text-slate-500">整图 {gridSize.replace('x', ' × ')} px → 每张 {activeSize.replace('x', ' × ')} px · 共 4 张</p>
    {custom && <p className="text-[11px] leading-5 text-slate-500">{changesRatio ? '与整图比例不同，将居中裁切边缘并等比缩放。' : '按指定尺寸等比缩放。'}{enlarges && ' 放大像素不会增加原图细节。'} 修改宽高后按 Enter 或移开焦点保存。</p>}
    {error && <p role="alert" className="mt-1 text-[11px] text-rose-600">{error}</p>}
  </div>;
}
