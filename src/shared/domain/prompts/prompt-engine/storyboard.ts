/**
 * 场景感知分镜动作模板与镜头语言多样性模块
 */

/**
 * 场景感知分镜动作模板与镜头语言多样性模块
 */
import { type OriginalProductRole, detectJewelryAnatomy } from './roles';

export interface StoryboardShotTemplate {
  title: string;
  sceneSuffix: string;
  action: string;
  expression: string;
  camera: string;
  angle: string;
  hasHuman: boolean;
  shotType: string;
}

export function getHarmonizedStoryboardForScene(
  sceneText = '', isNoModel = false, productFingerprint = ''
): StoryboardShotTemplate[] {
  const anatomy = detectJewelryAnatomy('', `${productFingerprint} ${sceneText}`);
  const s = (sceneText || '').toLowerCase();
  const isCar = /车|副驾|驾驶|方向盘|车窗|扶手箱|后座|车内/.test(s);

  // 清洗并提取动态场景主干，彻底避免任何硬编码场景覆盖
  const rawScene = (sceneText || '').trim();
  const baseScene = rawScene && rawScene !== '真实买家秀生活场景' && rawScene !== '真实生活场景'
    ? rawScene
    : '通透干净的高颜值生活美学空间，自然采光';

  if (isCar) {
    let carAction1 = '单手自然轻搭在随身手袋或车内扶手，手腕饰品随性入镜，神态松弛自然';
    let carAction2 = '单手手腕自然轻搭在安全带或包袋拉链上，手机贴近特写拍摄，首饰细节清晰锐利';
    let carAngle2 = '手腕/手指佩戴细节特写（真实手部与皮肤纹理）';

    if (anatomy === 'earring') {
      carAction1 = '副驾侧头看窗外天光，微风吹拂发丝，自然展露耳垂佩戴的小巧 @图片1 耳饰，手腕光洁';
      carAction2 = '微侧头，发丝挽于耳后，手机贴近对焦耳垂上的 @图片1 所示小巧耳饰，大光圈浅景深（严禁手腕手镯）';
      carAngle2 = '耳际局部微距特写（对焦耳垂小巧耳饰）';
    } else if (anatomy === 'necklace') {
      carAction1 = '微侧身面朝车窗自然天光，正面45°平视捕捉端庄领口与颈间项链，神态松弛真实';
      carAction2 = '半身近景清晰对焦颈间项链吊坠，清晰锁定金属光泽与细节，背景自然柔和虚化';
      carAngle2 = '颈间半身特写（正面平视）';
    }

    return [
      {
        title: '车内随行抓拍',
        sceneSuffix: `${baseScene}，车内自然采光，生活随拍视角`,
        action: carAction1,
        expression: '神情惬意，侧颜微露，不经意的生活抓拍微表情',
        camera: 'iPhone 35mm 生活抓拍视角',
        angle: '副驾平视中近景（45° 侧颜自然抓拍）',
        hasHuman: !isNoModel,
        shotType: isNoModel ? 'detail_shot' : 'medium_shot',
      },
      {
        title: '车内佩戴细节特写',
        sceneSuffix: `${baseScene}，近距离对焦特写`,
        action: carAction2,
        expression: '不露全脸（景深自然柔和虚化）',
        camera: 'iPhone 85mm 细节特写镜头',
        angle: carAngle2,
        hasHuman: !isNoModel,
        shotType: 'detail_shot',
      },
      {
        title: '车内生活互动随拍',
        sceneSuffix: `${baseScene}，生活抓拍中景`,
        action: anatomy === 'earring'
          ? '单手轻抚侧脸发丝，自然展露耳际小巧耳钉与灵动侧颜，手腕无额外饰品'
          : anatomy === 'necklace'
            ? '双手整理大衣或外套领口，自然展露颈间锁骨链，神态轻松舒适'
            : '双手整理随身手袋或手账本，手部饰品随性自然入镜',
        expression: '神情轻松自然，嘴角带浅浅生活笑意',
        camera: 'iPhone 50mm 标准生活镜头',
        angle: '中景生活互动抓拍',
        hasHuman: !isNoModel,
        shotType: isNoModel ? 'detail_shot' : 'medium_shot',
      },
      {
        title: '车内侧颜与饰品光影特写',
        sceneSuffix: `${baseScene}，车窗自然天光侧逆光`,
        action: anatomy === 'earring'
          ? '侧头望向窗外，微风吹拂耳际碎发，光影勾勒出侧颜与耳垂小巧耳饰微光（手腕光洁无手镯）'
          : anatomy === 'necklace'
            ? '侧头望向窗外，微风吹拂发丝，光影勾勒出侧颜与胸前项链微光'
            : '手轻搭在安全带或随身包袋望向窗外，手腕饰品在柔和自然光下若隐若现',
        expression: '望向窗外不经意抓拍，松弛惬意',
        camera: 'iPhone 50mm 侧颜光影特写',
        angle: '侧面45°生活抓拍特写',
        hasHuman: !isNoModel,
        shotType: isNoModel ? 'detail_shot' : 'close_up',
      }
    ];
  }

  // 🌟 通用小红书真实生活随拍分镜（分镜全随机 + 1~2 张多角度商品特写，彻底去除贝壳盘静物）
  if (isNoModel) {
    return [
      {
        title: '商品实物全景与生活置景',
        sceneSuffix: `${baseScene}，45° 平视实拍视角`,
        action: '商品实物主体置于真实生活场景中，自然采光下呈现真实物理质感与细节',
        expression: '无（纯静物实拍）',
        camera: 'iPhone 35mm 实物拍摄镜头',
        angle: '45° 斜上方生活化置景实拍',
        hasHuman: false,
        shotType: 'pure_product',
      },
      {
        title: '商品微观切面极清特写',
        sceneSuffix: `${baseScene}，超近距离微距对焦，背景自然大光圈虚化`,
        action: '镜头极近距离锁定商品材质纹理、金属光泽与微观工艺细节',
        expression: '无（微距特写）',
        camera: 'iPhone 微距特写镜头',
        angle: '极清细节微距大特写',
        hasHuman: false,
        shotType: 'detail_shot',
      },
      {
        title: '商品生活随行摆放俯拍',
        sceneSuffix: `${baseScene}，微俯视角度`,
        action: '商品与随身手袋、手账本等日常物件自然陈列，自然漫射天光与柔和阴影',
        expression: '无（生活物平铺）',
        camera: 'iPhone 微俯视镜头',
        angle: '俯视角度生活化实拍',
        hasHuman: false,
        shotType: 'detail_shot',
      },
      {
        title: '商品侧光质感特写',
        sceneSuffix: `${baseScene}，侧光投影`,
        action: '纯净自然侧光照射下，呈现商品边缘光影轮廓与真实物理质感',
        expression: '无（侧光质感）',
        camera: 'iPhone 50mm 质感特写',
        angle: '平视侧光特写',
        hasHuman: false,
        shotType: 'detail_shot',
      }
    ];
  }

  // 🌟 依据解剖学品类精准分配生活抓拍动作与特写机位（绝对杜绝耳饰画手腕手镯、项链画后背）
  let shot1Title = '正面高颜值半身自拍肖像';
  let shot1Angle = '正面半身/胸部以上自拍肖像';
  let shot1Action = '在场景中随性走动或漫步回眸，双手自然轻搭身前，展露佩戴首饰与整体时髦私服';
  let shot2Title = '45°侧颜微风光影抓拍';
  let shot2Angle = '45° 侧颜半身抓拍';
  let shot2Action = '在场景中舒适倚靠或看风景，微风吹拂发丝，神态松弛自然';
  let shot3Title = '佩戴部位超清微距特写';
  let shot3Action = '大光圈浅景深超清对焦佩戴的 @图片1 细节，背景自然柔和虚化';
  let shot3Angle = '局部超清微距大特写';
  let shot4Action = '侧身望向窗外或身侧光影，微风吹拂发丝，饰品在自然光下呈现细腻质感';

  if (anatomy === 'hairpin') {
    shot1Title = '45°侧颜发髻微风半身抓拍';
    shot1Angle = '45° 侧颜半身特写';
    shot1Action = '45度侧颜微风半身抓拍：自然侧身看窗外天光，发丝盘起整洁雅致，斜射阳光清晰展现发髻上插戴的 @图片1 所示发簪/步摇与灵动侧颜，手腕光洁无手镯';
    shot2Title = '侧后方45°回眸发髻抓拍';
    shot2Angle = '侧后方 45° 微回眸抓拍';
    shot2Action = '侧后方45度回眸微风抓拍：侧后方微回眸机位，镜头清晰对焦发髻上的 @图片1 簪饰，自然垂坠的流苏步摇在光影下摇曳生姿，下颌线优美';
    shot3Title = '发髻发簪超清微距特写';
    shot3Action = '发髻局部超清微距特写：极近距离大光圈浅景深超清对焦发髻上插戴的 @图片1 发簪雕花工艺、玉石/金属微观质感与流苏微光，商品占据画面视觉中心，清晰锐利，背景自然柔和虚化';
    shot3Angle = '发髻发簪部位超清微距特写';
    shot4Action = '生活氛围感半身随拍：优雅端坐或茶台窗边倚靠，单手自然将耳际碎发轻挽于耳后或轻触发髻，神态温润恬淡，自然展露发间 @图片1 簪饰';
  } else if (anatomy === 'earring') {
    shot1Action = '正面半身肖像：平视视角，双手自然轻搭在身前桌沿，自然展露双耳耳垂佩戴的 @图片1 所示小巧耳饰与优雅气质，手腕光洁无手镯';
    shot2Action = '45度侧颜微风半身抓拍：侧头看窗外天光，微风吹拂高颅顶蓬松长发，斜射阳光勾勒侧颜下颌线条与耳垂佩戴的 @图片1 所示小巧耳饰';
    shot3Title = '耳际局部超清微距特写';
    shot3Action = '耳际局部超清特写：微侧头，单手自然将碎发挽于耳后，大光圈浅景深超清对焦双耳耳垂佩戴的 @图片1 所示耳饰（小巧精致贴耳比例，严禁画手腕，严禁手腕出现手镯手链，严禁项链），锐利清晰展现宝石/金属光泽';
    shot3Angle = '耳际侧颜局部超清微距特写';
    shot4Action = '生活氛围感半身随拍：桌前舒适倚靠或露天街角回眸，神态甜美松弛，展露耳垂小巧精致耳钉与灵动侧颜，手腕光洁无任何手镯';
  } else if (anatomy === 'necklace') {
    shot1Action = '正面半身肖像：平视视角，单手大拇指与食指捏起颈间正中佩戴的 @图片1 所示项链吊坠向镜头展示，端庄领口清晰展露项链细节，半身构图';
    shot2Action = '45度侧颜微风半身抓拍：微侧头看窗外天光，微风吹拂发丝，斜射阳光洒在颈间，勾勒侧颜与颈间项链微光';
    shot3Title = '颈间项链半身近景特写';
    shot3Action = '颈间项链半身近景：平视聚焦端庄领口与颈间吊坠，大光圈浅景深清晰对焦自然垂坠的 @图片1 所示项链，展现细腻金属/宝石光泽与锐利微观细节（严禁项链画在手腕上，严禁手腕出现手镯，严禁后背悬空，严禁低胸与大面积裸露）';
    shot3Angle = '颈间项链半身近景';
    shot4Action = '生活氛围感半身随拍：生活空间舒适倚靠或车内副驾，手部轻扶包带或自然搭在身侧，神态甜美松弛，展露颈间项链，半身构图';
  } else if (anatomy === 'bracelet') {
    shot1Action = '正面半身自拍肖像：平视视角，单手轻搭在身前桌沿或随身包袋，单侧手腕佩戴的 @图片1 所示手链/手镯自然入镜，眼神灵动含笑直视镜头';
    shot2Action = '侧身微风半身抓拍：侧身倚靠看风景，高颅顶蓬松发丝随风微动，斜射阳光洒落在身侧，单手自然下垂或轻搭桌沿，手腕饰品随性入镜';
    shot3Title = '手腕局部超清微距特写';
    shot3Action = '手腕局部超清微距：手部自然平放于木质台面或搭在扶手（手部有真实物理支撑），大光圈浅景深聚焦单侧手腕佩戴的 @图片1 真实细腻的物理微光与锐利微观细节（严禁戴在耳朵或脖子上，脖子光洁无项链）';
    shot3Angle = '手腕首饰超清微距特写';
    shot4Action = '生活氛围感半身随拍：生活空间桌前慵懒倚靠或车内副驾，双手捧水杯或单手搭椅背，手腕首饰与灵动侧颜自然同框，半身构图';
  } else if (anatomy === 'ring') {
    shot1Action = '正面半身自拍肖像：平视视角，单手轻搭在身前桌沿或随身物品上，手指佩戴的 @图片1 所示戒指自然入镜，眼神明媚甜笑';
    shot2Action = '45度侧颜半身抓拍：自然侧身看窗外天光，微风吹拂发丝，斜射阳光洒落在面容与身侧，神态恬淡放松';
    shot3Title = '手指戒指超清微距特写';
    shot3Action = '手指局部微距特写：单手自然轻搭在台面或手袋边缘（手部有真实物理支撑），大光圈浅景深超清聚焦手指佩戴的 @图片1 戒指细节与金属质感，边缘锐利分明（严禁画在手腕或耳垂上）';
    shot3Angle = '手指戒指部位超清微距特写';
    shot4Action = '生活氛围感半身随拍：生活空间舒适倚靠或户外街头，单手轻扶包带或搭在身侧，手指戒指与甜美面容自然同框，半身构图';
  } else if (anatomy === 'bag') {
    shot1Action = '正面半身抓拍：单肩背着或手提 @图片1 所示包袋，神态自然从容，展现包袋版型与私服搭配';
    shot2Action = '45度侧身漫步抓拍：侧身漫步走动，手轻扶 @图片1 所示包袋肩带，展现包袋皮质与整体氛围';
    shot3Title = '包袋材质与五金超清特写';
    shot3Action = '包袋局部超清特写：近距离大光圈浅景深聚焦 @图片1 包袋的细腻皮质纹理、精致走线与五金搭扣光泽';
    shot3Angle = '包袋五金与皮质微距特写';
    shot4Action = '生活氛围随拍：手提包袋置于身侧桌边或椅背，人与包袋自然互动，展现生活温度';
  }

  return [
    {
      title: shot1Title,
      sceneSuffix: `${baseScene}，Shot on iPhone 真实生活抓拍视角，通透自然采光与清晰接触阴影`,
      action: shot1Action,
      expression: '长相自然清秀的年轻东亚女生，清纯邻家气质，神情自然从容，眼神清澈含笑直视镜头互动',
      camera: 'iPhone 35mm 人文广角镜头',
      angle: shot1Angle,
      hasHuman: true,
      shotType: 'medium_shot',
    },
    {
      title: shot2Title,
      sceneSuffix: `${baseScene}，生活随拍中景`,
      action: shot2Action,
      expression: '侧颜轮廓优美，神态松弛自然，眼神清澈，带不经意的生活抓拍浅浅甜笑',
      camera: 'iPhone 50mm 生活镜头',
      angle: shot2Angle,
      hasHuman: true,
      shotType: 'medium_shot',
    },
    {
      title: shot3Title,
      sceneSuffix: `${baseScene}，近距离对焦特写，背景自然柔和虚化`,
      action: shot3Action,
      expression: '微表情自然舒服（大光圈浅景深虚化）',
      camera: 'iPhone 85mm 细节特写镜头',
      angle: shot3Angle,
      hasHuman: true,
      shotType: 'detail_shot',
    },
    {
      title: '生活氛围感半身随拍',
      sceneSuffix: `${baseScene}，自然侧光漫射光影`,
      action: shot4Action,
      expression: '神情惬意从容，嘴角带甜美生活笑意，生活抓拍感十足',
      camera: 'iPhone 50mm 侧颜光影镜头',
      angle: '生活氛围半身交互随拍',
      hasHuman: true,
      shotType: 'close_up',
    }
  ];
}

