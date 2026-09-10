import type { PrismaClient } from '@prisma/client';
import { getHarmonizedStoryboardForScene, type StoryboardShotTemplate } from './prompt-engine/storyboard';

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
    sceneText,
    options?.isJewelry ?? true,
    false,
    options?.productFingerprint ?? ''
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

/** 按 sourceImageIndex 回填 ActionAsset.sceneId */
export async function backfillActionSceneLinks(
  prisma: Pick<PrismaClient, 'sceneAsset' | 'actionAsset'>,
): Promise<number> {
  const scenes = await prisma.sceneAsset.findMany({
    where: { sourceImageIndex: { not: null } },
    select: { id: true, sourceImageIndex: true },
  });

  const sceneByIndex = new Map<number, string>();
  for (const s of scenes) {
    if (s.sourceImageIndex !== null && !sceneByIndex.has(s.sourceImageIndex)) {
      sceneByIndex.set(s.sourceImageIndex, s.id);
    }
  }

  const unlinked = await prisma.actionAsset.findMany({
    where: { sceneId: null, sourceImageIndex: { not: null } },
    select: { id: true, sceneId: true, sourceImageIndex: true },
  });

  let updated = 0;
  for (const action of unlinked) {
    if (action.sourceImageIndex === null) continue;
    const sceneId = sceneByIndex.get(action.sourceImageIndex);
    if (!sceneId) continue;
    await prisma.actionAsset.update({
      where: { id: action.id },
      data: { sceneId },
    });
    updated++;
  }

  return updated;
}
