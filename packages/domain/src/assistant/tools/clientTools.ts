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
      actions: ['quick_generate', 'quick_video', 'navigate'],
      tools: ['trigger_generate', 'workspace_navigate', 'parse_product_or_social_url'],
    },
    workshop: {
      actions: [
        'load_product',
        'set_arch',
        'generate_shots',
        'switch_mode(storyboard_generate)',
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
      actions: ['generate_image', 'generate_video', 'navigate'],
      tools: ['trigger_generate', 'workspace_navigate'],
    },
    assets: {
      actions: ['search_assets', 'get_asset_detail', 'deconstruct_image', 'navigate'],
      tools: ['query_asset_library', 'get_prompt_asset_detail', 'deconstruct_image', 'workspace_navigate'],
    },
    collect: {
      actions: ['parse_url'],
      tools: ['parse_product_or_social_url', 'workspace_navigate'],
    },
    settings: {
      actions: ['configure_models', 'configure_api_keys'],
      tools: [],
    },
  };
  const cfg = capabilities[currentView] || capabilities.home;
  return JSON.stringify({
    success: true,
    view: currentView,
    actions: cfg.actions,
    availableTools: cfg.tools,
    note: '若需要执行 capabilities 中未列出的工具，需先 workspace_navigate 到对应视图',
  });
}
