import { REVERSE_ENGINE_CORE_SPEC } from '../../assets/assetDeconstruct/prompts';

const BUILTIN_REFERENCE_CONTENT: Record<string, string> = {
  'assetDeconstruct/REVERSE_ENGINE_CORE_SPEC': REVERSE_ENGINE_CORE_SPEC,
};

export function resolveSkillReferenceContent(path: string): string | null {
  const key = path.trim();
  if (!key) return null;
  return BUILTIN_REFERENCE_CONTENT[key] ?? null;
}
