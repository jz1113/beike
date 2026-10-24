import { getBuiltinPackages } from './builtinPackages';

export const PROMPT_REVERSE_ENGINEER_SKILL_ID = 'prompt-reverse-engineer';

export const BUILTIN_IMAGE_ASSISTANT_SKILLS = getBuiltinPackages([
  'prompt-reverse-engineer',
  'gpt-image2-prompt-copilot',
  'banana-prompt-copilot',
  'headline-poster-generator',
]);
