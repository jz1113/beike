import type { InspirationItem } from '../components/inspiration/InspirationModal';

const MEDIA_ROOT = '/inspirations/imported-20260910';

const billboardPrompt = (subject: string, action: string) =>
  `竖版超写实商业街拍合成海报。夜晚城市商业广场，蓝色树灯与红色灯笼形成冷暖对比，湿润街道路面带轻微反光。画面上半部是一块巨型弧形裸眼 3D 户外屏幕，屏幕中为周杰伦风格的黑发男歌手，穿黑黄拼色机车皮衣，坐在银色跑车驾驶位，从车窗递出黄色品牌购物袋；下半部${subject}，${action}。强调人物与巨幕之间的尺度反差、真实透视和自然空间光，高饱和蓝橙电影调色，人物面部清晰，85mm 商业人像质感，细腻皮肤纹理，背景灯光散景，画面锐利、时尚、具有节日氛围与社交媒体打卡感，4K，无多余人物，无肢体畸变。`;

const muralPrompt = (subject: string) =>
  `竖版潮流商业广告合影。现代玻璃幕墙建筑外立面铺设巨幅汽车广告，周杰伦风格的黑发男歌手穿黑黄赛车皮衣坐在银色跑车内，从车窗递出白黄品牌购物袋；前景${subject}，身穿黑色机车皮衣，以夸张近大远小的透视将一杯奶茶递向镜头，形成与背景明星隔空互动的创意合照。黄、黑、银为主色，夕阳蓝粉渐变天空映在玻璃与车身上，低机位广角构图，商业摄影级布光，人物轮廓干净，皮革、车漆、塑料杯和纸袋材质真实，广告文案清晰，年轻潮酷，适合品牌联名活动宣传，超高清细节。`;

