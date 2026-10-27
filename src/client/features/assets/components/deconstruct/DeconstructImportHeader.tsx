import { FolderOpen, Link2, X } from 'lucide-react';

export function DeconstructImportHeader({ mode, onModeChange, onClose, disabled = false }: {
  mode: 'xhs' | 'local';
  onModeChange: (mode: 'xhs' | 'local') => void;
  onClose: () => void;
  disabled?: boolean;
}) {
  return (
    <header className="deconstruct-import-header">
      <div className="deconstruct-heading">
        <h2 id="deconstruct-import-title">投喂参考图<span>素材与技能</span></h2>
        <p id="deconstruct-import-description">让喜欢的作品，成为下一次创作的参考。</p>
      </div>
      <div className="deconstruct-header-actions">
        <div className="deconstruct-source-tabs" role="tablist" aria-label="图集导入方式">
          {([{ id: 'xhs', label: '小红书链接', icon: Link2 }, { id: 'local', label: '本地图片', icon: FolderOpen }] as const).map(tab => (
            <button key={tab.id} id={`deconstruct-source-${tab.id}`} type="button" role="tab" aria-selected={mode === tab.id} aria-controls="deconstruct-source-panel"
              onClick={() => onModeChange(tab.id)}
              onKeyDown={event => {
                if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
                event.preventDefault();
                const nextMode = event.key === 'Home' ? 'xhs' : event.key === 'End' ? 'local' : mode === 'xhs' ? 'local' : 'xhs';
                onModeChange(nextMode);
                document.getElementById(`deconstruct-source-${nextMode}`)?.focus();
              }}
              tabIndex={mode === tab.id ? 0 : -1} disabled={disabled} className="deconstruct-source-tab">
              <tab.icon size={15} /><span>{tab.label}</span>
            </button>
          ))}
        </div>
        <button type="button" onClick={onClose} aria-label={disabled ? '收起图集导入，任务继续运行' : '关闭图集导入'}
          title={disabled ? '收起面板，已启动的后台任务继续运行' : '关闭'} className="deconstruct-icon-button deconstruct-close"><X size={18} /></button>
      </div>
    </header>
  );
}
