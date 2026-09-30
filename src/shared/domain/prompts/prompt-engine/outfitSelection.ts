/**
 * 判断穿搭描述是否为无效/泛化占位词或非服装名词
 */
export function isGenericLook(text?: string | null): boolean {
  if (!text) return true;
  const s = text.trim();
  if (s.length === 0) return true;
  if (/^(?:与商品调性匹配的简洁上装|协调上装|简洁上装|简约上装|协调下装|干净利落的下装|简约下装|简洁下装|简约鞋履|无抢镜配饰|商品陈设以\s*@图片\s*1\s*为准|佩戴\/使用\s*@图片\s*1\s*所示商品)$/.test(s)) return true;
  // 非具体服装词或抽象摄影/形态词拦截（杜绝提取出“轮廓”、“面向”等）
  if (/^(?:轮廓|面向|姿态|全身|半身|神态|镜头|画面|构图|比例|光影|视角|衣服|服装|穿搭|服饰|造型|搭配|外貌|细节)$/.test(s)) return true;
  if (/^(?:高级显白质感私服穿搭|质感私服穿搭|显白穿搭|私服穿搭|日常穿搭|质感穿搭)$/.test(s)) return true;
  return false;
}

/**
 * 从提示词文本中智能提炼具体穿搭（提取上装、下装或全身裙装）
 */
export function extractOutfitFromPrompt(prompt: string): { top?: string; bottom?: string; full?: string } | null {
  if (!prompt) return null;
  const segments = prompt.split(/[；;]/).map(s => s.trim()).filter(Boolean);
  // 必须是具体的穿搭声明，排除“呈现服装轮廓”、“服饰质感”等非穿搭句
  const garmentRe = /(?:身着|身穿|穿着|穿搭|上身搭配|上身穿|服饰搭配|服装穿搭)[：:\s]*([^；;]+)/i;
  const nonGarmentHeadRe = /^(?:轮廓|面向|姿态|神态|全身|半身|镜头|画面|构图|比例|角度|透视|细节|光线|阴影|氛围)/;

  for (const seg of segments) {
    if (/@图片\s*1/.test(seg)) continue; // 跳过包含商品的槽位声明
    const m = seg.match(garmentRe);
    if (m && m[1]) {
      const outfitStr = m[1].replace(/^(?:一件|一套|一条|身)/, '').trim();
      if (nonGarmentHeadRe.test(outfitStr)) continue;
      if (!isGenericLook(outfitStr) && outfitStr.length >= 4) {
        // 尝试拆分上装与下装
        const subParts = outfitStr
          .split(/(?:[，,、\s]*(?:搭配|下穿|下着|下身穿|下身搭配)[，,、\s]*|[，,、\s]+配[，,、\s]*|[，,、\s]+)/)
          .map(s => s.trim())
          .filter(Boolean);
        if (subParts.length >= 2) {
          if (isGenericLook(subParts[0]) || nonGarmentHeadRe.test(subParts[0])) continue;
          if (isGenericLook(subParts[1]) || nonGarmentHeadRe.test(subParts[1])) {
            return {
              top: subParts[0],
              full: outfitStr,
            };
          }
          return {
            top: subParts[0],
            bottom: subParts[1],
            full: outfitStr,
          };
        }
        if (!isGenericLook(outfitStr) && !nonGarmentHeadRe.test(outfitStr)) {
          return {
            top: outfitStr,
            full: outfitStr,
          };
        }
      }
    }
  }
  return null;
}

/**
 * 小红书博主多元时尚穿搭智能推断库（根据人群受众、商品风格与场景上下文有机匹配，绝不使用单一固定模板）
 */
