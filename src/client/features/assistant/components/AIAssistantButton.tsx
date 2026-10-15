import { useShallow } from 'zustand/react/shallow';
import { useAppStore } from '@client/store';
import AssistantMark from './AssistantMark';
import '../assistantWorkspace.css';

export default function AIAssistantButton() {
  const { isOpen, setOpen, view } = useAppStore(useShallow(s => ({ isOpen: s.isAssistantOpen, setOpen: s.setIsAssistantOpen, view: s.currentView })));
  if (isOpen || view === 'home') return null;
  return <div className={`agent-launcher-wrap fixed right-5 z-50 select-none ${view === 'generate' ? 'bottom-[calc(var(--prompt-dock-h,11rem)+0.75rem)]' : 'bottom-5'}`}>
    <button type="button" data-testid="ai-assistant-button" onClick={() => setOpen(true)}
      className="agent-launcher" aria-label="打开贝壳云图 AI 助手">
      <AssistantMark />
    </button>
  </div>;
}
