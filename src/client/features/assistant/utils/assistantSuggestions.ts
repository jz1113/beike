interface SuggestionContext {
  productTitle?: string;
  attachmentTypes?: Array<'image' | 'video' | 'document'>;
}

/** Suggest only tasks supported by the supplied context; never imply live trends or unseen screen contents. */
export function getAssistantSuggestions(currentView: string, context: SuggestionContext = {}): string[] {
  const types = context.attachmentTypes || [];
  const suggestions: string[] = [];
  if (types.includes('image')) suggestions.push('请分析已上传图片的构图、光线和配色；将可见事实与创意建议分开说明。');
  if (types.includes('video')) suggestions.push('请分析已上传视频可读取的画面，整理镜头顺序与复刻思路；无法确认的信息请标明。');
  if (types.includes('document')) suggestions.push('请阅读已上传文档，提炼核心要求、可执行步骤和需要我确认的问题。');
  const productTitle = context.productTitle?.trim();
  if ((currentView === 'workshop' || currentView === 'replicate') && productTitle) {
    suggestions.push(`根据商品「${productTitle.slice(0, 80)}」已提供的信息，设计3种拍摄场景；先指出还缺哪些参考素材。`);
  }
  if (currentView === 'canvas') suggestions.push('我想整理画板分镜。请先告诉我需要上传哪些画面或补充哪些信息，再一起规划镜头。');
  if (currentView === 'generate') suggestions.push('帮我把创作想法整理成图片提示词；先确认主体、场景、构图和风格，再给可修改的草稿。');
  if (currentView === 'replicate') suggestions.push('我想参考一张图片的构图与氛围。请先确认主体和复刻范围，再列出需要的素材。');
  suggestions.push(
    '先帮我明确创作目标、目标受众和交付形式，再提出3个创意方向。',
    '给我一份参考素材准备清单，并说明怎样描述光线、构图和风格。',
    '将我的想法整理成可编辑的创作方案，标出需要确认的内容。',
  );
  return suggestions.slice(0, 4);
}

export function getAssistantProductIdeaPrompt(title: string): string {
  return `根据商品「${title}」已提供的信息与参考素材，构思6条图片提示词，用标题和代码块分别给出。外观、材质或卖点无法确认时先标明，缺少关键素材时先提问。`;
}
