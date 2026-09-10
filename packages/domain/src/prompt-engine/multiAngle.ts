/**
 * 多角度机位转译与防九宫格提示词生成引擎
 */
import { cleanPromptText } from './guards';

export interface MultiAnglePromptOptions {
  originalPrompt: string;
  azimuth: number; // 水平方位角 (0° ~ 360°)
  elevation: number; // 垂直俯仰角 (-60° ~ 80°)
  angleName?: string; // 预设视角名称（如 "左视", "俯视", "右前45°" 等）
}

export interface AngleDescription {
  horizontalLabel: string;
  horizontalEn: string;
  verticalLabel: string;
  verticalEn: string;
  compositeLabel: string;
}

/**
 * 将方位角与俯仰角转译为清晰的专业摄影视角中英文描述
 */
export function resolveAngleDescriptions(azimuth: number, elevation: number): AngleDescription {
  const normA = ((Math.round(azimuth) % 360) + 360) % 360;
  const elev = Math.round(elevation);

  let horizontalLabel = '正面拍摄视角';
  let horizontalEn = 'front view, centered camera angle';

  if (normA >= 22.5 && normA < 67.5) {
    horizontalLabel = '右前侧方45度机位（右侧三分之二面）';
    horizontalEn = 'three-quarter right front angle, 45-degree angle from right side';
  } else if (normA >= 67.5 && normA < 112.5) {
    horizontalLabel = '正右侧方90度全侧身机位（侧颜侧影剪影视角）';
    horizontalEn = 'profile right side view, 90-degree side angle';
  } else if (normA >= 112.5 && normA < 157.5) {
    horizontalLabel = '右后侧方135度机位（后背侧透视或回眸视线）';
    horizontalEn = 'three-quarter back right view, over-the-shoulder angle from back-right';
  } else if (normA >= 157.5 && normA < 202.5) {
    horizontalLabel = '正后方180度背影视角（完整背影或后脑视角）';
    horizontalEn = 'full rear back view, view directly from behind';
  } else if (normA >= 202.5 && normA < 247.5) {
    horizontalLabel = '左后侧方135度机位（后背左侧透视或回眸视线）';
    horizontalEn = 'three-quarter back left view, over-the-shoulder angle from back-left';
  } else if (normA >= 247.5 && normA < 292.5) {
    horizontalLabel = '正左侧方90度全侧身机位（侧颜侧影剪影视角）';
    horizontalEn = 'profile left side view, 90-degree side angle';
  } else if (normA >= 292.5 && normA < 337.5) {
    horizontalLabel = '左前侧方45度机位（左侧三分之二面）';
    horizontalEn = 'three-quarter left front angle, 45-degree angle from left side';
  }

  let verticalLabel = '平视水平拍摄';
  let verticalEn = 'eye-level straight camera shot';

  if (elev >= 40) {
    verticalLabel = '高空大俯拍鸟瞰视角';
    verticalEn = 'high-angle bird-eye overhead shot, looking down from above';
  } else if (elev >= 15) {
    verticalLabel = '轻微高机位俯视';
    verticalEn = 'slight high-angle shot, looking slightly downward';
  } else if (elev <= -35) {
    verticalLabel = '地面极低机位超强仰拍透视';
    verticalEn = 'extreme low-angle ground-level frog-eye shot, dramatic upward tilt';
  } else if (elev <= -15) {
    verticalLabel = '微低机位仰拍视角';
    verticalEn = 'low-angle shot, looking slightly upward';
  }

  const compositeLabel = `${horizontalLabel} + ${verticalLabel}`;

  return {
    horizontalLabel,
    horizontalEn,
    verticalLabel,
    verticalEn,
    compositeLabel,
  };
}

/**
 * 单画幅防九宫格、防多切片、防接触表硬约束
 */
export const MULTI_ANGLE_ANTI_COLLAGE_GUARD =
  '【单幅画面硬性约束】：必须且仅生成一张单一摄影机位的完整全画幅画面。绝对严禁九宫格拼图、严禁多视角拼贴、严禁四宫格切片、严禁分镜接触表（Contact Sheet / Sprite Sheet / Character Turnaround Sheet）、严禁分屏切割、严禁分栏画框；画面中绝对严禁出现任何摄像机图标、机位度数文字、标尺数字、十字准星、分界网格线或水印字符。' +
  ' (Single full-frame image from a single camera angle. Absolute negative constraints: NO grid, NO collage, NO split screen, NO multi-panel, NO contact sheet, NO turnaround sheet, NO camera angle labels, NO degree text overlays, NO borders, NO watermark.)';

/**
 * 剥离用户原提示词中历史残留的多角度或机位前缀，提取纯粹的内容意图
 */
