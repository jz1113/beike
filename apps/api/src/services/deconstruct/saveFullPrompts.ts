import { db } from '../../repositories/access';
import { ensurePromptAlbum } from '@beike/server-kit/assetOrganization';
import type { ContentPromptGroup, PerImageResult } from '@beike/domain/assetDeconstruct/prompts';

const MAX_IMAGES_PER_CONTENT_GROUP = 4;
type RawGroup = Partial<ContentPromptGroup> & Record<string, unknown>;

function asImageIndices(value: unknown, max: number): number[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((n): n is number => Number.isInteger(n) && n >= 1 && n <= max))]
    .sort((a, b) => a - b);
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function summarizePersona(images: PerImageResult[]): string {
  const person = images.find((image) => image.persona)?.persona;
  return person ? [person.hair, person.face, person.skin, person.vibe].filter(Boolean).join('；') : '';
}

function summarizeOutfit(images: PerImageResult[]): string {
  const outfit = images.find((image) => image.outfit)?.outfit;
  return outfit
    ? [outfit.top, outfit.bottom, outfit.shoes, outfit.accessories, outfit.color_palette].filter(Boolean).join('；')
    : '';
}

function summarizeScene(images: PerImageResult[], declared?: RawGroup): string {
  const groupScene = text(declared?.scene_summary ?? declared?.sceneSummary);
  if (groupScene) return groupScene;
  const scene = images.find((image) => image.scene)?.scene;
  return scene ? [scene.description, scene.lighting].filter(Boolean).join('；') : '';
}

function buildArchitecture(images: PerImageResult[], declared?: RawGroup): string {
  const declaredArchitecture = text(declared?.architecture_summary ?? declared?.architectureSummary);
  if (declaredArchitecture) return declaredArchitecture;
  return images.map((image, index) => {
    const framing = image.shot_framing || image.action?.shot_type || '生活化镜头';
    const action = image.action?.action || image.dimensions?.action_pose || '保持参考图中的动作/摆放关系';
    return `图${index + 1}（原图#${image.image_index}）：${framing}；${action}`;
  }).join('\n');
}

/** 先采用视觉模型的语义分组；异常时按连续顺序兜底，永远不超过四图一组。 */
function normalizeContentGroups(perImageResults: PerImageResult[], rawGroups: unknown) {
  const imageIndices = perImageResults.map((image) => image.image_index).sort((a, b) => a - b);
  const available = new Set(imageIndices);
  const used = new Set<number>();
  const groups: Array<{ indices: number[]; declared?: RawGroup }> = [];

  if (Array.isArray(rawGroups)) {
    for (const raw of rawGroups) {
      if (!raw || typeof raw !== 'object') continue;
      const declared = raw as RawGroup;
      const indices = asImageIndices(
        declared.source_image_indices ?? declared.sourceImageIndices,
        Math.max(...imageIndices, 0),
      ).filter((index) => available.has(index) && !used.has(index));
      for (let start = 0; start < indices.length; start += MAX_IMAGES_PER_CONTENT_GROUP) {
        const chunk = indices.slice(start, start + MAX_IMAGES_PER_CONTENT_GROUP);
        chunk.forEach((index) => used.add(index));
        if (chunk.length > 0) groups.push({ indices: chunk, declared });
      }
    }
  }
  const remaining = imageIndices.filter((index) => !used.has(index));
  for (let start = 0; start < remaining.length; start += MAX_IMAGES_PER_CONTENT_GROUP) {
    groups.push({ indices: remaining.slice(start, start + MAX_IMAGES_PER_CONTENT_GROUP) });
  }
  return groups.sort((a, b) => a.indices[0] - b.indices[0]);
}

function buildGroupPrompt(params: {
  contentSummary: string;
  sceneSummary: string;
  architectureSummary: string;
  images: PerImageResult[];
}) {
  const { contentSummary, sceneSummary, architectureSummary, images } = params;
  return [
    contentSummary ? `【整条内容总结】${contentSummary}` : '',
    sceneSummary ? `【本组唯一场景】${sceneSummary}` : '',
    architectureSummary ? `【固定图组架构】${architectureSummary}` : '',
    '【图组分镜提示词】',
    ...images.map((image, index) => `图${index + 1}（原图#${image.image_index}）：\n${image.reverse_prompt_zh || image.reverse_prompt || ''}`),
  ].filter(Boolean).join('\n\n');
}

