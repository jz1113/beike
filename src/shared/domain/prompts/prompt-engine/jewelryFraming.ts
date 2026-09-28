import type { JewelryAnatomyType } from './roles';

const JEWELRY_TYPES = new Set(['bracelet', 'ring', 'necklace', 'earring', 'hairpin', 'jewelry']);

export function isJewelryAnatomy(anatomy: JewelryAnatomyType | string): boolean {
  return JEWELRY_TYPES.has(anatomy);
}

/** Skip jewelry near-shot converter when the caller wants the source composition kept. */
export function resolveJewelryShotOptics(args: {
  shotNo: number;
  anatomy: JewelryAnatomyType | string;
  actionText: string;
  cameraText: string;
  angleText: string;
  preserveComposition?: boolean;
}): { cameraText: string; angleText: string } {
  let { cameraText, angleText } = args;
  const { shotNo, anatomy, actionText, preserveComposition } = args;
  if (!isJewelryAnatomy(anatomy) || preserveComposition) {
    return { cameraText, angleText };
  }

  if (shotNo === 1 || /微距|特写|近景/i.test(actionText) || /微距|特写|近景/i.test(angleText)) {
    if (anatomy === 'bracelet') {
      cameraText = 'iPhone 85mm-100mm f/2.8 手腕特写与中近景镜头（Tight Wrist Close-Up Frame）';
      angleText = '平视或微俯角手腕局部特写，单侧手腕置于黄金分割中心，手镯清晰占据画面 40%~60% 核心面积，严禁全身/远景';
    } else if (anatomy === 'necklace') {
      cameraText = 'iPhone 85mm f/2.2 端庄领口与锁骨近景肖像镜头（Tight Bust-Up Portrait）';
      angleText = '胸部以上端庄领口与锁骨自拍近景，项链吊坠位于画面视觉中心（40%~60% 面积），严禁全身/远景';
    } else if (anatomy === 'hairpin') {
      cameraText = 'iPhone 100mm f/2.8 侧后方发髻超清微距镜头（Hairpin Macro Frame）';
      angleText = '45°侧颜与低发髻微距特写，发簪占据画面 40%~60% 视觉中心，严禁正面遮挡，严禁全身';
    } else if (anatomy === 'earring') {
      cameraText = 'iPhone 100mm f/2.8 侧颜耳际超清微距特写镜头（Earring Macro Frame）';
      angleText = '45°侧颜耳部局部特写，耳饰位于核心焦点（35%~55% 面积），严禁全身';
    } else if (anatomy === 'ring') {
      cameraText = 'iPhone 100mm f/2.8 手指超清微距特写镜头（Ring Macro Frame）';
      angleText = '手部自然舒展搭在桌畔，戒指占据画面 40%~60% 核心视觉焦点，严禁全身';
    } else {
      cameraText = 'iPhone 100mm f/2.8 超清微距特写镜头（Tight Close-Up Frame）';
      angleText = '局部中近景特写，首饰占据画面 40%~60% 核心面积，严禁全身/远景';
    }
    return { cameraText, angleText };
  }

  if (cameraText.includes('超广角') || cameraText.includes('全景镜头') || cameraText.includes('24mm') || cameraText.includes('35mm')) {
    cameraText = 'iPhone 85mm f/2.0 人像中近景镜头（Medium Close-Up Portrait）';
  }
  if (angleText.includes('全景') || angleText.includes('远景') || angleText.includes('全身') || !angleText) {
    if (anatomy === 'bracelet' || anatomy === 'ring') {
      angleText = '中近景半身坐姿抓拍，佩戴首饰的手部/手腕自然抬起或搭在桌面，手部与首饰清晰处于画幅焦点';
    } else if (anatomy === 'necklace') {
      angleText = '胸部以上端庄近景半身肖像，颈间项链居中清晰受光';
    } else {
      angleText = '45°侧颜半身近景抓拍，首饰佩戴部位清晰展示';
    }
  }
  return { cameraText, angleText };
}
