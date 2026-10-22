import { SkillLibraryWorkspace } from '@client/shared/skills/components/SkillLibraryWorkspace';

export default function WorkshopRecipeView({ onEnterStudio }: { onEnterStudio: () => void }) {
  return <SkillLibraryWorkspace initialRuntime="workshop" onEnterWorkshop={onEnterStudio} />;
}