function buildGroupShots(images: PerImageResult[], sceneSummary: string) {
  return images.map((image, index) => ({
    shot_no: index + 1,
    title: image.title || `图组分镜 ${index + 1}`,
    prompt: image.reverse_prompt_zh || image.reverse_prompt || '',
    scene: sceneSummary,
    action: image.action?.action || image.dimensions?.action_pose || '',
    optics: image.dimensions?.camera_language || '',
    camera_focal_length: image.dimensions?.focal_length || '',
    angle: image.dimensions?.composition || '',
    lighting_type: image.dimensions?.lighting || '',
    has_human: image.has_human !== false,
    shot_type: image.has_human === false ? 'pure_product' : 'model_shot',
    selected: true,
  }));
}

export async function persistFullPromptRecords(params: {
  parsedResult: Record<string, unknown>;
  perImageResults: PerImageResult[];
  imageUrls: string[];
  albumName: string;
  category: string;
  productCategoryId?: string | null;
  sourceKey?: string;
  sampleImagesJson: string;
  thumbForUrl: (url: string) => Promise<string>;
  defaultCoverUrl: string;
}) {
  const { parsedResult, perImageResults, imageUrls, albumName, category, productCategoryId, sourceKey, sampleImagesJson, thumbForUrl, defaultCoverUrl } = params;
  let albumId: string | null = null;
  if (sourceKey) {
    const rows = await db.$queryRaw<{ albumId: string | null }[]>`SELECT "albumId" FROM "PromptImportSource" WHERE "sourceKey" = ${sourceKey}`;
    albumId = rows[0]?.albumId || null;
  }
  const album = albumId
    ? await db.promptAlbum.findUnique({ where: { id: albumId } })
    : await ensurePromptAlbum(db, { albumName, sourceImages: JSON.stringify(imageUrls), productCategoryIds: productCategoryId ? JSON.stringify([productCategoryId]) : '[]' });
  if (!album) throw new Error('图集不存在');
  if (album.name !== albumName) await db.promptAlbum.update({ where: { id: album.id }, data: { name: albumName } });

  const productCategoryIds = JSON.stringify(album.productCategoryId ? [album.productCategoryId] : (productCategoryId ? [productCategoryId] : []));
  const contentSummary = text(parsedResult.content_summary ?? parsedResult.contentSummary) || `${albumName}：按连续图组复用的种草内容架构。`;
  const normalizedGroups = normalizeContentGroups(perImageResults, parsedResult.content_groups ?? parsedResult.contentGroups);
  const saved: any[] = [];

  for (const [offset, group] of normalizedGroups.entries()) {
    const groupIndex = offset + 1;
    const images = group.indices.map((index) => perImageResults.find((image) => image.image_index === index)).filter((image): image is PerImageResult => Boolean(image));
    if (images.length === 0) continue;
    const sceneSummary = summarizeScene(images, group.declared);
    const architectureSummary = buildArchitecture(images, group.declared);
    const hasHuman = group.declared?.has_human === false ? false : images.some((image) => image.has_human !== false);
    const replaceableSlots = JSON.stringify({
      persona: hasHuman ? 'group_replaceable' : 'not_applicable',
      outfit: hasHuman ? 'group_replaceable' : 'not_applicable',
      scene: 'group_replaceable',
      locked: ['scene_continuity', 'shot_order', 'framing', 'camera_position', 'action_or_placement'],
    });
    const firstImageIndex = group.indices[0];
    const coverUrl = await thumbForUrl(imageUrls[firstImageIndex - 1] || defaultCoverUrl);
    const existing = await db.fullPromptAsset.findFirst({ where: { albumId: album.id, groupIndex } });
    const shared = {
      title: text(group.declared?.title) || `${albumName} · 图组 ${groupIndex}`,
      albumName, albumId: album.id,
      reversePromptZh: buildGroupPrompt({ contentSummary, sceneSummary, architectureSummary, images }),
      sourceImageIndex: firstImageIndex,
      sourceImageIndices: JSON.stringify(group.indices),
      groupIndex, contentSummary, architectureSummary, replaceableSlots,
      shotPromptsJson: JSON.stringify(buildGroupShots(images, sceneSummary)),
      coverUrl: coverUrl || existing?.coverUrl || defaultCoverUrl,
      sourceImages: sampleImagesJson,
      hasHuman, sceneSummary, outfitSummary: summarizeOutfit(images),
      actionSummary: images.map((image) => image.action?.action).filter(Boolean).join('；'),
      personaSummary: hasHuman ? summarizePersona(images) : '本组无人物，不调用人物与穿搭槽位',
      category, productCategoryIds, provenance: 'deconstructed' as const,
    };
    saved.push(existing
      ? await db.fullPromptAsset.update({ where: { id: existing.id }, data: shared })
      : await db.fullPromptAsset.create({ data: shared }));
  }
  return { album, fullPrompts: saved };
}
