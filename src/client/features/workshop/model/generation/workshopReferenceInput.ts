import type { ShotPrompt } from '@shared/domain/prompts/vision';

/** The transport sends product views first, sample images next, and the optional face last. */
export function workshopReferenceInput(shots: ShotPrompt[], productImageCount: number) {
  const sampleShots = shots.filter(shot => Boolean(shot.sourceReferenceImageUrl));
  if (!sampleShots.length) {
    if (shots.some(shot => shot.assembly_source === 'group_skeleton')) throw new Error('旧分析尚未绑定参考原图，请重新分析后生成');
    return { compositionReferenceImages: [] as string[], instruction: '' };
  }
  if (sampleShots.length !== shots.length) throw new Error('参考图绑定不完整，请重新分析后生成');
  const compositionReferenceImages = [...new Set(sampleShots.map(shot => shot.sourceReferenceImageUrl!))];
  return {
    compositionReferenceImages,
    instruction: [
      `【参考图分工】@图片1 至 @图片${productImageCount} 仅用于当前商品身份与结构。`,
      ...sampleShots.map((shot, index) => `分镜${shot.shot_no}${shots.length === 4 ? `（${['左上', '右上', '左下', '右下'][index]}格）` : ''}的构图参考为 @图片${productImageCount + compositionReferenceImages.indexOf(shot.sourceReferenceImageUrl!) + 1}，保留该图的主体占比、裁切、视角、动作、空间与自然光感；将其中旧商品完整替换为当前商品。`),
      '明确替换项优先于参考图相应内容。不要复制参考中的旧商品、品牌、水印、字幕或界面；不要将构图参考作为第二件商品放入画面。保留真实材质与接触阴影，不额外美化成棚拍广告。',
    ].join('\n'),
  };
}
