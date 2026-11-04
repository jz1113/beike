import type { SalesPrompt } from '@shared/contracts/salesPrompts';
import { salesFocusClass } from './salesChrome';

interface PromptEntry {
  label: string;
  tabs: Record<string, string>;
}

const GROUPS: { title: string; entries: PromptEntry[] }[] = [
  { title: '商品文案', entries: [{ label: '商品卖点提炼', tabs: { summary: '商品卖点提炼' } }] },
  { title: '分镜脚本', entries: [
    { label: '参考视频拆解', tabs: { 'script-analysis': '参考视频拆解' } },
    { label: '商品分镜改编', tabs: { 'plan-adapt': '商品分镜改编' } },
    { label: '口播设置', tabs: { 'spoken-copy': '编写规则', 'spoken-review': '验收规则' } },
  ] },
  { title: '视频生成', entries: [
    { label: '最终视频生成', tabs: { 'final-video': '纯分镜版', 'final-video-depth': '深度视频版' } },
  ] },
  { title: '资产生成', entries: [
    { label: '人物生成', tabs: { 'persona-design': '人物绘图', 'persona-grid': '三视图补图' } },
    { label: '场景生成', tabs: { 'scene-design': '场景绘图', 'scene-grid': '九宫格补图' } },
  ] },
];

export function salesPromptEntry(id: string) {
  return GROUPS.flatMap((group) => group.entries).find((entry) => Object.hasOwn(entry.tabs, id));
}

export function SalesPromptSidebar({ items, selectedId, editorId, dirty, onSelect }: {
  items: readonly SalesPrompt[];
  selectedId: string;
  editorId: string;
  dirty: (item: SalesPrompt) => boolean;
  onSelect: (id: string) => void;
}) {
  return <aside className="sales-cat-sidebar">
    <strong>提示词管理</strong>
    <nav className="sales-cat-subs sales-prompts-nav" aria-label="提示词环节">
      {GROUPS.map((group) => {
        const entries = group.entries.map(({ label, tabs }) => ({
          label,
          prompts: Object.keys(tabs).flatMap((id) => items.filter((item) => item.id === id)),
        })).filter(({ prompts }) => prompts.length > 0);
        if (!entries.length) return null;
        return <div className="sales-prompts-nav-group" key={group.title} role="group" aria-label={group.title}>
          <span className="sales-prompts-nav-heading" aria-hidden>{group.title}<small>{entries.length}</small></span>
          {entries.map(({ label, prompts }) => {
            const current = prompts.find((item) => item.id === selectedId);
            const target = current ?? prompts[0];
            const status = prompts.some((item) => !item.configured) ? '，未配置' : prompts.some(dirty) ? '，未保存' : '';
            return <button key={label} type="button" className={`sales-cat-sub-item ${salesFocusClass}`}
              aria-label={label + status} aria-current={current ? 'true' : undefined} aria-controls={editorId}
              onClick={() => onSelect(target.id)}>
              <span>{label}</span>
              {status && <span className="sales-prompts-dirty-dot" aria-hidden />}
            </button>;
          })}
        </div>;
      })}
    </nav>
  </aside>;
}
