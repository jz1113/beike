const fs = require('fs');
const path = require('path');

const BASE_URL = process.env.AI_DRAWING_BASE_URL || 'https://ai.comfly.org';
const API_KEY = process.env.AI_DRAWING_API_KEY || 'sk-zPD0Umv6ccqJjGoCZ1HJPpFD1wDqU5g66jsDEsj4K86dtXnZ';

const OUT_DIR = path.join(__dirname, '../public/inspirations');
if (!fs.existsSync(OUT_DIR)) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
}

const NEW_ITEMS = [
  {
    id: 19,
    category: 'illustration',
    tag: '梵高油画',
    title: '梵高油画英短猫 · 格子头巾Q萌插画',
    prompt: '油画，梵高风格作品，欧美艺术插画，绘本插画，一只戴着蓝白色格子花头巾的猫咪，猫咪品种是英短猫，笔触细腻，油画笔触明显，写意，极简，猫咪的脸圆嘟嘟，表情震惊但是很可爱，超近景手绘插图，Q版。淡紫色背景。3:4 竖构图。'
  },
  {
    id: 20,
    category: 'illustration',
    tag: '唯美水彩',
    title: '慕夏风黑猫芍药 · 水彩透叠宁静插画',
    prompt: '慕夏风格插画，线条感通透，主角是黑色猫咪，水彩透叠， 颜色淡雅和谐。清新淡雅脱俗，色调温馨柔和，营造出一种宁静，愉快的氛围、故事感，完美构图，超多逼真细节，高清，超清，粉白芍药，大师级构图，大师级绘画水准精雕细琢，唯美精致浪漫，3:4 竖构图。'
  },
  {
    id: 21,
    category: 'ecommerce',
    tag: '七夕刺绣',
    title: '七夕刺绣喜鹊 · 丝绸缎带浪漫海报',
    prompt: '两只精致的刺绣喜鹊，翅膀纹理清晰；它们飞翔状态，绣在一条流畅飘逸的粉色渐变丝绸缎带上，具有柔软的褶皱和高级光泽。 浪漫的情人节 / 七夕主题，浅粉色渐变背景，带有柔和的弥散光效和隐约的心形轮廓光斑，氛围梦幻、唯美、轻盈。 丝绸材质顺滑，光线柔和均匀，高光细腻，整体色调为低饱和度的蜜桃粉。 竖屏构图，中景特写，焦点集中在喜鹊与丝绸的互动上，画面充满空气感与浪漫气息。 完整文案排版 顶部英文：Valentine\'s Day（浅色大字背景底纹） 左侧主标题：七夕（黑色书法大字） 主标题旁竖排小字：因爱恒久 右侧日期区域：2026/08/19 右下角寄语：不七而遇 满心欢夕，3:4 竖屏比例。'
  },
  {
    id: 22,
    category: 'ecommerce',
    tag: '烘焙美食',
    title: '法式欧包新品 · 烘焙商业美食海报',
    prompt: '法式欧包新品海报 竖版烘焙新品商业海报，浅咖色干净纯色背景，法式经典烘焙主题，顶部文字 “全新上市、New Arrival”，居中大号金色手写字体标题「轻食欧包」；画面摆放四款欧包面包：抹茶青稞红豆碱水包、牛油果干酪巧心欧包、生巧乳酪碱水球、生椰咖啡干酪欧包，面包旁摆放咖啡豆，巧克力块，干酪；每个面包配有对应中英文字标签，画面最下方绿色英文标识 “Bakery”，柔和自然光，高清美食摄影，法式风格，画面干净柔和，细节清晰，4K，浅绿暖调，精细面包肌理 负面提示词 水印、模糊、畸变、多余杂物、混乱背景、错误文字、人物、强烈阴影、暗沉色调、面包造型崩坏、多余水印 logo，3:4 竖图'
  },
  {
    id: 23,
    category: 'illustration',
    tag: '国风素描',
    title: '赵云极简素描 · 东方意境空灵美学',
    prompt: '极简主义素描风格，空气感强，松散的细密长线条，精致的涂抹，形式多变，写意，细节敲定，情愫流连，叠加态，神秘感，非常规不对称构图，动态模糊，抽象，标新立异，震撼，意境，大幅留白，高对比度黑色，空灵的氛围，夸张的比例，褪色的边缘，手绘的不完美，最小的阴影，光密度梯度，梦幻般的构图，平静的负空间，情感艺术素描美学，赵云，东方，极繁，人物全身入镜，3:4 竖构图。'
  },
  {
    id: 24,
    category: '3d',
    tag: '先锋特写',
    title: '明代锦衣卫 · Armin Hofmann 极简特写',
    prompt: 'Armin Hofmann风格，一幅超高清的特写画面：在极度深蓝的背景里，夸张抽象变形的东方神秘黑衣明代锦衣卫指挥使，高鼻梁，丹凤眼，容颜绝美，五官精致立体，身穿深蓝色飞鱼服，神秘、威严的氛围。仰角拍摄，酷炫风格。聚焦人物面部，使其从黑暗中窥视着世界。高品质细节，超精细，高分辦率，最佳品质，C4D，32K壁纸，eyes half closin the dark, in the style of Roberto Ferri and Hajime Sorayama，3:4 竖构图。'
  },
  {
    id: 25,
    category: 'photo',
    tag: '高端美妆',
    title: '韩系Clean Girl · 高端无瑕水光美妆大片',
    prompt: '高端美妆画面，画面主角是自拍向美妆韩国14岁女星，童星，幼态脸，洋娃娃般可爱，美妆直播，美妆教学，美妆博主，妆容展示，皮肤毛孔清晰可见，清透粉底，iphone直播，（发型随机，妆容随机，配饰随机，表情多变） 整体审美偏向Clean girl 与韩系美妆风格。她拥有无瑕水润的玻璃肌肤质，皮肤亮度高、光泽感通透；妆容为高级伪素颜妆：嘴唇为水润唇釉；整体妆感轻薄、干净、不刻意。搭配小巧的耳钉与细款项链，配饰克制而精致。 重点突出面颊高光与耳饰细节； 强调肌肤与线条。 整体采用柔和商业级棚拍灯光，人物眼中可见环形灯反光，色彩去饱和，肤色温暖通透，对比度偏高，整体呈现高端、超写实的美妆摄影质感，适合杂志内页或品牌视觉使用。 情感叙事和电影质感的人文纪实摄影作品，突出镜头的独特光学特性。瞬间捕捉感，安静的故事性。低饱和度，整体色彩柔和、克制。轻微暗角效应，焦点锐利区域与焦外虚化过渡自然。加入轻微且细腻的胶片颗粒感，3:4 竖图'
  },
  {
    id: 26,
    category: 'ecommerce',
    tag: '妆容指南',
    title: '日系纯欲妆容指南 · 小红书爆款信息图',
    prompt: '设计一张小红书爆款风格《圆脸女孩日系纯欲伪素颜妆容指南》信息图海报。 整体风格为： 日系美妆杂志、轻奢高级感、小红书种草海报、美妆教程信息图、现代UI设计、Pinterest风格。 版式采用： 中间人物大图 + 左右模块化教程 + 底部推荐产品与妆容总结。 大量圆角信息卡片、箭头标注、虚线引导、数字步骤、图文结合、杂志排版、专业视觉层级。 整体配色： 奶白色、杏色、浅粉色、暖米色、莫兰迪粉、柔和高级。 人物： 东亚年轻女生，圆脸，皮肤白皙透亮，五官精致，笑容自然，空气刘海，发顶蓬松，整体充满少女感。 底妆： 日系纯欲伪素颜底妆，轻薄透明，清透水光肌或柔焦微雾肌，不厚重，保留皮肤纹理，自然光泽感。 眼妆： 裸粉色与大地色眼影，自然渐变。 重点打造饱满卧蚕。 自然根根分明的睫毛。 放大双眼但不过度夸张。 内眼线贴近睫毛根部。 整体温柔亲和。 腮红修容： 蜜桃粉腮红从苹果肌最高点斜扫至太阳穴，提升面部重心。 下颌线轻微阴影修饰轮廓，打造自然小V脸。 唇妆： 果冻唇、水光唇釉、豆沙粉色。 无明显唇线。 嘴唇饱满、水润、少女感十足。 画面增加多个标注： ✔ 底妆 ✔ 卧蚕 ✔ 睫毛 ✔ 腮红 ✔ 修容 ✔ 唇妆 ✔ 发型建议 底部增加： 化妆步骤、推荐彩妆单品、妆容Tips、圆脸女孩妆容避坑指南。 摄影风格： 专业美妆广告摄影，柔光棚拍，自然肤质，真实皮肤纹理，高级商业大片质感。 输出要求： 超高清8K，杂志级排版，专业信息图，文字清晰，适合小红书封面和美妆教程海报，3:4 竖图'
  },
  {
    id: 27,
    category: 'ecommerce',
    tag: '对比步骤',
    title: '5分钟通勤伪素颜妆 · 对比与步骤图谱',
    prompt: '核心视觉： 人物一致性（最高权重）： 画面中央展示一位亚洲女性美妆博主，面部特征、五官及发型。 妆容与配饰： 极度自然清透的“5分钟伪素颜心机妆”。妆面强调原生感，仅有大地色眼影、纤长睫毛、腮红和润唇膏，发型为利落的低马尾。 红笔标记与步骤对应（逻辑核心）： 在右侧完妆人物的面部，使用哑光深灰色的细箭头引出5条指示线，分别指向妆容的5个关键部位，并按顺序标注中文：1. 消肿眼影；2. 内眼线；3. 睫毛定型；4. 提气腮红；5. 唇部打底。 排版布局： 顶部： 中文标题“通勤伪素颜妆”，搭配时钟图标。副标题“5分钟快手妆 干净提气色”。 中部（对比区）： 左右分屏设计。左侧为该人物“护肤后素颜”，右侧为“完妆后”。中间用简洁的箭头和“5min”文字标识连接。 下部（强关联步骤预览区）： 设置横向滑动的圆角卡片栏，展示5个与面部标记严格对应的步骤图： 单色哑光大地色眼影快速铺扫的特写； 用棕色眼线胶笔填充睫毛根部的特写； 用睫毛打底膏刷出原生睫毛感的特写； 用腮红膏在面颊拍开的特写； 涂抹有色润唇膏的特写。 底部（互动区）： “上滑学习技巧”箭头，“点击查看产品清单”按钮，笔记与时钟图标。 风格： 高清商业摄影质感结合极简UI设计，光影自然柔和，色彩低饱和度，肤质纹理真实细腻，呈现高级生活方式品牌的干净视觉风格，3:4 竖构图'
  }
];

