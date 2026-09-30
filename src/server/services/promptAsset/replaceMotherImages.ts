import type { PerImageResult } from '@shared/domain/assets/assetDeconstruct/prompts';
import { parseGroupShotSkeleton } from '@shared/domain/workshop/workshopPipeline';
import { AppError } from '@server/core/errors';
import { createCompactSourceImagesJson, createCompactThumbnailDataUrl } from '@server/infrastructure/media/imageConverter';
import {
  buildArchitecture, buildGroupPrompt, buildGroupShots, summarizeOutfit,
  summarizePersona, summarizeScene,
} from '@server/repositories/deconstructFullPrompts';
import { commitMotherReplacement, findMotherReplacement, findReplaceableMother, MotherReplacementReviewConflict } from '@server/repositories/motherGroupReplacement';

type ReviewPayload = {
  fullPromptOnly?: boolean;
  parentFullPromptId?: string | null;
  imageUrls?: string[];
  perImageResults?: PerImageResult[];
  parsedResult?: Record<string, unknown>;
};

export async function replaceMotherImages(reviewId: string, payload: ReviewPayload, reviewStatus: 'pending' | 'approved') {
  const motherId = payload.parentFullPromptId || '';
  if (!payload.fullPromptOnly || !motherId) throw new AppError('换图候选没有关联来源母组', 400, 'missing_mother');
  const existing = await findMotherReplacement(motherId);
  if (existing) {
    if (existing.reviewId === reviewId) return { motherId, alreadyReplaced: true };
    throw new AppError('此母组已完成一次换图，不能再次覆盖', 409, 'mother_already_replaced');
  }
  if (reviewStatus !== 'pending') {
    throw new AppError('此候选已作为衍生母本入库，不能再替换来源母组', 409, 'review_already_approved');
  }
  const mother = await findReplaceableMother(motherId);
  if (!mother) throw new AppError('来源母组不存在或不属于当前工作区', 404, 'mother_not_found');
  if (mother.provenance === 'workshop_generated') {
    throw new AppError('生成的衍生母组已使用原创成图，无需替换', 409, 'generated_mother');
  }
  const urls = payload.imageUrls || [];
  const images = (payload.perImageResults || []).slice().sort((a, b) => a.image_index - b.image_index);
  const groups = payload.parsedResult?.content_groups;
  const group = Array.isArray(groups) && groups.length === 1 ? groups[0] as Record<string, unknown> : null;
  if (urls.length !== 4 || images.length !== 4 || !group
    || images.some((image, index) => image.image_index !== index + 1 || !image.reverse_prompt_zh?.trim())
    || urls.some(url => !/^https?:\/\/|^\/(?!\/)/.test(url))) {
    throw new AppError('换图必须是四张完整、可长期访问且已重新分析的成图', 422, 'incomplete_generated_group');
  }
  const oldShots = parseGroupShotSkeleton(mother.shotPromptsJson);
  const sceneSummary = summarizeScene(images, group);
  const newShots = buildGroupShots(images, sceneSummary);
  const normalizedNewShots = parseGroupShotSkeleton(newShots);
  if (oldShots.length !== 4 || normalizedNewShots.length !== 4
    || oldShots.some((shot, index) => shot.has_human !== normalizedNewShots[index].has_human
      || shot.shot_type !== normalizedNewShots[index].shot_type)) {
    throw new AppError('新图的人物／静物镜头顺序与母组不一致，请改为新增衍生母组', 422, 'shot_structure_mismatch');
  }
  const [sourceImages, coverUrl] = await Promise.all([
    createCompactSourceImagesJson(urls, 320), createCompactThumbnailDataUrl(urls[0], 320),
  ]);
  if (!sourceImages || !coverUrl) throw new AppError('新图缩略图保存失败，未替换母组', 422, 'image_not_available');
  const summary = String(payload.parsedResult?.content_summary || '').trim();
  const architectureSummary = buildArchitecture(images, group);
  let committed: boolean;
  try {
    committed = await commitMotherReplacement({
      motherAssetId: motherId, reviewId, generatedImageUrls: urls,
      update: {
        sourceImages, coverUrl, sourceImageIndex: 1,
        sourceImageIndices: JSON.stringify([1, 2, 3, 4]),
        reversePromptZh: buildGroupPrompt({ contentSummary: summary, sceneSummary, architectureSummary, images }),
        shotPromptsJson: JSON.stringify(newShots), contentSummary: summary,
        architectureSummary, sceneSummary,
        personaSummary: summarizePersona(images), outfitSummary: summarizeOutfit(images),
        actionSummary: images.map(image => image.action?.action).filter(Boolean).join('；'),
      },
    });
  } catch (error) {
    if (error instanceof MotherReplacementReviewConflict) {
      throw new AppError(error.message, 409, 'review_status_changed');
    }
    throw error;
  }
  if (!committed) throw new AppError('此母组已完成换图，或候选状态已变化', 409, 'mother_already_replaced');
  return { motherId, alreadyReplaced: false };
}
