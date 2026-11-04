import { useSyncExternalStore } from 'react';
import { studioPreferenceKeys, studioPreferencePrefix } from '@client/shared/workspace/studioPreferences';
import type { CanvasSettingsPage } from '../model/settingsNavigation';

type PreviewControl =
  | { kind: 'toggle'; id: string; label: string; desc: string; defaultOn?: boolean }
  | { kind: 'segment'; id: string; label: string; desc?: string; options: string[]; defaultIndex?: number }
  | { kind: 'slider'; id: string; label: string; desc?: string; min: number; max: number; step: number; value: number; suffix?: string }
  | { kind: 'color'; id: string; label: string; desc?: string; value: string };

const CANVAS_CONTROLS: Record<Exclude<CanvasSettingsPage, 'pet'>, { title: string; blurb?: string; controls: PreviewControl[] }> = {
  connections: {
    title: '连线',
    controls: [
      { kind: 'toggle', id: 'half', label: '显示全部连线', desc: '全显时跳过稀疏裁剪，全部连线走画布绘制。' },
      { kind: 'toggle', id: 'tilt', label: '3D 倾斜', desc: '连线随节点高度差产生轻微透视倾斜。' },
      { kind: 'toggle', id: 'marquee', label: '跑马灯', desc: '选中或框选相关连线时播放跑马灯描边。', defaultOn: true },
      { kind: 'segment', id: 'flow', label: '流光动画', desc: '生成进行中的连线流光。', options: ['关闭', '默认'], defaultIndex: 1 },
      { kind: 'color', id: 'darkColor', label: '深色画布连线颜色', value: '#ffffff' },
      { kind: 'color', id: 'lightColor', label: '浅色画布连线颜色', value: '#18181b' },
      { kind: 'slider', id: 'width', label: '连线粗细', desc: '画布连线描边宽度。', min: 0.25, max: 6, step: 0.01, value: 1, suffix: 'px' },
      { kind: 'slider', id: 'hit', label: '连线命中范围', desc: '鼠标点选连线的热区，不改变线的视觉粗细。', min: 8, max: 32, step: 1, value: 16, suffix: 'px' },
      { kind: 'slider', id: 'alpha', label: '连线透明', desc: '静态连线不透明度。', min: 5, max: 100, step: 1, value: 100, suffix: '%' },
    ],
  },
  board: {
    title: '画布',
    controls: [
      { kind: 'toggle', id: 'follow', label: '跟随', desc: '拖动节点时，下游节点一起位移。' },
      { kind: 'toggle', id: 'grid', label: '网格', desc: '显示画布点阵网格。', defaultOn: true },
      { kind: 'slider', id: 'gap', label: '网格间隙', desc: '点阵网格间距。', min: 8, max: 80, step: 1, value: 20, suffix: 'px' },
      { kind: 'slider', id: 'dot', label: '网格点', desc: '网格圆点半径。', min: 0.5, max: 6, step: 0.5, value: 0.5, suffix: 'px' },
      { kind: 'toggle', id: 'snap', label: '吸附', desc: '拖动节点时对齐到吸附网格。', defaultOn: true },
      { kind: 'toggle', id: 'guides', label: '对齐辅助线', desc: '吸附时显示对齐辅助线。', defaultOn: true },
      { kind: 'toggle', id: 'minimap', label: '导航', desc: '显示画布小地图。', defaultOn: true },
      { kind: 'toggle', id: 'glow', label: '背景光晕', desc: '画布顶部一层很淡的氛围光。' },
      { kind: 'slider', id: 'motion', label: '定位动画上限', desc: '节点数超过该值时，定位改为瞬时跳转。', min: 50, max: 500, step: 50, value: 100 },
    ],
  },
  nodes: {
    title: '节点',
    controls: [
      { kind: 'toggle', id: 'close', label: '节点删除按钮', desc: '节点右上角删除按钮。', defaultOn: true },
      { kind: 'toggle', id: 'start', label: '快捷生成按钮', desc: '紧凑生图 / 视频节点顶栏的开始生成快捷钮。', defaultOn: true },
      { kind: 'toggle', id: 'timer', label: '秒表', desc: '节点上方的生成计时。', defaultOn: true },
      { kind: 'toggle', id: 'hidePreview', label: '隐藏输入图预览', desc: '全局收起图片输入节点的大图预览，只留边框。' },
      { kind: 'segment', id: 'motion', label: '生成动画', desc: '生成中的节点亮动画。', options: ['关闭', '默认', '星光'], defaultIndex: 1 },
    ],
  },
  actions: {
    title: '操作',
    controls: [
      { kind: 'toggle', id: 'confirmDelete', label: '删除前确认', desc: '手动删除节点、节点组或选中连线时先确认。' },
    ],
  },
};

