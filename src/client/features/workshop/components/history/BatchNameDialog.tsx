import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Layers3, X } from 'lucide-react';
import './batchHistory.css';

interface Props {
  mode: 'create' | 'rename';
  initialName: string;
  reuseEmpty?: boolean;
  onSave: (name: string) => Promise<void>;
  onClose: () => void;
}

export function BatchNameDialog({ mode, initialName, reuseEmpty, onSave, onClose }: Props) {
  const [name, setName] = useState(initialName);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const length = Array.from(name.trim()).length;
  const unchanged = mode === 'rename' && name.trim() === initialName.trim();
  const invalid = length > 120 || (mode === 'rename' && !length);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    inputRef.current?.focus(); inputRef.current?.select();
    return () => { document.body.style.overflow = overflow; if (previous?.isConnected) previous.focus(); };
  }, []);
  const submit = async () => {
    if (busy || invalid || unchanged) return;
    setBusy(true); setError('');
    try { await onSave(name.trim()); onClose(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : '批次操作失败，请重试'); }
    finally { setBusy(false); }
  };
  return createPortal(<div className="history-overlay batch-name-overlay" onClick={event => { if (event.target === event.currentTarget && !busy) onClose(); }}>
    <section ref={panelRef} className="batch-history batch-name-dialog" role="dialog" aria-modal="true" aria-labelledby="batch-name-title" aria-describedby={mode === 'create' && !reuseEmpty ? 'batch-name-description' : undefined} aria-busy={busy} onKeyDown={event => {
      if (event.key === 'Escape' && !busy) { event.stopPropagation(); onClose(); }
      if (event.key === 'Tab') {
        const elements = Array.from(panelRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled)') || []);
        if (event.shiftKey && document.activeElement === elements[0]) { event.preventDefault(); elements.at(-1)?.focus(); }
        else if (!event.shiftKey && document.activeElement === elements.at(-1)) { event.preventDefault(); elements[0]?.focus(); }
      }
    }}>
      <header className="history-header"><div className="history-brand"><span className="history-brand-icon"><Layers3 size={19} /></span><div className="history-heading"><h2 id="batch-name-title">{mode === 'create' ? '新建批次' : '编辑批次名称'}</h2><span>{mode === 'create' ? '先命名，再开始这一轮制作' : '名称会同步到当前工作区和历史列表'}</span></div></div><button type="button" disabled={busy} onClick={onClose} aria-label="关闭命名窗口" className="history-icon-button"><X size={18} /></button></header>
      <form onKeyDown={event => { if (event.key === 'Enter' && event.nativeEvent.isComposing) event.preventDefault(); }} onSubmit={event => { event.preventDefault(); void submit(); }}>
        <div className="batch-name-body">{mode === 'create' && !reuseEmpty && <p id="batch-name-description">当前内容会保存到历史批次，之后可以随时复制续做。</p>}
          <label htmlFor="batch-name-input">批次名称 <span>{mode === 'create' ? '选填' : '必填'}</span></label>
          <input ref={inputRef} id="batch-name-input" value={name} maxLength={120} disabled={busy} onChange={event => { setName(event.target.value); setError(''); }} aria-invalid={invalid} aria-describedby="batch-name-hint" placeholder="例如：双11上新 · 手机主图 · 第一轮" />
          <div id="batch-name-hint" className={`batch-name-hint ${invalid ? 'history-warning' : ''}`}><span>{invalid ? '请输入 1–120 个字符' : mode === 'create' ? '留空将使用“未命名批次 · 日期”' : '建议使用活动、品类或制作轮次命名'}</span><span>{length}/120</span></div>
          {error && <p role="alert" className="history-action-error">{error}</p>}
        </div>
        <footer className="batch-name-footer"><button type="button" className="history-secondary-button" disabled={busy} onClick={onClose}>取消</button><button className="history-primary-button" disabled={busy || invalid || unchanged}>{busy ? '正在保存…' : mode === 'create' ? '开始制作' : '保存名称'}</button></footer>
      </form>
    </section>
  </div>, document.body);
}
