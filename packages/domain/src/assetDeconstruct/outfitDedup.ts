type LooseRecord = Record<string, unknown>;

// 常见基础色系分类
const COLOR_FAMILIES: { name: string; regex: RegExp }[] = [
  { name: 'blue', regex: /(?:浅蓝|天蓝|水蓝|雾霾蓝|牛仔蓝|宝蓝|藏青|藏蓝|克莱因蓝|湖蓝|湛蓝|浅天蓝|深蓝|蓝)/ },
  { name: 'white', regex: /(?:纯白|米白|奶白|冷白|暖白|象牙白|雪白|白)/ },
  { name: 'black', regex: /(?:纯黑|炭黑|深黑|墨黑|暗黑|黑)/ },
  { name: 'gray', regex: /(?:浅灰|深灰|炭灰|烟灰|麻灰|燕麦灰|银灰|灰)/ },
  { name: 'brown', regex: /(?:棕|咖|卡其|驼色|焦糖|奶黄|米黄|米色|暖棕|深棕|杏色|大地色)/ },
  { name: 'red_pink', regex: /(?:红|粉|玫红|朱红|正红|樱桃红|豆沙|橘红|酒红|绯红)/ },
  { name: 'green', regex: /(?:绿|薄荷绿|墨绿|橄榄绿|翠绿|牛油果绿|浅绿|草绿)/ },
  { name: 'purple', regex: /(?:紫|香芋紫|薰衣草紫|浅紫|深紫)/ },
  { name: 'yellow', regex: /(?:黄|明黄|柠檬黄|姜黄|鹅黄)/ },
];

// 核心服装款式类型
const GARMENT_TYPES: { name: string; regex: RegExp }[] = [
  { name: 'hoodie_knit', regex: /(?:连帽|帽衫|卫衣|针织衫|针织|毛衣|开衫)/ },
  { name: 'shirt_blouse', regex: /(?:衬衫|衬衣|小方领|法式衬衫|雪纺衫)/ },
  { name: 'suit_coat', regex: /(?:西装|小西服|大衣|风衣|夹克|外套|工装)/ },
  { name: 'tank_camisole', regex: /(?:吊带|背心|抹胸|内搭|裹胸)/ },
  { name: 'tshirt', regex: /(?:t恤|短袖t|打底衫)/ },
  { name: 'dress', regex: /(?:连衣裙|连体裙|长裙|短裙|吊带裙|半身裙|伞摆|裙身|裙装|百褶裙|马面裙|旗袍)/ },
  { name: 'pants', regex: /(?:阔腿裤|牛仔裤|直筒裤|休闲裤|长裤|短裤|西装裤|微喇裤|短裙裤)/ },
];

// 核心面料与装饰工艺
const FABRIC_CRAFT_KEYWORDS = [
  '蕾丝', '荷叶边', '飞袖', '飞飞袖', '泡泡袖', '方领', '大方领', 'v领', '圆领', '挂脖',
  '露肩', '一字肩', '抽绳', '系带', '盘扣', '纽扣', '真丝', '雪纺', '亚麻', '纯棉', '羊绒',
  '牛仔', '丹宁', '提花', '刺绣', '粗花呢', '小香风', '百褶', '镂空', '褶皱', '开叉'
];

export interface OutfitSignature {
  fullText: string;
  colors: Set<string>;
  garments: Set<string>;
  crafts: Set<string>;
  ngrams: Set<string>;
}

export function extractOutfitSignature(outfit: LooseRecord): OutfitSignature {
  const title = String(outfit.title || '').trim();
  const top = String(outfit.top || '').trim();
  const bottom = String(outfit.bottom || '').trim();
  const shoes = String(outfit.shoes || '').trim();
  const accessories = String(outfit.accessories || '').trim();
  const colorPalette = String(outfit.color_palette || outfit.colorPalette || '').trim();
  const tags = Array.isArray(outfit.tags) ? outfit.tags.join(' ') : String(outfit.tags || '');

  const fullText = [title, top, bottom, shoes, accessories, colorPalette, tags]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  // 1. 颜色分析
  const colors = new Set<string>();
  for (const cf of COLOR_FAMILIES) {
    if (cf.regex.test(fullText)) {
      colors.add(cf.name);
    }
  }

  // 2. 款式类型分析
  const garments = new Set<string>();
  for (const gt of GARMENT_TYPES) {
    if (gt.regex.test(fullText)) {
      garments.add(gt.name);
    }
  }

  // 3. 面料与工艺
  const crafts = new Set<string>();
  for (const kw of FABRIC_CRAFT_KEYWORDS) {
    if (fullText.includes(kw)) {
      crafts.add(kw);
    }
  }

  // 4. 中文字符 N-gram (2-gram & 3-gram)
  const ngrams = new Set<string>();
  const cleanStr = fullText.replace(/[^\u4e00-\u9fa5a-z0-9]+/gi, '');
  for (let i = 0; i < cleanStr.length - 1; i++) {
    ngrams.add(cleanStr.slice(i, i + 2));
    if (i < cleanStr.length - 2) {
      ngrams.add(cleanStr.slice(i, i + 3));
    }
  }

  return {
    fullText,
    colors,
    garments,
    crafts,
    ngrams,
  };
}

