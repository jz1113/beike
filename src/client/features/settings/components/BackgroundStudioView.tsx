import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Laptop, Maximize2, Minimize2, Moon, Pause, Play, RotateCcw, Sun } from 'lucide-react';
import {
  BACKGROUND_CATALOG,
  getBackgroundCatalogItem,
  type AppBackgroundStyle,
} from '@client/shared/media/backgrounds/backgroundCatalog';
import {
  countStudioChanges,
  getStudioSchema,
  isDynamicStyle,
  matchingPresetId,
} from '@client/shared/media/backgrounds/studio';
import { CUSTOM_PRESET_LIMIT } from '@client/shared/media/backgrounds/studio/customPresets';
import { useAppTheme, type AppTheme } from '@client/shared/hooks/useAppTheme';
import { BackgroundLivePreview } from './BackgroundLivePreview';
import { StudioFieldGrid } from './BackgroundStudioControls';
import { PresetSection } from './BackgroundStudioPresets';

const THEME_OPTIONS: Array<{ id: AppTheme; label: string; icon: typeof Sun }> = [
  { id: 'dark', label: '深色', icon: Moon },
  { id: 'light', label: '浅色', icon: Sun },
  { id: 'system', label: '跟随系统', icon: Laptop },
];

const ICON_BTN = 'inline-flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40 dark:text-[#C7C7CC] dark:hover:bg-white/10';

