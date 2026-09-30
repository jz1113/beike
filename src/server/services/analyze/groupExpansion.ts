import type { GroupShotSkeleton } from '@shared/domain/workshop/workshopPipeline/storyboardSlots';
import { callVisionModel, parseResponseJson } from './analyzeVisionCall';

const value = (input: unknown) => typeof input === 'string' ? input.trim() : '';

/** Plan a second four-shot mother from text structure, without sending the crawled images. */
export async function planExpandedGroup(input: {
  originals: GroupShotSkeleton[];
  productTitle: string;
  productIndex: number;
  model: string;
  fallbackModels?: string[];
  baseUrl?: string;
  apiKey?: string;
  apiFormat?: 'openai-responses';
}): Promise<GroupShotSkeleton[]> {
  const originals = input.originals.slice(0, 4);
  if (originals.length !== 4) throw new Error('拓展生成需要完整的四镜母组');
  const source = originals.map((shot, index) => ({
    shot_no: index + 1, title: shot.title, scene: shot.scene,
    action: shot.action, camera: shot.camera_focal_length, angle: shot.angle,
    lighting: shot.lighting_type, has_human: shot.has_human, shot_type: shot.shot_type,
  }));
  const request = `你是商品摄影图组策划。根据下面四镜母组的文字结构，为同一商品设计另一套四镜图组，用于后续生图和重新反推。\n` +
    `商品：${input.productTitle || '当前商品'}。变化编号：${input.productIndex + 1}。\n母组结构：${JSON.stringify(source)}\n` +
    '新组必须有一个与母组明显不同、四镜一致且真实可拍的场景主题；改变光线、置景和每镜机位/动作表达。' +
    '保持四镜顺序及每镜人物/仅手部/纯商品的出镜类型，不添加其他人物；商品身份、外观和文字只由后续 @图片1 商品图决定。' +
    '不要照搬母组场景、商品、文字、品牌或具体图片，也不要提出需要原图作为图像参考。' +
    '只输出合法 JSON：{"scene":"新的统一场景","shots":[{"shot_no":1,"title":"短标题","action":"动作或摆放","angle":"新机位与景别","lighting_type":"本镜真实光线","optics":"镜头质感"}]}。shots 必须恰好四条。';
  const result = await callVisionModel(input.model, [{ type: 'text', text: request }],
    input.baseUrl, input.apiKey, input.fallbackModels, false, input.apiFormat);
  const parsed = parseResponseJson(result.rawText);
  const scene = value(parsed.scene);
  const proposals = Array.isArray(parsed.shots) ? parsed.shots : [];
  if (!scene || proposals.length !== 4 || originals.some(shot => value(shot.scene) === scene)) {
    throw new Error('模型没有给出不同于原母组的完整四镜拓展方案，请重试');
  }
  return originals.map((sourceShot, index) => {
    const proposed = proposals.find((shot: Record<string, unknown>) => Number(shot?.shot_no) === index + 1);
    const action = value(proposed?.action);
    const angle = value(proposed?.angle);
    const lighting = value(proposed?.lighting_type);
    if (!action || !angle || !lighting) throw new Error(`拓展方案第 ${index + 1} 镜缺少动作、机位或光线，请重试`);
    return {
      ...sourceShot,
      shot_no: index + 5,
      title: value(proposed?.title) || `衍生镜头 ${index + 1}`,
      scene,
      action,
      angle,
      optics: value(proposed?.optics) || sourceShot.optics,
      lighting_type: lighting,
      // The source prompt includes its old scene, action, framing, and light.
      // Reusing it would silently override the new plan when slots are built.
      // Persona and outfit still come from the mother's group-level summaries.
      prompt: '',
    };
  });
}
