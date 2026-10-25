export function toolDisplayName(name: string): string {
  switch (name) {
    case 'update_plan':
      return '更新执行计划';
    case 'read_skill':
      return '读取技能';
    case 'read_skill_file':
      return '读取技能资料';
    case 'search_mcp_tools':
      return '检索外部工具';
    case 'load_mcp_tool':
      return '加载外部工具';
    case 'read_tool_result':
      return '读取工具结果';
    case 'execute_code':
      return '运行代码';
    case 'parse_product_or_social_url':
      return '解析商品/社媒链接';
    case 'read_attached_document':
      return '阅读附件文档';
    case 'list_user_products':
      return '查询商品库';
    case 'query_asset_library':
      return '搜索资产库';
    case 'get_prompt_asset_detail':
      return '读取提示词资产详情';
    case 'deconstruct_image':
      return '反推图片提示词';
    case 'get_workshop_state':
      return '读取工作台状态';
    case 'workspace_navigate':
      return '调度工作台视图';
    case 'workspace_load_workshop_product':
      return '载入电商图文';
    case 'trigger_generate':
      return '准备生图';
    case 'trigger_generate_batch':
      return '请求批量生成';
    case 'set_workshop_arch':
      return '切换拍摄架构';
    case 'inspect_video_media':
      return '探查视频物理规格';
    case 'extract_video_storyboard':
      return '提取全片故事板九宫格';
    case 'extract_video_detailed_frames':
      return '提取关键镜头特写画面';
    default:
      if (name.startsWith('mcp_')) {
        const tool = name.slice(4).split('__')[1]?.replaceAll('_', ' ').trim();
        return tool ? `外部工具 ${tool}` : '外部工具';
      }
      return name;
  }
}

export function summarizeToolResult(raw: string): string {
  try {
    const j = JSON.parse(raw);
    if (j.success === false) return j.error || '失败';
    if (j.plan) return j.plan.map((step: { title: string; status: string }) => `${step.status === 'completed' ? '✓' : step.status === 'blocked' ? '受阻' : step.status === 'in_progress' ? '进行中' : '待办'} ${step.title}`).join('；');
    if (j.sandbox === 'quickjs-wasm') return j.output?.join('\n').slice(0, 1200) || '代码执行完成';
    if (j.kind === 'social') return `社媒「${j.title || ''}」图${j.imageCount || 0}张`;
    if (j.kind === 'ecommerce') return `商品「${j.title || ''}」`;
    if (j.products) return `商品库 ${j.count || j.products.length} 条`;
    if (j.assets) return `资产库 ${j.count || j.assets.length} 条`;
    if (j.excerpt) return `文档片段 ${String(j.excerpt).length} 字`;
    if (j.action === 'navigate') return `导航至 ${j.target_view}`;
    if (j.action === 'load_workshop_product') return `载入商品 ${j.itemId}`;
    if (j.action === 'trigger_generate') return '准备生图';
    if (j.action === 'generate_batch') return '已请求批量提交，客户端将校验后执行';
    if (j.action === 'set_workshop_arch') return `切换架构 ${j.arch_id}`;
    if (j.workshopState) return '已读取工作台状态';
    if (typeof j.text === 'string' && j.text.trim()) return j.text.trim().slice(0, 240);
    if (typeof j.skillId === 'string' && j.skillId.trim()) return `已读取技能 ${String(j.name || j.skillId).trim()}`;
    if (typeof j.path === 'string' && j.path.trim()) return `已读取 ${j.path.trim()}`;
    return '完成';
  } catch {
    return raw.slice(0, 80);
  }
}

export function parseToolAction(raw: string): Record<string, unknown> | undefined {
  try {
    const j = JSON.parse(raw);
    if (j?.action) return j as Record<string, unknown>;
    return undefined;
  } catch {
    return undefined;
  }
}
