/** Collapse alternate shots of the same physical setting without deleting their assets. */
export interface ScenePresentationAsset {
  id: string;
  title?: string | null;
  description?: string | null;
  spatialType?: string | null;
  sceneSourceKey?: unknown;
  coverUrl?: string | null;
  isFavorite?: boolean;
  usageCount?: number;
  registry?: { status?: string; [key: string]: unknown } | null;
  lifecycleStatus?: string;
}

const BACKDROP_RE = /(?:深蓝黑|蓝黑|蓝紫|黑色|深色|浅灰|灰白|白色|浅色|米白|奶白|木纹|木质|棕色|灰色)[^，。；]{0,12}(?:桌面|桌垫|工作台|台面)/;
const GENERIC_TITLE_RE = /^(?:实景拍摄环境空间|室内场景|生活场景|拍摄场景|产品展示空间)$/;

function physicalSetting(asset: ScenePresentationAsset): string {
  const text = `${asset.title || ''} ${asset.description || ''}`;
  const backdrop = text.match(BACKDROP_RE)?.[0] || '';
  if (backdrop) {
    const surface = /桌垫/.test(backdrop) ? 'desk' : /桌面|工作台|台面/.test(backdrop) ? 'desk' : '';
    const color = /黑|深蓝|蓝紫|深色/.test(backdrop) ? 'dark'
      : /木纹|木质|棕色/.test(backdrop) ? 'wood'
        : /白|浅|米|奶/.test(backdrop) ? 'light'
          : /灰/.test(backdrop) ? 'gray' : '';
    if (surface && color) return `${surface}:${color}`;
  }
  return '';
}

function normalized(value: string | null | undefined): string {
  return String(value || '').trim().toLocaleLowerCase().replace(/[\s，,。.；;：:]+/g, '');
}

function sceneIdentity(asset: ScenePresentationAsset): string {
  const title = normalized(asset.title);
  const description = normalized(asset.description);
  const source = typeof asset.sceneSourceKey === 'string' ? asset.sceneSourceKey : '';
  const setting = physicalSetting(asset);
  if (source && setting) return `setting:${source}:${normalized(asset.spatialType)}:${setting}`;
  if (source && title && !GENERIC_TITLE_RE.test(String(asset.title || '').trim())) {
    return `title:${source}:${normalized(asset.spatialType)}:${title}`;
  }
  // A broad model fallback title can describe unrelated rooms, so it never
  // identifies a scene by itself. Exact content is still safe to fold.
  if (title && description) return `exact:${title}:${description}`;
  return `asset:${asset.id}`;
}

function representativeScore(asset: ScenePresentationAsset): number {
  const title = String(asset.title || '').trim();
  const status = asset.registry?.status || asset.lifecycleStatus;
  return Number(status === 'published') * 1500
    + Number(Boolean(asset.isFavorite)) * 1000
    + Number(Boolean(asset.coverUrl)) * 100
    + Number(Boolean(title && !GENERIC_TITLE_RE.test(title))) * 50
    + Math.min(title.length, 40)
    + Math.min(asset.usageCount || 0, 20);
}

/** One visible card per recognizable setting; original IDs remain available to saved work. */
export function uniqueSceneAssets<T extends ScenePresentationAsset>(assets: T[], preferredId?: string): T[] {
  const result: T[] = [];
  const indexByIdentity = new Map<string, number>();
  for (const asset of assets) {
    const identity = sceneIdentity(asset);
    const index = indexByIdentity.get(identity);
    if (index === undefined) {
      indexByIdentity.set(identity, result.length);
      result.push(asset);
    } else if ((asset.id === preferredId ? 10_000 : representativeScore(asset))
      > (result[index].id === preferredId ? 10_000 : representativeScore(result[index]))) {
      result[index] = asset;
    }
  }
  return result;
}
