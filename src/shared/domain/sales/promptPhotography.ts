import type { SalesSourceExclusion } from './scriptTemplate';

const venuePattern = /咖啡馆|咖啡厅|茶室|摄影棚|影棚|服装店|客厅|卧室|厨房|办公室|健身房/g;

/** Some older style summaries mix rendering with the source wardrobe or set. */
export function salesRenderingStyle(summary: string, currentScene: boolean, localCameras = false, sceneText = ''): string {
  return summary.split(/(?<=[。！？；;，,])/).filter((part) => {
    const clause = part.trim();
    if (currentScene && clause.match(venuePattern)?.some(venue => !sceneText.includes(venue))) return false;
    if (currentScene && /(?:透窗日光|自然采光|棚灯照明|霓虹灯光|阳光斜射)/.test(clause)) return false;
    if (localCameras && /(?:全程|全片|始终|全部)(?:使用|采用|为|以)?(?:前置|自拍|固定机位|手持|推拉)/.test(clause)) return false;
    if (/^(?:人物|模特|主体)(?:身穿|穿着|着装|留着)|^(?:[^，。；]{0,6}长辫|发辫|马尾)(?:形成|垂在|随)/.test(clause)) return false;
    const sourceSet = /^(?:背景(?:由|为|是|以)|以).*(?:建筑|屋顶|楼顶|栏杆|街道|门店|橱窗|墙面|家具)/.test(clause);
    return !(currentScene && sourceSet && !/虚化|失焦|景深|颗粒|对比度/.test(clause));
  }).join('').replace(/[，,；;]$/, '').trim();
}

/** Clean photography metadata only; never apply this to action or expression text. */
export function currentSalesPhotography(text: string, sceneBound: boolean, exclusions: readonly SalesSourceExclusion[]): string {
  let result = text;
  for (const item of exclusions) {
    const term = item.term.trim();
    if (term.length >= 2) result = result.split(term).join('');
  }
  if (sceneBound) {
    // Strip source setting/light placement, retaining rendering properties such
    // as warm tones, contrast, background blur and the named photographic style.
    result = result
      .replace(/(?:开阔的?|明亮的?|昏暗的?)?(?:户外|室外|室内)(?:环境|场景|背景)?/g, '')
      .replace(/(?:城市街头|街头|街边|沿街)(?=自然采光|采光|光线|日光|环境光|[，,。；;\s])/g, '')
      .replace(/(?:背景)?(?:门店|店铺|商店|服装店|玻璃橱窗|橱窗)(?=有|呈|被|虚化|模糊|清晰|可辨|背景)/g, '背景')
      .replace(/(?:黄昏|暮色|日落|落日|天幕|天空)(?:背景|环境|场景)?/g, '')
      .replace(/(?:左|右|前|后)(?:侧|方|上方|前方|后方)?(?:逆光|侧光|顶光|顺光)|侧逆光|逆光|顶光/g, '')
      .replace(/(?:左|右|前|后|侧|顶)(?:侧|方|上方|前方|后方)?(?:窗光|天光|阳光|日光|光源|灯光|打光|灯位)/g, '')
      .replace(/(?:经过|站在|位于)?(?:原片|原有|原来|旧)(?:的)?(?:房间|场景|墙面|窗边|门边|家具|灯位|背景)(?:前|旁|边|中)?/g, '');
  }
  return result.replace(/^[，,；;、\s]+|[，,；;、\s]+$/g, '').replace(/([，,；;、])\s*[，,；;、]+/g, '$1').trim();
}

function describesSet(text: string, venue: string): boolean {
  return text.split(/[。；;，,\n]/).some(clause => {
    const index = clause.indexOf(venue);
    if (index < 0) return false;
    const before = clause.slice(0, index);
    return !/(?:屏幕|监视器|照片|海报|倒影)(?:中|上|里|内|显示|映出|呈现)[^。；，]*$/.test(before)
      && !/(?:不再|不要|避免)(?:站在|坐在|走进|切到)?$/.test(before);
  });
}

/** Keep a source location only when the current scene explicitly supports it.
 * A screen or photograph can depict another location without changing sets. */
export function salesBeatSceneError(visual: string, currentScene: string): string {
  if (!currentScene.match(venuePattern)) return '';
  const venues = new Set(visual.match(venuePattern) || []);
  for (const venue of venues) {
    const aliases = venue === '咖啡馆' || venue === '咖啡厅' ? ['咖啡馆', '咖啡厅'] :
      venue === '影棚' || venue === '摄影棚' ? ['影棚', '摄影棚'] : [venue];
    if (aliases.some(name => currentScene.includes(name))) continue;
    const physicalLocation = new RegExp(`(?:站在|坐在|走进|走入|置身|位于|回到|切到|切入|转场到|^(?:女主|男主|模特|人物)?在)(?:了|原片的|原来的|原|旧)?${venue}`);
    if (visual.split(/[。；;，,\n]/).some(clause =>
      physicalLocation.test(clause) && describesSet(clause, venue))) {
      return `仍要求进入或置身「${venue}」，请将该段改为当前场景中的站位或动作。`;
    }
  }
  return '';
}

export function unresolvedSalesEntityError(text: string, exclusions: readonly SalesSourceExclusion[], currentNames: readonly string[], sceneEvidence: string): string {
  const terms = exclusions.filter(item => item.type !== 'copy_claim').map(item => ({ ...item, term: item.term.trim() }))
    .filter(item => item.term.length >= 2 && text.includes(item.term) && !(item.type === 'scene'
      ? sceneEvidence.includes(item.term) || !describesSet(text, item.term) : currentNames.some(name => name.includes(item.term))))
    .map(item => item.term);
  return terms.length ? `分镜仍引用已排除的原片实体：${[...new Set(terms)].join('、')}。请明确替换对应的当前资产后再生成。` : '';
}
