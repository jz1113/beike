export interface CreationSkillFlow {
  inputLabel: string;
  inputHint: string;
  placeholder: string;
  starter: string;
  output: string;
  steps: string[];
  example: string;
  accept: string;
  requiresMedia?: boolean;
}

const FLOWS: Record<string, CreationSkillFlow> = {
  'beike-prompt-extraction': {
    inputLabel: '上传图片或视频', inputHint: '先上传要分析的素材，可补充只提取构图、动作或完整风格。',
    placeholder: '想提取哪些内容？例如：保留构图和光线，替换成我的商品…',
    starter: '请分析我上传的图片或视频，提取主体、构图、光线、动作与风格，输出可直接使用的提示词。',
    output: '图片提示词，或按镜头拆分的视频提示词；事实与推测分别说明。',
    steps: ['上传素材', '提取与核对', '复用提示词'],
    example: '请提取这份素材的构图、镜头和光线，分别说明可见事实与推测，保留原画面风格。',
    accept: 'image/*,video/*', requiresMedia: true,
  },
  'beike-cinematic-storyboard': {
    inputLabel: '添加参考素材（可选）', inputHint: '用一句话描述故事；可补充总时长、画幅和人物参考。',
    placeholder: '故事讲什么？想拍多长、什么画幅？',
    starter: '请把我的故事想法整理成电影分镜，先给镜头表，再给各镜头可独立使用的视频提示词。',
    output: '连续分镜表、逐镜视频提示词；需要时补充关键帧图片提示词。',
    steps: ['描述故事', '确认分镜', '逐镜生成'],
    example: '雨后车站，一位成年摄影师拾起旧照片，抬头看见远处同样的自己。16秒、16:9，拆为两个8秒镜头。',
    accept: 'image/*,.pdf,.docx,.txt,.md',
  },
  'beike-character-three-view': {
    inputLabel: '上传人物参考图（可选）', inputHint: '上传人物图，或直接描述外貌、服装和画风；两种方式都可以。',
    placeholder: '描述人物外貌、服装和画风，或补充参考图要保留的细节…',
    starter: '请根据我提供的人物参考图或文字设定，制作同一角色正面、左侧面、背面的全身三视图，白色背景。',
    output: '同一人物的三视图设定板提示词，可在生成面板绑定人物图后出图。',
    steps: ['提供人物设定', '确认三视图方案', '生成设定板'],
    example: '原创成年男性，黑色短发、白色圆领T恤、深蓝直筒牛仔裤、白色运动鞋，写实风格，横向3:2三视图。',
    accept: 'image/*',
  },
  'beike-ugc-product-sales': {
    inputLabel: '上传商品参考图（可选）', inputHint: '上传商品图或填写商品信息，补充真实卖点、受众和视频时长。',
    placeholder: '卖什么商品？面向谁？有哪些真实卖点，想拍多长？',
    starter: '请根据我的商品图或商品信息，设计自然生活化的达人带货视频，先给口播与镜头安排，再给完整视频提示词。',
    output: '有事实依据的口播脚本、商品演示镜头与可执行的视频提示词。',
    steps: ['提供商品信息', '确认口播与演示', '生成视频镜头'],
    example: '米白与深蓝色头戴式耳机，只展示外观，不写未知性能。面向年轻通勤人群，8秒9:16，展示佩戴与取下动作。',
    accept: 'image/*,.pdf,.docx,.txt,.md',
  },
};

export function creationSkillFlow(id: string | undefined): CreationSkillFlow | undefined {
  return id ? FLOWS[id.replace(/^assistant:/, '')] : undefined;
}

/** Switching skills replaces only our own starter; authored notes and attachments remain intact. */
export function skillActivationPrompt(id: string, title: string, current: string, override?: string): string {
  const token = `#[skill:${title}]`;
  let body = (override ?? current).replace(/#\[skill:[^\]]+\]\s*/gi, '').trim();
  if (override === undefined && Object.values(FLOWS).some(flow => flow.starter === body)) body = '';
  return `${token} ${body || creationSkillFlow(id)?.starter || ''}`.trimEnd() + ' ';
}

export function creationSkillInputIssue(id: string | undefined, prompt: string, hasMedia: boolean): string | undefined {
  const flow = creationSkillFlow(id);
  if (!flow) return;
  if (flow.requiresMedia && !hasMedia) return '请先上传要分析的图片或视频。';
  const body = prompt.replace(/#\[skill:[^\]]+\]\s*/gi, '').trim();
  if (!hasMedia && (!body || body === flow.starter)) return flow.inputHint;
}
