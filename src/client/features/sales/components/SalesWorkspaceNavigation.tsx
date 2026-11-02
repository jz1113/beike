import { useRef, type KeyboardEvent } from 'react';
import type { SalesWorkspace } from '../model/salesWorkspace';
import { salesFocusClass } from './salesChrome';

const WORKSPACES = [
  { id: 'workflow', title: '视频制作', description: '商品资料、分镜脚本与成片合成' },
  { id: 'assets', title: '资产库', description: '动作、人物、场景、声音与提示词' },
] as const;

export function SalesWorkspaceNavigation({
  workspace,
  onChange,
  id,
  disabled = false,
  hasUnsavedAssets = false,
}: {
  workspace: SalesWorkspace;
  disabled?: boolean;
  onChange: (workspace: SalesWorkspace) => void;
  id: string;
  hasUnsavedAssets?: boolean;
}) {
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    let next: number;
    switch (event.key) {
      case 'ArrowRight':
        next = (index + 1) % WORKSPACES.length;
        break;
      case 'ArrowLeft':
        next = (index + WORKSPACES.length - 1) % WORKSPACES.length;
        break;
      case 'Home':
        next = 0;
        break;
      case 'End':
        next = WORKSPACES.length - 1;
        break;
      default:
        return;
    }
    event.preventDefault();
    onChange(WORKSPACES[next].id);
    buttons.current[next]?.focus();
  };

  return (
    <nav className="sales-workspace-nav" aria-label="电商视频功能板块">
      <div className="sales-workspace-underline-tabs" role="tablist" aria-label="切换功能板块">
        {WORKSPACES.map(({ id: key, title, description }, index) => {
          const active = workspace === key;
          return (
            <button
              key={key}
              ref={(element) => {
                buttons.current[index] = element;
              }}
              type="button"
              disabled={disabled}
              role="tab"
              id={`${id}-tab-${key}`}
              aria-label={title}
              aria-selected={active}
              aria-controls={`${id}-panel`}
              tabIndex={active ? 0 : -1}
              title={`${title} · ${description}`}
              onClick={() => onChange(key)}
              onKeyDown={(event) => onKeyDown(event, index)}
              className={`sales-mode-tab ${active ? 'is-active' : ''} ${salesFocusClass}`}
            >
              <span>{title}</span>
              {key === 'assets' && hasUnsavedAssets ? (
                <span
                  className="sales-unsaved-dot"
                  title="存在未保存的脚本或提示词修改"
                  aria-hidden
                />
              ) : null}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
