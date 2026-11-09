import type { SalesPrompt } from '@shared/contracts/salesAssetViews';
import { selectSalesTemplateVoice, type SalesBeatVoiceMode } from '@shared/domain/sales/scriptTemplate';
import { useId, useState } from 'react';
import { Check, Copy, Loader2, Save } from 'lucide-react';
import MarkdownBody from '@client/shared/ui/markdown/MarkdownBody';
import type { useSalesPrompts } from '../hooks/useSalesPrompts';
import { salesFocusClass, salesGhostButtonClass, salesPrimaryButtonClass } from './salesChrome';

type PromptManager = ReturnType<typeof useSalesPrompts>;

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
  return (
    <aside className="sales-cat-sidebar">
      <strong>提示词管理</strong>
      <nav className="sales-cat-subs sales-prompts-nav" aria-label="提示词环节">
        {GROUPS.map((group) => {
          const entries = group.entries.map(({ label, tabs }) => ({
            label,
            prompts: Object.keys(tabs).flatMap((id) => items.filter((item) => item.id === id)),
          })).filter(({ prompts }) => prompts.length > 0);
          if (!entries.length) return null;
          return (
            <div className="sales-prompts-nav-group" key={group.title} role="group" aria-label={group.title}>
              <span className="sales-prompts-nav-heading" aria-hidden>{group.title}<small>{entries.length}</small></span>
              {entries.map(({ label, prompts }) => {
                const current = prompts.find((item) => item.id === selectedId);
                const target = current ?? prompts[0];
                const status = prompts.some((item) => !item.configured) ? '，未配置' : prompts.some(dirty) ? '，未保存' : '';
                return (
                  <button
                    key={label}
                    type="button"
                    className={`sales-cat-sub-item ${salesFocusClass}`}
                    aria-label={label + status}
                    aria-current={current ? 'true' : undefined}
                    aria-controls={editorId}
                    onClick={() => onSelect(target.id)}
                  >
                    <span>{label}</span>
                    {status && <span className="sales-prompts-dirty-dot" aria-hidden />}
                  </button>
                );
              })}
            </div>
          );
        })}
      </nav>
    </aside>
  );
}

const previewFields: Record<string, string> = {
  photographyFacts: '', audioFacts: '',
  personaFacts: '[女主角／男主角] 参考 @图N，人物设定为[身份、年龄感与本片性格]。',
  productFacts: '本片商品为[商品名称]，外观参考 @图N。',
  sceneFacts: '本段在[地点]拍摄，空间与陈设参考[本段场景图或分镜记录]。',
  depthFacts: '@视频N 仅作为对应镜头的动作参考。',
  referenceFacts: '[本次人物、商品、场景及已选动作参考]',
  timelineFacts: '[镜号范围｜地点｜人物造型｜场景参考]\n[镜号｜时长｜拍摄视角｜必见内容｜动作与收势]',
};

function readingTemplate(text: string, voice: SalesBeatVoiceMode, storyboard?: string) {
  return selectSalesTemplateVoice(text, voice).split(/\r?\n/).flatMap(line => {
    const expanded = line.replace(/\{\{\s*(\w+)\s*\}\}/g, (token, key: string) =>
      key === 'timelineFacts' && storyboard ? storyboard : Object.hasOwn(previewFields, key) ? previewFields[key] : token);
    return expanded || !line.trim() ? [expanded] : [];
  }).join('\n');
}

