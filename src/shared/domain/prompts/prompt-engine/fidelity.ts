/**
 * Reference fidelity constraints for workshop image generation.
 * Keep these short and physical: long negative-prompt lists tend to create
 * style conflicts instead of improving identity or product consistency.
 */
import { isPhoneProduct } from '../../products/phoneProductPolicy';

const PRODUCT_FIDELITY_MARKER = '【商品外观保真约束】';
const HUMAN_FIDELITY_MARKER = '【真人摄影约束】';

export interface FidelityGuidanceOptions {
  productRole?: string;
  productFingerprint?: string;
  hasHuman?: boolean;
  hasSupplementaryProductViews?: boolean;
}

export function buildProductFidelityGuidance(options: FidelityGuidanceOptions = {}): string {
  const productTitle = String(options.productFingerprint || '').trim();
  const isPhone = isPhoneProduct(productTitle) || /\bipad\b|平板电脑|\btablet\b/i.test(productTitle);
  const extraViewRule = options.hasSupplementaryProductViews
    ? '请求中附带的同一商品补充视图只用于核对同一实物的正反面、边框和细节，不把多张视图拼成一个物体。'
    : '';
  const phoneRule = isPhone
    ? '若本镜展示正面或屏幕，屏幕比例、边框厚度、前摄开孔和机身结构严格服从 @图片1 的可见实物；屏显画面不是商品身份，不照抄 @图片1 中的演示壁纸、假 UI、乱码、通知或广告。有明确的本镜屏显方案时据此重新设计；没有方案时使用与场景协调的简洁无字画面或自然熄屏。参考图未展示的硬件细节不要凭空补造，不要换成相似型号。'
    : '若本镜展示商品正面、背面或侧面，当前可见面的比例、结构、文字和细节严格服从参考图；参考图未展示的细节不要凭空补造。';

  return [
    PRODUCT_FIDELITY_MARKER,
    isPhone
      ? '手机机身身份、型号、颜色、材质、实体 Logo/可验证机身文字、正反面方向与硬件结构只以 @图片1 及其同一商品补充视图为准，优先级高于模板和风格描述；屏幕内的壁纸和演示界面不属于机身外观。'
      : '商品身份、型号、颜色、材质、Logo/文字、正反面方向与外观结构只以 @图片1 及其同一商品补充视图为准，优先级高于模板和风格描述。',
    '保持真实长宽比、厚度、边框、圆角、部件相对尺寸和位置，不改款、不镜像、不拉伸、不压扁、不把另一件相似商品替换进来。',
    phoneRule,
    extraViewRule,
  ].filter(Boolean).join('');
}

export function buildHumanFidelityGuidance(): string {
  return [
    HUMAN_FIDELITY_MARKER,
    '人物优先保持参考人物或原图组的脸型比例、年龄感、发际线、发丝走向、轻微左右不对称和自然表情；有 @图片2 时人物身份以 @图片2 为准，不重新设计五官。',
    '保留真实肤色变化、细小皮肤纹理、衣料褶皱、手指关节和头发边缘；使用生活抓拍式自然光，不做商业棚拍、统一网红脸、过度磨皮、过度锐化、塑料高光或 CG 假人效果。',
  ].join('');
}

export function appendFidelityGuidance(
  prompt: string,
  options: FidelityGuidanceOptions = {},
): string {
  let text = (prompt || '').trim();
  if (!text) return text;
  if (!text.includes(PRODUCT_FIDELITY_MARKER)) {
    text = `${text}\n${buildProductFidelityGuidance(options)}`;
  }
  if (options.hasHuman !== false && !text.includes(HUMAN_FIDELITY_MARKER)) {
    text = `${text}\n${buildHumanFidelityGuidance()}`;
  }
  return text.trim();
}