export function BackgroundStudioView({
  style,
  onStyleChange,
}: {
  style: AppBackgroundStyle;
  onStyleChange: (style: AppBackgroundStyle) => void;
}) {
  const {
    theme,
    setTheme,
    isDark,
    backgroundStudios,
    customPresets,
    setBackgroundStudio,
    resetBackgroundStudio,
    applyBackgroundPreset,
    saveCustomPreset,
    deleteCustomPreset,
  } = useAppTheme();
  const [paused, setPaused] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [presetName, setPresetName] = useState('');
  const [saveOpen, setSaveOpen] = useState(false);
  const item = getBackgroundCatalogItem(style);
  const dynamic = isDynamicStyle(style) ? style : null;
  const schema = dynamic ? getStudioSchema(dynamic) : null;
  const values = dynamic ? backgroundStudios[dynamic] : null;
  const saved = dynamic ? customPresets[dynamic] : [];
  const activePreset = schema && values ? matchingPresetId(style, values) : null;
  const changes = schema && values ? countStudioChanges(style, values) : 0;

  useEffect(() => {
    setPresetName('');
    setSaveOpen(false);
  }, [style]);

  useEffect(() => {
    if (!expanded) return undefined;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      setExpanded(false);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [expanded]);

  const shift = (delta: number) => {
    const index = BACKGROUND_CATALOG.findIndex((entry) => entry.id === style);
    const next = BACKGROUND_CATALOG[(index + delta + BACKGROUND_CATALOG.length) % BACKGROUND_CATALOG.length];
    onStyleChange(next.id);
  };

  const renderToolbar = () => (
    <StageToolbar
      theme={theme}
      paused={paused}
      expanded={expanded}
      canReset={dynamic !== null}
      onTheme={setTheme}
      onTogglePause={() => setPaused((value) => !value)}
      onReset={() => {
        if (dynamic) resetBackgroundStudio(dynamic);
      }}
      onToggleExpanded={() => setExpanded((value) => !value)}
    />
  );

  return (
    <>
      <section className="flex h-[300px] min-h-0 min-w-0 flex-col lg:h-full">
        {expanded ? null : renderToolbar()}
        <div className="relative min-h-0 flex-1 bg-[#0D0F14]">
          {expanded ? null : (
            <BackgroundLivePreview
              style={style}
              isDark={isDark}
              studio={values ?? undefined}
              mode="stage"
              paused={paused}
            />
          )}
          <p className="pointer-events-none absolute bottom-3 left-3 z-10 rounded-full bg-black/45 px-2.5 py-1 text-[11px] text-white/90 backdrop-blur-sm">
            {paused ? '动态已暂停' : '移动鼠标或点击预览，试互动效果'}
          </p>
        </div>
      </section>
      <aside className="flex max-h-[70vh] min-h-[320px] min-w-0 flex-col border-t border-slate-200/80 bg-white dark:border-white/[0.06] dark:bg-[#141416] lg:h-full lg:max-h-none lg:border-l lg:border-t-0">
        <div className="flex items-start justify-between gap-2 px-4 pb-3 pt-4">
          <div className="min-w-0">
            <h2 className="truncate text-sm font-semibold text-slate-900 dark:text-white">{item.name}</h2>
            <p className="mt-1 truncate text-[11px] text-slate-500 dark:text-[#8E8E93]">{item.description}</p>
          </div>
          <div className="flex shrink-0 gap-1">
            <button type="button" aria-label="上一个背景" onClick={() => shift(-1)} className={ICON_BTN}>
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button type="button" aria-label="下一个背景" onClick={() => shift(1)} className={ICON_BTN}>
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
        {schema && values && dynamic ? (
          <>
            <p className="px-4 pb-2 text-[11px] text-slate-400 dark:text-[#8E8E93]">
              {changes > 0 ? `已修改 ${changes} 项参数` : '当前为默认参数'}
            </p>
            <PresetSection
              presets={schema.presets}
              saved={saved}
              values={values}
              activePreset={activePreset}
              presetName={presetName}
              saveOpen={saveOpen}
              atLimit={saved.length >= CUSTOM_PRESET_LIMIT}
              onPresetName={setPresetName}
              onToggleSave={() => setSaveOpen((open) => !open)}
              onApply={(presetId) => applyBackgroundPreset(dynamic, presetId)}
              onApplySaved={(preset) => setBackgroundStudio(dynamic, preset.values)}
              onDelete={(id) => deleteCustomPreset(dynamic, id)}
              onSave={() => {
                if (saved.length >= CUSTOM_PRESET_LIMIT) return;
                saveCustomPreset(dynamic, presetName);
                setPresetName('');
                setSaveOpen(false);
              }}
            />
            <div className="min-h-0 flex-1">
              <StudioFieldGrid
                fields={schema.fields}
                values={values}
                defaults={schema.defaults}
                onChange={(patch) => setBackgroundStudio(dynamic, patch)}
              />
            </div>
          </>
        ) : (
          <div className="space-y-3 px-4">
            <p className="text-xs leading-relaxed text-slate-500 dark:text-[#8E8E93]">
              这个背景使用默认环境光，没有可调参数。
            </p>
            <button
              type="button"
              onClick={() => onStyleChange('shards')}
              className="inline-flex h-8 cursor-pointer items-center rounded-full bg-slate-900 px-3 text-xs font-medium text-white dark:bg-white dark:text-slate-900"
            >
              改用气旋碎片
            </button>
          </div>
        )}
      </aside>
      {expanded ? (
        <div className="fixed inset-0 z-[100] flex flex-col bg-[#0c0d11]">
          {renderToolbar()}
          <div className="relative min-h-0 flex-1">
            <BackgroundLivePreview
              style={style}
              isDark={isDark}
              studio={values ?? undefined}
              mode="stage"
              paused={paused}
            />
            <p className="pointer-events-none absolute bottom-4 left-4 z-10 rounded-full bg-black/45 px-2.5 py-1 text-[11px] text-white/90 backdrop-blur-sm">
              {paused ? '动态已暂停' : '移动鼠标或点击预览，试互动效果'}
            </p>
          </div>
        </div>
      ) : null}
    </>
  );
}

function StageToolbar({
  theme,
  paused,
  expanded,
  canReset,
  onTheme,
  onTogglePause,
  onReset,
  onToggleExpanded,
}: {
  theme: AppTheme;
  paused: boolean;
  expanded: boolean;
  canReset: boolean;
  onTheme: (theme: AppTheme) => void;
  onTogglePause: () => void;
  onReset: () => void;
  onToggleExpanded: () => void;
}) {
  return (
    <div className="flex h-11 shrink-0 items-center justify-between gap-2 overflow-hidden border-b border-slate-200/80 bg-white px-2 dark:border-white/[0.06] dark:bg-[#141416]">
      <div className="flex min-w-0 items-center gap-1.5">
        <div className="inline-flex shrink-0 rounded-full bg-slate-100 p-0.5 dark:bg-[#1C1C20]">
          {THEME_OPTIONS.map((option) => {
            const Icon = option.icon;
            const active = theme === option.id;
            return (
              <button
                key={option.id}
                type="button"
                aria-label={option.label}
                aria-pressed={active}
                title={option.label}
                onClick={() => onTheme(option.id)}
                className={`inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-full ${
                  active
                    ? 'bg-white text-slate-900 shadow-sm dark:bg-[#2C2C32] dark:text-white'
                    : 'text-slate-500 hover:text-slate-900 dark:text-[#8E8E93] dark:hover:text-white'
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
              </button>
            );
          })}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <button type="button" aria-label={paused ? '播放动态' : '暂停动态'} onClick={onTogglePause} className={ICON_BTN}>
          {paused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
        </button>
        <button type="button" aria-label="重置参数" disabled={!canReset} onClick={onReset} className={ICON_BTN}>
          <RotateCcw className="h-3.5 w-3.5" />
        </button>
        <button type="button" aria-label={expanded ? '退出放大' : '放大预览'} onClick={onToggleExpanded} className={ICON_BTN}>
          {expanded ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
        </button>
      </div>
    </div>
  );
}
