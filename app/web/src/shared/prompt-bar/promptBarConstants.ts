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

export interface SubjectItem {
  id: string;
  name: string;
  url: string;
}

/** 按进入顺序生成主体展示名：1、2、3… (有命名时优先用原名，无命名用序号) */
export function formatSubjectName(index: number): string {
  return `${index + 1}`;
}
