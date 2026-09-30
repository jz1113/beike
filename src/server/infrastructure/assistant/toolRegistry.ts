/**
 * 智能助手工具注册中心与统一调度器
 * 
 * 模块结构说明：
 * - ./tools/defs: 工具定义、OpenAI Function Calling Schema 与元数据
 * - ./tools/productTools: 电商商品链接解析、文档检索、商品库与资产库查询
 * - ./tools/mediaTools: 图片反推提示词、视频元数据探查与故事板分镜提取
 * - ./tools/clientTools: 客户端工作台状态感知与各视图能力查询
 */

import { prisma } from '@server/infrastructure/database/prisma';
import { parseToolArguments } from './toolArguments';
import { formatToolError } from './toolSafety';
import { listWorkshopArchitectures, toolSetWorkshopArch } from './tools/workshopTools';
import type { ToolExecContext } from '@shared/domain/assistant/tools/defs';
import {
  toolParseUrl,
  toolReadDocument,
  toolListProducts,
  toolQueryAssetLibrary,
  toolGetPromptAssetDetail,
} from './tools/productTools';
import {
  toolDeconstructImage,
  toolInspectVideoMedia,
  toolExtractVideoStoryboard,
  toolExtractVideoDetailedFrames,
} from './tools/mediaTools';
import {
  toolGetWorkshopState,
  toolGetViewCapabilities,
} from '@shared/domain/assistant/tools/clientTools';

// 1. 导出全部定义、Schema 与工具元数据
export * from '@shared/domain/assistant/tools/defs';

// 2. 导出商品与资产工具
export * from './tools/productTools';

// 3. 导出多媒体与视频逆向工具
export * from './tools/mediaTools';

// 4. 导出客户端工作台能力工具
export * from '@shared/domain/assistant/tools/clientTools';

/**
 * 助手工具统一执行分发器
 */
export async function executeAssistantTool(
  name: string,
  argsJson: string,
  ctx: ToolExecContext,
): Promise<string> {
  ctx.signal?.throwIfAborted();
  let args: Record<string, unknown>;
  try { args = parseToolArguments(name, argsJson); }
  catch (error) { return JSON.stringify({ success: false, error: formatToolError(error, '工具参数无效') }); }

  switch (name) {
    case 'parse_product_or_social_url':
      return toolParseUrl(String(args.url || args.link || ''), ctx.origin, ctx.signal);
    case 'read_attached_document':
      return toolReadDocument(args as Parameters<typeof toolReadDocument>[0], ctx.documents);
    case 'list_user_products':
      return toolListProducts(args as Parameters<typeof toolListProducts>[0]);
    case 'query_asset_library':
      return toolQueryAssetLibrary(args as Parameters<typeof toolQueryAssetLibrary>[0], ctx.origin, ctx.signal);
    case 'get_prompt_asset_detail':
      return toolGetPromptAssetDetail(args as Parameters<typeof toolGetPromptAssetDetail>[0], ctx.origin, ctx.signal);
    case 'deconstruct_image':
      return toolDeconstructImage(args as Parameters<typeof toolDeconstructImage>[0], ctx.origin, ctx.signal);
    case 'inspect_video_media':
      return toolInspectVideoMedia(String(args.video_url || args.url || ''), ctx.signal);
    case 'extract_video_storyboard':
      return toolExtractVideoStoryboard(
        String(args.video_url || args.url || ''),
        Number(args.sample_count) || 12,
        ctx.signal,
      );
    case 'extract_video_detailed_frames':
      return toolExtractVideoDetailedFrames(
        String(args.video_url || args.url || ''),
        Number(args.start_time ?? args.startSec) || 0,
        Number(args.end_time ?? args.endSec) || 3,
        Number(args.frame_count ?? args.count) || 4,
        ctx.signal,
      );
    case 'get_workshop_state':
      return toolGetWorkshopState(ctx);
    case 'get_view_capabilities': {
      const result = JSON.parse(toolGetViewCapabilities(args as { view?: string }, ctx));
      if (result.view === 'workshop') {
        try { result.availableArchitectures = await listWorkshopArchitectures(); }
        catch (error) { result.availableArchitectures = []; result.architectureError = formatToolError(error, '架构列表暂时不可用'); }
      }
      return JSON.stringify(result);
    }
    case 'workspace_navigate':
      return JSON.stringify({
        success: true,
        action: 'navigate',
        target_view: args.target_view,
        reason: args.reason || '',
        message: `已请求将工作台切换至「${args.target_view === 'workshop' ? '种草工坊' : args.target_view === 'generate' ? '极速生图' : args.target_view === 'assets' ? '资产中心' : '灵感首页'}」`,
      });
    case 'workspace_load_workshop_product': {
      const itemId = String(args.itemId || '').trim();
      if (!itemId) return JSON.stringify({ success: false, error: '缺少商品编号，请先查询商品库或采集商品' });
      try {
        const product = await prisma.product.findFirst({ where: { itemId }, orderBy: { createdAt: 'desc' } });
        if (!product) return JSON.stringify({ success: false, error: '该商品尚未保存，请先采集链接或从商品库选择商品' });
        let stored: unknown;
        try { stored = JSON.parse(product.detailUrls || '{}'); } catch { stored = {}; }
        const data = stored && typeof stored === 'object' && !Array.isArray(stored) ? stored as Record<string, unknown> : {};
        const urls = (value: unknown): string[] => Array.isArray(value) ? value.filter((url): url is string => typeof url === 'string' && /^(https?:\/\/|\/storage\/|data:image\/)/i.test(url)).slice(0, 100) : [];
        const main = urls(data.main || data.mainImages);
        const details = urls(data.details || data.detailImages);
        const skus = urls(data.skus || data.skuImages);
        if (!main.length && product.picUrl) main.push(...urls([product.picUrl]));
        if (!main.length && !details.length && !skus.length) return JSON.stringify({ success: false, error: '该商品没有可用图片，请先重新采集或补充图片' });
        return JSON.stringify({ success: true, action: 'load_workshop_product', itemId: product.itemId,
          title: product.title || '商品', product: { itemId: product.itemId, title: product.title || '商品', platform: product.platform, price: '', picUrl: product.picUrl || main[0] || details[0] || skus[0] },
          images: { main, details, skus }, message: '商品资料已核实，已请求将图片和资料载入种草工坊' });
      } catch (error) { return JSON.stringify({ success: false, error: formatToolError(error, '商品资料读取失败，请稍后重试') }); }
    }
    case 'trigger_generate':
      return JSON.stringify({
        success: true,
        action: 'trigger_generate',
        prompt: args.prompt,
        requiresUserGenerate: true,
        message: '已请求将提示词和参考图载入首页生图输入，等待用户确认生成',
      });
    case 'set_workshop_arch':
      return toolSetWorkshopArch(args);
    case 'spawn_subagent':
      return JSON.stringify({
        success: false,
        error: `spawn_subagent 工具应由 Agent Runtime 直接处理，请检查调用上下文`,
        _handled_by_runtime: true,
        skill_id: args.skill_id,
        prompt: args.prompt,
      });
    default:
      return JSON.stringify({ success: false, error: `未知工具: ${name}` });
  }
}
