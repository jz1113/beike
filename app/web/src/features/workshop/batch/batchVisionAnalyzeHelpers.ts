import { getHarmonizedStoryboardForScene } from '@beike/shared/drawing';
import { isJewelryProductTitle } from '@beike/shared/jewelryArchHelpers';

export function resolveHarmonizedTemplatesForItem(opts: {
  masterScene: string;
  productTitle: string;
  hasHumanPersona: boolean;
  lockedSceneId?: string;
  availableScenes: any[];
}) {
  const { masterScene, productTitle, hasHumanPersona, lockedSceneId, availableScenes } = opts;
  const isJewelry = isJewelryProductTitle(productTitle || '');

  if (lockedSceneId !== 'auto') {
    const locked = availableScenes.find((s) => s.id === lockedSceneId);
    if (locked?.shots?.length) {
      const sceneText = locked.description
        ? `${locked.title}，${locked.description}`
        : locked.title;

      return locked.shots.map((shot: any) => {
        let action = shot.action || '';
        let angle = shot.angle || shot.title || '';
        let camera = shot.camera || 'iPhone 35mm 人文广角镜头';

        // 🚨 珠宝首饰类目联动引用：全景图与大动作自动优化为半身近镜头，确保能看清商品实物
        if (isJewelry) {
          angle = angle
            .replace(/(全景|远景|全身站立|全身照|全身|长廊)+/g, '半身近镜头')
            .replace(/门廊前远景全景/g, '门廊前半身近镜头');
          action = action.replace(
            /(在[^\s，；;]*大步奔跑|大步快跑|跳跃奔跑|全速奔跑|跑动|路边蹲姿|坐在石阶|微模糊的复古跑动)[^，；;]*/g,
            '桌前优雅倚靠，手部自然依托台面，清晰展露佩戴首饰'
          );
          if (camera.includes('广角') && !camera.includes('微距')) {
            camera = 'iPhone 85mm 人像中近景镜头';
          }
        }

        return {
          title: isJewelry ? (shot.title || '').replace(/(全景|远景|全身|长廊)/g, '半身近景') : shot.title,
          sceneSuffix: sceneText,
          action,
          expression: '神态自然从容，眼神清澈灵动',
          camera,
          angle,
          hasHuman: hasHumanPersona,
          shotType: isJewelry && shot.shotType === 'wide_shot' ? 'medium_shot' : shot.shotType,
        };
      });
    }
  }

  return getHarmonizedStoryboardForScene(masterScene || '', isJewelry, !hasHumanPersona, productTitle);
}
