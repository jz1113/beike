import type { AssetProductCategory } from './assetOrganization';
import type { ActionCategoryId } from '../products/productCategory/defs';

export const CATEGORY_ARCHITECTURES: Record<ActionCategoryId, { label: string; focus: string }> = {
  universal: { label: '通用商品', focus: '依据可见主体判断使用方式，记录轮廓、接触关系、构图与光影；不套用首饰佩戴或手机握持模板。' },
  jewelry: { label: '首饰佩戴', focus: '识别具体首饰类型与佩戴部位，记录比例、固定结构、遮挡和金属/宝石可见质感；动作不得串佩戴部位。' },
  digital_3c: { label: '手机数码', focus: '区分手机、耳机、平板及配件，记录屏幕/背面/镜头/边框、握持与连接关系；手机本体与壳、挂饰、磁吸环分别描述，不把组合商品图当单机结构。' },
  apparel: { label: '服饰穿搭', focus: '以服装为主体，记录版型、领口、袖长、长度、层次、面料可见纹理及穿着褶皱；人物动作须展示服装轮廓，不能套首饰特写。' },
  bag: { label: '箱包携带', focus: '记录包型、容量视觉比例、提手、肩带连接点、五金和开合状态，区分手提/肩背/斜挎；不能虚构隔层或材质成分。' },
  shoes: { label: '鞋履上脚', focus: '记录鞋面、鞋头、鞋跟/鞋底、系带和上脚比例，区分单鞋/成对及左右脚；姿态符合足部受力，不能虚构功能。' },
  beauty: { label: '美妆护肤', focus: '区分瓶罐包装、产品本体、涂抹动作及可见质地；不编造功效、成分、包装文字或皮肤改善前后对比。' },
  eyewear: { label: '眼镜佩戴', focus: '记录镜框形状、镜腿/鼻托、镜片可见反光及佩戴位置；不改变脸部结构，不推断镜片防护或度数。' },
};

const MATCHERS: Array<[ActionCategoryId, RegExp]> = [
  ['digital_3c', /手机|通讯|数码|平板|耳机|电子|digital|3c/i],
  ['jewelry', /珠宝|首饰|项链|手镯|手链|耳饰|耳环|戒指|发簪|胸针|jewelry/i],
  ['eyewear', /眼镜|墨镜|太阳镜|eyewear/i],
  ['apparel', /服装|服饰|穿搭|女装|男装|童装|apparel/i],
  ['bag', /箱包|包袋|手袋|背包|皮包|bag/i],
  ['shoes', /鞋|靴|shoes/i],
  ['beauty', /美妆|护肤|彩妆|化妆|香水|beauty/i],
];

/** Follow the selected category and ancestors, never assume a database ID is a family ID. */
export function resolveCategoryArchitecture(categories: AssetProductCategory[], categoryId?: string | null): ActionCategoryId {
  const visited = new Set<string>();
  let id = categoryId;
  while (id && !visited.has(id)) {
    visited.add(id);
    const category = categories.find(item => item.id === id);
    const known = Object.keys(CATEGORY_ARCHITECTURES).find(key => key === id) as ActionCategoryId | undefined;
    const matched = MATCHERS.find(([, pattern]) => pattern.test(category?.name || ''))?.[0];
    if (matched || known) return matched || known!;
    id = category?.parentId;
  }
  return 'universal';
}

export function categoryArchitectureGuidance(profile?: string): string {
  if (!profile || !(profile in CATEGORY_ARCHITECTURES)) return '';
  const architecture = CATEGORY_ARCHITECTURES[profile as ActionCategoryId];
  return `【当前反推架构：${architecture.label}】\n${architecture.focus}\n品类是分析侧重，不是要求在原图中补造该类商品；画面不符时按可见事实记录，并在分析摘要说明不匹配。`;
}
