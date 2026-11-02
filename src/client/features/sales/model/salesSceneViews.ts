import { audienceDimensions } from '@shared/domain/assets/appearanceAudience';
import type { SalesSceneCandidate } from '@shared/domain/sales';
import type { AssetViewSet } from './salesAssetViews';

export const SCENE_VIEWS = [
  { id: 'main', label: '主图', hint: '上传场景参考图' },
  { id: 'left', label: '左侧视角', hint: '从左侧观察同一场景' },
  { id: 'right', label: '右侧视角', hint: '从右侧观察同一场景' },
  { id: 'reverse', label: '反向视角', hint: '从对面回看同一场景' },
  { id: 'frontWide', label: '正面全景', hint: '正面展示完整空间' },
  { id: 'leftWide', label: '左侧全景', hint: '左侧展示空间全貌' },
  { id: 'rightWide', label: '右侧全景', hint: '右侧展示空间全貌' },
  { id: 'reverseLeft', label: '左后视角', hint: '从对面左侧回看空间' },
  { id: 'reverseRight', label: '右后视角', hint: '从对面右侧回看空间' },
  { id: 'detail', label: '局部细节', hint: '同一场景的材质与陈设细节' },
] as const;
export type SceneSupplementView = Exclude<typeof SCENE_VIEWS[number]['id'], 'main'>;
export type SceneViews = AssetViewSet<SceneSupplementView>['views'];

export function readSceneViews(scene?: SalesSceneCandidate): AssetViewSet<SceneSupplementView> {
  const saved = audienceDimensions(audienceDimensions(scene?.dimensions).sceneViews);
  const urls = [...new Set([scene?.coverUrl || '', ...(scene?.sourceImages || [])].filter(Boolean))];
  const views = Object.fromEntries(SCENE_VIEWS.map(({ id }) => [id, ''])) as SceneViews;
  for (const { id } of SCENE_VIEWS) views[id] = typeof saved[id] === 'string' ? saved[id].trim() : '';
  if (!Object.keys(saved).length) views.main = urls[0] || '';
  return { views, extraImages: urls.filter((url) => !Object.values(views).includes(url)) };
}

export function sceneImageFields(views: SceneViews, extraImages: string[], dimensions?: string) {
  return {
    coverUrl: views.main,
    sourceImages: JSON.stringify([...new Set([...SCENE_VIEWS.map(({ id }) => views[id]), ...extraImages].filter(Boolean))]),
    dimensions: JSON.stringify({ ...audienceDimensions(dimensions), sceneViews: views }),
  };
}
