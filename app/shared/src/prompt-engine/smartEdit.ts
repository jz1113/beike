/**
 * 智能改图 / 局部重绘定向提示词生成器
 */

export interface MarkerPoint {
  id?: string;
  x: number; // 0 ~ 100 百分比
  y: number; // 0 ~ 100 百分比
  index: number;
  type?: 'point' | 'box';
  width?: number; // 0 ~ 100 百分比 (框选模式)
  height?: number; // 0 ~ 100 百分比 (框选模式)
}

export interface SmartEditPromptOptions {
  originalPrompt?: string;
  userPrompt: string;
  markers?: MarkerPoint[];
}

/**
 * 将百分比坐标转化为人类及 AI 大模型直观理解的方位描述
 */
export function resolveMarkerSpatialDescription(x: number, y: number): string {
  let vertical = '中段';
  if (y <= 30) vertical = '上方头部/上半部分';
  else if (y <= 65) vertical = '中部身躯/中心位置';
  else vertical = '下方下半部分';

  let horizontal = '居中';
  if (x <= 35) horizontal = '偏左侧';
  else if (x >= 65) horizontal = '偏右侧';

  return `${vertical}${horizontal}（横向坐标约 ${Math.round(x)}%，纵向坐标约 ${Math.round(y)}%）`;
}

/**
 * 拼装高质量智能改图与局部重绘提示词
 */
export function buildSmartEditPrompt(options: SmartEditPromptOptions): string {
  const { originalPrompt, userPrompt, markers = [] } = options;
  const cleanUserPrompt = (userPrompt || '').trim() || '进行局部细节修改调整';

  // 1. 标记点与框选区域方位分析
  const markerNotes = markers.map((m) => {
    const isBox = m.type === 'box' && (m.width || 0) > 0 && (m.height || 0) > 0;
    if (isBox) {
      const centerX = m.x + (m.width || 0) / 2;
      const centerY = m.y + (m.height || 0) / 2;
      const loc = resolveMarkerSpatialDescription(centerX, centerY);
      return `选区序号【${m.index}】（矩形框选区域）：位于原图${loc}，框选区域覆盖宽度约 ${Math.round(m.width || 0)}%，高度约 ${Math.round(m.height || 0)}%`;
    }
    const loc = resolveMarkerSpatialDescription(m.x, m.y);
    return `标记序号【${m.index}】（点选标记）：位于原图${loc}`;
  });

  const markerSection =
    markerNotes.length > 0
      ? `【局部标记与框选区域】：\n${markerNotes.join('\n')}`
      : '【局部标记与框选区域】：以用户描述指向的具体局部位置为准。';

  const parts = [
    `【局部定向修改与智能重绘指令】：以参考图 @图片1 (image) 为绝对视觉基准画面。`,
    markerSection,
    `【目标修改内容】：${cleanUserPrompt}。`,
    `【全画面一致性与局部锁定严密规则】：\n1. 仅对上述标记与用户指定的局部区域进行精准修改，严禁重绘或擅自改动画面其他任何未提及的元素。\n2. 绝对保持原图人物主体的人物五官长相、神态表情、肤色发型（除非指定修改头发）、体态身材及未修改的服饰细节 100% 高度一致。\n3. 绝对保持原图的背景环境、空间构图、光影透视、画质色调与整体艺术风格完整统一，确保修改后的新画面与原图浑然一体。`,
  ];

  if (originalPrompt && originalPrompt.trim()) {
    parts.push(`【原图基准画面参考描述】：${originalPrompt.trim()}`);
  }

  return parts.join('\n\n');
}