/**
 * 计算两套服装的相似度得分 (0 ~ 1)
 */
export function outfitSimilarity(
  a: LooseRecord | OutfitSignature,
  b: LooseRecord | OutfitSignature
): number {
  const sigA = 'colors' in a && 'garments' in a ? (a as OutfitSignature) : extractOutfitSignature(a as LooseRecord);
  const sigB = 'colors' in b && 'garments' in b ? (b as OutfitSignature) : extractOutfitSignature(b as LooseRecord);

  if (!sigA.fullText || !sigB.fullText) return 0;

  // 1. 颜色相似度 (Jaccard)
  let sharedColors = 0;
  for (const c of sigA.colors) {
    if (sigB.colors.has(c)) sharedColors++;
  }
  const minColors = Math.min(sigA.colors.size, sigB.colors.size);
  const maxColors = Math.max(sigA.colors.size, sigB.colors.size);
  const colorOverlap = maxColors > 0 ? sharedColors / maxColors : 0;

  // 颜色冲突检查：如果两套服装各自都有明确颜色，但完全不重叠（例如一个纯黑、一个纯白），惩罚性降分
  if (sigA.colors.size > 0 && sigB.colors.size > 0 && sharedColors === 0) {
    return 0.15;
  }

  // 2. 款式重叠
  let sharedGarments = 0;
  for (const g of sigA.garments) {
    if (sigB.garments.has(g)) sharedGarments++;
  }
  const minGarments = Math.min(sigA.garments.size, sigB.garments.size);
  const maxGarments = Math.max(sigA.garments.size, sigB.garments.size);
  const garmentOverlap = maxGarments > 0 ? sharedGarments / maxGarments : 0;

  // 3. 工艺与面料重叠（如都有"蕾丝"、"荷叶边"）
  let sharedCrafts = 0;
  for (const cr of sigA.crafts) {
    if (sigB.crafts.has(cr)) sharedCrafts++;
  }
  const minCrafts = Math.min(sigA.crafts.size, sigB.crafts.size);
  const craftOverlap = minCrafts > 0 ? sharedCrafts / minCrafts : 0;

  // 4. N-gram 文本相似度 (Dice)
  let sharedNgrams = 0;
  for (const ng of sigA.ngrams) {
    if (sigB.ngrams.has(ng)) sharedNgrams++;
  }
  const minNgrams = Math.min(sigA.ngrams.size, sigB.ngrams.size);
  const ngramScore = minNgrams > 0 ? sharedNgrams / minNgrams : 0;

  // 强匹配特例：
  // 如果款式重合且主要色调重合（例如都是浅蓝+白，且都是针织/连帽）
  if (sharedColors >= 1 && sharedGarments >= 1 && (ngramScore >= 0.2 || sharedCrafts >= 1)) {
    return Math.max(0.75, 0.4 + colorOverlap * 0.3 + ngramScore * 0.3);
  }

  // 纯白蕾丝裙特例：纯白 + 蕾丝 + 裙装/方领/荷叶边
  if (sigA.colors.has('white') && sigB.colors.has('white') && sharedCrafts >= 1 && ngramScore >= 0.2) {
    return Math.max(0.72, 0.4 + craftOverlap * 0.3 + ngramScore * 0.3);
  }

  // 综合评分
  const finalScore = colorOverlap * 0.35 + garmentOverlap * 0.35 + craftOverlap * 0.15 + ngramScore * 0.15;
  return finalScore;
}

/**
 * 组图候选服装聚类去重
 * 将同一个图集内属于同一套衣服的多张切片合并归纳为 1 个精选穿搭资产
 */
