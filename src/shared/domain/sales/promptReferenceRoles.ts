import { SALES_IMAGE_VIEW_LABELS, type SalesReferenceSlot } from './types';

/** Material roles apply to saved templates as well as the initial template. */
export function salesReferenceScopeFacts(
  references: readonly SalesReferenceSlot[],
  sceneSlot: SalesReferenceSlot | null,
  sceneText: string,
  productName: string,
) {
  const withRole = (role: SalesReferenceSlot['kind']) => references.filter((slot) => (slot.roles || [slot.kind]).includes(role));
  const products = withRole('product').map((slot) => slot.view
    ? `${slot.mixedToken}·${slot.view === 'worn' ? '上身' : SALES_IMAGE_VIEW_LABELS[slot.view]}` : slot.mixedToken).join('、');
  const actions = withRole('action').map((slot) => slot.mixedToken).join('、');
  const clothing = /冲锋衣|外套|羽绒服|棉服|夹克|风衣|毛衣|针织衫|卫衣|衬衫|T恤|t恤|短袖|长袖|背心|马甲|连衣裙|半身裙|长裙|短裙|长裤|短裤|牛仔裤|休闲裤|运动裤|内衣|睡衣/.test(productName)
    && !/收纳|衣架|衣柜|护理|清洁|清洗|洗衣|熨烫|熨斗|烘干|去球|配件|缝纫|裁剪/.test(productName);
  const productFacts = [
    ...(productName.trim() ? [`当前商品名称：${productName.trim()}`] : []),
    ...(products ? [`商品用途（${products}）：仅取款式、颜色、结构和材质${clothing ? '及穿着关系' : ''}。`] : []),
    ...(products && clothing ? ['衣物连续性：保持穿着层次与开闭状态，随可见操作改变。'] : []),
  ].join('\n');
  const sceneFacts = [
    sceneSlot ? `当前场景参考：${sceneSlot.mixedToken}；空间布局、背景与现场光源以此图为准。` : '',
    sceneText ? `当前场景描述：${sceneText}` : '',
  ].filter(Boolean).join('\n');
  const depthFacts = actions ? `动作参考：${actions}（深度动作视频），仅取前景动作与接触时序。` : '';
  return { productFacts, sceneFacts, depthFacts };
}
