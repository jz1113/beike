/**
 * 全渠道电商商品全量规格参数 (Props) 深度提取与智能解析引擎
 * 支持解析 OneBound 结构化字段、京东/淘宝原生参数结构，以及从商品标题深度提炼核心工业设计与硬件卖点
 */

/**
 * 从商品标题智能解析核心硬件配置、芯片、影像、屏幕、续航与工艺卖点 (8维矩阵)
 */
export function extractSpecsFromTitle(title: string): Record<string, string> {
  const specs: Record<string, string> = {};
  if (!title || typeof title !== 'string') return specs;
  const t = title.trim();

  // 1. 品牌与系列
  if (/iQOO/i.test(t)) specs['品牌系列'] = 'vivo iQOO 旗舰系列';
  else if (/vivo|X200|S20|S60|Y300/i.test(t)) specs['品牌系列'] = 'vivo 蓝厂旗舰系列';
  else if (/iPhone|iPad|MacBook|Apple/i.test(t)) specs['品牌系列'] = 'Apple 苹果原装系列';
  else if (/Redmi|红米|K80|Note\s*14|Note\s*17/i.test(t)) specs['品牌系列'] = '小米 Redmi 性能系列';
  else if (/小米|Xiaomi|MIX/i.test(t)) specs['品牌系列'] = '小米 Xiaomi 高端系列';
  else if (/华为|HUAWEI|Mate|Pura|Nova/i.test(t)) specs['品牌系列'] = '华为 HUAWEI 鸿蒙系列';
  else if (/一加|OnePlus/i.test(t)) specs['品牌系列'] = 'OPPO 一加旗舰系列';
  else if (/OPPO|Find|Reno/i.test(t)) specs['品牌系列'] = 'OPPO 美学旗舰系列';
  else if (/荣耀|HONOR|Magic/i.test(t)) specs['品牌系列'] = '荣耀 HONOR 旗舰系列';
  else if (/ROG|玩家国度|ASUS|华硕/i.test(t)) specs['品牌系列'] = '华硕 ROG 电竞系列';
  else if (/AOC|飞利浦|戴尔|DELL|联想|Lenovo|拯救者/i.test(t)) specs['品牌系列'] = '一线数码电脑/外设品牌';

  // 2. 核心处理器与 AI 芯片
  const chipMatch = t.match(/(骁龙\s*8\s*至尊版|骁龙\s*[\w\d+至尊版]+|天玑\s*9400[\w+]*|天玑\s*[\w\d+]+|麒麟\s*[\w\d+]+|A\d+\s*Pro|A\d+\s*Bionic|M\d+\s*(?:Pro|Max|Ultra)?|自研电竞芯片\w*|自研影像芯片\w*|自研\w+芯片|第二代红枫影像鸿蒙AI|鸿蒙AI|AI自研芯片)/i);
  if (chipMatch) specs['核心处理器/AI芯片'] = chipMatch[0].trim();

  // 3. 影像系统与摄像头规格
  const cameraMatch = t.match(/(第二代红枫影像|蔡司\s*APO\s*超级长焦|蔡司\s*[\w\d]+|哈苏影像|徕卡影调|索尼\s*LYT-?\d+|潜望式长焦|2亿像素|5000万超光变|1\.08亿像素|超清防抖三摄|超光影潜望长焦|超聚光微距长焦|大底主摄)/i);
  if (cameraMatch) specs['影像与镜头系统'] = cameraMatch[0].trim();

  // 4. 屏幕规格与显示形态
  const screenMatch = t.match(/(\d+(?:\.\d+)?英寸(?:[\w\s\dK]+)?|2K\s*(?:[\w\s\dHz]+)?|1\.5K\s*(?:[\w\s\dHz]+)?|144Hz[\w\s\d]*|120Hz[\w\s\d]*|240Hz[\w\s\d]*|280Hz[\w\s\d]*|8T\s*LTPO|等深微曲屏|微四曲屏|直屏|曲面屏|珠峰屏|OLED|IPS|高刷护眼屏)/i);
  if (screenMatch) specs['屏幕形态与规格'] = screenMatch[0].trim();

  // 5. 存储配置与运行内存
  const memMatch = t.match(/(\d+GB\s*\+\s*\d+(?:GB|TB)|\d+G\s*\+\s*\d+(?:G|T)|\d+GB\s*内存|\d+TB\s*存储|\d+G\s*大内存)/i);
  if (memMatch) specs['存储与运行内存'] = memMatch[0].replace(/\s+/g, '').trim();

  // 6. 电池容量与闪充功率
  const batteryMatch = t.match(/(\d{4,5}mAh(?:[\w\s大电池]+)?|\d+W(?:[\w\s]+快充|闪充|有线秒充)?|超薄蓝海电池|金沙江电池|青海湖电池)/i);
  if (batteryMatch) specs['电池容量与续航'] = batteryMatch[0].trim();

  // 7. 机身工艺与特色亮点
  const craftMatch = t.match(/(湿手秒开超声波指纹2\.0|超声波指纹2\.0|3D超声波指纹|昆仑玻璃|玄武架构|陶瓷后盖|钛金属边框|素皮机身|IP68|IP69|卫星通信|北斗卫星消息|双扬声器|红外遥控|多功能NFC)/i);
  if (craftMatch) specs['特色工艺与黑科技'] = craftMatch[0].trim();

  // 8. 操作系统与软件生态
  const osMatch = t.match(/(HarmonyOS\s*NEXT|HarmonyOS\s*[\d\.]*|鸿蒙\s*[\d\.]*|iOS\s*\d+|OriginOS\s*\d+|HyperOS\s*\d*|澎湃OS\s*\d*|ColorOS\s*\d+|MagicOS\s*\d+)/i);
  if (osMatch) specs['操作系统与生态'] = osMatch[0].trim();

  return specs;
}

