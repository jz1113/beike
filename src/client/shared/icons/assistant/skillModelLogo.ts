import type { AssistantSkill } from '@shared/domain/assistant/skills/types';
import { getModelLogoDataUri } from '@client/shared/ui/ModelIcons';
import wanLogo from '@client/assets/model-logos/wan.ico';

/** The iframe uses the same bundled brand assets as the Skill library. */
export function skillModelLogo(skill?: Pick<AssistantSkill,'modelIcon'>):string|undefined {
  if(!skill?.modelIcon)return;
  return skill.modelIcon.startsWith('wan')?wanLogo:getModelLogoDataUri(skill.modelIcon,true) || undefined;
}
