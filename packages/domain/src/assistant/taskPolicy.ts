/** Explicit execution boundaries and reference scope; the model still plans the actual work. */
export type AssistantRunMode = 'auto' | 'plan' | 'act';
export type ReferenceScope = 'auto' | 'sample' | 'all' | 'none';
export interface AssistantTaskState {
  mode: 'plan' | 'act'; goal: string; deliverable: 'storyboard' | 'selection' | 'reply';
  referenceScope: 'sample' | 'all' | 'explicit' | 'none';
  totalReferences: number; references: Array<{ number: number; label: string; url: string }>;
  status: 'running' | 'completed' | 'failed' | 'cancelled';
  stage: string;
}

export function resolveTaskPolicy(text: string, mode: AssistantRunMode = 'auto', scope: ReferenceScope = 'auto') {
  const planning = /先.{0,8}(规划|方案|分析)|提示词|分镜|版式|排版|先不要.{0,4}(生图|生成|执行)|只.{0,4}(规划|方案|文案|分析)/.test(text);
  const storyboard = /图文|分镜|套图|海报/.test(text) && /提示词|规划|版式|排版|方案|设计/.test(text);
  const selection = /(?:挑|筛选|选出|选取|选择).{0,12}(?:张|图片|素材|封面|主图)|逐(?:张|图)|全(?:部|量).{0,8}(?:图片|素材|分析)/.test(text);
  const noImages = /不(?:要|用).{0,6}(?:分析|参考|看)(?:图|图片)|仅写文案|只写文案/.test(text);
  const referencesNeeded = !noImages && /图片|参考图|采集|图集|素材|版式|排版|封面|构图|配图|逐图/.test(text);
  const resolvedScope = scope !== 'auto' ? scope : !referencesNeeded ? 'none' : selection && !storyboard ? 'all' : 'sample';
  return {
    mode: mode === 'auto' ? planning || storyboard ? 'plan' as const : 'act' as const : mode,
    deliverable: storyboard ? 'storyboard' as const : selection ? 'selection' as const : 'reply' as const,
    referenceScope: resolvedScope,
  };
}

export const PLANNING_TOOLS = ['execute_code', 'parse_product_or_social_url', 'read_attached_document', 'list_user_products', 'query_asset_library', 'get_prompt_asset_detail', 'get_workshop_state', 'get_view_capabilities'];
export function toolsForTask(mode: 'plan' | 'act', allowed?: string[]) {
  return mode === 'act' ? allowed : PLANNING_TOOLS.filter(name => !allowed || allowed.includes(name) || name === 'execute_code');
}

export function taskInstructions(task: Pick<AssistantTaskState, 'mode' | 'deliverable'>) {
  return `【本轮交付与执行边界】\n${task.mode === 'plan' ? '本轮先规划：交付具体方案、文案和可执行提示词；不调用生图、视频生成或工作区写入工具。规划本身必须完成，不能只列下一步计划。' : '按当前用户目标执行；已有授权范围内推进，工具操作使用真实返回结果，生成动作遵守工具审批。'}\n` +
    (task.deliverable === 'storyboard' ? '本轮需要多页图文方案。用户要求的封面、页数和画面文字必须完整交付：先给整体标题和正文，再逐页给页码、用途、画面内准确文案、版式与构图、配图建议，每页附独立可复制的完整生图提示词代码块（使用 ```prompt）。用户未指定时默认封面加5页，共6页；指定页数或最少页数则遵从。每页保持共同字体、配色、比例和视觉风格；用户未指定比例时默认3:4，每页提示词附 --ar 3:4（有用户规格则替换）。参考图用于版式，不把图中地名与新目的地混用；未核实的项目或优惠不写成事实。不要把“生成图文方案”误解成必须立即付费生图。' : '先交付用户请求的结果，不机械添加执行报告、工具列表或下一步建议。');
}

export function selectReferenceImages<T extends { url: string; label: string; sourceUrl?: string }>(images: T[], text: string, scope: 'sample' | 'all' | 'none', limit = 6) {
  if (scope === 'none') return { images: [] as T[], scope: 'none' as const };
  const explicit = [...text.matchAll(/[@＠]\s*(?:图片|图|素材)\s*(\d+)|第\s*(\d+)\s*张/g)].map(match => Number(match[1] || match[2]));
  if (explicit.length) {
    const unique = [...new Set(explicit)];
    const missing = unique.filter(n => n < 1 || n > images.length);
    if (missing.length) throw new Error(`未找到素材编号 ${missing.join('、')}，请核对本次图集编号`);
    return { images: unique.map(n => images[n - 1]), scope: 'explicit' as const };
  }
  if (scope === 'all' || images.length <= limit) return { images, scope };
  // Position/source sampling is transparent, not a claim that these are the best images.
  const groups = new Map<string, T[]>();
  for (const image of images) { const key = image.sourceUrl || ''; groups.set(key, [...(groups.get(key) || []), image]); }
  const result: T[] = [];
  const buckets = [...groups.values()];
  for (let round = 0; result.length < limit; round++) {
    let added = false;
    for (const group of buckets) {
      const quota = Math.max(1, Math.ceil(limit / buckets.length));
      const positions = [...new Set(Array.from({ length: Math.min(quota, group.length) }, (_, i) => quota === 1 ? 0 : Math.round(i * (group.length - 1) / (quota - 1))))];
      const ordered = [...positions.map(i => group[i]), ...group.filter((_, i) => !positions.includes(i))];
      const image = ordered[round];
      if (image && result.length < limit) { result.push(image); added = true; }
    }
    if (!added) break;
  }
  return { images: result, scope: 'sample' as const };
}