async function submitPrompt(item) {
  try {
    const res = await fetch(`${BASE_URL}/v1/images/generations?async=true`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`
      },
      body: JSON.stringify({
        model: 'gpt-image-2',
        prompt: item.prompt,
        size: '2448x3264',
        quality: 'high'
      })
    });

    const data = await res.json();
    const taskId = data.task_id || data.data?.task_id || data.data?.[0]?.task_id || data.id;
    return taskId;
  } catch (err) {
    console.error(`Submit error for item ${item.id}:`, err.message);
    return null;
  }
}

async function pollTask(taskId) {
  for (let i = 0; i < 90; i++) {
    await new Promise(r => setTimeout(r, 2500));
    try {
      const res = await fetch(`${BASE_URL}/v1/images/tasks/${taskId}`, {
        headers: { 'Authorization': `Bearer ${API_KEY}` }
      });
      const data = await res.json();
      const status = data.status || data.data?.status || data.state;
      if (status === 'SUCCESS' || status === 'completed') {
        const url = data.data?.data?.data?.[0]?.url || data.data?.data?.[0]?.url || data.data?.[0]?.url || data.url;
        if (url) return url;
      } else if (status === 'FAILED' || status === 'failure') {
        console.warn(`Task ${taskId} failed:`, data.data?.fail_reason || data.message);
        return null;
      }
    } catch (e) {}
  }
  return null;
}

async function downloadImage(url, destPath) {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buffer = Buffer.from(await res.arrayBuffer());
    fs.writeFileSync(destPath, buffer);
    console.log(`✓ 成功保存 3:4 高清图片: ${path.basename(destPath)} (${(buffer.length / 1024).toFixed(1)} KB)`);
    return true;
  } catch (err) {
    console.error(`下载失败 ${url}:`, err.message);
    return false;
  }
}

async function processSingleItem(item) {
  console.log(`[#${item.id}] 开始提交 3:4 生图: "${item.title}"...`);
  const taskId = await submitPrompt(item);
  if (!taskId) {
    console.error(`[#${item.id}] 提交失败，未获取到 taskId`);
    return false;
  }
  console.log(`[#${item.id}] 任务已提交，Task ID: ${taskId}，正在轮询渲染结果...`);
  const imgUrl = await pollTask(taskId);
  if (imgUrl) {
    const localFile = path.join(OUT_DIR, `insp_${item.id}.png`);
    return await downloadImage(imgUrl, localFile);
  } else {
    console.warn(`[#${item.id}] 轮询超时或渲染失败`);
    return false;
  }
}

async function main() {
  console.log(`\n========================================`);
  console.log(`🚀 开始批量生成 9 个 3:4 灵感案例 (GPT-Image-2 4K 2448x3264)`);
  console.log(`========================================\n`);

  // 并发分批处理 (每批 3 个并发)
  const BATCH_SIZE = 3;
  for (let i = 0; i < NEW_ITEMS.length; i += BATCH_SIZE) {
    const batch = NEW_ITEMS.slice(i, i + BATCH_SIZE);
    console.log(`\n--- 正在处理第 ${Math.floor(i / BATCH_SIZE) + 1} 批任务 (${batch.map(b => '#' + b.id).join(', ')}) ---`);
    await Promise.all(batch.map(item => processSingleItem(item)));
  }

  console.log('\n========================================');
  console.log('🎉 全部 9 个 3:4 灵感案例已生成并保存！');
  console.log('========================================\n');
}

main();
