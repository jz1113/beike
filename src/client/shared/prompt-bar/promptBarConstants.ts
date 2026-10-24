// 图片比例选项列表
export const IMAGE_RATIO_ITEMS = [
  { id: 'smart', label: '智能', ratio: 'auto', w: 2048, h: 2731, iconType: 'smart' },
  { id: '21:9', label: '21:9', ratio: '21:9', w: 2560, h: 1080, iconType: 'ultrawide' },
  { id: '16:9', label: '16:9', ratio: '16:9', w: 2560, h: 1440, iconType: 'wide169' },
  { id: '3:2', label: '3:2', ratio: '3:2', w: 2160, h: 1440, iconType: 'wide32' },
  { id: '4:3', label: '4:3', ratio: '4:3', w: 2731, h: 2048, iconType: 'wide43' },
  { id: '1:1', label: '1:1', ratio: '1:1', w: 2048, h: 2048, iconType: 'square' },
  { id: '3:4', label: '3:4', ratio: '3:4', w: 2048, h: 2731, iconType: 'tall34' },
  { id: '2:3', label: '2:3', ratio: '2:3', w: 1440, h: 2160, iconType: 'tall23' },
  { id: '9:16', label: '9:16', ratio: '9:16', w: 1440, h: 2560, iconType: 'tall916' }
];

// Gemini / Nano Banana 扩展宽高比选项（含 5:4, 4:5 及 2.1/3.1 Flash 支持的 4:1, 1:4, 8:1, 1:8）
export const EXTENDED_IMAGE_RATIO_ITEMS = [
  { id: '5:4', label: '5:4', ratio: '5:4', w: 2304, h: 1856, iconType: 'wide43' },
  { id: '4:5', label: '4:5', ratio: '4:5', w: 1856, h: 2304, iconType: 'tall34' },
  { id: '4:1', label: '4:1', ratio: '4:1', w: 4096, h: 1024, iconType: 'ultrawide' },
  { id: '1:4', label: '1:4', ratio: '1:4', w: 1024, h: 4096, iconType: 'tall916' },
  { id: '8:1', label: '8:1', ratio: '8:1', w: 6144, h: 768, iconType: 'ultrawide' },
  { id: '1:8', label: '1:8', ratio: '1:8', w: 768, h: 6144, iconType: 'tall916' },
];

export const ALL_IMAGE_RATIO_ITEMS = [...IMAGE_RATIO_ITEMS, ...EXTENDED_IMAGE_RATIO_ITEMS];

export interface SubjectItem {
  id: string;
  name: string;
  url: string;
}

/** 按进入顺序生成主体展示名：1、2、3… (有命名时优先用原名，无命名用序号) */
export function formatSubjectName(index: number): string {
  return `${index + 1}`;
}