export const IMPORTED_IMAGE_INSPIRATIONS: InspirationItem[] = [
  {
    id: 'imported-image-jay-collab-01', category: 'photo', tag: '明星合影 · 品牌联名',
    title: '巨幕车窗递奶茶 · 潮酷联名合照',
    prompt: muralPrompt('一位短发年轻男生'), image: `${MEDIA_ROOT}/jay-collab-01.jpg`,
    aspectRatio: '3:4', author: { name: '贝壳云图', badge: '精选案例' }, date: '2026-09-10 | 用户素材',
  },
  {
    id: 'imported-image-jay-collab-02', category: 'photo', tag: '节日街拍 · 巨幕打卡',
    title: '新春灯会巨幕 · 福字提灯合影',
    prompt: billboardPrompt('一位短发年轻男生站在画面中央', '身穿黑色长大衣与米色针织衫，戴针织手套，一手举红色福字卡片，一手提发光中式小灯笼，直视镜头自然微笑'), image: `${MEDIA_ROOT}/jay-collab-02.jpg`,
    aspectRatio: '3:4', author: { name: '贝壳云图', badge: '精选案例' }, date: '2026-09-10 | 用户素材',
  },
  {
    id: 'imported-image-jay-collab-03', category: 'photo', tag: '夜景人像 · 巨幕打卡',
    title: '冬夜巨幕街拍 · 围巾男生看手机',
    prompt: billboardPrompt('一位短发年轻男生站在画面中央', '身穿深色长大衣、棕色针织衫与格纹围巾，低头查看手机，另一只手提暖光中式灯笼，神态自然克制'), image: `${MEDIA_ROOT}/jay-collab-03.jpg`,
    aspectRatio: '3:4', author: { name: '贝壳云图', badge: '精选案例' }, date: '2026-09-10 | 用户素材',
  },
  {
    id: 'imported-image-jay-collab-04', category: 'photo', tag: '商业街拍 · 购物打卡',
    title: '城市巨幕购物季 · 暖笑男士街拍',
    prompt: billboardPrompt('一位年轻男士站在画面中央', '身穿黑色长大衣与灰色高领针织衫，双手拿手机并提牛皮纸购物袋，面向镜头自然微笑，呈现都市购物后的轻松状态'), image: `${MEDIA_ROOT}/jay-collab-04.jpg`,
    aspectRatio: '3:4', author: { name: '贝壳云图', badge: '精选案例' }, date: '2026-09-10 | 用户素材',
  },
  {
    id: 'imported-image-jay-collab-05', category: 'photo', tag: '女性街拍 · 巨幕打卡',
    title: '灯笼夜景巨幕 · 风衣女生手机抓拍',
    prompt: billboardPrompt('一位长卷发年轻女生站在画面中央', '身穿卡其色长风衣与黑色高领衫，一手查看手机、一手提棕色手袋，神态安静自然'), image: `${MEDIA_ROOT}/jay-collab-05.jpg`,
    aspectRatio: '3:4', author: { name: '贝壳云图', badge: '精选案例' }, date: '2026-09-10 | 用户素材',
  },
  {
    id: 'imported-image-jay-collab-06', category: 'photo', tag: '冬日街拍 · 巨幕打卡',
    title: '冬夜暖饮巨幕 · 女生咖啡合影',
    prompt: billboardPrompt('一位短卷发年轻女生站在画面中央', '身穿炭灰色长大衣、米色针织衫和针织手套，双手捧着咖啡杯，对镜头温暖微笑'), image: `${MEDIA_ROOT}/jay-collab-06.jpeg`,
    aspectRatio: '3:4', author: { name: '贝壳云图', badge: '精选案例' }, date: '2026-09-10 | 用户素材',
  },
  {
    id: 'imported-image-jay-collab-07', category: 'photo', tag: '冬日穿搭 · 巨幕打卡',
    title: '灯会咖啡街拍 · 格纹围巾女生',
    prompt: billboardPrompt('一位盘发年轻女生站在画面中央', '身穿黑色长大衣与格纹围巾，一手插袋、一手拿外带咖啡，肩背棕色手袋，侧望灯会微笑'), image: `${MEDIA_ROOT}/jay-collab-07.jpg`,
    aspectRatio: '3:4', author: { name: '贝壳云图', badge: '精选案例' }, date: '2026-09-10 | 用户素材',
  },
  {
    id: 'imported-image-jay-collab-08', category: 'photo', tag: '明星合影 · 奶茶广告',
    title: '白色机车风 · 递奶茶联名合照',
    prompt: muralPrompt('一位长发年轻女生'), image: `${MEDIA_ROOT}/jay-collab-08.jpeg`,
    aspectRatio: '3:4', author: { name: '贝壳云图', badge: '精选案例' }, date: '2026-09-10 | 用户素材',
  },
  {
    id: 'imported-image-jay-collab-09', category: 'photo', tag: '明星合影 · 奶茶广告',
    title: '城市车窗互动 · 笑容女生递奶茶',
    prompt: `${muralPrompt('一位长发年轻女生')} 前景女生露出自然灿烂笑容，白色机车夹克搭配黑色短上衣与浅蓝牛仔裤，奶茶杯贴近镜头形成强烈视觉焦点。`, image: `${MEDIA_ROOT}/jay-collab-09.jpeg`,
    aspectRatio: '3:4', author: { name: '贝壳云图', badge: '精选案例' }, date: '2026-09-10 | 用户素材',
  },
  {
    id: 'imported-image-jay-collab-10', category: 'photo', tag: '夜景男装 · 巨幕打卡',
    title: '蓝调商业街 · 连帽男生购物街拍',
    prompt: billboardPrompt('一位短发年轻男生全身站在画面中央', '身穿藏蓝长大衣叠搭灰色连帽衫、牛仔裤与皮靴，一手拿手机、一手提牛皮纸购物袋，迈步走向镜头，神情冷静'), image: `${MEDIA_ROOT}/jay-collab-10.jpg`,
    aspectRatio: '3:4', author: { name: '贝壳云图', badge: '精选案例' }, date: '2026-09-10 | 用户素材',
  },
];
