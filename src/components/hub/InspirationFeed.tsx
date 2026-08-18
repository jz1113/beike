'use client';
import { useState } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { 
  Search, 
  Sparkles, 
  Copy, 
  Check,
  Eye,
  ImageIcon,
  Flame,
  ArrowUpRight
} from 'lucide-react';
import InspirationModal, { InspirationItem } from './InspirationModal';

interface Props {
  onUsePrompt: (prompt: string, refImage?: string) => void;
  onOpenProductVault: () => void;
}

export default function InspirationFeed({ onUsePrompt, onOpenProductVault }: Props) {
  const [searchTerm, setSearchTerm] = useState('');
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const [selectedModalItem, setSelectedModalItem] = useState<InspirationItem | null>(null);

  // 高美感商用爆款案例库（100% 真实 AI 旗舰模型生成）
  const INSPIRATION_ITEMS = [
    {
      id: 'item-video-seedance-1',
      category: 'video',
      tag: '🎬 爆款视频 · Seedance 2.5',
      title: '现代生活方式 Vlog · 法式白门与绿意窗景',
      prompt: '一位年轻漂亮亚洲女性@1，人脸参考 @2。\n场景位于明亮的现代室内@3，有白色法式玻璃门和能看到户外绿树的大窗户，室内有电视和摆放着水果盘的桌子。\n现代生活方式Vlog风格，自然柔和光线。她先坐在桌前平静地看着镜头；下个镜头接着站在窗边眺望；\n随后在白色门前自信地摆弄姿势、轻抚头发；最后她背对镜头走动，并迷人地回头看镜头。\n镜头景别在中景和全景之间切换，带有些许手持跟拍感。时尚、休闲、优雅。人物表情自信，眼神柔和且具有吸引力。',
      image: '/inspirations/vlog_seedance.mp4',
      video: '/inspirations/vlog_seedance.mp4',
      mediaType: 'video' as const,
      author: {
        name: '贝壳云图',
        badge: '官方精选'
      },
      likes: 119,
      date: '2026-08-16 | 内容由 AI 生成',
      aspectRatio: '3:4',
      model: 'Seedance 2.5',
      quality: '720P'
    },
    {
      id: 'item-1',
      isBanner: true,
      category: 'illustration',
      tag: '🔥 热门推荐',
      title: '东方丧彪猫 · 极简主义情感素描美学',
      prompt: '极简主义素描风格，空气感强，松散的细密长线条，精致的涂抹，形式多变，写意，细节敲定，情愫流连，叠加态，神秘感，非常规不对称构图，动态模糊，抽象，标新立异，震撼，意境，大幅留白，高对比度黑色，空灵的氛围，夸张的比例，褪色的边缘，手绘的不完美，最小的阴影，光密度梯度，梦幻般的构图，平静的负空间，情感艺术素描美学，猫，丧彪，东方，极繁，全身入镜。',
      image: '/inspirations/insp_1.png',
    },
    {
      id: 'item-2',
      category: 'illustration',
      tag: '奇幻插画',
      title: 'Dan Gartman 风格 · 极简神秘插画',
      prompt: 'Dan Gartman风格插画，极简主义，奇幻插画，不对称构图。神秘阴暗，极致细节，传统色彩高饱和的融合对比碰撞来搭配，oc渲染，神秘，孤寂，留白，震撼，超高清画质，无文字。',
      image: '/inspirations/insp_2.png',
    },
    {
      id: 'item-3',
      category: 'photo',
      tag: '治愈禅意',
      title: '雨中小和尚 · 荷叶撑伞微距漫步',
      prompt: '以微距的视角，生成一幅简约透明的白色线条人物，下雨天，一个小和尚（缩小迷你版），手上撑着一片荷叶挡雨，孤独在雨中漫步，背后有小白兔小鸡跟着，实景清晰，背景虚化，禅意、治愈系，人物小点',
      image: '/inspirations/insp_3.png',
    },
    {
      id: 'item-4',
      category: 'illustration',
      tag: '先锋前卫',
      title: '丝网印波斯猫 · 先锋极简抽象点绘',
      prompt: '创意想象，极简，大幅留白，先锋前卫，极简抽象，抽象的简约形态，由极少几个关键元素构成强烈视觉焦点，简约氛围，丝网印刷的点绘效果突出极简质感，艺术风格明显，波丝猫，无文字。',
      image: '/inspirations/insp_4.png',
    },
    {
      id: 'item-5',
      category: '3d',
      tag: 'CG厚涂',
      title: '暗夜流光少年 · 3D厚涂超现实情绪人像',
      prompt: '32K超高清画质，全局抗锯齿，OC引擎与虚拟引擎双渲染，新三维CG写实质感。水彩插画结合3D动漫厚涂画风，韩系二次元厚涂融合CG半厚涂，伪厚涂线条利落锐利，笔触流畅富有肌理。兼具手绘笔触、油画肌理与淡淡BJD人偶拟真质感，写实逼真，超现实主义，获奖插画水准。 配色大胆鲜活，色彩柔和弥漫。大师级配色，明暗对比强烈，光影错落斑斓，漫射柔光包裹人物。柔和漫射暖调柔光温润覆盖面部，面部阴影立体自然，明暗过渡细腻。叠加细腻磨砂颗粒噪点，低帧抓拍轻微柔糊，朦胧氛围，无过度锐化，清透与写实相融。人物周身生物发光，画面细碎细闪整体泛光，叠加迷离朦胧滤镜，边缘动态模糊。浓郁二次元氛围，清冷神秘，梦幻缥缈，意识流层次饱满。',
      image: '/inspirations/insp_5.png',
    },
    {
      id: 'item-6',
      category: '3d',
      tag: '国风建模',
      title: '国风妖孽帅哥 · 超写实角色设定三视图',
      prompt: '人物形象提示词：（三视图） 1.主视觉区 (上方)以 "正面 + 侧面 + 背面" 三个核心视角为主体，直观呈现角色的整体身形、服饰搭配和标志性特征，是制作人员对人物 "整体造型" 的参考基础。 2.补充信息区 (左侧)拆分出 "面部特写" 和 "配色板"(明确毛发、服饰的色值)，补充主视角没覆盖的细节与色彩标准。 3.局部细节区 (底部)用小模块单独展示关键部件的设计 (配饰、点缀、关键身份识别元素)，把主视角里的 "模糊细节" 拆分为精准的制作参考，方便导演确认。 4.全身照比例照 (右侧)使用黄金比例参考物和人物身高形成对比。 5.背景为白色，最高品质细节丰富。 6【真人写实】超写实国风，现代风格，写实风格，质感光照，自然光线，质感十足，8K高清纹理，布料褶皱自然，艺术写实风格，营造出震撼的视觉效果。',
      image: '/inspirations/insp_6.png',
    },
    {
      id: 'item-7',
      category: 'illustration',
      tag: '微景观',
      title: '春日微景观 · 3D厚涂奔跑小狗插画',
      prompt: '厚涂风格，3D，微景观，厚涂，厚薄不同塑造立体感，俯视图，居中斜构图的一抹不规则的厚厚的草绿色闪光颜料，上面（可爱的小狗汪汪队，奔跑的小狗，云彩，花朵小草，小鸟），极简俯视图，画面底部写着纤细艺术字“Spring is coming”，*大面积留白*，白色纸张纹理背景。',
      image: '/inspirations/insp_7.png',
    },
    {
      id: 'item-8',
      category: 'ecommerce',
      tag: '美食食谱',
      title: '番茄牛腩食谱 · 小红书爆款信息图海报',
      prompt: '高分辨率中文菜谱信息图海报，番茄牛腩，成品特写，红亮番茄酱汁浓郁有光泽，牛腩肉块软烂，食材细节清晰，热气腾腾，极具食欲感。 版式设计：结构化菜谱排版，上方大标题，中间食材区，下方步骤区，信息层级清晰，易读性强。 风格：小红书爆款菜谱风，干净现代中文排版，标题醒目，生活化又高级。 背景：浅米色/暖白色纸质纹理背景，干净柔和不过于单调。 光影：自然柔光，轻微暖色调，阴影柔和，真实食物质感。 摄影感：50mm美食摄影，浅景深，真实质感，高清细节，轻微胶片颗粒感，3:4',
      image: '/inspirations/insp_8.png',
    },
    {
      id: 'item-9',
      category: 'illustration',
      tag: '水墨写意',
      title: '辽阔草原人流 · 钢笔水墨混彩写意画',
      prompt: '钢笔水墨混彩，创意构图，唯美感受，情愫写意，质感和肌理，极简风格，大面积留白，不拘一格的创意，质感，浮凸，笨庸笔触，内涵，深意，隽永，虚拟，描绘，辽阔草原，小小人流',
      image: '/inspirations/insp_9.png',
    },
    {
      id: 'item-10',
      category: 'ecommerce',
      tag: '日式甜品',
      title: '抹茶芝士蛋糕 · 高级日式禅意商业海报',
      prompt: '高级日式禅意甜品海报，竖版商业美食海报，高级日式禅意，铺满细腻抹茶粉的绿色背景，抹茶粉地面带有多处同心圆水波纹纹路；画面上方白色文字 “KUMO KUMO CHEESE”，居中竖排白色书法字体 “春日初摘”，右侧方形小字印章 “三倍绿意”；画面中间，圆形抹茶芝士蛋糕放置在黑色高脚圆盘上，蛋糕顶面烙印棕色文字 “CHEESE KUMO KUMO”；画面右下角摆放竹制茶筅，底部左侧文字 “三倍抹茶芝士蛋糕、TRIPLE MATCHA CHEESECAKE”，柔和自然光，4K 超高清，85mm f1.8 镜头，质感细腻，高级清新抹茶色调，商业广告质感，构图干净精致',
      image: '/inspirations/insp_10.png',
    },
    {
      id: 'item-11',
      category: 'photo',
      tag: '甜美写真',
      title: '春日蔷薇少女 · 清新冷白皮户外胶片人像',
      prompt: '真实摄影，亚洲美少女薇薇，身着白色短袖上衣（带小标志）、格纹下装，背着粉色布袋，手持粉色蔷薇花枝；站在开满粉色蔷薇的路边（旁有公路、远处绿植），整体风格清新甜美，充满春日户外的烂漫美感，电影级面光，光线追踪，冷白皮漫感质感的光滑皮肤，人物有最好的骨相，网感脸，网感妆，身材完美，莫兰迪配色，高颜值网红，INS风，幼态脸，19岁女生尖下巴，三庭五眼比例均衡，身材娇小，细腻陶瓷水嫩肌肤，偏冷白皮，侧光，发丝轻飘，凌乱，随机角度拍摄，风格甜美少女系，氛围慵懒俏皮，东方美女。',
      image: '/inspirations/insp_11.png',
    },
    {
      id: 'item-12',
      category: '3d',
      tag: '3D潮玩',
      title: '毛绒哆啦A梦 · 极端透视Q萌翻白眼特写',
      prompt: '绒毛材质，极端透视，干净白背景，3D渲染，极简，Q萌，艺术性，光线追踪，朦胧感，光影加重，硕大的胖嘟嘟的哆啦A梦背部特写，扭头，翻白眼，皮毛质感纹理。',
      image: '/inspirations/insp_12.png',
    },
    {
      id: 'item-13',
      category: 'ecommerce',
      tag: '复古穿搭',
      title: '复古港风穿搭 · 90年代胶片测评封面',
      prompt: '封面设计：复古港风穿搭测评，采用90年代胶片质感与复古海报结合的设计，主标题“港风穿搭测评”用厚重风格的酒红色艺术字，搭配金色细描边，下方配米白色字体深棕描边英文“Vintage Hong Kong Style Review”。标题左侧添加“RETRO”复古标识。副标题“经典款穿搭实穿指南”用暖橙色艺术字体，背景为浅褐色仿旧纹理，画面中心融入一位穿着黑色收腰连衣裙、戴黑色宽檐帽的穿搭博主形象，周围点缀手绘风格的配饰插画（珍珠耳环、复古单肩包、粗跟皮鞋），整体色彩浓郁复古，充满怀旧氛围感与参考性。',
      image: '/inspirations/insp_13.png',
    },
    {
      id: 'item-14',
      category: 'photo',
      tag: '夜景自拍',
      title: '夜间街头自拍 · 超写实微风波浪卷发少女',
      prompt: '一张超写实、细节丰富的年轻女性夜间人行道自拍图。她有着长且带波浪的深棕色头发，被风微微吹得有些凌乱。双眼明亮，嘴唇呈可爱的嘟起状，唇色自然。身着一件修身的灰色背心。背景是夜间城市景象：带有纹理的铺装人行道，有几辆车（包括一辆白色车）的马路，散发柔和光芒的路灯，以及郁郁葱葱的树木和植被。光线是环境夜光与人工光源的混合，营造出带有精准阴影和高光的真实夜间氛围。从发丝到人行道纹理，再到细微的光影效果，每一处细节都被极致精准地呈现。',
      image: '/inspirations/insp_14.png',
    },
    {
      id: 'item-15',
      category: 'photo',
      tag: '买家秀随拍',
      title: '夜间街头手机随拍 · 19岁冷白皮氛围感女生',
      prompt: '漂亮女生，19岁网红女，冷白皮。棕色长卷发（被风吹动，略显凌乱），黑色上衣，夜晚户外街道场景（背景、马路、树木、昏暗的环境）给皮肤镀上一层清透的质感，带着“夜间随拍”的网感，既日常又有氛围感，手机拍摄风格，古早滤镜，做可爱表情',
      image: '/inspirations/insp_15.png',
    },
    {
      id: 'item-16',
      category: 'photo',
      tag: '宿命梦核',
      title: '宿命梦核 · 绿意春日烂漫光影叙事',
      prompt: '宿命感，故事感，be，有创意性，艺术气息，风格模糊 梦核感，绿色系，树枝茂密，蓝天，光影斑斓，气质，超高清画质，细节丰富，精致感强，朦胧，极致超清，极致细节，春天，高质量，极致细节，温柔透明，阳光普照，极致烂漫，极致宿命感，悲剧感',
      image: '/inspirations/insp_16.png',
    },
    {
      id: 'item-17',
      category: 'illustration',
      tag: '单线写意',
      title: 'Adam Riches 艺术风格 · 连续单线抽离群像',
      prompt: 'Adam Riches艺术风格，以单线连续绘画为语言，让彩色圆珠笔在纸上游走成即兴的线条集合，单线条时而密集，时而疏朗，这些看似无序的轨迹，堆叠，最终在画布上随性勾勒出抽象群体，画风写意，皆由线条的韵律叙事，构建抽象暗黑空间，重组出平面线条的立体感，人文写实大师，复杂光影与层叠构图，混乱中藏着精准叙事，艺术性，高级感，意境，艺术性大幅留白，自然百态。',
      image: '/inspirations/insp_17.png',
    },
    {
      id: 'item-18',
      category: 'illustration',
      tag: '角色设定集',
      title: '电影级角色设定集 · 科幻人形机器人牛仔',
      prompt: '电影级角色设定集，照片级真实感人形机器人牛仔，带有明显金属关节的白色机械躯体，发光的蓝色数字笑脸，头戴棕色牛仔帽，身穿只有一只长袖棕色皮夹克，夹克长袖手臂上方镶嵌着一块银色的“超”字圆形金属徽章，脖子系红色方巾，带大银扣的西部风格皮带，臀部枪套，做旧机械质感，并且在人物右侧单独放上（枪支，帽子，方巾，夹克，腰带）这些配件的形象图，科幻西部美学，超细节，8K，焦点清晰，ARRI Alexa 65拍摄，体积光，用于角色设计参考的干净纯色背景',
      image: '/inspirations/insp_18.jpg',
    },
    {
      id: 'item-19',
      category: 'illustration',
      tag: '梵高油画',
      title: '梵高油画英短猫 · 格子头巾Q萌插画',
      prompt: '油画，梵高风格作品，欧美艺术插画，绘本插画，一只戴着蓝白色格子花头巾的猫咪，猫咪品种是英短猫，笔触细腻，油画笔触明显，写意，极简，猫咪的脸圆嘟嘟，表情震惊但是很可爱，超近景手绘插图，Q版。淡紫色背景。',
      image: '/inspirations/insp_19.png',
    },
    {
      id: 'item-20',
      category: 'illustration',
      tag: '唯美水彩',
      title: '慕夏风黑猫芍药 · 水彩透叠宁静插画',
      prompt: '慕夏风格插画，线条感通透，主角是黑色猫咪，水彩透叠， 颜色淡雅和谐。清新淡雅脱俗，色调温馨柔和，营造出一种宁静，愉快的氛围、故事感，完美构图，超多逼真细节，高清，超清，粉白芍药，大师级构图，大师级绘画水准精雕细琢，唯美精致浪漫',
      image: '/inspirations/insp_20.png',
    },
    {
      id: 'item-21',
      category: 'ecommerce',
      tag: '七夕刺绣',
      title: '七夕刺绣喜鹊 · 丝绸缎带浪漫海报',
      prompt: '两只精致的刺绣喜鹊，翅膀纹理清晰；它们飞翔状态，绣在一条流畅飘逸的粉色渐变丝绸缎带上，具有柔软的褶皱和高级光泽。 浪漫的情人节 / 七夕主题，浅粉色渐变背景，带有柔和的弥散光效和隐约的心形轮廓光斑，氛围梦幻、唯美、轻盈。 丝绸材质顺滑，光线柔和均匀，高光细腻，整体色调为低饱和度的蜜桃粉。 竖屏构图，中景特写，焦点集中在喜鹊与丝绸的互动上，画面充满空气感与浪漫气息。 完整文案排版 顶部英文：Valentine\'s Day（浅色大字背景底纹） 左侧主标题：七夕（黑色书法大字） 主标题旁竖排小字：因爱恒久 右侧日期区域：2026/08/19 右下角寄语：不七而遇 满心欢夕',
      image: '/inspirations/insp_21.png',
    },
    {
      id: 'item-22',
      category: 'ecommerce',
      tag: '烘焙美食',
      title: '法式欧包新品 · 烘焙商业美食海报',
      prompt: '法式欧包新品海报 竖版烘焙新品商业海报，浅咖色干净纯色背景，法式经典烘焙主题，顶部文字 “全新上市、New Arrival”，居中大号金色手写字体标题「轻食欧包」；画面摆放四款欧包面包：抹茶青稞红豆碱水包、牛油果干酪巧心欧包、生巧乳酪碱水球、生椰咖啡干酪欧包，面包旁摆放咖啡豆，巧克力块，干酪；每个面包配有对应中英文字标签，画面最下方绿色英文标识 “Bakery”，柔和自然光，高清美食摄影，法式风格，画面干净柔和，细节清晰，4K，浅绿暖调，精细面包肌理 负面提示词 水印、模糊、畸变、多余杂物、混乱背景、错误文字、人物、强烈阴影、暗沉色调、面包造型崩坏、多余水印 logo',
      image: '/inspirations/insp_22.png',
    },
    {
      id: 'item-23',
      category: 'illustration',
      tag: '国风素描',
      title: '赵云极简素描 · 东方意境空灵美学',
      prompt: '极简主义素描风格，空气感强，松散的细密长线条，精致的涂抹，形式多变，写意，细节敲定，情愫流连，叠加态，神秘感，非常规不对称构图，动态模糊，抽象，标新立异，震撼，意境，大幅留白，高对比度黑色，空灵的氛围，夸张的比例，褪色的边缘，手绘的不完美，最小的阴影，光密度梯度，梦幻般的构图，平静的负空间，情感艺术素描美学，赵云，东方，极繁，人物全身入镜。',
      image: '/inspirations/insp_23.png',
    },
    {
      id: 'item-24',
      category: '3d',
      tag: '先锋特写',
      title: '明代锦衣卫 · Armin Hofmann 极简特写',
      prompt: 'Armin Hofmann风格，一幅超高清的特写画面：在极度深蓝的背景里，夸张抽象变形的东方神秘黑衣明代锦衣卫指挥使，高鼻梁，丹凤眼，容颜绝美，五官精致立体，身穿深蓝色飞鱼服，神秘、威严的氛围。仰角拍摄，酷炫风格。聚焦人物面部，使其从黑暗中窥视着世界。高品质细节，超精细，高分辦率，最佳品质，C4D，32K壁纸，eyes half closin the dark, in the style of Roberto Ferri and Hajime Sorayama',
      image: '/inspirations/insp_24.png',
    },
    {
      id: 'item-25',
      category: 'photo',
      tag: '高端美妆',
      title: '韩系Clean Girl · 高端无瑕水光美妆大片',
      prompt: '高端美妆画面，画面主角是自拍向美妆韩国14岁女星，童星，幼态脸，洋娃娃般可爱，美妆直播，美妆教学，美妆博主，妆容展示，皮肤毛孔清晰可见，清透粉底，iphone直播，（发型随机，妆容随机，配饰随机，表情多变） 整体审美偏向Clean girl 与韩系美妆风格。她拥有无瑕水润的玻璃肌肤质，皮肤亮度高、光泽感通透；妆容为高级伪素颜妆：嘴唇为水润唇釉；整体妆感轻薄、干净、不刻意。搭配小巧的耳钉与细款项链，配饰克制而精致。 重点突出面颊高光与耳饰细节； 强调肌肤与线条。 整体采用柔和商业级棚拍灯光，人物眼中可见环形灯反光，色彩去饱和，肤色温暖通透，对比度偏高，整体呈现高端、超写实的美妆摄影质感，适合杂志内页或品牌视觉使用。 情感叙事和电影质感的人文纪实摄影作品，突出镜头的独特光学特性。瞬间捕捉感，安静的故事性。低饱和度，整体色彩柔和、克制。轻微暗角效应，焦点锐利区域与焦外虚化过渡自然。加入轻微且细腻的胶片颗粒感。',
      image: '/inspirations/insp_25.png',
    },
    {
      id: 'item-26',
      category: 'ecommerce',
      tag: '妆容指南',
      title: '日系纯欲妆容指南 · 小红书爆款信息图',
      prompt: '设计一张小红书爆款风格《圆脸女孩日系纯欲伪素颜妆容指南》信息图海报。 整体风格为： 日系美妆杂志、轻奢高级感、小红书种草海报、美妆教程信息图、现代UI设计、Pinterest风格。 版式采用： 中间人物大图 + 左右模块化教程 + 底部推荐产品与妆容总结。 大量圆角信息卡片、箭头标注、虚线引导、数字步骤、图文结合、杂志排版、专业视觉层级。 整体配色： 奶白色、杏色、浅粉色、暖米色、莫兰迪粉、柔和高级。 人物： 东亚年轻女生，圆脸，皮肤白皙透亮，五官精致，笑容自然，空气刘海，发顶蓬松，整体充满少女感。 底妆： 日系纯欲伪素颜底妆，轻薄透明，清透水光肌或柔焦微雾肌，不厚重，保留皮肤纹理，自然光泽感。 眼妆： 裸粉色与大地色眼影，自然渐变。 重点打造饱满卧蚕。 自然根根分明的睫毛。 放大双眼但不过度夸张。 内眼线贴近睫毛根部。 整体温柔亲和。 腮红修容： 蜜桃粉腮红从苹果肌最高点斜扫至太阳穴，提升面部重心。 下颌线轻微阴影修饰轮廓，打造自然小V脸。 唇妆： 果冻唇、水光唇釉、豆沙粉色。 无明显唇线。 嘴唇饱满、水润、少女感十足。 画面增加多个标注： ✔ 底妆 ✔ 卧蚕 ✔ 睫毛 ✔ 腮红 ✔ 修容 ✔ 唇妆 ✔ 发型建议 底部增加： 化妆步骤、推荐彩妆单品、妆容Tips、圆脸女孩妆容避坑指南。 摄影风格： 专业美妆广告摄影，柔光棚拍，自然肤质，真实皮肤纹理，高级商业大片质点。 输出要求： 超高清8K，杂志级排版，专业信息图，文字清晰，适合小红书封面和美妆教程海报。',
      image: '/inspirations/insp_26.png',
    },
    {
      id: 'item-27',
      category: 'ecommerce',
      tag: '对比步骤',
      title: '5分钟通勤伪素颜妆 · 对比与步骤图谱',
      prompt: '核心视觉： 人物一致性（最高权重）： 画面中央展示一位亚洲女性美妆博主，面部特征、五官及发型。 妆容与配饰： 极度自然清透的“5分钟伪素颜心机妆”。妆面强调原生感，仅有大地色眼影、纤长睫毛、腮红和润唇膏，发型为利落的低马尾。 红笔标记与步骤对应（逻辑核心）： 在右侧完妆人物的面部，使用哑光深灰色的细箭头引出5条指示线，分别指向妆容的5个关键部位，并按顺序标注中文：1. 消肿眼影；2. 内眼线；3. 睫毛定型；4. 提气腮红；5. 唇部打底。 排版布局： 顶部： 中文标题“通勤伪素颜妆”，搭配时钟图标。副标题“5分钟快手妆 干净提气色”。 中部（对比区）： 左右分屏设计。左侧为该人物“护肤后素颜”，右侧为“完妆后”。中间用简洁的箭头和“5min”文字标识连接。 下部（强关联步骤预览区）： 设置横向滑动的圆角卡片栏，展示5个与面部标记严格对应的步骤图： 单色哑光大地色眼影快速铺扫的特写； 用棕色眼线胶笔填充睫毛根部的特写； 用睫毛打底膏刷出原生睫毛感的特写； 用腮红膏在面颊拍开的特写； 涂抹有色润唇膏的特写。 底部（互动区）： “上滑学习技巧”箭头，“点击查看产品清单”按钮，笔记与时钟图标。 风格： 高清商业摄影质感结合极简UI设计，光影自然柔和，色彩低饱和度，肤质纹理真实细腻，呈现高级生活方式品牌的干净视觉风格',
      image: '/inspirations/insp_27.png',
    }
  ];

  const filteredItems = INSPIRATION_ITEMS.filter(item => {
    if (searchTerm.trim()) {
      return item.title.toLowerCase().includes(searchTerm.toLowerCase()) || item.prompt.toLowerCase().includes(searchTerm.toLowerCase());
    }
    return true;
  });

  const handleCopy = (text: string, idx: number, e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(text);
    setCopiedIdx(idx);
    setTimeout(() => setCopiedIdx(null), 2000);
  };

  const handleApply = (prompt: string, img?: string) => {
    onUsePrompt(prompt, img);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="w-full space-y-4 pt-2 select-none">
      {/* 🌟 1. 发现分类与行内搜索栏 */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-2 select-none">
        {/* 左侧：发现标签 + 行内搜索框 */}
        <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
          <div className="flex items-center bg-[#F4F5F8] p-1 rounded-full text-xs font-bold text-slate-900">
            <span className="px-3.5 py-1 rounded-full bg-white text-slate-900 shadow-2xs font-extrabold">
              发现
            </span>
          </div>

          {/* 行内搜索框 */}
          <div className="relative w-48 sm:w-60">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              placeholder="搜索爆款灵感 / 提示词"
              className="w-full pl-8.5 pr-3 py-1.5 rounded-full bg-[#F4F5F8] border border-transparent text-xs text-slate-800 placeholder-slate-400 outline-none focus:border-slate-300 focus:bg-white transition-all shadow-2xs"
            />
          </div>
        </div>

        {/* 右侧：我的商品库 / 我的发布 */}
        <div className="flex items-center gap-2">
          <button
            onClick={onOpenProductVault}
            className="text-xs font-semibold text-slate-500 hover:text-slate-900 px-3 py-1.5 rounded-full hover:bg-slate-100 transition-colors cursor-pointer"
          >
            我的商品库
          </button>
        </div>
      </div>

      {/* 🌟 2. 即梦同款灵感瀑布流 (首张支持活动大横幅 Banner 卡片，其余为紧凑纯图瀑布流) */}
      <div className="columns-2 sm:columns-3 md:columns-4 lg:columns-5 xl:columns-5 2xl:columns-6 gap-3 [column-fill:_balance]">
        {filteredItems.map((item, idx) => {
          const isSpecialBanner = idx === 0 && !searchTerm;

          return (
            <div
              key={item.id}
              onClick={() => setSelectedModalItem(item)}
              className={`break-inside-avoid mb-3 w-full inline-block rounded-2xl bg-slate-100 shadow-2xs hover:shadow-lg transition-all duration-300 overflow-hidden group cursor-pointer relative border border-slate-100 ${
                isSpecialBanner ? 'ring-1 ring-amber-500/20' : ''
              }`}
            >
              {/* 纯净图片/视频主体 */}
              <div className="relative w-full overflow-hidden">
                {item.mediaType === 'video' || item.video || item.image.endsWith('.mp4') ? (
                  <div className="relative w-full">
                    <video
                      src={item.video || item.image}
                      autoPlay
                      loop
                      muted
                      playsInline
                      className="w-full h-auto object-cover block transition-transform duration-500 group-hover:scale-103 rounded-2xl"
                    />
                    <div className="absolute top-2.5 left-2.5 z-10 px-2 py-0.5 rounded-md bg-black/70 backdrop-blur-md text-white text-[10px] font-bold flex items-center gap-1 shadow-xs">
                      <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse"></span>
                      <span>Seedance 2.5 视频</span>
                    </div>
                  </div>
                ) : (
                  <img
                    src={item.image}
                    alt={item.title}
                    loading="lazy"
                    className="w-full h-auto object-cover block transition-transform duration-500 group-hover:scale-103"
                  />
                )}

                {/* 🌟 特殊横幅底部固定常驻标签 (对标即梦 Banner：AI 广告爆改大赛 · 已有 2415 人参与) */}
                {isSpecialBanner && (
                  <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/85 via-black/40 to-transparent p-3 text-white pointer-events-none">
                    <div className="text-xs font-extrabold leading-snug drop-shadow-sm">
                      AI 广告爆改大赛 · 经典广告你来演！
                    </div>
                    <div className="flex items-center justify-between mt-1 text-[10px] text-white/80 font-medium">
                      <span>已有 2415 人参与</span>
                      <div className="flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-white"></span>
                        <span className="w-1 h-1 rounded-full bg-white/50"></span>
                        <span className="w-1 h-1 rounded-full bg-white/50"></span>
                        <span className="w-1 h-1 rounded-full bg-white/50"></span>
                      </div>
                    </div>
                  </div>
                )}

                {/* 悬停毛玻璃与快捷做同款浮层 */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-black/30 opacity-0 group-hover:opacity-100 transition-all duration-200 flex flex-col justify-between p-3">
                  {/* 顶部标签与复制 */}
                  <div className="flex items-center justify-between w-full">
                    <span className="px-2 py-0.5 rounded-md bg-black/60 backdrop-blur-md text-white text-[10px] font-bold shadow-xs">
                      {item.tag}
                    </span>
                    <button
                      type="button"
                      onClick={(e) => handleCopy(item.prompt, idx, e)}
                      className="p-1.5 rounded-md bg-black/60 hover:bg-black/90 backdrop-blur-md text-white transition-colors cursor-pointer"
                      title="复制提示词"
                    >
                      {copiedIdx === idx ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                    </button>
                  </div>

                  {/* 底部标题与做同款操作按钮 */}
                  <div className="space-y-2">
                    <p className="text-white text-xs font-semibold line-clamp-1 drop-shadow-md">
                      {item.title}
                    </p>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleApply(item.prompt, item.image);
                      }}
                      className="w-full py-1.5 px-2 rounded-xl bg-white hover:bg-slate-50 text-slate-900 text-xs font-bold shadow-md flex items-center justify-center gap-1 active:scale-95 transition-all cursor-pointer"
                    >
                      <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                      <span>做同款</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* 🌟 3. 灵感大图详情与做同款模态框 */}
      <InspirationModal
        item={selectedModalItem}
        allItems={filteredItems}
        isOpen={!!selectedModalItem}
        onClose={() => setSelectedModalItem(null)}
        onUsePromptOnly={(prompt) => {
          onUsePrompt(prompt);
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }}
        onUseAsReference={(prompt, imgUrl) => {
          onUsePrompt(prompt, imgUrl);
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }}
        onNavigate={(newItem) => setSelectedModalItem(newItem)}
      />
    </div>
  );
}
