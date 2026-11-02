import { Fragment, useRef, type KeyboardEvent } from 'react';
import { salesFocusClass } from './salesChrome';

const VIEWS = [
  { id: 'summary', title: '商品资料', description: '选图识字与卖点提炼' },
  { id: 'storyboard', title: '分镜脚本', description: '全宽分镜表格与制作设置' },
  { id: 'delivery', title: '生成成片', description: '素材核对、视频生成与配乐导出' },
] as const;

export type SalesEditorView = typeof VIEWS[number]['id'];

export function SalesEditorNavigation({
  view,
  onChange,
  id,
}: {
  view: SalesEditorView;
  onChange: (view: SalesEditorView) => void;
  id: string;
}) {
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const activeIndex = VIEWS.findIndex((item) => item.id === view);

  const navigate = (event: KeyboardEvent, index: number) => {
    const next =
      event.key === 'ArrowRight'
        ? (index + 1) % VIEWS.length
        : event.key === 'ArrowLeft'
          ? (index + VIEWS.length - 1) % VIEWS.length
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? VIEWS.length - 1
              : -1;
    if (next < 0) return;
    event.preventDefault();
    onChange(VIEWS[next].id);
    buttons.current[next]?.focus();
  };

  return (
    <div className="sales-editor-stepper" role="tablist" aria-label="编辑内容">
      {VIEWS.map(({ id: key, title, description }, index) => {
        const active = view === key;
        const done = index < activeIndex;
        return (
          <Fragment key={key}>
            {index > 0 && <span className="sales-step-connector" aria-hidden />}
            <button
              type="button"
              role="tab"
              ref={(element) => {
                buttons.current[index] = element;
              }}
              id={`${id}-editor-${key}`}
              aria-controls={`${id}-editor-panel`}
              aria-selected={active}
              tabIndex={active ? 0 : -1}
              title={`${title} · ${description}`}
              onClick={() => onChange(key)}
              onKeyDown={(event) => navigate(event, index)}
              className={`sales-step-item ${active ? 'is-active' : ''} ${done ? 'is-done' : ''} ${salesFocusClass}`}
            >
              <span className="sales-step-num" aria-hidden>
                {index + 1}
              </span>
              <span>{title}</span>
            </button>
          </Fragment>
        );
      })}
    </div>
  );
}
