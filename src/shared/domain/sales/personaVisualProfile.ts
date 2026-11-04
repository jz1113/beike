import type { SalesAssetSlots } from './scriptTemplate';

export interface SalesPersonaVisualProfile {
  imageUrl: string;
  presence: Exclude<SalesAssetSlots['persona']['presence'], 'none'>;
  temperament: string;
  gaze: string;
  expression: string;
  posture: string;
  limitations: string;
}

/** Persist observations only with the image and visible scope that established them. */
export function parseSalesPersonaVisualProfile(value: unknown): SalesPersonaVisualProfile | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  if (typeof raw.imageUrl !== 'string' || !raw.imageUrl.trim() || raw.imageUrl.length > 8192
    || !['full_presenter', 'silent_model', 'hands_only'].includes(String(raw.presence))) return null;
  const fields = ['temperament', 'gaze', 'expression', 'posture', 'limitations'] as const;
  if (fields.some(field => typeof raw[field] !== 'string' || raw[field].length > 600)) return null;
  const text = Object.fromEntries(fields.map(field => [field, (raw[field] as string).trim()])) as Pick<SalesPersonaVisualProfile, typeof fields[number]>;
  if (raw.presence === 'hands_only') { text.gaze = ''; text.expression = ''; }
  if (![text.temperament, text.gaze, text.expression, text.posture].some(Boolean)) return null;
  return { imageUrl: raw.imageUrl.trim(), presence: raw.presence as SalesPersonaVisualProfile['presence'], ...text };
}

export function salesPersonaVisualFacts(profile: SalesPersonaVisualProfile | null | undefined, imageUrl: string, presence: SalesAssetSlots['persona']['presence']): string {
  profile = parseSalesPersonaVisualProfile(profile);
  if (!profile || profile.imageUrl !== imageUrl || profile.presence !== presence) return '';
  return ([['原图视觉气质', profile.temperament], ['原图视线', profile.gaze], ['原图表情', profile.expression],
    ['原图姿态', profile.posture], ['原图观察范围', profile.limitations]] as const)
    .filter(([, value]) => value.trim()).map(([label, value]) => `${label}：${value.trim()}`).join('\n');
}

export function salesPersonaVisualProfileError(profile: SalesPersonaVisualProfile | null | undefined, imageUrl: string, presence: SalesAssetSlots['persona']['presence']): string {
  if (!profile || presence === 'none') return '';
  return profile.imageUrl !== imageUrl || profile.presence !== presence
    ? '人物原图或出镜范围已变更，请重新改写分镜以更新视觉分析；原稿已保留。' : '';
}