/**
 * 全面整合并清洗 OneBound 与原生渠道的商品全量属性
 */
export function buildComprehensiveProductProps(params: {
  title?: string;
  brand?: string;
  category?: string;
  weight?: string | null;
  rawProps?: any;
  rawPropsList?: any;
  rawPropsName?: any;
  rawSkus?: any;
  saleProp?: Record<string, string>;
  salePropSeq?: Record<string, string[]>;
}): Record<string, string> {
  const {
    title = '',
    brand = '',
    category = '',
    weight,
    rawProps,
    rawPropsList,
    rawPropsName,
    rawSkus,
    saleProp,
    salePropSeq
  } = params;

  const result: Record<string, string> = {};

  // 1. 先注入品牌、品类与毛重
  if (brand && brand.trim()) {
    result['品牌'] = brand.trim();
  }
  if (category && category.trim() && category !== '全品类') {
    result['商品分类'] = category.trim();
  }
  if (weight && typeof weight === 'string' && weight.trim()) {
    result['商品毛重'] = weight.trim();
  }

  // 2. 解析 OneBound 结构化 props 数组 (形如 [{ name: '屏幕规格', value: '直屏' }, ...])
  if (Array.isArray(rawProps)) {
    rawProps.forEach((p: any) => {
      if (!p) return;
      let k = (p.name || p.key || p.prop_name || '').toString().trim();
      let v = (p.value || p.val || p.prop_value || '').toString().trim();
      if (k && v) {
        result[k] = v;
      }
    });
  } else if (typeof rawProps === 'object' && rawProps !== null) {
    for (const [k, v] of Object.entries(rawProps)) {
      if (typeof v === 'string' && v.trim()) {
        result[k.trim()] = v.trim();
      }
    }
  }

  // 3. 解析 OneBound props_list 对象 (形如 { "0:0": "尺码:S85-95斤", "1:0": "颜色:花色" })
  if (rawPropsList && typeof rawPropsList === 'object') {
    const groups: Record<string, string[]> = {};
    for (const rawVal of Object.values(rawPropsList)) {
      if (typeof rawVal === 'string' && rawVal.includes(':')) {
        const parts = rawVal.split(':');
        const k = parts[0].trim();
        const v = parts.slice(1).join(':').trim();
        if (k && v) {
          if (!groups[k]) groups[k] = [];
          if (!groups[k].includes(v)) groups[k].push(v);
        }
      }
    }
    for (const [k, vList] of Object.entries(groups)) {
      result[k] = vList.join(' | ');
    }
  }

  // 4. 解析 OneBound props_name 字符串 (形如 "0:0:尺码:S85-95斤;1:0:颜色:花色;")
  if (rawPropsName && typeof rawPropsName === 'string') {
    const groups: Record<string, string[]> = {};
    const segments = rawPropsName.split(';').map(s => s.trim()).filter(Boolean);
    for (const seg of segments) {
      const parts = seg.split(':');
      if (parts.length >= 4) {
        const k = parts[2].trim();
        const v = parts.slice(3).join(':').trim();
        if (k && v) {
          if (!groups[k]) groups[k] = [];
          if (!groups[k].includes(v)) groups[k].push(v);
        }
      }
    }
    for (const [k, vList] of Object.entries(groups)) {
      if (!result[k]) {
        result[k] = vList.join(' | ');
      }
    }
  }

  // 5. 解析京东原生销售属性 (saleProp & salePropSeq)
  if (saleProp && salePropSeq) {
    for (const [keyIndex, propName] of Object.entries(saleProp)) {
      const seqValues = salePropSeq[keyIndex];
      if (Array.isArray(seqValues) && seqValues.length > 0) {
        const cleanedName = String(propName).trim();
        const cleanedValues = seqValues.map(v => String(v).trim()).filter(Boolean);
        if (cleanedName && cleanedValues.length > 0) {
          result[cleanedName] = cleanedValues.join(' | ');
        }
      }
    }
  }

  // 6. 解析 SKUs 规格组合列表 (提取 properties_name)
  if (rawSkus?.sku && Array.isArray(rawSkus.sku)) {
    const skuGroups: Record<string, string[]> = {};
    for (const skuItem of rawSkus.sku) {
      const pName = skuItem?.properties_name;
      if (typeof pName === 'string' && pName.includes(':')) {
        const segments = pName.split(';').map((s: string) => s.trim()).filter(Boolean);
        for (const seg of segments) {
          const parts = seg.split(':');
          if (parts.length >= 4) {
            const k = parts[2].trim();
            const v = parts.slice(3).join(':').trim();
            if (k && v) {
              if (!skuGroups[k]) skuGroups[k] = [];
              if (!skuGroups[k].includes(v)) skuGroups[k].push(v);
            }
          }
        }
      }
    }
    for (const [k, vList] of Object.entries(skuGroups)) {
      if (!result[k]) {
        result[k] = vList.join(' | ');
      }
    }
  }

  // 7. 🌟 深度兜底补充：无论接口是否完整，自动从标题中提取并补齐关键硬件/设计卖点
  const fromTitle = extractSpecsFromTitle(title);
  for (const [k, v] of Object.entries(fromTitle)) {
    if (!result[k] && v) {
      result[k] = v;
    }
  }

  return result;
}
