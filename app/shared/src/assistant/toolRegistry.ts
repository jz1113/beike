/**
 * 智能助手工具注册中心与统一调度器
 * 
 * 模块结构说明：
 * - ./tools/defs: 工具定义、OpenAI Function Calling Schema 与元数据
 * - ./tools/productTools: 电商商品链接解析、文档检索、商品库与资产库查询
 * - ./tools/mediaTools: 图片反推提示词、视频元数据探查与故事板分镜提取
 * - ./tools/clientTools: 客户端工作台状态感知与各视图能力查询
 */

import type { ToolExecContext } from './tools/defs';
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
} from './tools/clientTools';

// 1. 导出全部定义、Schema 与工具元数据
export * from './tools/defs';

// 2. 导出商品与资产工具
export * from './tools/productTools';

// 3. 导出多媒体与视频逆向工具
export * from './tools/mediaTools';

// 4. 导出客户端工作台能力工具
export * from './tools/clientTools';

/**
 * 助手工具统一执行分发器
 */
export async function executeAssistantTool(
  name: string,
  argsJson: string,
  ctx: ToolExecContext,
): Promise<string> {
  let args: Record<string, unknown> = {};
  try {
    args = argsJson ? JSON.parse(argsJson) : {};
  } catch {
    args = {};
  }

  switch (name) {
    case 'parse_product_or_social_url':
      return toolParseUrl(String(args.url || args.link || ''), ctx.origin);
    case 'read_attached_document':
      return toolReadDocument(args as Parameters<typeof toolReadDocument>[0], ctx.documents);
    case 'list_user_products':
      return toolListProducts(args as Parameters<typeof toolListProducts>[0]);
    case 'query_asset_library':
      return toolQueryAssetLibrary(args as Parameters<typeof toolQueryAssetLibrary>[0], ctx.origin);
    case 'get_prompt_asset_detail':
      return toolGetPromptAssetDetail(args as Parameters<typeof toolGetPromptAssetDetail>[0], ctx.origin);
    case 'deconstruct_image':
      return toolDeconstructImage(args as Parameters<typeof toolDeconstructImage>[0], ctx.origin);
    case 'inspect_video_media':
      return toolInspectVideoMedia(String(args.video_url || args.url || ''));
    case 'extract_video_storyboard':
      return toolExtractVideoStoryboard(
        String(args.video_url || args.url || ''),
        Number(args.sample_count) || 12,
      );
    case 'extract_video_detailed_frames':
      return toolExtractVideoDetailedFrames(
        String(args.video_url || args.url || ''),
        Number(args.start_time ?? args.startSec) || 0,
        Number(args.end_time ?? args.endSec) || 3,
        Number(args.frame_count ?? args.count) || 4,
      );
    case 'get_workshop_state':
      return toolGetWorkshopState(ctx);
    case 'get_view_capabilities':
      return toolGetViewCapabilities(args as { view?: string }, ctx);
    case 'workspace_navigate':
      return JSON.stringify({
        success: true,
        action: 'navigate',
        target_view: args.target_view,
        reason: args.reason || '',
        message: `已为您将工作台调度至「${args.target_view === 'workshop' ? '种草工坊' : args.target_view === 'generate' ? '极速生图' : args.target_view === 'assets' ? '资产中心' : '灵感首页'}」`,
      });
    case 'workspace_load_workshop_product':
      return JSON.stringify({
        success: true,
        action: 'load_workshop_product',
        itemId: args.itemId,
        title: args.title || '',
        message: `已将商品【${args.title || args.itemId}】装载至种草工坊工作区`,
      });
    case 'trigger_generate':
      return JSON.stringify({
        success: true,
        action: 'trigger_generate',
        prompt: args.prompt,
        model: args.model || null,
        message: '已准备将提示词发送至极速生图工作区',
      });
    case 'set_workshop_arch':
      return JSON.stringify({
        success: true,
        action: 'set_workshop_arch',
        arch_id: args.arch_id,
        reason: args.reason || '',
        message: `已切换拍摄架构为 ${args.arch_id}`,
      });
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
