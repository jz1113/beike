import { useAssistantDialog } from './useAssistantDialog';
import AssistantRuntimeInfo from './panels/AssistantRuntimeInfo';
import AssistantSessionMenu from './panels/AssistantSessionMenu';
import { useEffect, useId, useRef, useState } from 'react';
import { ChevronDown, SlidersHorizontal, Minus, Minimize2, MessageSquarePlus, Maximize2, ListFilter } from 'lucide-react';

interface Props {
  sessionTitle: string;
  sessionsCount: number;
  isExpanded: boolean;
  isWorking?: boolean;
  onCreateSession: () => void;
  isCreatingDisabled?: boolean;
  isHistoryOpen: boolean;
  onToggleHistory: () => void;
  onCloseHistory: () => void;
  onOpenMemory?: () => void;
  onOpenSettings?: () => void;
  onToggleExpanded: () => void;
  onCloseAssistant: () => void;
}

export default function AssistantDrawerHeader(props: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [showRuntime, setShowRuntime] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const settingsDialog = useAssistantDialog(menuOpen, () => setMenuOpen(false));
  const historyRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLButtonElement>(null);
  const historyId = useId();
  const { isHistoryOpen, onCloseHistory } = props;
  const closeHistory = () => { props.onCloseHistory(); titleRef.current?.focus(); };
  const toggleHistory = () => { setMenuOpen(false); props.onToggleHistory(); };
  useEffect(() => {
    if (!isHistoryOpen) return;
    const outside = (e: MouseEvent) => { if (!historyRef.current?.contains(e.target as Node)) onCloseHistory(); };
    document.addEventListener('mousedown', outside);
    return () => document.removeEventListener('mousedown', outside);
  }, [isHistoryOpen, onCloseHistory]);
  useEffect(() => {
    if (!menuOpen) return;
    const close = (e: MouseEvent) => { if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false); };
    const escape = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); setMenuOpen(false); } };
    document.addEventListener('mousedown', close);
    menuRef.current?.addEventListener('keydown', escape);
    const menu = menuRef.current;
    return () => { document.removeEventListener('mousedown', close); menu?.removeEventListener('keydown', escape); };
  }, [menuOpen]);
  return <header className="agent-header">
    <div className="agent-identity agent-history-anchor" ref={historyRef} onBlur={e => { if (e.relatedTarget && !e.currentTarget.contains(e.relatedTarget)) props.onCloseHistory(); }} onKeyDown={e => {
      if (e.key === 'Escape' && props.isHistoryOpen) { e.stopPropagation(); e.preventDefault(); closeHistory(); }
    }}>
      <button ref={titleRef} className="agent-session-button" onClick={toggleHistory} aria-expanded={props.isHistoryOpen} aria-haspopup="dialog" aria-controls={props.isHistoryOpen ? historyId : undefined} title={`历史对话（${props.sessionsCount}）`} aria-label="历史对话">
        <ListFilter size={17} strokeWidth={1.6} /><span>{props.sessionTitle || '新对话'}</span><ChevronDown size={13} />
      </button>
      {props.isHistoryOpen && <AssistantSessionMenu id={historyId} onClose={closeHistory} />}
      {props.isWorking && <span className="agent-status working" role="status">处理中</span>}
    </div>
    <div className="agent-header-actions">
      <div className="relative" ref={menuRef}>
        <button className="agent-icon-button" aria-label="更多助手设置" aria-expanded={menuOpen} onClick={() => { props.onCloseHistory(); setMenuOpen(!menuOpen); }}><SlidersHorizontal size={16} strokeWidth={1.6} /></button>
        {menuOpen && <div ref={settingsDialog} role="dialog" aria-modal="false" tabIndex={-1} className="agent-popover agent-header-menu" aria-label="助手设置">
          {props.onOpenMemory && <button onClick={() => { setMenuOpen(false); props.onOpenMemory?.(); }}>会话记忆<span>查看与管理</span></button>}
          {props.onOpenSettings && <button onClick={() => { setMenuOpen(false); props.onOpenSettings?.(); }}>助手设置<span>模型与服务</span></button>}
          <button onClick={() => setShowRuntime(!showRuntime)} aria-expanded={showRuntime}>执行规则<span>{showRuntime ? '收起' : '预算与沙箱'}</span></button>
          {showRuntime && <AssistantRuntimeInfo />}
        </div>}
      </div>
      <button className="agent-icon-button" disabled={props.isCreatingDisabled} onClick={() => { setMenuOpen(false); props.onCloseHistory(); props.onCreateSession(); }} title={props.isCreatingDisabled ? '附件上传中，请稍候' : '新建对话'} aria-label="新建对话"><MessageSquarePlus size={17} strokeWidth={1.6} /></button>
      <button className="agent-icon-button agent-layout-button" onClick={props.onToggleExpanded} aria-pressed={props.isExpanded} aria-label={props.isExpanded ? '返回侧栏' : '进入专注模式'} title={props.isExpanded ? '返回侧栏' : '进入专注模式'}>
        {props.isExpanded ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
      </button>
      <button className="agent-icon-button" onClick={props.onCloseAssistant} title="收起助手，保留当前任务" aria-label="收起助手"><Minus size={18} strokeWidth={1.6} /></button>
    </div>
  </header>;
}
