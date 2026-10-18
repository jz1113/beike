export type AvatarDriverFamily = 'kling' | 'omnihuman' | 'wanx' | 'hedra' | 'latentsync' | 'generic';
export type AvatarDriverInput = 'image' | 'video' | 'either';

export interface AvatarDriverSpec {
  family: AvatarDriverFamily;
  input: AvatarDriverInput;
}

const RULES: Array<{ family: AvatarDriverFamily; input: AvatarDriverInput; test: RegExp }> = [
  { family: 'omnihuman', input: 'image', test: /omnihuman|omni-human/ },
  { family: 'kling', input: 'either', test: /kling.*(lip|avatar|ident)|(lip|avatar|ident).*kling/ },
  { family: 'wanx', input: 'either', test: /wanx-avatar|videoretalk|wan2\.2-s2v|emo-v|emo-detect/ },
  { family: 'hedra', input: 'image', test: /hedra/ },
  { family: 'latentsync', input: 'video', test: /latentsync|musetalk/ },
  { family: 'generic', input: 'either', test: /lip-?sync|digital-human|口型|数字人/ },
];

export function classifyAvatarDriver(modelId: string): AvatarDriverSpec | null {
  const id = modelId.trim().toLowerCase();
  if (!id) return null;
  const matched = RULES.find((rule) => rule.test.test(id));
  return matched ? { family: matched.family, input: matched.input } : null;
}

export function isAvatarDriverModel(modelId: string): boolean {
  return classifyAvatarDriver(modelId) !== null;
}

export function avatarMediaKind(url: string): 'image' | 'video' {
  const path = url.split('?')[0].toLowerCase();
  if (/\.(png|jpe?g|webp|gif|avif)$/.test(path)) return 'image';
  return 'video';
}
