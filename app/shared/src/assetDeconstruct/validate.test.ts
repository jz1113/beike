import { describe, it, expect } from 'vitest';
import {
  validateReversePrompt,
  validateDimensions,
  ensurePerImageQuality,
  mergePerImageIntoAssets,
  reconcileAssetsFromPerImage,
  sanitizeActionPrompt,
  sanitizeScenePrompt,
  isActionTitle,
  MIN_PROMPT_LENGTH,
} from './validate';
import type { PerImageResult } from './prompts';
import { assembleReversePrompt, resolveUnifiedShardSize } from './prompts';

describe('assembleReversePrompt', () => {
  it('assembles all core dimensions into structured prompt', () => {
    const result = assembleReversePrompt(
      {
        subject: '模特侧坐台阶',
        art_style: '生活随拍',
        color_scheme: '暖色调',
        lighting: '自然侧光',
        lighting_type: '柔光',
        composition: '三分法',
        camera_language: '俯拍 35mm',
        focal_length: '35mm',
        depth_of_field: '中等景深',
        material_texture: '棉麻质感',
        atmosphere: '慵懒午后',
        resolution_quality: '8K高清',
      },
      'photography',
      {
        scene: {
          title: '石阶庭院',
          description: '复古水泥石阶与绿植庭院',
          lighting: '自然侧光',
        },
        outfit: {
          title: '棉麻裙',
          top: '白色棉麻连衣裙',
          bottom: '',
        },
      }
    );

    expect(result).toContain('【主体】模特侧坐台阶');
    expect(result).toContain('【场景结构】');
    expect(result).toContain('【光影】自然侧光（柔光）');
    expect(result).toContain('【构图镜头】');
    expect(result).toContain('35mm');
    expect(result).toContain('【材质与真实感】');
    expect(result).toContain('【画质与限制】');
  });
});

describe('validateReversePrompt', () => {
  it('rejects short prompts', () => {
    const result = validateReversePrompt('太短了');
    expect(result.valid).toBe(false);
    expect(result.issues[0]).toContain('过短');
  });

  it('rejects vague words', () => {
    const longVague = '很高级的氛围感强'.repeat(20);
    const result = validateReversePrompt(longVague);
    expect(result.valid).toBe(false);
  });

  it('accepts detailed prompts', () => {
    const prompt = assembleReversePrompt({
      subject: '模特侧坐石阶平台回望镜头，身穿白色棉麻连衣裙，发丝随风轻扬，神态从容自然',
      art_style: '日系生活随拍风格，原生相机直出质感，微弱胶片颗粒',
      color_scheme: '暖白与浅灰色调，柔和自然过渡',
      lighting: '午后自然侧光从左侧打入，柔和阴影与轮廓光交织',
      composition: '俯拍三分法构图，人物偏右，背景纵深清晰扎实',
      camera_language: 'iPhone 35mm 俯拍视角，中等景深保留环境细节',
      material_texture: '棉麻连衣裙与水泥台阶粗糙质感，真实物理微瑕与接触阴影',
      atmosphere: '慵懒放松的午后氛围，生活化抓拍感与松弛微表情',
      resolution_quality: '8K高清胶片质感，微弱颗粒与自然锐度',
      lighting_type: '自然光',
      focal_length: '35mm',
      depth_of_field: '中等景深',
      color_tone: '暖色',
    }, 'photography', {
      scene: {
        title: '石阶庭院',
        description: '复古水泥石阶与绿植庭院，午后斑驳树影',
        lighting: '自然侧光',
      },
    });

    const result = validateReversePrompt(prompt);
    expect(result.valid).toBe(true);
    expect(prompt.length).toBeGreaterThanOrEqual(MIN_PROMPT_LENGTH);
  });
});

describe('validateDimensions', () => {
  it('requires all 9 core dimensions', () => {
    const result = validateDimensions(
      { subject: 'a', art_style: 'b', color_scheme: 'c', lighting: 'd', composition: 'e' },
      'photography'
    );
    expect(result.valid).toBe(false);
    expect(result.issues[0]).toContain('9');
  });

  it('requires photography extras for photography type', () => {
    const fullCore = {
      subject: '主体描述足够长',
      art_style: '艺术风格描述',
      color_scheme: '色彩方案描述',
      lighting: '光影设定描述',
      composition: '构图逻辑描述',
      material_texture: '材质质感描述',
      camera_language: '镜头语言描述',
      atmosphere: '氛围情绪描述',
      resolution_quality: '画质标准描述',
    };
    const result = validateDimensions(fullCore, 'photography');
    expect(result.valid).toBe(false);
  });
});

