import { useState } from 'react';
import type { CanvasSettingsPage } from '../model/settingsNavigation';

type PreviewControl =
  | { kind: 'toggle'; id: string; label: string; desc: string; defaultOn?: boolean }
  | { kind: 'segment'; id: string; label: string; desc?: string; options: string[]; defaultIndex?: number }
  | { kind: 'slider'; id: string; label: string; desc?: string; min: number; max: number; step: number; value: number; suffix?: string }
  | { kind: 'text'; id: string; label: string; desc?: string; placeholder: string; secret?: boolean };

const CANVAS_CONTROLS: Record<Exclude<CanvasSettingsPage, 'media'>, { title: string; blurb?: string; controls: PreviewControl[] }> = {
  connections: {
    title: '连线',
    controls: [
      { kind: 'toggle', id: 'half', label: '连线半显', desc: '全显时跳过稀疏裁剪，全部连线走画布绘制。' },
      { kind: 'toggle', id: 'tilt', label: '3D 倾斜', desc: '连线随节点高度差产生轻微透视倾斜。' },
      { kind: 'toggle', id: 'marquee', label: '跑马灯', desc: '选中或框选相关连线时播放跑马灯描边。', defaultOn: true },
      { kind: 'segment', id: 'flow', label: '流光动画', desc: '生成进行中的连线流光。', options: ['关闭', '默认'], defaultIndex: 1 },
      { kind: 'slider', id: 'width', label: '连线粗细', desc: '画布连线描边宽度。', min: 0.5, max: 8, step: 0.5, value: 1, suffix: 'px' },
      { kind: 'slider', id: 'hit', label: '连线命中范围', desc: '鼠标点选连线的热区，不改变线的视觉粗细。', min: 8, max: 32, step: 1, value: 16, suffix: 'px' },
      { kind: 'slider', id: 'alpha', label: '连线透明', desc: '静态连线不透明度。', min: 20, max: 100, step: 1, value: 100, suffix: '%' },
    ],
  },
  board: {
    title: '画布',
    controls: [
      { kind: 'toggle', id: 'follow', label: '跟随', desc: '拖动节点时，下游节点一起位移。' },
      { kind: 'toggle', id: 'grid', label: '网格', desc: '显示画布点阵网格。', defaultOn: true },
      { kind: 'slider', id: 'gap', label: '网格间隙', desc: '点阵网格间距。', min: 8, max: 48, step: 1, value: 20, suffix: 'px' },
      { kind: 'slider', id: 'dot', label: '网格点', desc: '网格圆点半径。', min: 0.5, max: 2, step: 0.5, value: 0.5, suffix: 'px' },
      { kind: 'toggle', id: 'snap', label: '吸附', desc: '拖动节点时对齐到吸附网格。', defaultOn: true },
      { kind: 'toggle', id: 'guides', label: '对齐辅助线', desc: '吸附时显示对齐辅助线。', defaultOn: true },
      { kind: 'toggle', id: 'minimap', label: '导航', desc: '显示画布小地图。', defaultOn: true },
      { kind: 'toggle', id: 'glow', label: '背景光晕', desc: '画布顶部一层很淡的氛围光。' },
      { kind: 'slider', id: 'motion', label: '定位动画上限', desc: '节点数超过该值时，定位改为瞬时跳转。', min: 20, max: 400, step: 10, value: 100 },
    ],
  },
  nodes: {
    title: '节点',
    controls: [
      { kind: 'toggle', id: 'close', label: '叉叉', desc: '节点右上角删除按钮。', defaultOn: true },
      { kind: 'toggle', id: 'start', label: '开始钮', desc: '紧凑生图 / 视频节点顶栏的开始生成快捷钮。', defaultOn: true },
      { kind: 'toggle', id: 'timer', label: '秒表', desc: '节点上方的生成计时。', defaultOn: true },
      { kind: 'toggle', id: 'hidePreview', label: '隐藏输入图预览', desc: '全局收起图片输入节点的大图预览，只留边框。' },
      { kind: 'segment', id: 'motion', label: '生成动画', desc: '生成中的节点亮动画。', options: ['关闭', '默认', '星光'], defaultIndex: 1 },
    ],
  },
  actions: {
    title: '操作',
    controls: [
      { kind: 'toggle', id: 'confirmDelete', label: '删除前确认', desc: '删除节点或连线前先弹出确认。', defaultOn: true },
    ],
  },
  token: {
    title: '平台 API 令牌',
    controls: [
      { kind: 'text', id: 'userId', label: 'USER ID', desc: '平台用户 ID。', placeholder: '平台用户 ID' },
      { kind: 'text', id: 'token', label: 'TOKEN', desc: '平台系统 Token，形如 Bearer …', placeholder: '平台系统 Token，形如 Bearer …', secret: true },
    ],
  },
  pet: {
    title: '麻衣桌宠',
    controls: [
      { kind: 'toggle', id: 'show', label: '显示桌宠', desc: '在画布上显示麻衣桌宠。', defaultOn: true },
      { kind: 'segment', id: 'preview', label: '快捷预览', desc: '预览待机、跑动或视线动作。', options: ['待机', '跑动', '视线'] },
      { kind: 'segment', id: 'size', label: '显示大小', desc: '画布上桌宠的显示尺寸。', options: ['小', '中', '大'], defaultIndex: 1 },
      { kind: 'segment', id: 'link', label: '画布联动', desc: '关闭后暂停画布与任务通知。', options: ['全开', '仅生成', '关闭'] },
    ],
  },
  jimeng: {
    title: '即梦',
    blurb: '即梦渠道的开关预览。密钥仍在 API 接入里配置。',
    controls: [
      { kind: 'toggle', id: 'enabled', label: '在视频页显示即梦模型', desc: '只影响这份预览，不会改动已保存的视频模型。' },
    ],
  },
  codex: {
    title: 'Codex',
    controls: [
      { kind: 'text', id: 'base', label: 'BASE URL', desc: 'Codex 兼容接口地址。', placeholder: 'https://api.openai.com/v1' },
      { kind: 'text', id: 'key', label: 'API KEY', desc: '不会写入 OpenAI 渠道。', placeholder: 'sk-…', secret: true },
    ],
  },
  upscale: {
    title: '即梦智能超清',
    controls: [
      { kind: 'text', id: 'base', label: 'BASE URL', desc: '桌面版转发地址。不会发起连接测试。', placeholder: 'https://visual.volcengineapi.com' },
      { kind: 'text', id: 'key', label: 'API KEY', desc: '填写 AK:SK 或普通 API Key。关闭面板后丢弃。', placeholder: '填写 AK:SK 或普通 API Key', secret: true },
    ],
  },
};

