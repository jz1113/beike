import { jsonResponse } from '../../../../core/http';
import { prisma } from '../../../../repositories/db';
import { sanitizeScenePrompt, outfitSimilarity } from '@beike/domain/assetDeconstruct/validate';

// 🌟 一键智能提纯、分类归位与去重
export async function executeLibraryDeduplication() {
  let cleanedCount = 0;
  let migratedCount = 0;

  const OUTFIT_KEYWORDS =
    /(?:外套|大衣|风衣|西装|开衫|衬衫|卫衣|T恤|针织衫|针织|连衣裙|长裙|短裙|百褶裙|蓬蓬裙|马面裙|短裤|长裤|牛仔裤|阔腿裤|套组|套装|穿搭|穿著|搭配|叠穿|刺绣半裙|蕾丝裙|工装外套)/;
  const ACTION_KEYWORDS =
    /(?:姿势|姿态|蹲坐|侧卧|俯视|仰视|掩面|端捧|举手|倚靠|漫步|奔跑|用餐|笑颜|近景|抓拍|特写|合拢|侧颜|回眸|微动|随拍|自拍|打结|露肩|肖像|甜笑|大笑|微笑|欢笑|凝视|互动|小憩|沉思|立姿|坐姿|站姿)/;
  const PERSONA_KEYWORDS =
    /(?:金发少女|复古少女|京都卷发女子|时尚博主|卷发女子|金橘发|波西米亚女子|波浪卷发|短发女生|黑长直|鹅蛋脸|猫系脸|清秀五官)/;

  // 1. 扫描 SceneAsset 并智能迁移
  const allScenes = await prisma.sceneAsset.findMany({ orderBy: { createdAt: 'desc' } });
  const seenSceneTitles = new Set<string>();

  for (const s of allScenes) {
    const title = s.title || '';
    const desc = s.description || '';
    const full = `${title} ${desc}`;

    // A. 迁移至穿搭库
    if (OUTFIT_KEYWORDS.test(title) && /(?:外套|套组|套装|穿搭|裙|西装|针织)/.test(title)) {
      const top = title;
      const bottom = desc.length > 10 ? desc.slice(0, 100) : '高腰垂感半身长裙';
      await prisma.outfitAsset
        .create({
          data: {
            title,
            top,
            bottom,
            shoes: '法式复古单鞋',
            colorPalette: '经典复古配色',
            category: s.category || 'general',
            tags: s.tags || '',
            coverUrl: s.coverUrl,
          },
        })
        .catch(() => {});
      await prisma.sceneAsset.delete({ where: { id: s.id } }).catch(() => {});
      migratedCount++;
      continue;
    }

    // B. 迁移至动作库
    if (
      ACTION_KEYWORDS.test(title) ||
      /(?:构图|抓拍|姿势|姿态|近景|特写|俯视|蹲坐|侧卧)/.test(desc)
    ) {
      let camera = 'iPhone 50mm 生活镜头';
      if (title.includes('俯视') || full.includes('俯角')) camera = '高角度俯视镜头';
      else if (title.includes('特写') || title.includes('近景')) camera = '85mm f/1.8 特写镜头';
      else if (full.includes('35mm')) camera = '35mm 全景镜头';

      let shotType = 'medium_full_body';
      if (title.includes('特写') || title.includes('近景') || title.includes('侧颜'))
        shotType = 'close_up';
      else if (title.includes('俯视')) shotType = 'high_angle_seated_full_body';

      await prisma.actionAsset
        .create({
          data: {
            shotType,
            title,
            action: desc || title,
            camera,
            reversePrompt: desc || title,
          },
        })
        .catch(() => {});
      await prisma.sceneAsset.delete({ where: { id: s.id } }).catch(() => {});
      migratedCount++;
      continue;
    }

    // C. 迁移至人设库
    if (PERSONA_KEYWORDS.test(title)) {
      await prisma.personaAsset
        .create({
          data: {
            name: title,
            description: desc || title,
            tags: s.tags || '',
            avatarUrl: s.coverUrl,
          },
        })
        .catch(() => {});
      await prisma.sceneAsset.delete({ where: { id: s.id } }).catch(() => {});
      migratedCount++;
      continue;
    }

    // D. 纯净场景去重与标题/描述/采光深度净化
    const cleanTitle = title
      .replace(/与(?:复古)?(?:少女|女生|女郎|人物|模特|行人)/g, '空间')
      .replace(/[，,。.；;\s]+$/, '')
      .trim();
    const cleanDesc = sanitizeScenePrompt(s.description || '');
    const cleanLighting = s.lighting
      ? sanitizeScenePrompt(s.lighting)
      : '自然采光与清晰物理接触阴影';
    const key = cleanTitle.toLowerCase();
    if (seenSceneTitles.has(key)) {
      await prisma.sceneAsset.delete({ where: { id: s.id } }).catch(() => {});
      cleanedCount++;
    } else {
      seenSceneTitles.add(key);
      if (cleanTitle !== title || cleanDesc !== s.description || cleanLighting !== s.lighting) {
        await prisma.sceneAsset
          .update({
            where: { id: s.id },
            data: {
              title: cleanTitle,
              description: cleanDesc,
              lighting: cleanLighting,
            },
          })
          .catch(() => {});
      }
    }
  }

  // 2. 去重 OutfitAsset（结合语义相似度与文本特征聚类）
  const allOutfits = await prisma.outfitAsset.findMany({ orderBy: { createdAt: 'desc' } });
  const keptOutfits: typeof allOutfits = [];
  for (const o of allOutfits) {
    let isDup = false;
    for (const kept of keptOutfits) {
      const sim = outfitSimilarity(kept, o);
      if (sim >= 0.7) {
        isDup = true;
        break;
      }
    }
    if (isDup) {
      await prisma.outfitAsset.delete({ where: { id: o.id } }).catch(() => {});
      cleanedCount++;
    } else {
      keptOutfits.push(o);
    }
  }

  // 3. 去重 ActionAsset
  const allActions = await prisma.actionAsset.findMany({ orderBy: { createdAt: 'desc' } });
  const seenActionKeys = new Set<string>();
  for (const a of allActions) {
    const key = a.title.trim().toLowerCase();
    if (seenActionKeys.has(key)) {
      await prisma.actionAsset.delete({ where: { id: a.id } }).catch(() => {});
      cleanedCount++;
    } else {
      seenActionKeys.add(key);
    }
  }

  // 4. 去重 PersonaAsset
  const allPersonas = await prisma.personaAsset.findMany({ orderBy: { createdAt: 'desc' } });
  const seenPersonaKeys = new Set<string>();
  for (const p of allPersonas) {
    const key = p.name.trim().toLowerCase();
    if (seenPersonaKeys.has(key)) {
      await prisma.personaAsset.delete({ where: { id: p.id } }).catch(() => {});
      cleanedCount++;
    } else {
      seenPersonaKeys.add(key);
    }
  }

  return jsonResponse({
    success: true,
    message: `智能提纯完成：迁移错位资产 ${migratedCount} 条，清理重复记录 ${cleanedCount} 条`,
    migratedCount,
    cleanedCount,
  });
}