function subscribePreferences(update: () => void) {
  window.addEventListener('storage', update);
  return () => window.removeEventListener('storage', update);
}

function PreferenceRow({ page, control }: { page: CanvasSettingsPage; control: PreviewControl }) {
  const key = studioPreferencePrefix + studioPreferenceKeys[page + '.' + control.id];
  const raw = useSyncExternalStore(subscribePreferences, () => localStorage.getItem(key));
  const modes = ['off', 'default', 'starfield'];
  const mode = raw === 'false' || raw === 'off' ? 'off'
    : page === 'nodes' && (raw === 'jimeng' || raw === 'starfield') ? 'starfield' : 'default';
  const value = control.kind === 'toggle' ? ((raw ?? String(!!control.defaultOn)) === 'true' ? '1' : '0')
    : control.kind === 'segment' ? String(raw === null ? control.defaultIndex ?? 0 : modes.indexOf(mode))
    : raw ?? String((control.kind === 'slider' || control.kind === 'color') ? control.value : '');
  const set = (input: string) => {
    const next = control.kind === 'toggle' ? String(input === '1') : control.kind === 'segment' ? modes[Number(input)] : input;
    localStorage.setItem(key, next);
    window.dispatchEvent(new StorageEvent('storage', {key, newValue: next}));
  };
  return (
    <div className="settings-preview-list">
          <div key={control.id} className="settings-preview-row">
            <div className="min-w-0">
              <div className="text-sm font-medium text-slate-900 dark:text-slate-100">{control.label}</div>
              {control.desc && <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">{control.desc}</p>}
            </div>
            {control.kind === 'toggle' && (
              <button type="button" role="switch" aria-checked={value === '1'} aria-label={control.label} onClick={() => set(value === '1' ? '0' : '1')} className={`settings-switch ${value === '1' ? 'is-on' : ''}`}>
                <span />
              </button>
            )}
            {control.kind === 'segment' && (
              <div className="settings-segment" role="group" aria-label={control.label}>
                {control.options.map((option, index) => (
                  <button key={option} type="button" aria-pressed={value === String(index)} onClick={() => set(String(index))}>{option}</button>
                ))}
              </div>
            )}
            {control.kind === 'color' && (
              <input type="color" aria-label={control.label} value={/^#[0-9a-f]{6}$/i.test(value) ? value : control.value} onChange={event => set(event.target.value)}/>
            )}
            {control.kind === 'slider' && (
              <label className="settings-slider">
                <span>{value}{control.suffix || ''}</span>
                <input type="range" min={control.min} max={control.max} step={control.step} value={value} aria-label={control.label} onChange={event => set(event.target.value)} />
              </label>
            )}
          </div>
    </div>
  );
}

export function CanvasPreview({ page }: { page: Exclude<CanvasSettingsPage, 'pet'> }) {
  const spec = CANVAS_CONTROLS[page];
  return (
    <section className="settings-preview">
      <header>
        <h2>{spec.title}</h2>
        <p>在当前浏览器保存，更改会同步到已打开的项目画布。</p>
        {spec.blurb && <p>{spec.blurb}</p>}
      </header>
      {spec.controls.map(control => <PreferenceRow key={page + control.id} page={page} control={control} />)}
    </section>
  );
}
