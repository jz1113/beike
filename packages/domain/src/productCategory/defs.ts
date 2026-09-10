export type ActionCategoryId =
  | 'jewelry'
  | 'digital_3c'
  | 'apparel'
  | 'bag'
  | 'shoes'
  | 'beauty'
  | 'eyewear'
  | 'universal';

/** 二级细分类目数据结构 */
export interface SubCategoryDef {
  id: string;
  parentId: ActionCategoryId;
  label: string;
  shortLabel: string;
  anchorId?: string;
  anatomy?: string;
  keywords: string[];
  isCustom?: boolean;
}

/** 兼容旧版命名 */
export type JewelrySubCategoryDef = SubCategoryDef;

export const JEWELRY_SUBCATEGORIES: SubCategoryDef[] = [
  {
    id: 'necklace',
    parentId: 'jewelry',
    label: '项链/锁骨链',
    shortLabel: '项链',
    anchorId: 'collarbone',
    anatomy: 'necklace',
    keywords: ['项链', '锁骨链', '吊坠', '项圈', '毛衣链', 'necklace', 'pendant', 'choker', '锁骨', '抚胸', '捻链', '托坠'],
  },
  {
    id: 'bracelet',
    parentId: 'jewelry',
    label: '手镯/手串',
    shortLabel: '手镯',
    anchorId: 'wrist',
    anatomy: 'wrist',
    keywords: ['手镯', '手链', '手串', '玉镯', '金镯', '珠串', 'bracelet', 'bangle', '手腕', '露腕', '理袖', '搭肩'],
  },
  {
    id: 'ring',
    parentId: 'jewelry',
    label: '戒指/指环',
    shortLabel: '戒指',
    anchorId: 'fingers',
    anatomy: 'fingers',
    keywords: ['戒指', '指环', '戒圈', '婚戒', '钻戒', 'ring', '指尖', '展戒', '抚唇', '抚颊', '双手交叠'],
  },
  {
    id: 'earring',
    parentId: 'jewelry',
    label: '耳饰/耳环',
    shortLabel: '耳饰',
    anchorId: 'ear',
    anatomy: 'ear',
    keywords: ['耳饰', '耳环', '耳钉', '耳坠', '耳夹', 'earring', 'ear', '耳际', '耳垂', '撩发露耳', '下颌线'],
  },
  {
    id: 'hairpin',
    parentId: 'jewelry',
    label: '发簪/发饰',
    shortLabel: '发饰',
    anchorId: 'hair',
    anatomy: 'hair',
    keywords: ['发簪', '发饰', '发夹', '发钗', '步摇', 'hairpin', 'hair', '发髻', '后脑', '盘发', '挽发', '发带'],
  },
  {
    id: 'brooch',
    parentId: 'jewelry',
    label: '胸针/别针',
    shortLabel: '胸针',
    anchorId: 'brooch',
    anatomy: 'brooch',
    keywords: ['胸针', '别针', '领针', 'brooch', 'pin', '翻领', '衣襟', '胸前', '抚襟'],
  },
];

export const DIGITAL_3C_SUBCATEGORIES: SubCategoryDef[] = [
  {
    id: 'camera_deco',
    parentId: 'digital_3c',
    label: '镜头模组',
    shortLabel: '镜头',
    anchorId: 'camera_deco',
    anatomy: 'camera_deco',
    keywords: ['镜头模组', '后置镜头', '摄像模组', '大底镜头', '潜望长焦', 'camera_deco'],
  },
  {
    id: 'screen_bezel',
    parentId: 'digital_3c',
    label: '正面屏幕',
    shortLabel: '屏幕',
    anchorId: 'screen_bezel',
    anatomy: 'screen_bezel',
    keywords: ['正面屏幕', '全面屏', '屏幕边框', '超窄边框', '亮屏', 'screen_bezel'],
  },
  {
    id: 'side_profile',
    parentId: 'digital_3c',
    label: '金属中框',
    shortLabel: '中框',
    anchorId: 'side_profile',
    anatomy: 'side_profile',
    keywords: ['金属中框', '中框特写', '按键机身', '超薄机身', '边缘弧度', 'side_profile'],
  },
  {
    id: 'hand_holding',
    parentId: 'digital_3c',
    label: '握持/对镜拍',
    shortLabel: '握持',
    anchorId: 'hand_holding',
    anatomy: 'hand_holding',
    keywords: ['握持', '对镜自拍', '滑屏触控', '横屏游戏', '手持手机', '双手打字', 'hand_holding'],
  },
];

export const APPAREL_SUBCATEGORIES: SubCategoryDef[] = [
  {
    id: 'collar',
    parentId: 'apparel',
    label: '领口/领型',
    shortLabel: '领口',
    anchorId: 'collarbone',
    anatomy: 'collar',
    keywords: ['领口', '翻领', '立领', 'V领', '方领', '领型', '衣领'],
  },
  {
    id: 'cuffs',
    parentId: 'apparel',
    label: '袖口/手袖',
    shortLabel: '袖口',
    anchorId: 'wrist',
    anatomy: 'cuffs',
    keywords: ['袖口', '手袖', '挽袖', '泡泡袖', '法式袖', '袖边'],
  },
  {
    id: 'waist',
    parentId: 'apparel',
    label: '腰线/版型',
    shortLabel: '腰线',
    anchorId: 'waist',
    anatomy: 'waist',
    keywords: ['腰线', '收腰', '腰带', '腰部剪裁', '版型', '廓形'],
  },
  {
    id: 'hemline',
    parentId: 'apparel',
    label: '裙摆/裤脚',
    shortLabel: '下摆',
    anchorId: 'hemline',
    anatomy: 'hemline',
    keywords: ['裙摆', '裤脚', '下摆', '开叉', '垂坠感', '摆动'],
  },
];

export const DEFAULT_SUBCATEGORIES_MAP: Record<ActionCategoryId, SubCategoryDef[]> = {
  jewelry: JEWELRY_SUBCATEGORIES,
  digital_3c: DIGITAL_3C_SUBCATEGORIES,
  apparel: APPAREL_SUBCATEGORIES,
  bag: [],
  shoes: [],
  beauty: [],
  eyewear: [],
  universal: [],
};

export const SUBCATEGORY_STORAGE_KEY_PREFIX = 'antigravity_category_subcategories_v1_';
