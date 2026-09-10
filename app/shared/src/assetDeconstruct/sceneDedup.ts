import type { PerImageResult } from './prompts';

type LooseRecord = Record<string, unknown>;

const ACTION_KEYWORDS_RE = /(?:走向|走来|走动|迎面|迈步|步伐|回眸|侧颜|托腮|抚发|侧坐|倚靠|交叠|凝视|视线|微仰|低头|探头|伸手|比心|站姿|坐姿|立姿|姿态|姿势|立像|人像|特写|微笑|笑脸|侧影|互动|手提|抓拍|拈草|席地而坐|仰卧|静坐|正坐|转圈|探身|俯视|仰视|大笑|倾听|拉拽|挎包|奔跑|漫步|半身|全身|微距|近景|中景)/;

/** 判断标题是否为人体动作/神态（防止动作被误当成场景） */
export function isActionTitle(title: string): boolean {
  if (!title) return false;
  return ACTION_KEYWORDS_RE.test(title);
}

const SCENE_LANDMARK_KEYWORDS = [
  '木门', '大门', '门廊', '正门', '门框', '双开门', '雕花门', '蓝门', '绿门', '铁艺门', '百叶窗', '窗边', '落地窗', '窗框',
  '石阶', '台阶', '梯级', '踏步', '石板路', '阶梯',
  '木桌', '茶台', '咖啡桌', '餐桌', '吧台', '长条桌', '办公桌', '工位',
  '沙发', '皮沙发', '布艺沙发', '复古沙发', '扶手椅', '地毯', '茶室', '客厅', '卧室', '大堂', '走廊', '过道', '玄关',
  '草坪', '庭院', '花园', '院落', '绿植', '花丛', '树林', '林荫', '树下', '树影', '竹林', '茶园', '梯田', '田野', '花海',
  '街景', '街道', '马路', '斑马线', '露台', '阳台', '连廊', '古建', '复古建筑', '欧式建筑', '红砖墙', '白墙', '砂岩', '石墙',
  '车内', '副驾', '后座', '车窗', '海边', '沙滩', '水边', '湖畔', '池塘', '泳池', '天台', '楼梯间'
];

export interface SceneSignature {
  text: string;
  spatialType: string;
  landmarks: Set<string>;
  ngrams: Set<string>;
}

export function extractSceneSignature(candidate: LooseRecord, img?: PerImageResult): SceneSignature {
  const title = String(candidate.title || img?.scene?.title || img?.title || '').trim();
  const desc = String(candidate.description || img?.scene?.description || '').trim();
  const d = (candidate.dimensions as Record<string, string>) || img?.dimensions || {};
  const spatialType = String(candidate.spatial_type || img?.scene?.spatial_type || '').trim().toLowerCase();

  const parts = [
    title,
    desc,
    d.vegetation_water,
    d.material_texture,
    d.atmosphere,
    d.sky_state,
    d.time_of_day,
    d.perspective,
  ].filter((v) => typeof v === 'string' && v.trim().length > 0);

  const fullText = parts.join(' ').toLowerCase();

  // 1. 提取物理地标/核心锚点关键词
  const landmarks = new Set<string>();
  for (const kw of SCENE_LANDMARK_KEYWORDS) {
    if (fullText.includes(kw)) {
      landmarks.add(kw);
    }
  }

  // 2. 提取中文 2-gram 与 3-gram 特征
  const ngrams = new Set<string>();
  const cleanStr = fullText.replace(/[^\u4e00-\u9fa5a-z0-9]+/gi, '');
  for (let i = 0; i < cleanStr.length - 1; i++) {
    ngrams.add(cleanStr.slice(i, i + 2));
    if (i < cleanStr.length - 2) {
      ngrams.add(cleanStr.slice(i, i + 3));
    }
  }

  return {
    text: fullText,
    spatialType,
    landmarks,
    ngrams,
  };
}

export function sceneSimilarity(
  a: string | SceneSignature,
  b: string | SceneSignature
): number {
  const sigA = typeof a === 'string' ? extractSceneSignature({ description: a }) : a;
  const sigB = typeof b === 'string' ? extractSceneSignature({ description: b }) : b;
  if (!sigA || !sigB) return 0;

  // 1. 地标关键词重叠 (Landmark Overlap)
  let sharedLandmarks = 0;
  for (const lm of sigA.landmarks) {
    if (sigB.landmarks.has(lm)) sharedLandmarks++;
  }
  const minLandmarks = Math.min(sigA.landmarks.size, sigB.landmarks.size);
  const landmarkScore = minLandmarks > 0 ? sharedLandmarks / minLandmarks : 0;

  // 2. N-gram 相似度 (Dice coefficient)
  let sharedNgrams = 0;
  for (const ng of sigA.ngrams) {
    if (sigB.ngrams.has(ng)) sharedNgrams++;
  }
  const minNgrams = Math.min(sigA.ngrams.size, sigB.ngrams.size);
  const ngramScore = minNgrams > 0 ? sharedNgrams / minNgrams : 0;

  // 3. 空间类型亲和度 (Spatial Type)
  const sameSpatial = Boolean(
    sigA.spatialType && sigB.spatialType && sigA.spatialType === sigB.spatialType
  );

  // 地标重叠需配合较高 n-gram 分数，避免仅共享泛化词（如「草坪」「木门」）就合并不同场景
  if (sharedLandmarks >= 2 || (sharedLandmarks >= 1 && ngramScore >= 0.35)) {
    return Math.max(0.65, 0.4 + landmarkScore * 0.3 + ngramScore * 0.3);
  }

  // 常规综合打分
  return landmarkScore * 0.5 + ngramScore * 0.4 + (sameSpatial ? 0.1 : 0);
}

export function dedupeSceneCandidates(candidates: LooseRecord[]): LooseRecord[] {
  const clusters: {
    candidate: LooseRecord;
    sig: SceneSignature;
  }[] = [];

  for (const candidate of candidates) {
    const sig = extractSceneSignature(candidate);
    let merged = false;

    for (const cluster of clusters) {
      const sim = sceneSimilarity(sig, cluster.sig);
      if (sim >= 0.55) {
        const clusterItem = cluster.candidate;
        const indices = (clusterItem.source_image_indices as number[]) || [];
        const candIndices = (candidate.source_image_indices as number[]) || [candidate.source_image_index as number].filter(Boolean);
        for (const idx of candIndices) {
          if (idx !== undefined && !indices.includes(idx)) indices.push(idx);
        }
        clusterItem.source_image_indices = indices.sort((a, b) => a - b);

        const clusterDesc = String(clusterItem.description || '');
        const candidateDesc = String(candidate.description || '');
        if (candidateDesc.length > clusterDesc.length) {
          clusterItem.description = candidateDesc;
        }

        const clusterTitle = String(clusterItem.title || '');
        const candidateTitle = String(candidate.title || '');
        if (candidateTitle.length > clusterTitle.length && !isActionTitle(candidateTitle)) {
          clusterItem.title = candidateTitle;
        }

        cluster.sig = extractSceneSignature(clusterItem);
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
    return {
      ...rest,
      source_image_index: (source_image_indices as number[])?.[0] ?? rest.source_image_index,
      source_image_indices,
    };
  });
}