const MODALITY_MODELS: Record<'three_d' | 'music' | 'voice', { title: string; models: { name: string; id: string }[] }> = {
  three_d: { title: '3D', models: [{ name: 'Hunyuan 3D Pro', id: 'hunyuan-3d-pro' }, { name: 'Hunyuan 3D Rapid', id: 'hunyuan-3d-rapid' }] },
  music: { title: '音乐', models: [{ name: 'Suno V6', id: 'suno-v6' }, { name: 'Suno V6 Wild', id: 'suno-v6-wild' }] },
  voice: { title: '语音', models: [{ name: 'Minimax Speech HD', id: 'speech-2.8-hd' }, { name: 'Minimax Speech Turbo', id: 'speech-2.8-turbo' }] },
};

function readValue(state: Record<string, string>, control: PreviewControl) {
  const stored = state[control.id];
  if (stored !== undefined) return stored;
  if (control.kind === 'toggle') return control.defaultOn ? '1' : '0';
  if (control.kind === 'segment') return String(control.defaultIndex || 0);
  if (control.kind === 'slider') return String(control.value);
  return '';
}

function PreviewRows({ controls }: { controls: PreviewControl[] }) {
  const [state, setState] = useState<Record<string, string>>({});
  const set = (id: string, value: string) => setState(current => ({ ...current, [id]: value }));
  return (
    <div className="settings-preview-list">
      {controls.map(control => {
        const value = readValue(state, control);
        return (
          <div key={control.id} className="settings-preview-row">
            <div className="min-w-0">
              <div className="text-sm font-medium text-slate-900">{control.label}</div>
              {control.desc && <p className="mt-1 text-xs leading-5 text-slate-500">{control.desc}</p>}
            </div>
            {control.kind === 'toggle' && (
              <button type="button" role="switch" aria-checked={value === '1'} aria-label={control.label} onClick={() => set(control.id, value === '1' ? '0' : '1')} className={`settings-switch ${value === '1' ? 'is-on' : ''}`}>
                <span />
              </button>
            )}
            {control.kind === 'segment' && (
              <div className="settings-segment" role="group" aria-label={control.label}>
                {control.options.map((option, index) => (
                  <button key={option} type="button" aria-pressed={value === String(index)} onClick={() => set(control.id, String(index))}>{option}</button>
                ))}
              </div>
            )}
            {control.kind === 'slider' && (
              <label className="settings-slider">
                <span>{value}{control.suffix || ''}</span>
                <input type="range" min={control.min} max={control.max} step={control.step} value={value} aria-label={control.label} onChange={event => set(control.id, event.target.value)} />
              </label>
            )}
            {control.kind === 'text' && (
              <input className="settings-field" type={control.secret ? 'password' : 'text'} value={value} placeholder={control.placeholder} aria-label={control.label} onChange={event => set(control.id, event.target.value)} />
            )}
          </div>
        );
      })}
    </div>
  );
}