export function SalesPromptWorkspace({ manager, storyboard, showSidebar = true }: { manager: PromptManager; storyboard?: string; showSidebar?: boolean }) {
  const { selected, loading, saving } = manager;
  const id = useId();
  const [copied, setCopied] = useState({ id: '', text: '' });
  const [copyError, setCopyError] = useState('');
  const [mode, setMode] = useState<'read' | 'edit' | null>(null);
  const editing = (mode ?? (selected?.configured ? 'read' : 'edit')) === 'edit';
  const busy = loading || saving;
  const isDirty = selected ? manager.dirty(selected) : false;
  const isGrid = selected?.id === 'persona-grid' || selected?.id === 'scene-grid';
  const isFinalVideo = selected?.id === 'final-video' || selected?.id === 'final-video-depth';
  const entry = selected && salesPromptEntry(selected.id);
  const isSpoken = selected?.id === 'spoken-copy' || selected?.id === 'spoken-review';
  const select = (promptId: string) => {
    manager.select(promptId);
    setMode(null);
    setCopyError('');
  };
  const finalVideoHelp =
    selected?.id === 'final-video-depth'
      ? '深度视频只参考动作；运镜、景别、构图和表情按分镜文字，人物、商品与场景按所选图片。'
      : '纯分镜版按文字执行动作、运镜与表情，人物、商品与场景按所选图片，不引用动作视频或姿态图。';
  const [voice, setVoice] = useState<SalesBeatVoiceMode>('none');
  const preview = isFinalVideo && !editing;
  const displayText = preview ? readingTemplate(manager.text, voice, storyboard) : manager.text;
  const isCopied = copied.id === selected?.id && copied.text === displayText;
  const copy = async () => {
    setCopyError('');
    const value = { id: selected?.id ?? '', text: displayText };
    try {
      await navigator.clipboard.writeText(value.text);
      setCopied(value);
    } catch {
      setCopyError('复制失败，请在编辑框中选中文本后复制。');
    }
  };

  return (
    <section className="sales-prompts-workspace" aria-label="提示词管理">
      {showSidebar && (
        <SalesPromptSidebar
          items={manager.items}
          selectedId={manager.selectedId}
          editorId={`${id}-editor`}
          dirty={manager.dirty}
          onSelect={select}
        />
      )}
      <div className="sales-prompts-body">
        {manager.error && (
          <div className="sales-prompts-error" role="alert">
            <span>{manager.error}</span>
            <button
              type="button"
              disabled={busy}
              className={salesGhostButtonClass}
              onClick={() => {
                void manager.refresh();
              }}
            >
              {manager.conflict ? '读取最新版本，保留编辑' : '重新读取'}
            </button>
          </div>
        )}
        {manager.notice && (
          <p className="sales-prompts-notice" role="status">
            {manager.notice}
          </p>
        )}

        {selected ? (
          <>
            <div className="sales-prompts-editor" id={`${id}-editor`} role="region" aria-labelledby={`${id}-title`}>
              {entry && Object.keys(entry.tabs).length > 1 && (
                <div className="sales-prompts-modes" role="group" aria-label={entry.label}>
                  {Object.entries(entry.tabs).map(([promptId, label]) => {
                    const item = manager.items.find((prompt) => prompt.id === promptId);
                    if (!item) return null;
                    const status = !item.configured ? ' · 未配置' : manager.dirty(item) ? ' · 未保存' : '';
                    return (
                      <button
                        key={item.id}
                        type="button"
                        className={salesFocusClass}
                        aria-pressed={item.id === selected.id}
                        onClick={() => select(item.id)}
                      >
                        {label}
                        {status}
                      </button>
                    );
                  })}
                </div>
              )}
              <header className="sales-prompts-editor-head">
                <h2 id={`${id}-title`}>{selected.title}</h2>
                <button
                  type="button"
                  className={salesGhostButtonClass}
                  onClick={() => {
                    void copy();
                  }}
                  disabled={!manager.text}
                >
                  {isCopied ? <Check size={13} aria-hidden /> : <Copy size={13} aria-hidden />}
                  {isCopied ? '已复制' : '复制'}
                </button>
              </header>
              {isSpoken && <p className="sales-prompts-help">真人口播或画外旁白使用编写和验收规则，纯画面展示跳过。</p>}
              {!selected.configured && (
                <p role="status" className="sales-prompts-notice">
                  当前展示的是待保存的初始模板，对应环节尚不能执行。编辑并保存后生效。
                </p>
              )}
              {editing && (
                <p id={`${id}-help`} className="sales-prompts-help">
                  {isFinalVideo
                    ? `这是本模式最终视频生成的完整创作规则。${finalVideoHelp}两套模板独立保存，按制作模式调用。保留各章节的资料占位符，系统只注入所选素材、摄影资料、时间轴与声音数据，不额外追加创作指令。以【仅无口播】【仅有口播】【仅后期旁白】开头的行，只在对应声音模式输出。`
                    : selected.id === 'script-analysis'
                      ? '按真实切镜记录分场、造型、视角、同框主体和动作，应用会整理为分镜表。'
                      : selected.id === 'persona-grid'
                        ? '保存后用于下一次人物补图。请保留一行四列，依次为正面全身、侧面全身、背面全身和脸部特写。'
                        : isGrid
                          ? '保存后用于下一次九宫格生成。请保留 3×3 等分、视角顺序、无边框和无文字要求，以便自动裁切。'
                          : '保存后逐字用于当前工作区对应环节。请保留提示词中的输出格式要求。'}
                </p>
              )}
              <div className="sales-prompts-sheet" key={selected.id}>
                <div className="sales-prompts-sheet-bar">
                  <div className="sales-prompts-modes" role="group" aria-label="提示词视图">
                    <button type="button" aria-pressed={!editing} className={salesFocusClass} onClick={() => setMode('read')}>
                      阅读
                    </button>
                    <button type="button" aria-pressed={editing} className={salesFocusClass} onClick={() => setMode('edit')}>
                      编辑原文
                    </button>
                  </div>
                  {preview && (
                    <div className="sales-prompts-modes" role="group" aria-label="声音预览">
                      {(['none', 'speech', 'voiceover'] as const).map((mode) => (
                        <button type="button" key={mode} aria-pressed={voice === mode} onClick={() => setVoice(mode)}>
                          {({ none: '无口播', speech: '有口播', voiceover: '后期旁白' })[mode]}
                        </button>
                      ))}
                    </div>
                  )}
                  <span className="sales-prompts-character-count">{displayText.length.toLocaleString()} 字符</span>
                </div>
                {editing ? (
                  <textarea
                    className={`sales-prompts-textarea ${salesFocusClass}`}
                    aria-labelledby={`${id}-title`}
                    aria-describedby={`${id}-help`}
                    value={manager.text}
                    onChange={(event) => {
                      manager.updateDraft(event.target.value);
                      setCopied({ id: '', text: '' });
                    }}
                    disabled={busy}
                    spellCheck={false}
                  />
                ) : (
                  <div className="sales-prompts-reader" tabIndex={0} role="region" aria-label="提示词正文">
                    {preview ? <div className="sales-template-reading">{displayText}</div> : <MarkdownBody content={manager.text} />}
                  </div>
                )}
              </div>
              {copyError && (
                <p role="alert" className="sales-prompts-error">
                  {copyError}
                </p>
              )}
            </div>
            <footer className="sales-prompts-footer">
              <span role="status" className={isDirty ? 'is-dirty' : ''}>
                {!selected.configured
                  ? '尚未配置，保存后才能执行；不会回退内置规则'
                  : isDirty
                    ? '修改尚未生效，保存后用于下一次生成'
                    : manager.verified
                      ? '当前内容已生效'
                      : loading
                        ? '正在核对后台内容'
                        : '请刷新以核对后台内容'}
              </span>
              <div>
                {isDirty && (
                  <button type="button" className={salesGhostButtonClass} disabled={busy} onClick={manager.discardDraft}>
                    撤销修改
                  </button>
                )}
                <button
                  type="button"
                  className={salesPrimaryButtonClass}
                  disabled={busy || !manager.verified || !isDirty || !manager.text.trim()}
                  onClick={() => {
                    void manager.save();
                  }}
                >
                  {saving ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <Save size={14} aria-hidden />}
                  {saving ? '正在保存' : '保存提示词'}
                </button>
              </div>
            </footer>
          </>
        ) : (
          <div className="sales-prompts-empty" role="status">
            {loading ? (
              <>
                <Loader2 size={22} className="animate-spin" aria-hidden />
                正在读取各环节提示词…
              </>
            ) : manager.error ? (
              '读取失败，点击「重新读取」重试。'
            ) : (
              '暂无可管理的提示词。'
            )}
          </div>
        )}
      </div>
    </section>
  );
}
