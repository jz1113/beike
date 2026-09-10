import { PrismaClient } from '@prisma/client';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import { sanitizeActionPrompt, sanitizeActionTitle } from '../../../app/shared/src/assetDeconstruct/validate';
import { extractActionCategories, extractActionFocusAnchors } from '../../../app/shared/src/productCategoryHelpers';

async function main() {
  const desktopDbPath = path.join(
    os.homedir(),
    'Library/Application Support/com.azhuo.workbench/azhuo.db'
  );

  const devDbPath = path.resolve(process.cwd(), 'db/prisma/dev.db');
  const dbUrls = [
    process.env.DATABASE_URL,
    fs.existsSync(desktopDbPath) ? `file:${desktopDbPath}` : null,
    fs.existsSync(devDbPath) ? `file:${devDbPath}` : null,
  ].filter(Boolean) as string[];

  const uniqueDbUrls = Array.from(new Set(dbUrls));
  console.log(`[CleanAssets] 找到待检查数据库路径:`, uniqueDbUrls);

  for (const url of uniqueDbUrls) {
    console.log(`\n================= 正在清洗数据库: ${url} =================`);
    const prisma = new PrismaClient({
      datasources: {
        db: { url },
      },
    });

    try {
      // 1. 清洗 Action 动作资产
      const actions = await prisma.actionAsset.findMany();
      console.log(`[ActionAsset] 共查询到 ${actions.length} 条动作记录`);

      let actionCleanedCount = 0;
      for (const act of actions) {
        const cleanTitle = sanitizeActionTitle(act.title, act.shotType, act.action);
        const cleanAction = sanitizeActionPrompt(act.action);
        const cleanReverse = act.reversePrompt ? sanitizeActionPrompt(act.reversePrompt) : null;

        const cats = extractActionCategories(act);
        const anchors = extractActionFocusAnchors(act);
        let targetList: string[] = [];
        if (anchors.length > 0) {
          targetList = [
            ...cats.map((c) => c.id),
            ...anchors.map((anc) => anc.id),
            ...(anchors.some((a) => a.id === 'wrist') ? ['bracelet'] : []),
            ...(anchors.some((a) => a.id === 'collarbone') ? ['necklace'] : []),
            ...(anchors.some((a) => a.id === 'fingers') ? ['ring'] : []),
            ...(anchors.some((a) => a.id === 'ear') ? ['earring'] : []),
          ];
        } else {
          targetList = cats.map((c) => c.id);
        }
        const uniqueList = Array.from(new Set(targetList));
        const targetAnatomyJson = JSON.stringify(uniqueList);
        const targetTags = Array.from(new Set([
          ...cats.map((c) => c.label),
          ...anchors.map((a) => a.label),
        ])).join(', ');

        const needsUpdate =
          cleanTitle !== act.title ||
          cleanAction !== act.action ||
          act.suitableAnatomy !== targetAnatomyJson ||
          act.tags !== targetTags;

        if (needsUpdate) {
          await prisma.actionAsset.update({
            where: { id: act.id },
            data: {
              title: cleanTitle,
              action: cleanAction,
              ...(cleanReverse ? { reversePrompt: cleanReverse } : {}),
              suitableAnatomy: targetAnatomyJson,
              tags: targetTags,
            },
          });
          actionCleanedCount++;
        }
      }
      console.log(`✅ [ActionAsset] 动作资产清洗完成，共修复 ${actionCleanedCount} 条！`);

      // 2. 清洗 Persona 人物资产
      const personas = await prisma.personaAsset.findMany();
      console.log(`[PersonaAsset] 共查询到 ${personas.length} 条人物记录`);
      let personaCleanedCount = 0;

      const HAIR_STYLES = [
        '温婉古典优雅低盘发髻与轻柔碎发',
        '元气蓬松高马尾与自然野生胎毛发际线',
        '复古及肩微外翻碎发波波头',
        '慵懒法式侧编发与微风碎发',
        '自然柔顺及腰黑长直发与轻薄空气刘海',
        '清冷利落半扎丸子头与耳际碎发',
      ];

      for (let i = 0; i < personas.length; i++) {
        const ps = personas[i];
        if (ps.description.includes('高颅顶蓬松法式微卷中长发')) {
          const alternateHair = HAIR_STYLES[i % HAIR_STYLES.length];
          const newDesc = ps.description.replace(/高颅顶蓬松法式微卷中长发/g, alternateHair);
          await prisma.personaAsset.update({
            where: { id: ps.id },
            data: {
              description: newDesc,
            },
          });
          personaCleanedCount++;
        }
      }
      console.log(`✅ [PersonaAsset] 人物资产去同质化清洗完成，共多样化修复 ${personaCleanedCount} 条！`);

    } catch(err: unknown) {
      console.error(`❌ 清洗数据库 ${url} 异常:`, err.message);
    } finally {
      await prisma.$disconnect();
    }
  }

  console.log(`\n🎉 全部数据库资产清洗完毕！`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