export function getOriginalDiversityForShot(shotNo: number, role?: OriginalProductRole, masterScene?: string) {
  const templates = getHarmonizedStoryboardForScene(masterScene || '');
  const i = Math.max(0, (shotNo || 1) - 1);
  const t = templates[i % templates.length];
  return {
    expression: t.expression,
    action: t.action,
    camera_focal_length: t.camera,
    angle: t.angle,
    scene: t.sceneSuffix,
    title: t.title,
    hasHuman: t.hasHuman,
    shotType: t.shotType,
  };
}

/** 粗粒度文本相似度：重合字越多越雷同 */
export function isOriginalTextTooSimilar(a?: string, b?: string): boolean {
  const na = (a || '').replace(/\s+/g, '').trim();
  const nb = (b || '').replace(/\s+/g, '').trim();
  if (!na || !nb) return false;
  if (na === nb) return true;
  if (na.includes(nb) || nb.includes(na)) return true;
  const shorter = na.length <= nb.length ? na : nb;
  const longer = na.length <= nb.length ? nb : na;
  if (shorter.length < 4) return false;
  let hits = 0;
  const step = Math.max(2, Math.floor(shorter.length / 4));
  for (let i = 0; i <= shorter.length - 3; i += step) {
    if (longer.includes(shorter.slice(i, i + 3))) hits += 1;
  }
  return hits >= 3;
}

export interface OriginalDiversityShot {
  shot_no?: number;
  has_human?: boolean;
  title?: string;
  camera_focal_length?: string;
  action?: string;
  expression?: string;
  angle?: string;
}

export function enforceOriginalShotDiversity<T extends OriginalDiversityShot>(shots: T[], groupHasHuman?: boolean) {
  return shots.map((s, idx) => {
    const shotNo = s.shot_no || idx + 1;
    const diversity = getOriginalDiversityForShot(shotNo);
    return {
      ...s,
      shot_no: shotNo,
      has_human: groupHasHuman !== undefined ? groupHasHuman : (s.has_human !== false),
      title: s.title || `分镜 ${shotNo}`,
      camera_focal_length: s.camera_focal_length || diversity.camera_focal_length,
      action: s.action || diversity.action,
      expression: s.expression || diversity.expression,
      angle: s.angle || diversity.angle,
    };
  });
}
