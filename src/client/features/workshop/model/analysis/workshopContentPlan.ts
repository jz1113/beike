import type { BatchProductItem, WorkshopContentPlan } from '../batchTypes';

const directions = [
  { theme: '第一眼与整体设计', focus: '整体轮廓、比例和可见设计', opening: '完整商品建立印象，再递进到局部与情境', scene: '自然光生活静物，以商品整体为视觉中心' },
  { theme: '细节与材质观察', focus: '可确认的纹理、边缘和结构衔接', opening: '从有辨识度的局部切入，再拉开景别解释位置', scene: '近距离观察环境，用侧光表现真实材质' },
  { theme: '日常使用情境', focus: '与商品用途相符的真实动作及接触关系', opening: '以使用动作开场，再展示整体和操作细节', scene: '适合当前商品的生活使用空间，按需选择静物、手部或成年人' },
  { theme: '收纳与随身搭配', focus: '商品与日常物品的比例、放置和取用关系', opening: '从空间关系开场，再靠近商品并交代取用', scene: '按实际体积选择收纳、陈列或携带场景，不强行放入包中' },
  { theme: '空间氛围与搭配', focus: '商品配色、轮廓与生活空间的协调', opening: '用环境建立氛围，再逐镜突出商品与设计细节', scene: '与前几条不同的生活空间及背景层次，商品始终清晰可辨' },
];
const treatments = ['自然平视与近景交替', '俯视空间关系与斜侧特写交替', '低机位轮廓与局部细节交替', '前景层次与留白构图交替'];

export function createContentPlan(index: number, total: number): WorkshopContentPlan {
  const direction = directions[(index - 1) % directions.length];
  const treatment = treatments[Math.floor((index - 1) / directions.length) % treatments.length];
  return { index, total, ...direction, treatment };
}

export function contentPlanLabel(item: Pick<BatchProductItem, 'contentPlan'>): string {
  return item.contentPlan ? `内容 ${item.contentPlan.index}/${item.contentPlan.total} · ${item.contentPlan.theme}` : '';
}

/** Plans are stable before concurrent calls, so siblings differ even with no finished storyboard. */
export function workshopContentContext(item: BatchProductItem, allItems: BatchProductItem[]) {
  if (!item.contentPlan) return undefined;
  const platform = (value: string) => value === 'tmall' ? 'taobao' : value;
  const siblings = allItems.filter(row => row.itemId === item.itemId && platform(row.platform) === platform(item.platform));
  return {
    current: item.contentPlan,
    siblings: siblings.filter(row => row.id !== item.id).slice(0, 19).map(row => ({
      plan: row.contentPlan || createContentPlan(1, item.contentPlan!.total),
      completedShots: row.analyzedSuccess ? row.prompts.map(shot => ({ title: shot.title, scene: shot.scene, angle: shot.angle })).slice(0, 8) : [],
    })),
  };
}
