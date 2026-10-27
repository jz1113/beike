import { FolderOpen, Images, SearchX } from 'lucide-react';
import type { AssetSubTab } from '../../model/assetPromptConstants';
import { promptLibraryEmptyCopy } from '../../model/promptLibraryEmptyCopy';

export function AssetLibraryEmptyState({ tab, filtered, folderName, onClearFilters, onBrowseAll, onFeedReference }: {
  tab: AssetSubTab;
  filtered: boolean;
  folderName?: string;
  onClearFilters: () => void;
  onBrowseAll: () => void;
  onFeedReference: () => void;
}) {
  const copy = promptLibraryEmptyCopy(tab, filtered, folderName);
  const Icon = filtered ? SearchX : Images;
  return <div role="status" className="asset-library-empty">
    <div className="asset-empty-icon"><Icon size={28} strokeWidth={1.5} /></div>
    <h3>{copy.title}</h3>
    <p>{copy.body}</p>
    <div className="asset-empty-actions">
      <button type="button" onClick={filtered ? onClearFilters : onFeedReference} className="asset-primary-button">
        {!filtered && <FolderOpen size={14} />}{filtered ? '清除筛选' : '投喂参考图'}
      </button>
      {folderName && <button type="button" onClick={onBrowseAll} className="asset-secondary-button">查看全部母本</button>}
    </div>
    {!filtered && tab === 'full_prompt' && <div className="asset-empty-steps" aria-label="母本积累流程">
      <span><b>1</b>投喂参考图</span><i>→</i><span><b>2</b>反推并归档</span><i>→</i><span><b>3</b>提炼创作技能</span>
    </div>}
  </div>;
}
