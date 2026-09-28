/** Shared by every workshop shot, including prompts that already mention @图片1. */
export const PRODUCT_GEOMETRY_LOCK = [
  '【商品几何保真约束】商品结构以 @图片1 的当前商品为唯一依据，优先于模板、场景、构图占比和风格描述。',
  '锁定同一实物的长宽比、厚度比例、边框与圆角、各部件的相对尺寸和位置；不得拉长、压扁、加宽、缩窄或单独放大局部部件。',
  '若为手机，机身长宽比、摄像头模组占背板的比例、镜头直径与间距、模组距机身边缘的位置均须与原商品图一致，不可借用其他型号的外形。',
  '参考图含正反面、多视图或多个商品时，按当前商品对应的单个视图识别结构；正反面是同一商品的不同视图，不能把整张拼图的长宽比当成机身比例，也不能将多个视图拼成一个物体。',
  '构图需要更大或更小时，仅调整相机距离、整体等比缩放或取景范围；机位变化遵循同一三维实物的合理透视，不为满足模板主体占比改变商品形状。',
  '局部特写允许裁切，但镜头模组及可见部件相对机身的比例不变；全套分镜保持同一商品结构。',
  '无标尺或可靠尺寸信息时不得编造毫米尺寸；图片像素尺寸、画面占比与商品实物尺寸不可混为一谈。',
].join('');

export function enforceProductGeometry(prompt: string): string {
  // Re-finalization must not grow the prompt or leave a stale lock behind.
  const text = prompt.split(PRODUCT_GEOMETRY_LOCK).join('').trim();
  return `${text}\n${PRODUCT_GEOMETRY_LOCK}`;
}