describe('ensurePerImageQuality', () => {
  it('falls back to assembled prompt when original is too short', () => {
    const item = ensurePerImageQuality({
      image_index: 1,
      image_type: 'photography',
      reverse_prompt_zh: '太短',
      dimensions: {
        subject: '模特侧坐石阶平台回望镜头，身穿白色棉麻连衣裙，发丝随风轻扬',
        art_style: '日系生活随拍风格，原生相机直出质感',
        color_scheme: '暖白与浅灰色调，柔和自然',
        lighting: '午后自然侧光从左侧打入，柔和阴影与轮廓光',
        composition: '俯拍三分法构图，人物偏右，背景纵深清晰',
        camera_language: 'iPhone 35mm 俯拍视角，中等景深',
        material_texture: '棉麻连衣裙与水泥台阶粗糙质感，真实物理微瑕',
        atmosphere: '慵懒放松的午后氛围，生活化抓拍感',
        resolution_quality: '8K高清胶片质感，微弱颗粒',
        lighting_type: '自然光',
        focal_length: '35mm',
        depth_of_field: '中等景深',
        color_tone: '暖色',
      },
      outfit: {
        title: '棉麻连衣裙',
        top: '白色棉麻方领连衣裙',
        bottom: '',
        shoes: '米色平底单鞋',
        accessories: '草编手提包',
        color_palette: '暖白米色系',
      },
      scene: {
        title: '石阶庭院',
        description: '复古水泥石阶与绿植庭院，午后斑驳树影',
        lighting: '自然侧光',
      },
    });

    expect(item.reverse_prompt_zh.length).toBeGreaterThanOrEqual(MIN_PROMPT_LENGTH);
    expect(item.reverse_prompt_zh).toContain('【');
  });
});

describe('mergePerImageIntoAssets', () => {
  it('binds per_image reverse_prompt to matching actions', () => {
    const perImage = [{
      image_index: 1,
      image_type: 'photography',
      reverse_prompt_zh: '完整的逐图反推提示词'.repeat(10),
      dimensions: { subject: '测试主体内容描述' },
    }];

    const result = mergePerImageIntoAssets({
      actions: [{ title: '测试动作', source_image_index: 1, reverse_prompt: '被压缩的短版本' }],
    }, perImage);

    const actions = result.actions as Array<{ reverse_prompt: string }>;
    expect(actions[0].reverse_prompt).toBe(perImage[0].reverse_prompt_zh);
  });
});

function makePerImage(
  index: number,
  subject: string,
  env: string
): PerImageResult {
  const reverse_prompt_zh = `【主体】${subject}
【发型与面部】原生肤质，自然神态
【穿搭或物体细节】简约日常穿搭
【动作或摆放】自然站立姿态
【场景结构】${env}
【光影】午后自然侧光，柔和阴影
【构图镜头】约50mm平视中景
【材质与真实感】棉麻与水泥质感
【画质与限制】自然曝光，真实比例`.repeat(2);
  return {
    image_index: index,
    image_type: 'photography',
    title: `图${index}`,
    reverse_prompt_zh,
    reverse_prompt: reverse_prompt_zh,
    dimensions: {
      subject,
      vegetation_water: env,
      atmosphere: env,
      composition: '三分法',
      lighting: '自然光',
      art_style: '生活随拍',
      color_scheme: '暖色',
      material_texture: '棉麻',
      camera_language: '50mm',
      resolution_quality: '高清',
      lighting_type: '自然光',
      focal_length: '50mm',
      depth_of_field: '浅景深',
      color_tone: '暖色',
    },
    has_human: true,
    shot_framing: 'medium_full_body',
  };
}

