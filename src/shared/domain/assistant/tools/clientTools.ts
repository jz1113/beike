import type { ToolExecContext } from './defs';

export function toolGetWorkshopState(ctx: ToolExecContext): string {
  const c = ctx.clientContext || {};
  return JSON.stringify({
    success: true,
    workshopState: {
      currentView: c.currentView || 'home',
      workshopStep: c.workshopStep ?? 0,
      productTitle: c.productTitle || null,
      productItemId: c.productItemId || null,
      selectedArchId: c.selectedArchId || null,
      workshopMode: c.workshopMode || null,
      assetLibraryTab: c.assetLibraryTab || null,
      assetLibraryKeyword: c.assetLibraryKeyword || null,
    },
  });
}

export function toolGetViewCapabilities(args: { view?: string }, ctx: ToolExecContext): string {
  const currentView = args.view || ctx.clientContext?.currentView || 'home';
  // 能力地图：每个视图列出可用的"动作 + 需要的工具"。Agent 据此决策下一步。
  const capabilities: Record<string, { actions: string[]; tools: string[] }> = {
    home: {
      actions: ['prepare_image_draft', 'navigate'],
      tools: ['trigger_generate', 'workspace_navigate', 'parse_product_or_social_url'],
    },
    workshop: {
      actions: [
        'load_product',
        'set_arch',
        'navigate',
      ],
      tools: [
        'workspace_load_workshop_product',
        'set_workshop_arch',
        'trigger_generate',
        'list_user_products',
        'workspace_navigate',
        'deconstruct_image',
        'query_asset_library',
        'spawn_subagent',
      ],
    },
    generate: {
      actions: ['prepare_image_draft_on_home', 'navigate'],
      tools: ['trigger_generate', 'workspace_navigate'],
    },
    assets: {
      actions: ['search_assets', 'get_asset_detail', 'deconstruct_image', 'navigate'],
      tools: ['query_asset_library', 'get_prompt_asset_detail', 'deconstruct_image', 'workspace_navigate'],
    },
    collect: {
      actions: ['parse_url'],
      tools: ['parse_product_or_social_url'],
    },
    canvas: { actions: ['planning_from_workspace_summary'], tools: [] },
    replicate: { actions: ['planning_from_workspace_summary'], tools: [] },
    settings: {
      actions: [],
      tools: [],
    },
  };
  const cfg = capabilities[currentView] || { actions: [], tools: [] };
  return JSON.stringify({
    success: true,
    view: currentView,
    actions: cfg.actions,
    availableTools: cfg.tools,
    note: '可用工具以本轮函数列表和权限为准；查询资料无需切换视图。生图工具仅载入首页输入草稿，用户确认生成后才产生图片；视频生成和模型设置当前由用户在界面操作。',
  });
}
