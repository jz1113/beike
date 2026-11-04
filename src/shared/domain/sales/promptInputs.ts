const genericDetailDisplayClause = /^(\s*(?:(?:并且|并|同时|继续|自然)(?:地)?)*(?:展示|展现|呈现)(?:出)?\s*)(?:\{\{\s*商品细节部位\s*\}\}|商品细节部位)((?:的(?:外观|纹理|质感|轮廓|状态|细节))?\s*)$/;

/** Resolve reusable action slots without inventing a product's material or design. */
export function resolveSalesProductSlots(text: string): string {
  return text.split('\n').map((sourceLine) => {
    // A standalone appearance display does not name a contact target. Include
    // field-label colons here so rendered facts use the same wording as beats.
    const line = sourceLine.split(/([。！？!?；;，,:：])/)
      .map((clause) => clause.replace(genericDetailDisplayClause, '$1商品外观细节$2')).join('');
    const context = line.replace(/\{\{[^{}]+\}\}/g, '');
    const existing = (parts: string[], fallback: string) => parts.find((part) => context.includes(part)) || fallback;
    const slots: Record<string, string> = {
      商品: '当前商品',
      商品正面结构: existing(['衣襟', '门襟', '前襟', '领口'], '商品正面'),
      商品背部设计: '商品背面',
      商品背面结构: '商品背面',
      商品细节部位: existing(['袖口', '领口', '包边', '边缘', '接口'], '该部位'),
      商品内部配件: existing(['内胆', '内衬', '衬里', '里布', '里料', '配件'], '内部配件'),
    };
    return line.replace(/\{\{\s*([^{}]+?)\s*\}\}/g, (token, key: string) => Object.hasOwn(slots, key) ? slots[key] : token);
  }).join('\n');
}

/** Remove source speech performance while retaining gaze, gestures and non-speaking expressions. */
export function omitSourceSpeechCues(text: string, removeSilenceConflict = true): string {
  if (!/(?:语速|语气|音色|声音|口播|说话|讲话|发音|嘴唇|嘴部|嘴巴|口型|嘴型|闭嘴|不张嘴|不开口)/.test(text)) return text;
  // Strip only identified speech spans. Unknown clauses may contain an action,
  // so never discard a clause based on a list of recognized visual verbs.
  return text
      .replace(/(?:伴随|配合|随着|跟随|随)(?:口播|说话|讲话|发音)(?:的|时)?/g, '')
      .replace(/(?:嘴唇|嘴部|嘴巴|口型|嘴型)(?:(?:持续|连续|不停|不断|反复|快速|急促|飞快|同步|保持|呈现|自然|轻微|缓慢|开合|张合|分合|运动|正在|如同|呈|像|的|地|着)){0,12}(?:说话|讲话|口播|发音)(?:讲解|式|状|的)?/g, '')
      .replace(/(?:嘴唇|嘴部|嘴巴|口型|嘴型)(?:(?:持续|连续|不停|不断|反复|快速|急促|飞快|同步|保持|呈现|地|的)){1,8}(?:开合|张合|运动)(?:着|说话|讲话)?/g, '')
      .replace(/(?:全程|始终|保持)?(?:紧闭嘴唇|嘴唇紧闭|闭嘴|不说话|不张嘴|不开口)/g, (match) => removeSilenceConflict ? '' : match)
      .replace(/(?:(?:以|用|保持|持续|连续|边)?(?:快速|急促|飞快|缓慢|慢速|中速|自然|高亢|低沉)(?:的)?(?:语速)?(?:口播|说话|讲话)|(?:口播|说话|讲话)(?:的)?(?:语速)?(?:很|偏|较)?(?:快速|急促|飞快|缓慢|慢速|中速))/g, '')
      .replace(/(?:(?:口播|说话|讲话)(?:的)?(?:节奏|语速|语气)|语速|语气|音色|声音)(?:很|偏|较|保持|为|呈现|的)?(?:(?:轻快|快速|急促|缓慢|慢速|中速|平稳|自然|高亢|低沉|热情|温柔|有力|舒缓|清楚|清晰|洪亮|快|慢)){1,6}/g, '')
      .replace(/([，,；;。！？!?])(?:\s*[，,；;。！？!?])+/g, '$1')
      .replace(/(^|[，,；;。！？!?])(?:时|边|着|的|地|且|并且|并)(?=[，,；;。！？!?]|$)/g, '$1')
      .replace(/^(?:[，,；;。！？!?\s]|并且|并(?=举|抬|低|转|看|放|收|全程|保持|不))+/g, '')
      .replace(/(?:并且|并|且|[，,；;、\s])+$/g, '').trim();
}

export function salesPromptDataError(text: string, allowedTokens: readonly string[]): string {
  let remainder = text;
  for (const token of allowedTokens) remainder = remainder.split(token).join('');
  const unknown = [...remainder.matchAll(/\{\{([^{}]+)\}\}/g)].map((match) => match[1].trim());
  if (unknown.length) return `生成事实中仍有未展开的占位符：${[...new Set(unknown)].join('、')}。请在分镜或商品资料中补充明确内容。`;
  return /\{\{/.test(remainder) ? '生成事实中的双花括号占位符格式不完整，请检查分镜或商品资料。' : '';
}

export function isSeedance2Model(model: string | undefined): boolean {
  return /seedance[-_. ]*2[.-]0(?:$|[-_. ])/i.test(model || '');
}