describe('reconcileAssetsFromPerImage', () => {
  it('fills missing actions from per_image and dedupes distinct scenes (PROD_7-like)', () => {
    const perImage: PerImageResult[] = [
      ...[1, 2, 3].map((i) => makePerImage(i, `模特庭院姿态${i}`, '现代水泥庭院绿植盆栽')),
      makePerImage(4, '模特密林站立', '密林树林绿意盎然'),
      ...[5, 6, 7, 8, 9, 10, 11].map((i) =>
        makePerImage(i, `模特茶园姿态${i}`, '开阔茶园梯田蓝色天空')
      ),
    ];

    const { result, stats } = reconcileAssetsFromPerImage(
      {
        scenes: [{ title: '户外绿意', description: '合并过度', source_image_index: 1 }],
        actions: [
          { title: '动作1', source_image_index: 1, reverse_prompt: '短版本' },
          { title: '动作2', source_image_index: 2, reverse_prompt: '短版本' },
        ],
      },
      perImage
    );

    const actions = result.actions as Array<{ source_image_index: number; reverse_prompt: string }>;
    const scenes = result.scenes as Array<{ source_image_indices?: number[] }>;

    expect(actions).toHaveLength(11);
    expect(actions[0].reverse_prompt).toBe(perImage[0].reverse_prompt_zh);
    expect(actions[10].source_image_index).toBe(11);
    expect(scenes.length).toBeGreaterThanOrEqual(3);
    expect(stats.actionsBeforeDedup).toBe(2);
    expect(stats.actionsAfterDedup).toBe(11);
    expect(stats.scenesBeforeDedup).toBe(11);
    expect(stats.scenesAfterDedup).toBeGreaterThanOrEqual(3);
  });

  it('dedupes real-world Chinese 9-image album into 2-3 distinct spatial scenes', () => {
    const perImage: PerImageResult[] = [
      {
        ...makePerImage(1, '模特站立', '复古木门'),
        title: '图1',
        scene: {
          title: '复古欧式院落与青蓝色温门',
          description: '复古欧式建筑大门前庭，青蓝色实木大门与石阶，自然采光',
          lighting: '自然光',
          spatial_type: 'outdoor_nature',
        },
      },
      {
        ...makePerImage(2, '模特侧坐', '复古木门'),
        title: '图2',
        scene: {
          title: '复古绿意木质门与温润大门景深',
          description: '欧式复古建筑大门前石阶，木质门框与庭院绿意，午后斜射自然光',
          lighting: '自然光',
          spatial_type: 'outdoor_nature',
        },
      },
      {
        ...makePerImage(3, '模特室内坐姿', '复古沙发'),
        title: '图3',
        scene: {
          title: '复古室内沙发与温暖斜切视角',
          description: '室内复古休闲空间，黄色皮质复古沙发，温馨室内暖光',
          lighting: '室内暖光',
          spatial_type: 'indoor_room',
        },
      },
      {
        ...makePerImage(4, '模特靠门', '复古木门'),
        title: '图4',
        scene: {
          title: '欧式复古木门前石阶环境',
          description: '木质双开大门前的石阶平台，古朴雕花门把手与复古墙面',
          lighting: '自然光',
          spatial_type: 'outdoor_nature',
        },
      },
      {
        ...makePerImage(5, '模特草坪倚靠', '草坪庭院'),
        title: '图5',
        scene: {
          title: '阳光树影草坪与百叶窗',
          description: '庭院草坪与树影斑驳，木质百叶窗与自然绿植',
          lighting: '自然光',
          spatial_type: 'outdoor_nature',
        },
      },
      {
        ...makePerImage(6, '模特门前近景', '复古木门'),
        title: '图6',
        scene: {
          title: '复古青蓝木门石阶平台',
          description: '欧式青蓝色复古木门前石阶，自然漫射光',
          lighting: '自然光',
          spatial_type: 'outdoor_nature',
        },
      },
      {
        ...makePerImage(7, '模特室内端坐', '复古沙发'),
        title: '图7',
        scene: {
          title: '室内黄色复古皮沙发休憩角',
          description: '复古室内客厅空间，黄色皮沙发与木茶几',
          lighting: '室内暖光',
          spatial_type: 'indoor_room',
        },
      },
      {
        ...makePerImage(8, '模特走廊站立', '欧式走廊'),
        title: '图8',
        scene: {
          title: '欧式门廊木门石阶环境',
          description: '欧式建筑门廊石阶，复古实木双开大门',
          lighting: '自然光',
          spatial_type: 'outdoor_nature',
        },
      },
      {
        ...makePerImage(9, '模特门前随拍', '复古木门'),
        title: '图9',
        scene: {
          title: '复古实木双开大门庭院',
          description: '复古木质大门与庭院石阶平台，自然光影',
          lighting: '自然光',
          spatial_type: 'outdoor_nature',
        },
      },
    ];

    const { result } = reconcileAssetsFromPerImage({ actions: [], scenes: [] }, perImage);
    const scenes = result.scenes as Array<{ title: string; source_image_indices?: number[] }>;
    
    // 9 张图中 7 张为木门/石阶/庭院，2 张为室内沙发，应聚类去重为 2~3 个场景
    expect(scenes.length).toBeLessThanOrEqual(3);
    expect(scenes.length).toBeGreaterThanOrEqual(1);

    // 验证合并后的场景包含了所有源图片索引
    const allCoveredIndices = scenes.flatMap((s) => s.source_image_indices || []);
    expect(new Set(allCoveredIndices).size).toBe(9);
  });

  it('skips actions for images marked has_human=false', () => {
    const perImage: PerImageResult[] = [
      makePerImage(1, '模特', '庭院'),
      { ...makePerImage(2, '纯风景', '密林'), has_human: false },
    ];

    const { result } = reconcileAssetsFromPerImage({ actions: [], scenes: [] }, perImage);
    const actions = result.actions as Array<{ source_image_index: number }>;
    expect(actions).toHaveLength(1);
    expect(actions[0].source_image_index).toBe(1);
  });
});

