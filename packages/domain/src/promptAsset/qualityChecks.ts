export type QualityCheckSeverity = 'block' | 'warn';

export interface QualityCheck {
  code: string;
  message: string;
  severity: QualityCheckSeverity;
}

export interface StoryboardQualityInput {
  productTitle?: string;
  productFingerprint?: string;
  personaMode?: 'asset_driven' | 'none';
  shots: Array<{
    shotNo: number;
    prompt: string;
    actionId?: string;
    shotType?: string;
    hasHuman?: boolean;
    personaId?: string;
    sceneId?: string;
    outfitId?: string;
    camera?: string;
    expectedCamera?: string;
    cameraFromAsset?: boolean;
  }>;
}

const SHOT_TYPES = ['macro_closeup', 'half_body', 'full_body', 'detail'];

export function evaluateStoryboardQuality(input: StoryboardQualityInput): QualityCheck[] {
  return [
    ...checkProductAnchor(input),
    ...checkActionRepeat(input),
    ...checkShotCoverage(input),
    ...checkPersonaConsistency(input),
    ...checkPureProductRule(input),
    ...checkSameScene(input),
    ...checkSameOutfit(input),
    ...checkCameraRewrite(input),
  ];
}

export function checkProductAnchor(input: StoryboardQualityInput): QualityCheck[] {
  const tokens = [input.productTitle, input.productFingerprint]
    .filter((value): value is string => Boolean(value && value.trim()))
    .flatMap((value) => value.split(/[\s,，、/]+/).filter((token) => token.length >= 2));
  if (tokens.length === 0) {
    return [{ code: 'PRODUCT_ANCHOR_MISSING', message: '缺少商品锚点，无法校验商品还原', severity: 'warn' }];
  }
  const missing = input.shots.filter((shot) => {
    if (/@图片\s*1/.test(shot.prompt)) return false;
    return !tokens.some((token) => shot.prompt.includes(token));
  });
  if (missing.length === 0) return [];
  return [{
    code: 'PRODUCT_ANCHOR_WEAK',
    message: `有 ${missing.length} 镜提示词未覆盖商品锚点`,
    severity: missing.length === input.shots.length ? 'block' : 'warn',
  }];
}

export function checkActionRepeat(input: StoryboardQualityInput): QualityCheck[] {
  const ids = input.shots.map((shot) => shot.actionId).filter((id): id is string => Boolean(id));
  const unique = new Set(ids);
  if (ids.length > 1 && unique.size < ids.length) {
    return [{ code: 'ACTION_REPEAT', message: '同组动作重复，缺少镜头变化', severity: 'warn' }];
  }
  return [];
}

export function checkSameScene(input: StoryboardQualityInput): QualityCheck[] {
  const ids = input.shots.map((shot) => shot.sceneId).filter((id): id is string => Boolean(id));
  if (ids.length > 1 && new Set(ids).size > 1) {
    return [{ code: 'SCENE_INCONSISTENT', message: '同组场景不一致', severity: 'block' }];
  }
  return [];
}

export function checkSameOutfit(input: StoryboardQualityInput): QualityCheck[] {
  const ids = input.shots
    .filter((shot) => shot.hasHuman !== false)
    .map((shot) => shot.outfitId)
    .filter((id): id is string => Boolean(id));
  if (ids.length > 1 && new Set(ids).size > 1) {
    return [{ code: 'OUTFIT_INCONSISTENT', message: '同组穿搭不一致', severity: 'block' }];
  }
  return [];
}

export function checkCameraRewrite(input: StoryboardQualityInput): QualityCheck[] {
  const rewritten = input.shots.filter((shot) => (
    shot.cameraFromAsset
    && shot.expectedCamera
    && shot.camera
    && shot.camera !== shot.expectedCamera
  ));
  if (rewritten.length === 0) return [];
  return [{ code: 'CAMERA_REWRITTEN', message: `有 ${rewritten.length} 镜资产机位被模板改写`, severity: 'warn' }];
}

export function checkShotCoverage(input: StoryboardQualityInput): QualityCheck[] {
  const types = new Set(input.shots.map((shot) => normalizeShotType(shot.shotType)).filter(Boolean));
  if (input.shots.length >= 3 && types.size < 2) {
    return [{ code: 'SHOT_COVERAGE_NARROW', message: '景别覆盖不足，建议补充特写或半身', severity: 'warn' }];
  }
  return [];
}

export function checkPersonaConsistency(input: StoryboardQualityInput): QualityCheck[] {
  if (input.personaMode === 'none') return [];
  const personaIds = new Set(input.shots.map((shot) => shot.personaId).filter(Boolean));
  if (personaIds.size > 1) {
    return [{ code: 'PERSONA_INCONSISTENT', message: '同组人物身份不一致', severity: 'block' }];
  }
  return [];
}

export function checkPureProductRule(input: StoryboardQualityInput): QualityCheck[] {
  if (input.personaMode !== 'none') return [];
  const humanShots = input.shots.filter((shot) => shot.hasHuman);
  if (humanShots.length > 0) {
    return [{ code: 'PURE_PRODUCT_HUMAN', message: '纯商品方案中出现人物出镜', severity: 'block' }];
  }
  return [];
}

function normalizeShotType(value?: string): string {
  const lower = String(value || '').toLowerCase();
  if (SHOT_TYPES.includes(lower)) return lower;
  if (lower.includes('macro') || lower.includes('close')) return 'macro_closeup';
  if (lower.includes('half')) return 'half_body';
  if (lower.includes('full')) return 'full_body';
  return lower;
}

export function blockingIssueCount(checks: QualityCheck[]): number {
  return checks.filter((check) => check.severity === 'block').length;
}