export function sanitizeOriginalPromptForMultiAngle(prompt: string): string {
  if (!prompt) return '';
  let cleaned = cleanPromptText(prompt);

  // 1. 优先剔除带括号包裹的完整多角度标签，如 "【多角度...】"、"[多角度...]"
  cleaned = cleaned.replace(/[【\[\(（]多角度[^】\]\)）]*[】\]\)）]/gi, ' ');
  // 2. 剔除形如 "多角度视角转换(机位: 129° / 0°)" 或 "多角度视角转换"
  cleaned = cleaned.replace(/多角度(?:视角转换)?(?:\([^\)]*\)|（[^）]*）)?[:：\s]*/gi, ' ');
  // 3. 剔除机位与度数文本
  cleaned = cleaned.replace(/[（\(]机位[:：][^）\)]+[）\)]/gi, ' ');
  cleaned = cleaned.replace(/机位[:：]\s*\d+°?\s*(?:\/\s*-?\d+°?)?/gi, ' ');
  // 4. 清理残留的空括号与前缀
  cleaned = cleaned.replace(/[【\[\(（]\s*[】\]\)）]/gi, ' ');
  cleaned = cleaned.replace(/^多角度\s+/gi, '');

  return cleanPromptText(cleaned);
}

/**
 * 拼装高质量多角度单机位视角转换生图提示词
 */
export function buildMultiAnglePrompt(options: MultiAnglePromptOptions): string {
  const { originalPrompt, azimuth, elevation, angleName } = options;
  const baseContent = sanitizeOriginalPromptForMultiAngle(originalPrompt) || '场景人物主体与环境氛围';
  const desc = resolveAngleDescriptions(azimuth, elevation);

  const parts = [
    // 1. 核心单视角主指令
    `【全新单视角摄影转换】：以参考图 @图片1 (image) 为绝对视觉基准，摄像机已围绕画面中的主体与环境进行三维环绕位移，切换至全新的摄影机位：【${desc.compositeLabel}】（摄影机水平方位角：${Math.round(azimuth)}°，垂直俯仰角：${Math.round(elevation)}°，${desc.horizontalEn}, ${desc.verticalEn}）。`,

    // 2. 空间透视与光影重绘指令（杜绝与原图一模一样，但视角透视精准变换）
    `【空间透视重构】：必须严格依据该全新三维机位视点，重新绘制画面中主体与环境的新空间透视与立体层次。彻底打破原图原有的平视正面机位，精准表现主体在新视角下的身体朝向、侧面/仰视/俯视遮挡结构与立体轮廓（如侧颜鼻梁、下颌线条或仰视俯视透视），并根据机位相对位置重新投射自然统一的光影与阴影，严禁原样复刻原图正面视角。`,

    // 3. 原图主体五官、同框伙伴与画风绝对一致性锁定
    `【主体身份与风格继承】：以参考图 @图片1 (image) 为唯一视觉基准，严格保持主体人物/角色的外貌长相、面容五官、神态表情（如眨眼、笑容）、代表性动作姿势（如手势合照动作）、服装发饰与色彩细节 100% 绝对一致；画面中同框出现的伙伴/随行角色（如宝可梦、宠物、随行伙伴等）必须完整保留并保持同一外貌与站位关系；背景环境场景与整体艺术风格（动漫原画、光影质感与色调）必须与原图保持高度同一，严禁擅自增删主体、篡改衣着或脱离原图场景。`,

    // 4. 融合主体内容描述
    `【画面呈现内容】：${baseContent}。`,

    // 5. 单画幅反九宫格/反接触表硬性守卫（杜绝九宫格切片与刻度文字）
    MULTI_ANGLE_ANTI_COLLAGE_GUARD,
  ];

  return parts.join('\n\n');
}

/**
 * 规整输入文本：如果检测到包含旧版多角度视角转换格式，自动升级并补全单画幅防拼图约束
 */
export function normalizeLegacyMultiAnglePrompt(prompt: string): string {
  if (!prompt || typeof prompt !== 'string') return prompt;

  const match = prompt.match(/多角度视角转换\(机位:\s*(\d+(?:\.\d+)?)°?\s*\/\s*(-?\d+(?:\.\d+)?)°?\)/i);
  if (match) {
    const az = parseFloat(match[1] || '0');
    const el = parseFloat(match[2] || '0');
    const remaining = prompt.replace(match[0], '').trim();
    return buildMultiAnglePrompt({
      originalPrompt: remaining,
      azimuth: az,
      elevation: el,
    });
  }

  // 若仅有 "多角度" 且未包含防九宫格约束
  if (prompt.startsWith('多角度 ') && !prompt.includes('单幅画面硬性约束')) {
    const remaining = prompt.replace(/^多角度\s+/, '').trim();
    return [
      `【全新单视角摄影转换】：以参考图 @图片1 为绝对基准，摄像机围绕主体切换至全新的侧前方立体拍摄机位，依据全新视点重新绘制透视轮廓与身体朝向，打破原图原有正面视角，同时严格保持 @图片1 的主体五官特征与画风色彩 100% 一致。`,
      `【画面呈现内容】：${remaining}`,
      MULTI_ANGLE_ANTI_COLLAGE_GUARD,
    ].join('\n\n');
  }

  return prompt;
}
