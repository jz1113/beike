import type { SalesPrompt } from '@shared/contracts/salesPrompts';
import { SalesMaterialSidebar } from './SalesMaterialSidebar';
import { salesFocusClass } from './salesChrome';

const GROUPS = [
  { title: '商品文案', ids: ['summary'] },
  { title: '分镜脚本', ids: ['script-analysis', 'script-normalize', 'plan-adapt'] },
  { title: '资产补图', ids: ['persona-grid', 'scene-grid'] },
];

export function SalesPromptSidebar({ items, selectedId, editorId, dirty, onSelect }: {
  items: readonly SalesPrompt[];
  selectedId: string;
  editorId: string;
  dirty: (item: SalesPrompt) => boolean;
  onSelect: (id: string) => void;
}) {
  return <SalesMaterialSidebar>
    <nav className="sales-cat-subs sales-prompts-nav" aria-label="提示词环节">
      {GROUPS.map((group) => {
        const prompts = group.ids.flatMap((id) => items.filter((item) => item.id === id));
        if (!prompts.length) return null;
        return <div className="sales-prompts-nav-group" key={group.title} role="group" aria-label={group.title}>
          <span className="sales-prompts-nav-heading" aria-hidden>{group.title}<small>{prompts.length}</small></span>
          {prompts.map((item) => <button key={item.id} type="button"
            className={`sales-cat-sub-item ${salesFocusClass}`} title={item.title}
            aria-label={`${item.title}${dirty(item) ? '，未保存' : ''}`}
            aria-current={selectedId === item.id ? 'true' : undefined} aria-controls={editorId}
            onClick={() => onSelect(item.id)}>
            <span>{item.title}</span>
            {dirty(item) && <span className="sales-prompts-dirty-dot" aria-hidden />}
          </button>)}
        </div>;
      })}
    </nav>
  </SalesMaterialSidebar>;
}