describe('sanitizeActionPrompt & sanitizeScenePrompt', () => {
  it('strips jackets, lace skirts, scarves, sneakers from actions and generalises models', () => {
    const rawAction = '橙卷发女性在复古建筑前快步奔跑跳跃，身穿深蓝夹克、白色蕾丝裙、黄色运动鞋，搭配薄荷绿围巾。抓拍动态瞬间，自然阳光。';
    const cleaned = sanitizeActionPrompt(rawAction);

    expect(cleaned).not.toContain('深蓝夹克');
    expect(cleaned).not.toContain('白色蕾丝裙');
    expect(cleaned).not.toContain('黄色运动鞋');
    expect(cleaned).not.toContain('薄荷绿围巾');
    expect(cleaned).not.toContain('橙卷发女性');
    expect(cleaned).toContain('模特');
    expect(cleaned).toContain('奔跑跳跃');
  });

  it('strips broken syntax fragments, human skin and action walking clauses from real user cases', () => {
    const rawUserScene =
      '草坪迎面走向，50mm f/2.2商业35mm RAW 真实街景全景构图。裙，在树影斑驳的草坪上迎面走来。右前侧为粗糙大树树干，背景为白色建筑与垂柳。阳光透过树叶散落颗粒状光影，呈现原生相机直出质感与真实次表面散射皮肤。';
    const cleaned = sanitizeScenePrompt(rawUserScene);

    expect(cleaned).not.toContain('裙，');
    expect(cleaned).not.toContain('迎面走来');
    expect(cleaned).not.toContain('迎面走向');
    expect(cleaned).not.toContain('次表面散射皮肤');
    expect(cleaned).toContain('树影斑驳');
    expect(cleaned).toContain('粗糙大树树干');
    expect(cleaned).toContain('白色建筑与垂柳');
  });

  it('correctly intercepts action-titled scenes like 草坪迎面走向', () => {
    expect(isActionTitle('草坪迎面走向')).toBe(true);
    expect(isActionTitle('45度侧颜细节特写')).toBe(true);
    expect(isActionTitle('自然绿意庭院与石阶')).toBe(false);
  });
});

describe('resolveUnifiedShardSize', () => {
  it('defaults to DEFAULT_UNIFIED_SHARD_SIZE to limit per-request payload', () => {
    expect(resolveUnifiedShardSize()).toBe(10);
    expect(resolveUnifiedShardSize(undefined)).toBe(10);
  });

  it('caps custom shard size at MAX_IMAGES_PER_SET', () => {
    expect(resolveUnifiedShardSize(5)).toBe(5);
    expect(resolveUnifiedShardSize(15)).toBe(10);
  });
});
