import { useId, useState } from 'react';
import { Check, Copy, Loader2, RefreshCw, Save } from 'lucide-react';
import type { useSalesPrompts } from '../hooks/useSalesPrompts';
import { SalesPromptSidebar } from './SalesPromptSidebar';
import { salesFocusClass, salesGhostButtonClass, salesPrimaryButtonClass } from './salesChrome';

type PromptManager = ReturnType<typeof useSalesPrompts>;

export function SalesPromptWorkspace({ manager }: { manager: PromptManager }) {
  const { selected, loading, saving } = manager;
  const id = useId();
  const [copied, setCopied] = useState({ id: '', text: '' });
  const [copyError, setCopyError] = useState('');
  const busy = loading || saving;
  const savedStatus = loading ? '正在核对' : manager.verified ? '已生效' : '待核对';
  const isDirty = selected ? manager.dirty(selected) : false;
  const isGrid = selected?.id === 'persona-grid' || selected?.id === 'scene-grid';
  const unsavedCount = manager.items.filter(manager.dirty).length;
  const isCopied = copied.id === selected?.id && copied.text === manager.text;
  const copy = async () => {
    setCopyError('');
    const value = { id: selected?.id ?? '', text: manager.text };
    try { await navigator.clipboard.writeText(value.text); setCopied(value); }
    catch { setCopyError('复制失败，请在编辑框中选中文本后复制。'); }
  };

  return <section className="sales-prompts-workspace" aria-label="提示词管理">
    <SalesPromptSidebar items={manager.items} selectedId={manager.selectedId} editorId={`${id}-editor`} dirty={manager.dirty}
      onSelect={(promptId) => { manager.select(promptId); setCopyError(''); }} />
    <header className="sales-library-top sales-prompts-heading">
      <div className="sales-material-section-heading">
        <div><h2>提示词管理</h2><span role="status">{loading ? '正在读取…' : `共 ${manager.items.length} 套提示词`}{unsavedCount > 0 ? ` · ${unsavedCount} 套未保存` : ''}</span></div>
        <p>按用途管理各环节指令，保存后用于下一次生成。</p>
      </div>
      <button type="button" className={salesGhostButtonClass} disabled={busy} onClick={() => { void manager.refresh(); }}>
        {loading ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <RefreshCw size={14} aria-hidden />}刷新已保存内容
      </button>
    </header>

    <div className="sales-prompts-body">
    {manager.error && <div className="sales-prompts-error" role="alert">
      <span>{manager.error}</span>
      <button type="button" disabled={busy} className={salesGhostButtonClass} onClick={() => { void manager.refresh(); }}>
        {manager.conflict ? '读取最新版本，保留编辑' : '重新读取'}
      </button>
    </div>}
    {manager.notice && <p className="sales-prompts-notice" role="status">{manager.notice}</p>}

    {selected ? <>
      <div className="sales-prompts-editor" id={`${id}-editor`} role="region" aria-labelledby={`${id}-title`}>
        <header className="sales-prompts-editor-head">
          <div><h3 id={`${id}-title`}>{selected.title}<span className={`sales-prompts-badge ${isDirty ? 'is-dirty' : ''}`}>{isDirty ? '未保存' : savedStatus}</span></h3><p>{selected.description}</p></div>
          <button type="button" className={salesGhostButtonClass} onClick={() => { void copy(); }} disabled={!manager.text}>
            {isCopied ? <Check size={13} aria-hidden /> : <Copy size={13} aria-hidden />}{isCopied ? '已复制' : '复制'}
          </button>
        </header>
        <p id={`${id}-help`} className="sales-prompts-help">{isGrid
          ? '保存后用于下一次九宫格生成。请保留 3×3 等分、视角顺序、无边框和无文字要求，以便自动裁切。'
          : '保存即更新系统在当前工作区使用的提示词。请保留提示词中的输出格式要求。'}</p>
        <textarea className={`sales-prompts-textarea ${salesFocusClass}`} aria-labelledby={`${id}-title`} aria-describedby={`${id}-help`}
          value={manager.text} onChange={(event) => { manager.updateDraft(event.target.value); setCopied({ id: '', text: '' }); }} disabled={busy} spellCheck={false} />
        <span className="sales-prompts-character-count">{manager.text.length.toLocaleString()} 字符</span>
        {copyError && <p role="alert" className="sales-prompts-error">{copyError}</p>}
        {isDirty && <div className="sales-prompts-reference" key={selected.id}>
          <details><summary className={salesFocusClass}>对照当前已保存内容</summary><pre>{selected.prompt}</pre></details>
        </div>}
      </div>
      <footer className="sales-prompts-footer">
        <span role="status" className={isDirty ? 'is-dirty' : ''}>{isDirty ? '修改尚未生效，保存后用于下一次生成' : manager.verified ? '当前内容已生效' : loading ? '正在核对后台内容' : '请刷新以核对后台内容'}</span>
        <div>
          {isDirty && <button type="button" className={salesGhostButtonClass} disabled={busy} onClick={manager.discardDraft}>撤销修改</button>}
          <button type="button" className={salesPrimaryButtonClass} disabled={busy || !manager.verified || !isDirty || !manager.text.trim()} onClick={() => { void manager.save(); }}>
            {saving ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <Save size={14} aria-hidden />}{saving ? '正在保存' : '保存提示词'}
          </button>
        </div>
      </footer>
    </> : <div className="sales-prompts-empty" role="status">
      {loading ? <><Loader2 size={22} className="animate-spin" aria-hidden />正在读取各环节提示词…</> : manager.error ? '读取失败，点击「重新读取」重试。' : '暂无可管理的提示词。'}
    </div>}
    </div>
  </section>;
}