export function dedupeOutfitCandidates(candidates: LooseRecord[]): LooseRecord[] {
  const clusters: {
    candidate: LooseRecord;
    sig: OutfitSignature;
  }[] = [];

  for (const candidate of candidates) {
    const title = String(candidate.title || '').trim();
    const top = String(candidate.top || '').trim();
    const bottom = String(candidate.bottom || '').trim();
    if (!title && !top && !bottom) continue;

    const sig = extractOutfitSignature(candidate);
    let merged = false;

    const getIndices = (item: LooseRecord): number[] => {
      if (Array.isArray(item.source_image_indices)) {
        return item.source_image_indices.filter((x): x is number => typeof x === 'number');
      }
      if (typeof item.source_image_index === 'number') {
        return [item.source_image_index];
      }
      return [];
    };

    for (const cluster of clusters) {
      const sim = outfitSimilarity(sig, cluster.sig);
      // 只要相似度达到 0.52，在同批次/图集中即判定为同一套衣服
      if (sim >= 0.52) {
        const clusterItem = cluster.candidate;

        // 1. 聚合 source_image_indices（防止 0 索引被 falsy 过滤）
        const indices = getIndices(clusterItem);
        const candIndices = getIndices(candidate);
        for (const idx of candIndices) {
          if (!indices.includes(idx)) indices.push(idx);
        }
        clusterItem.source_image_indices = indices.sort((a, b) => a - b);

        // 2. 上装挑选细节更充实的描述
        const clusterTop = String(clusterItem.top || '');
        const candidateTop = String(candidate.top || '');
        if (candidateTop.length > clusterTop.length && !candidateTop.includes('无法确认')) {
          clusterItem.top = candidateTop;
        }

        // 3. 下装挑选细节更充实的描述
        const clusterBottom = String(clusterItem.bottom || '');
        const candidateBottom = String(candidate.bottom || '');
        if (
          candidateBottom.length > clusterBottom.length &&
          !candidateBottom.includes('无法确认') &&
          !candidateBottom.includes('不足')
        ) {
          clusterItem.bottom = candidateBottom;
        }

        // 4. 鞋履与配饰
        if (!clusterItem.shoes && candidate.shoes) clusterItem.shoes = candidate.shoes;
        if (!clusterItem.accessories && candidate.accessories) clusterItem.accessories = candidate.accessories;

        // 5. 配色方案挑更丰富的
        const clusterColor = String(clusterItem.color_palette || clusterItem.colorPalette || '');
        const candidateColor = String(candidate.color_palette || candidate.colorPalette || '');
        if (candidateColor.length > clusterColor.length) {
          clusterItem.color_palette = candidateColor;
          clusterItem.colorPalette = candidateColor;
        }

        // 6. 标题挑选更优美具象的
        const clusterTitle = String(clusterItem.title || '');
        const candidateTitle = String(candidate.title || '');
        if (
          candidateTitle.length > clusterTitle.length &&
          !candidateTitle.startsWith('自定义') &&
          !candidateTitle.includes('时尚质感')
        ) {
          clusterItem.title = candidateTitle;
        }

        // 7. 合并标签
        const existingTags = new Set(
          (Array.isArray(clusterItem.tags) ? clusterItem.tags : String(clusterItem.tags || '').split(/[,，\s]+/))
            .map((t) => String(t).trim())
            .filter(Boolean)
        );
        const newTags = (Array.isArray(candidate.tags) ? candidate.tags : String(candidate.tags || '').split(/[,，\s]+/))
          .map((t) => String(t).trim())
          .filter(Boolean);
        for (const t of newTags) existingTags.add(t);
        clusterItem.tags = Array.from(existingTags);

        // 重新提取更新后的特征签名
        cluster.sig = extractOutfitSignature(clusterItem);
        merged = true;
        break;
      }
    }

    if (!merged) {
      clusters.push({
        candidate: { ...candidate },
        sig,
      });
    }
  }

  return clusters.map(({ candidate }) => {
    const { source_image_indices, ...rest } = candidate;
    const finalIndices = Array.isArray(source_image_indices)
      ? (source_image_indices as number[])
      : typeof rest.source_image_index === 'number'
        ? [rest.source_image_index]
        : [];
    return {
      ...rest,
      source_image_index: finalIndices[0] ?? rest.source_image_index,
      source_image_indices: finalIndices,
    };
  });
}
