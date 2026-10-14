import type { AssetSubTab } from '../model/assetPromptConstants';
import DynamicTagDropdown from './DynamicTagDropdown';

const colors: Record<AssetSubTab, string> = {
  full_prompt: 'bg-indigo-50 border-indigo-300 text-indigo-900',
  persona: 'bg-amber-50 border-amber-300 text-amber-900',
  outfit: 'bg-sky-50 border-sky-300 text-sky-900',
  scene: 'bg-emerald-50 border-emerald-300 text-emerald-900',
  action: 'bg-purple-50 border-purple-300 text-purple-900',
};

export function AssetTagFilter({
  activeSubTab,
  dynamicTagList,
  selectedTag,
  setSelectedTag,
}: {
  activeSubTab: AssetSubTab;
  dynamicTagList: Array<{ tag: string; count: number }>;
  selectedTag: string | null;
  setSelectedTag: (tag: string | null) => void;
}) {
  if (activeSubTab === 'action' || dynamicTagList.length === 0) return null;
  return <DynamicTagDropdown selectedTag={selectedTag} tagList={dynamicTagList} activeColorClass={colors[activeSubTab]} onSelectTag={setSelectedTag} />;
}
