import { getHarmonizedStoryboardForScene, type StoryboardShotTemplate } from '../prompts/prompt-engine/storyboard';

export interface SceneShot {
  id: string;
  title: string;
  action: string;
  camera?: string | null;
  angle?: string;
  shotType: string;
  shotOrder: number;
  provenance: string;
  sceneId?: string | null;
}

export interface SceneLike {
  id: string;
  title: string;
  description: string;
  lighting: string;
  category?: string;
  spatialType?: string;
}

export interface ActionLike {
  id: string;
  title: string;
  action: string;
  camera?: string | null;
  shotType: string;
  shotOrder?: number;
  provenance?: string;
  sceneId?: string | null;
  sourceImageIndex?: number | null;
}

export function buildSceneText(scene: Pick<SceneLike, 'title' | 'description'>): string {
  return `${scene.title}，${scene.description}`.trim();
}

export function harmonizedTemplatesToShots(
  sceneId: string,
  templates: StoryboardShotTemplate[]
): SceneShot[] {
  return templates.slice(0, 4).map((t, idx) => ({
    id: `harmonized-${sceneId}-${idx + 1}`,
    title: t.title,
    action: t.action,
    camera: t.camera,
    angle: t.angle,
    shotType: t.shotType,
    shotOrder: idx + 1,
    provenance: 'harmonized',
    sceneId,
  }));
}

export function actionRecordsToShots(actions: ActionLike[]): SceneShot[] {
  return [...actions]
    .sort((a, b) => (a.shotOrder ?? 0) - (b.shotOrder ?? 0) || a.title.localeCompare(b.title))
    .slice(0, 4)
    .map((a, idx) => ({
      id: a.id,
      title: a.title,
      action: a.action,
      camera: a.camera,
      angle: a.title,
      shotType: a.shotType,
      shotOrder: a.shotOrder && a.shotOrder > 0 ? a.shotOrder : idx + 1,
      provenance: a.provenance || 'manual',
      sceneId: a.sceneId,
    }));
}

/** 分镜解析：DB 关联 actions 优先，否则 harmonized fallback */
export function resolveShotsForScene(
  scene: SceneLike,
  linkedActions: ActionLike[] = [],
  options?: { isJewelry?: boolean; productFingerprint?: string }
): SceneShot[] {
  if (linkedActions.length > 0) {
    return actionRecordsToShots(linkedActions);
  }

  const sceneText = buildSceneText(scene);
  const templates = getHarmonizedStoryboardForScene(
    sceneText, false, options?.productFingerprint ?? ''
  );
  return harmonizedTemplatesToShots(scene.id, templates);
}

export function formatSceneSpaceSnippet(scene: Pick<SceneLike, 'title' | 'description' | 'lighting'>): string {
  return `【场景空间】：${scene.title}，${scene.description}；【采光光影】：${scene.lighting}`;
}

export function formatShotSnippet(shot: Pick<SceneShot, 'title' | 'action' | 'shotOrder'>, index?: number): string {
  const order = shot.shotOrder || (index !== undefined ? index + 1 : 1);
  return `【分镜${order}·${shot.title}】：${shot.action}`;
}

/** 整套置景分镜应用文本 */
export function formatSceneBundleApplyText(
  scene: Pick<SceneLike, 'title' | 'description' | 'lighting'>,
  shots: SceneShot[]
): string {
  const scenePart = formatSceneSpaceSnippet(scene);
  const shotParts = shots.map((s, idx) => formatShotSnippet(s, idx));
  return [scenePart, ...shotParts].join('\n');
}

/** 单镜应用：场景 + 选定分镜 */
export function formatSingleShotApplyText(
  scene: Pick<SceneLike, 'title' | 'description' | 'lighting'>,
  shot: SceneShot
): string {
  return `${formatSceneSpaceSnippet(scene)}\n${formatShotSnippet(shot)}`;
}