export function SettingsPreviewNotice() {
  return <p className="settings-preview-notice">界面预览，暂不生效</p>;
}

export function CanvasPreview({ page }: { page: Exclude<CanvasSettingsPage, 'media'> }) {
  const spec = CANVAS_CONTROLS[page];
  return (
    <section className="settings-preview">
      <header>
        <h2>{spec.title}</h2>
        <SettingsPreviewNotice />
        {spec.blurb && <p>{spec.blurb}</p>}
      </header>
      <PreviewRows key={page} controls={spec.controls} />
    </section>
  );
}

export function PrivacyPreview() {
  return (
    <section className="settings-preview">
      <header><h2>隐私</h2><SettingsPreviewNotice /></header>
      <PreviewRows controls={[{ kind: 'toggle', id: 'privacy', label: '隐私模式', desc: '截图或分享屏幕时，隐藏项目名称和封面。首页和项目库不显示封面。' }]} />
    </section>
  );
}

export function LanguagePreview() {
  return (
    <section className="settings-preview">
      <header><h2>语言</h2><SettingsPreviewNotice /></header>
      <PreviewRows controls={[{ kind: 'segment', id: 'locale', label: '界面语言', desc: '当前产品界面仍为简体中文，切换不会改写文案。', options: ['简体中文', 'English'] }]} />
    </section>
  );
}

export function ModalityPreview({ kind }: { kind: 'three_d' | 'music' | 'voice' }) {
  const spec = MODALITY_MODELS[kind];
  return (
    <section className="settings-preview">
      <header>
        <h2>{spec.title}</h2>
        <SettingsPreviewNotice />
        <p>这些模型卡只在本面板里编辑，不会写入渠道或默认模型。</p>
      </header>
      <div className="space-y-3">
        {spec.models.map(model => (
          <article key={model.id} className="settings-config-card space-y-3">
            <h3 className="text-sm font-semibold text-slate-900">{model.name}</h3>
            <label className="settings-form-field">MODEL ID<input className="settings-field" defaultValue={model.id} aria-label={`${model.name} MODEL ID`} /></label>
            <label className="settings-form-field">API KEY<input className="settings-field" type="password" placeholder="sk-…" aria-label={`${model.name} API KEY`} /></label>
            <label className="settings-form-field">BASE URL<input className="settings-field" placeholder="https://" aria-label={`${model.name} BASE URL`} /></label>
          </article>
        ))}
      </div>
    </section>
  );
}

export function StoragePreviewNote() {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <SettingsPreviewNotice />
      <span className="text-xs text-slate-500">Cloudinary 与七牛不会写入当前存储服务商。</span>
      <button type="button" disabled className="settings-button-secondary opacity-60">Cloudinary（免费）</button>
      <button type="button" disabled className="settings-button-secondary opacity-60">七牛云</button>
    </div>
  );
}
