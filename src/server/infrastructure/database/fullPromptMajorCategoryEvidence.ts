import type { Prisma } from '@prisma/client';
import { parseGroupShotSkeleton, sourcePromptSection } from '@shared/domain/workshop/workshopPipeline/storyboardSlots';

export const fullPromptMajorCategoryEvidenceSource = 'full-prompt-major-category-title-and-two-shots-v1';

const DIGITAL_SUBJECT = /手机(?:本体|壳|机身|背面|正面|镜头|屏幕)?|iPhone|Android|耳机|耳塞|平板|iPad|phone\s*case|earbuds|tablet/i;
const OTHER_SUBJECT = /项链|手链|手镯|戒指|耳环|耳饰|珠宝|首饰|鞋履|服饰|女装|男装|箱包|手袋/;

function hasRepeatedDigitalSubject(title: string, shotsJson: string | null): boolean {
  if (!DIGITAL_SUBJECT.test(title) || OTHER_SUBJECT.test(title)) return false;
  const shots = parseGroupShotSkeleton(shotsJson);
  if (shots.length !== 4) return false;
  return shots.filter(shot => {
    const subject = sourcePromptSection(shot.prompt || '', '主体');
    return DIGITAL_SUBJECT.test(subject);
  }).length >= 2;
}

/** Follow-up for groups whose phone/case subtype is ambiguous but major digital family is clear. */
export async function applyFullPromptMajorCategoryEvidence(db: Prisma.TransactionClient): Promise<void> {
  const groups = await db.$queryRawUnsafe<Array<{
    id: string; workspaceId: string; albumId: string | null; title: string;
    shotPromptsJson: string | null; productCategoryIds: string;
  }>>(`SELECT "id", "workspaceId", "albumId", "title", "shotPromptsJson", "productCategoryIds"
    FROM "FullPromptAsset" WHERE "productCategoryIds" = '[]' AND "provenance" <> 'legacy_single'`);
  const category = await db.$queryRawUnsafe<Array<{ workspaceId: string }>>(
    `SELECT "workspaceId" FROM "AssetProductCategory" WHERE "id" = 'digital_3c' AND "parentId" IS NULL`,
  );
  if (!category.length) return;
  const allowed = (workspaceId: string) => category[0].workspaceId === workspaceId || category[0].workspaceId === 'official';

  for (const group of groups) {
    if (!allowed(group.workspaceId) || !hasRepeatedDigitalSubject(group.title, group.shotPromptsJson)) continue;
    if (group.albumId) {
      const albums = await db.$queryRawUnsafe<Array<{ productCategoryId: string | null }>>(
        'SELECT "productCategoryId" FROM "PromptAlbum" WHERE "id" = ? AND "workspaceId" = ?',
        group.albumId, group.workspaceId,
      );
      if (!albums.length || (albums[0].productCategoryId && albums[0].productCategoryId !== 'digital_3c')) continue;
      const members = await db.$queryRawUnsafe<Array<{ id: string; productCategoryIds: string }>>(
        `SELECT "id", "productCategoryIds" FROM "FullPromptAsset"
          WHERE "albumId" = ? AND "workspaceId" = ? AND "provenance" <> 'legacy_single'`,
        group.albumId, group.workspaceId,
      );
      if (members.some(member => member.id !== group.id && member.productCategoryIds !== '["digital_3c"]')) continue;
      await db.$executeRawUnsafe(
        `UPDATE "PromptAlbum" SET "productCategoryId" = 'digital_3c'
          WHERE "id" = ? AND "workspaceId" = ? AND "productCategoryId" IS NULL`,
        group.albumId, group.workspaceId,
      );
    }
    await db.$executeRawUnsafe(
      `UPDATE "FullPromptAsset" SET "productCategoryIds" = '["digital_3c"]'
        WHERE "id" = ? AND "workspaceId" = ? AND "productCategoryIds" = '[]'`,
      group.id, group.workspaceId,
    );
  }
}
