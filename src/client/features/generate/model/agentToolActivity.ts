import type { AssistantItem, ToolCallItem, ToolResultItem, ToolRunStatus } from '@shared/domain/assistant/types';

export type ToolActivityIcon = 'plan' | 'file' | 'search' | 'code' | 'image' | 'link' | 'tool';

export interface ToolActivityLine {
  id: string;
  icon: ToolActivityIcon;
  phrase: string;
  text: string;
  tone: 'muted' | 'running' | 'error';
  details: string[];
}

export interface ToolActivityGroup {
  id: string;
  summary: string;
  tone: 'muted' | 'running' | 'error';
  expandable: boolean;
  lines: ToolActivityLine[];
}

export type AgentTurnBlock =
  | { kind: 'item'; item: AssistantItem }
  | { kind: 'tools'; group: ToolActivityGroup };

interface ToolCopy {
  icon: ToolActivityIcon;
  done: string;
  running: string;
  failed: string;
  skipped: string;
  line: (target: string, images: number) => string;
}

const CATALOG: Record<string, ToolCopy> = {
  update_plan: {
    icon: 'plan',
    done: '更新了执行计划',
    running: '正在更新执行计划',
    failed: '未能更新执行计划',
    skipped: '已跳过执行计划',
    line: () => '已更新执行计划',
  },
  read_skill: {
    icon: 'file',
    done: '读取了技能',
    running: '正在读取技能',
    failed: '未能读取技能',
    skipped: '已跳过读取技能',
    line: (target) => (target ? `已读取技能 ${target}` : '已读取技能'),
  },
  read_skill_file: {
    icon: 'file',
    done: '读取了技能资料',
    running: '正在读取技能资料',
    failed: '未能读取技能资料',
    skipped: '已跳过读取技能资料',
    line: (target) => (target ? `已读取 ${target}` : '已读取技能资料'),
  },
  search_mcp_tools: {
    icon: 'search',
    done: '检索了外部工具',
    running: '正在检索外部工具',
    failed: '未能检索外部工具',
    skipped: '已跳过检索外部工具',
    line: (target) => (target ? `已检索 ${target}` : '已检索外部工具'),
  },
  load_mcp_tool: {
    icon: 'tool',
    done: '加载了外部工具',
    running: '正在加载外部工具',
    failed: '未能加载外部工具',
    skipped: '已跳过加载外部工具',
    line: (target) => (target ? `已加载 ${target}` : '已加载外部工具'),
  },
  read_attached_document: {
    icon: 'file',
    done: '读取了文件',
    running: '正在读取文件',
    failed: '未能读取文件',
    skipped: '已跳过读取文件',
    line: (target) => (target ? `已读取 ${target}` : '已读取文件'),
  },
  read_tool_result: {
    icon: 'file',
    done: '读取了工具结果',
    running: '正在读取工具结果',
    failed: '未能读取工具结果',
    skipped: '已跳过工具结果',
    line: () => '已读取工具结果',
  },
  execute_code: {
    icon: 'code',
    done: '运行了代码',
    running: '正在运行代码',
    failed: '未能运行代码',
    skipped: '已跳过运行代码',
    line: () => '运行了代码',
  },
  query_asset_library: {
    icon: 'search',
    done: '搜索了资产库',
    running: '正在搜索资产库',
    failed: '未能搜索资产库',
    skipped: '已跳过搜索资产库',
    line: (target) => (target ? `已搜索 ${target}` : '已搜索资产库'),
  },
  list_user_products: {
    icon: 'search',
    done: '查询了商品库',
    running: '正在查询商品库',
    failed: '未能查询商品库',
    skipped: '已跳过查询商品库',
    line: (target) => (target ? `已查询 ${target}` : '已查询商品库'),
  },
  get_prompt_asset_detail: {
    icon: 'file',
    done: '读取了提示词',
    running: '正在读取提示词',
    failed: '未能读取提示词',
    skipped: '已跳过读取提示词',
    line: (target) => (target ? `已读取 ${target}` : '已读取提示词'),
  },
  parse_product_or_social_url: {
    icon: 'link',
    done: '解析了链接',
    running: '正在解析链接',
    failed: '未能解析链接',
    skipped: '已跳过解析链接',
    line: () => '已解析链接',
  },
  deconstruct_image: {
    icon: 'image',
    done: '查看了图像',
    running: '正在查看图像',
    failed: '未能查看图像',
    skipped: '已跳过查看图像',
    line: (_target, images) => (images > 0 ? `已查看 ${images} 张图像` : '已查看图像'),
  },
  extract_video_storyboard: {
    icon: 'image',
    done: '提取了故事板',
    running: '正在提取故事板',
    failed: '未能提取故事板',
    skipped: '已跳过提取故事板',
    line: (_target, images) => (images > 0 ? `已查看 ${images} 张图像` : '已提取故事板'),
  },
  extract_video_detailed_frames: {
    icon: 'image',
    done: '提取了镜头画面',
    running: '正在提取镜头画面',
    failed: '未能提取镜头画面',
    skipped: '已跳过提取镜头画面',
    line: (_target, images) => (images > 0 ? `已查看 ${images} 张图像` : '已提取镜头画面'),
  },
  inspect_video_media: {
    icon: 'file',
    done: '查看了视频',
    running: '正在查看视频',
    failed: '未能查看视频',
    skipped: '已跳过查看视频',
    line: () => '已查看视频',
  },
  get_workshop_state: {
    icon: 'tool',
    done: '读取了工作台',
    running: '正在读取工作台',
    failed: '未能读取工作台',
    skipped: '已跳过读取工作台',
    line: () => '已读取工作台',
  },
  workspace_navigate: {
    icon: 'tool',
    done: '打开了页面',
    running: '正在打开页面',
    failed: '未能打开页面',
    skipped: '已跳过打开页面',
    line: (target) => (target ? `已打开 ${target}` : '已打开页面'),
  },
  workspace_load_workshop_product: {
    icon: 'tool',
    done: '载入了商品',
    running: '正在载入商品',
    failed: '未能载入商品',
    skipped: '已跳过载入商品',
    line: () => '已载入商品',
  },
  trigger_generate: {
    icon: 'image',
    done: '准备了生图',
    running: '正在准备生图',
    failed: '未能准备生图',
    skipped: '已跳过准备生图',
    line: () => '已准备生图',
  },
  get_view_capabilities: {
    icon: 'tool',
    done: '读取了视图能力',
    running: '正在读取视图能力',
    failed: '未能读取视图能力',
    skipped: '已跳过读取视图能力',
    line: () => '已读取视图能力',
  },
  trigger_generate_batch: {
    icon: 'image',
    done: '请求了批量生成',
    running: '正在请求批量生成',
    failed: '未能请求批量生成',
    skipped: '已跳过请求批量生成',
    line: () => '已请求批量生成',
  },
  spawn_subagent: {
    icon: 'tool',
    done: '启动了子任务',
    running: '正在启动子任务',
    failed: '未能启动子任务',
    skipped: '已跳过启动子任务',
    line: (target) => (target ? `已启动子任务 ${target}` : '已启动子任务'),
  },
  set_workshop_arch: {
    icon: 'tool',
    done: '切换了拍摄架构',
    running: '正在切换拍摄架构',
    failed: '未能切换拍摄架构',
    skipped: '已跳过切换拍摄架构',
    line: () => '已切换拍摄架构',
  },
};

