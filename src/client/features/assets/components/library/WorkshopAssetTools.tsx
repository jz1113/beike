import { useState } from 'react';
import { CategorySkillsDialog } from '../folders/CategorySkillsDialog';
import AssetPromptLibrary, { type ReferenceTarget } from './AssetPromptLibrary';

export default function WorkshopAssetTools({ skillsOpen, onCloseSkills, onBrowseReferences, navigationTarget }: {
  skillsOpen: boolean;
  onCloseSkills: () => void;
  onBrowseReferences: () => void;
  navigationTarget: HTMLElement | null;
}) {
  const [target, setTarget] = useState<ReferenceTarget | null>(null);
  const browse = (next: ReferenceTarget) => { setTarget(next); onBrowseReferences(); };
  return skillsOpen
    ? <CategorySkillsDialog onClose={onCloseSkills} onBrowse={(category, subcategory) => browse({ category, subcategory })}
        onPreview={previewId => browse({ previewId })} />
    : <AssetPromptLibrary initialTarget={target} navigationTarget={navigationTarget} />;
}