export function resolveDiverseDefaultOutfit(productFingerprint = '', contextText = ''): { top: string; bottom: string } {
  const text = `${productFingerprint} ${contextText}`.toLowerCase();

  // 1. 男士品类
  if (/男士|男款|男表|男戒|男装|扳指|皮带|打火机|men/i.test(text)) {
    const menOutfits = [
      { top: '极简深灰重磅落肩纯棉T恤', bottom: '垂感黑色直筒休闲西裤' },
      { top: '随性微敞领口深蓝亚麻衬衫', bottom: '浅卡其直筒休闲裤' },
      { top: '质感酷飒炭灰色休闲西装内搭白T', bottom: '深色修身牛仔裤' },
      { top: '极简黑白拼色运动卫衣', bottom: '黑色束脚运动休闲裤' },
    ];
    const idx = Math.abs(hashCode(text)) % menOutfits.length;
    return menOutfits[idx];
  }

  // 2. 宝宝/儿童/母婴品类
  if (/宝宝|儿童|婴儿|小童|新生儿|长命锁|童镯|婴儿手绳|母婴|baby|kid/i.test(text)) {
    const babyOutfits = [
      { top: '纯棉软糯米白连体爬服', bottom: '柔软纯棉连体裤脚' },
      { top: '温柔鹅黄色婴儿纯棉小哈衣', bottom: '纯棉小短裤' },
      { top: '淡雅浅蓝纯棉透气婴儿服', bottom: '纯棉婴儿裤' },
      { top: '喜庆红色中式刺绣小肚兜与纯棉小衫', bottom: '纯棉红短裤' },
    ];
    const idx = Math.abs(hashCode(text)) % babyOutfits.length;
    return babyOutfits[idx];
  }

  // 3. 旅行度假/海滨/户外风格（端庄防走光、得体显白）
  if (/海边|沙滩|海岛|度假|旅行|露营|草坪|户外|湖畔|雪山|栈道|travel|resort|vacation/i.test(text)) {
    const travelOutfits = [
      { top: '法式小方领浅米色透气亚麻长裙', bottom: '飘逸垂坠长裙摆' },
      { top: '慵懒轻薄棉麻白衬衫（微敞第一颗纽扣自然展露锁骨）', bottom: '浅蓝高腰直筒牛仔裤' },
      { top: '温柔落日色优雅小方领长裙', bottom: '浪漫飘逸裙身' },
      { top: '户外随性工装风短袖衬衫内搭纯白圆领T恤', bottom: '卡其色宽松工装休闲裤' },
    ];
    const idx = Math.abs(hashCode(text)) % travelOutfits.length;
    return travelOutfits[idx];
  }
  
  // 4. 黄金/古法/玉石类（优雅端庄、质感显白）
  if (/黄金|足金|金镯|古法|金条|金手镯|玉镯|翡翠|和田玉|南红|玛瑙/i.test(text)) {
    const goldOutfits = [
      { top: '软糯慵懒奶油白圆领马海毛开衫', bottom: '复古高腰直筒微喇牛仔裤' },
      { top: '法式复古小方领微落肩针织上衣', bottom: '垂感高腰黑色阔腿裤' },
      { top: '极简黑色正肩圆领打底衫外搭轻薄开衫', bottom: '垂坠黑色直筒长裤' },
      { top: '温柔燕麦色小圆领羊绒针织衫', bottom: '浅卡其直筒休闲西裤' },
    ];
    const idx = Math.abs(hashCode(text)) % goldOutfits.length;
    return goldOutfits[idx];
  }

  // 5. 珍珠/仙气/细链类（清透温婉、端庄防走光）
  if (/珍珠|淡水珠|澳白|大溪地|母贝|碎银|仙气|锁骨链|吊坠/i.test(text)) {
    const pearlOutfits = [
      { top: '慵懒宽松男友风微挺括白衬衫（端庄露出锁骨正中）', bottom: '浅蓝高腰直筒牛仔裤' },
      { top: '法式优雅复古小方领平口长裙', bottom: '垂感雪纺半身长裙' },
      { top: '温柔鹅黄色小圆领针织开衫', bottom: '白色直筒牛仔裤' },
      { top: '优雅小方领泡泡袖法式小衫', bottom: '深色高腰阔腿西裤' },
    ];
    const idx = Math.abs(hashCode(text)) % pearlOutfits.length;
    return pearlOutfits[idx];
  }

  // 6. 钻石/彩宝/高奢珠宝类（端庄高级、名媛质感）
  if (/钻石|莫桑|彩宝|红宝石|蓝宝石|祖母绿|高奢|宴会/i.test(text)) {
    const luxuryOutfits = [
      { top: '高级质感小方领丝绒小黑裙', bottom: '修身垂坠长裙摆' },
      { top: '轻奢小香风粗花呢外套内搭极简纯白圆领打底衫', bottom: '高腰黑色西装长裤' },
      { top: '极简黑白拼色法式端庄长裙', bottom: '优雅修身裙身' },
      { top: '优雅缎面正肩微立领衬衫（自然展露锁骨项链）', bottom: '高腰垂感西装长裤' },
    ];
    const idx = Math.abs(hashCode(text)) % luxuryOutfits.length;
    return luxuryOutfits[idx];
  }

  // 7. 现代极简/中性/日常配饰
  const casualChicOutfits = [
    { top: '酷飒 Oversized 灰调休闲西装内搭纯白圆领T恤', bottom: '高腰直筒牛仔裤' },
    { top: '随性轻薄男友风白衬衫（领口自然展露锁骨项链）', bottom: '黑色垂感阔腿裤' },
    { top: '法式慵懒黑白条纹小圆领针织衫', bottom: '深蓝色高腰直筒牛仔裤' },
    { top: '极简修身纯黑小方领打底衫', bottom: '高腰浅灰直筒西裤' },
  ];
  const idx = Math.abs(hashCode(text || 'default')) % casualChicOutfits.length;
  return casualChicOutfits[idx];
}

function hashCode(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return hash;
}