const TARGET_KEYS = ['document_name', 'filename', 'path', 'keyword', 'query', 'url', 'asset_id', 'skill_id', 'title', 'target_view', 'itemId', 'arch_id', 'name'];

function readRecord(raw?: string): Record<string, unknown> | undefined {
  if (!raw) return undefined;
  try {
    const value = JSON.parse(raw) as unknown;
    if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
    return value as Record<string, unknown>;
  } catch {
    return undefined;
  }
}

function clip(text: string, max = 48): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max)}…`;
}

function targetFrom(args?: string): string {
  const record = readRecord(args);
  if (!record) return '';
  for (const key of TARGET_KEYS) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) return clip(value);
  }
  return '';
}

function planStatusLabel(status: string): string {
  if (status === 'completed') return '已完成';
  if (status === 'in_progress') return '进行中';
  if (status === 'blocked') return '受阻';
  return '待办';
}

function planLines(raw?: string): string[] {
  const record = readRecord(raw);
  const steps = record?.plan ?? record?.steps;
  if (!Array.isArray(steps)) return [];
  return steps.flatMap((step) => {
    if (!step || typeof step !== 'object') return [];
    const title = 'title' in step && typeof step.title === 'string' ? step.title.trim() : '';
    if (!title) return [];
    const status = 'status' in step && typeof step.status === 'string' ? step.status : 'pending';
    return [`${planStatusLabel(status)} ${title}`];
  });
}

function imageCount(result?: ToolResultItem): number {
  if (result?.visualImages?.length) return result.visualImages.length;
  const record = readRecord(result?.summary);
  if (!record) return 0;
  if (typeof record.imageCount === 'number') return record.imageCount;
  if (Array.isArray(record.images)) return record.images.length;
  return 0;
}

function plainText(raw?: string): string {
  const text = raw?.trim() || '';
  if (!text || text.startsWith('{') || text.startsWith('[')) {
    const record = readRecord(text);
    if (typeof record?.error === 'string') return clip(record.error, 160);
    return '';
  }
  return clip(text, 160);
}

function copyFor(name: string, displayName: string): ToolCopy {
  const known = CATALOG[name];
  if (known) return known;
  const label = displayName || name || '工具';
  return {
    icon: 'tool',
    done: label,
    running: `正在${label}`,
    failed: `未能${label}`,
    skipped: `已跳过${label}`,
    line: (target) => (target ? `${label} ${target}` : label),
  };
}

function phraseFor(copy: ToolCopy, status: ToolRunStatus): string {
  if (status === 'running') return copy.running;
  if (status === 'error') return copy.failed;
  if (status === 'declined' || status === 'cancelled') return copy.skipped;
  return copy.done;
}

function toneFor(status: ToolRunStatus): ToolActivityLine['tone'] {
  if (status === 'running') return 'running';
  if (status === 'error') return 'error';
  return 'muted';
}

function activityLine(call: ToolCallItem, result?: ToolResultItem): ToolActivityLine {
  const status = result?.status || call.status;
  const copy = copyFor(call.name, call.displayName);
  const images = imageCount(result);
  const seenImages = images > 0 && call.name !== 'update_plan';
  const icon = seenImages ? 'image' : copy.icon;
  const fromResult = planLines(result?.summary);
  const steps = fromResult.length ? fromResult : planLines(call.args);
  const note = plainText(result?.summary);
  const phrase = seenImages && status === 'done' ? '查看了图像' : phraseFor(copy, status);
  const text = status === 'done' && seenImages
    ? `已查看 ${images} 张图像`
    : status === 'done' && call.name === 'read_skill' && note.startsWith('已读取技能')
      ? note
      : status === 'done'
        ? copy.line(targetFrom(call.args), images)
        : phrase;
  const details = steps.length ? steps : note && note !== text ? [note] : [];
  return { id: call.id, icon, phrase, text, tone: toneFor(status), details };
}

function groupSummary(lines: ToolActivityLine[]): string {
  if (lines.length === 1 && lines[0].details.length === 0) return lines[0].text;
  const seen = new Set<string>();
  const parts: string[] = [];
  for (const line of lines) {
    if (seen.has(line.phrase)) continue;
    seen.add(line.phrase);
    parts.push(line.phrase);
  }
  return parts.join('、');
}

function buildGroup(calls: ToolCallItem[], results: Map<string, ToolResultItem>): ToolActivityGroup {
  const lines = calls.map((call) => activityLine(call, results.get(`${call.id}__result`)));
  const tone = lines.some((line) => line.tone === 'running')
    ? 'running'
    : lines.some((line) => line.tone === 'error')
      ? 'error'
      : 'muted';
  return {
    id: calls[0]?.id || 'tools',
    summary: groupSummary(lines),
    tone,
    expandable: lines.length > 1 || lines.some((line) => line.details.length > 0),
    lines,
  };
}

/** 连续工具收成一组；思考、正文和确认把组隔开。 */
export function presentAgentTurn(items: AssistantItem[]): AgentTurnBlock[] {
  const results = new Map(items.filter((item): item is ToolResultItem => item.kind === 'toolResult').map((item) => [item.id, item]));
  const blocks: AgentTurnBlock[] = [];
  let pending: ToolCallItem[] = [];
  const flush = () => {
    if (!pending.length) return;
    blocks.push({ kind: 'tools', group: buildGroup(pending, results) });
    pending = [];
  };
  for (const item of items) {
    if (item.kind === 'toolResult' || item.kind === 'userMessage') continue;
    if (item.kind === 'toolCall') {
      pending.push(item);
      continue;
    }
    flush();
    blocks.push({ kind: 'item', item });
  }
  flush();
  return blocks;
}
