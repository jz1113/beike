import type { CoverStyleSkill } from './coverSkillTypes';

export const BUILTIN_COVER_STYLES: CoverStyleSkill[] = [
  {
    id: 'headline-bombastic',
    name: '爆款大字报',
    badge: '默认',
    description: '超粗黑体大字标题，两行错位压顶咬合，极高反差视觉冲击，适合电商结论款与信息流爆款。',
    isBuiltin: true,
    directorPrompt: '风格族：爆款大字报款。字体超粗黑体错位咬合，主体水平居中占高65%-74%，背景纸纹或双色微切面，突出结论式大字。',
    negativeRules: [
      '禁止彩虹渐变发光字',
      '禁止将大字完全与商品分离上下断层',
      '禁止出现额外虚假价格与促销标签',
    ],
    sampleCount: 28,
    updatedAt: Date.now(),
    features: {
      layout: {
        gridType: '居中压顶咬合',
        subjectAreaRatio: '68%',
        subjectAnchor: '水平居中偏下',
        whiteSpaceRatio: '15%',
        depthLayering: '文字压商品上沿咬合',
      },
      typography: {
        titleFontFamily: '超粗无衬线体(Black)',
        titleArrangement: '双行错位',
        letterSpacing: '紧凑吃满(-2%)',
        artTreatment: '黑底黄字块或极细描边反白',
      },
      colorPalette: {
        backgroundTone: '米白纸感灰或哑光深色',
        dominantColor: '#18181B',
        accentColor: '#F59E0B',
        contrastLevel: '极高反差',
        colorSourceRule: '强调色取自商品本体，总色数不超过三色',
      },
    },
  },
  {
    id: 'tech-review-dark',
    name: '数码硬核测评',
    badge: '极客',
    description: '深灰/碳黑科技底色，冷调品牌主色与参数角标，精密工业感，适合手机、相机、数码外设。',
    isBuiltin: true,
    directorPrompt: '风格族：深底数码测评款。背景近黑/品牌色哑光底加低对比度背景参数水印，标题为冷白或黄色描边字，排版带精密下划线与角标。',
    negativeRules: [
      '禁止大红大紫暖色调杂乱背景',
      '禁止出现动漫风或手绘涂鸦装饰',
      '禁止遮挡数码产品摄像头或屏幕核心部件',
    ],
    sampleCount: 15,
    updatedAt: Date.now(),
    features: {
      layout: {
        gridType: '右侧向心排列',
        subjectAreaRatio: '62%',
        subjectAnchor: '居中偏右',
        whiteSpaceRatio: '25%',
        depthLayering: '背景参数层 < 商品主体 < 前置核心大字',
      },
      typography: {
        titleFontFamily: '现代力量感黑体',
        titleArrangement: '左上顶格双行',
        letterSpacing: '稍收紧',
        artTreatment: '冷光微描边 + 细线参数注记',
      },
      colorPalette: {
        backgroundTone: '碳纤维灰/极夜黑(#0D0D11)',
        dominantColor: '#0F172A',
        accentColor: '#38BDF8',
        contrastLevel: '高反差冷色调',
        colorSourceRule: '背景极深，字体荧光冷青或科技黄',
      },
    },
  },
  {
    id: 'editorial-magazine',
    name: '清透杂志排版',
    badge: '高级',
    description: '柔和影棚光，米白微噪点背景，大面积留白与优雅衬线/精致黑体，适合美妆、穿搭、香氛与生活好物。',
    isBuiltin: true,
    directorPrompt: '风格族：清透杂志陈列款。背景有方向的柔光studio与巨型低对比背景字，标题偏左侧压，留白透气，排版精致温润。',
    negativeRules: [
      '禁止粗暴黑黄色块',
      '禁止粗厚多层描边与厚重阴影',
      '禁止大面积高饱和荧光色',
    ],
    sampleCount: 12,
    updatedAt: Date.now(),
    features: {
      layout: {
        gridType: '杂志留白侧压',
        subjectAreaRatio: '58%',
        subjectAnchor: '黄金分割偏右',
        whiteSpaceRatio: '32%',
        depthLayering: '背景大字半透 < 商品投影 < 侧边标题',
      },
      typography: {
        titleFontFamily: '精致无衬线/优雅宋体',
        titleArrangement: '阶梯错落',
        letterSpacing: '适度透气(+2%)',
        artTreatment: '纯净平滑无描边，点缀细边框印章',
      },
      colorPalette: {
        backgroundTone: '暖柔米白/淡石灰(#F9F9F8)',
        dominantColor: '#262626',
        accentColor: '#B45309',
        contrastLevel: '中高反差温润调',
        colorSourceRule: '来自商品大地色系与低饱和自然调',
      },
    },
  },
];

export const DEFAULT_STYLE_ID = 'headline-bombastic';
