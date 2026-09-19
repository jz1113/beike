import { AgentRuntime } from '@beike/server-kit/assistant/agentRuntime';
import { toolParseUrl } from '@beike/server-kit/assistant/tools/productTools';
import { productWidgetFromToolResult } from '@beike/server-kit/assistant/agentLoop/toolExecutor';

export function socialCollectionIntent(text: string) {
  const urls = [...new Set((text.match(/https?:\/\/[^\s<>「」『』"，。；！）)]+/gi) || []).filter((raw) => {
    try {
      const host = new URL(raw).hostname.toLowerCase();
      return ['xiaohongshu.com', 'xhslink.com'].some((domain) => host === domain || host.endsWith(`.${domain}`));
    } catch { return false; }
  }))];
  const instruction = urls.reduce((s, url) => s.replaceAll(url, ''), text);
  const collectOnly = /(?:只|仅)(?:要|需)?(?:采集|收集|下载|解析)|不(?:要|用)(?:分析|挑选|筛选|调用.*模型)/.test(instruction);
  // 带采集链接的本轮只采集；分析必须由后续消息明确发起。
  const analyze = urls.length === 0 && !collectOnly && /分析|挑|筛选|选出|选择|选取|帮我选|封面|主图|构图|配图|海报|设计|根据|按照|适合|需要|想要/.test(instruction);
  return { urls, analyze };
}

/** 确定性采集阶段：只调用解析接口，绝不访问模型。 */
export async function collectSocialImages(
  urls: string[], origin: string, runtime: AgentRuntime, signal?: AbortSignal,
) {
  const images: Array<{ url: string; label: string; sourceUrl?: string }> = [];
  const seen = new Set<string>();
  const summaries: string[] = [];
  let productWidget: unknown;
  for (const [index, url] of urls.entries()) {
    signal?.throwIfAborted();
    const item = runtime.startItem('toolCall', {
      name: 'parse_product_or_social_url', displayName: '采集小红书图片', args: JSON.stringify({ url }),
    });
    const raw = await toolParseUrl(url, origin, signal);
    signal?.throwIfAborted();
    const result = JSON.parse(raw);
    const summary = result.success
      ? `链接 ${index + 1}：${result.title || '小红书图集'}，获取 ${result.imageCount} 张图片`
      : `链接 ${index + 1} 采集失败：${result.error}`;
    runtime.completeToolCall(item, { status: result.success ? 'done' : 'error', summary: raw });
    const resultItem = runtime.startItem('toolResult', { name: 'parse_product_or_social_url', displayName: '采集小红书图片', summary: raw });
    runtime.completeItem(resultItem, result.success ? 'done' : 'error');
    summaries.push(summary);
    if (result.success) {
      for (const image of result.images || []) {
        if (typeof image === 'string' && !seen.has(image)) {
          seen.add(image);
          images.push({ url: image, label: `素材 ${images.length + 1}（链接 ${index + 1}）`, sourceUrl: url });
        }
      }
      productWidget = productWidgetFromToolResult('parse_product_or_social_url', raw);
    }
  }
  if (productWidget && typeof productWidget === 'object') {
    productWidget = { ...productWidget, title: urls.length > 1 ? '小红书采集图集' : (productWidget as { title: string }).title,
      imageSources: images, props: { '链接数量': String(urls.length), '图集数量': String(images.length) },
      allImages: images.map((i) => i.url), mainImages: images.map((i) => i.url) };
  }
  return { images, summaries, productWidget };
}
