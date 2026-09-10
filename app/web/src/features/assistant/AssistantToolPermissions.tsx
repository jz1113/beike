/**
 * AssistantToolPermissions — 工具权限白名单管理面板
 *
 * 允许用户在会话内配置哪些工具需要审批（per_turn）、哪些永久批准（白名单）。
 * 存储在 AssistantThread.allowedToolsJson，通过 PUT /api/assistant/sessions 持久化。
 *
 * 调用方式：
 *   <AssistantToolPermissions
 *     allowedTools={session.allowedTools}
 *     onChange={setAllowedTools}
 *   />
 */

import { useState } from 'react';
import { Shield, ShieldCheck, ShieldX, Search } from 'lucide-react';

export interface ToolMeta {
  name: string;
  description: string;
  scope: string;
  approval: string;
}

export interface ToolPermission {
  toolName: string;
  displayName: string;
  description: string;
  /** 'none' = 永久批准 | 'per_turn' = 每次审批 | 'blocked' = 禁用 */
  mode: 'none' | 'per_turn' | 'blocked';
}

interface Props {
  allowedTools: string[];
  allTools: ToolMeta[];
  onChange: (allowed: string[]) => void;
  onClose?: () => void;
}

const BUILTIN_TOOLS: ToolMeta[] = [
  { name: 'spawn_subagent', description: '派生子代理执行独立任务', scope: 'server', approval: 'none' },
  { name: 'get_view_capabilities', description: '查询当前视图可用的动作与工具', scope: 'client', approval: 'none' },
  { name: 'get_workshop_state', description: '读取种草工坊当前状态（架构、商品、模式）', scope: 'client', approval: 'none' },
  { name: 'workspace_navigate', description: '切换工作台视图（首页/工坊/生图/资产/采集）', scope: 'client', approval: 'none' },
  { name: 'workspace_load_workshop_product', description: '将商品装载到工坊工作区', scope: 'client', approval: 'none' },
  { name: 'set_workshop_arch', description: '切换种草工坊拍摄架构', scope: 'client', approval: 'none' },
  { name: 'trigger_generate', description: '发送提示词到极速生图', scope: 'client', approval: 'none' },
  { name: 'parse_product_or_social_url', description: '解析商品链接/社媒图文，提取商品信息', scope: 'client', approval: 'none' },
  { name: 'list_user_products', description: '查询用户商品库', scope: 'client', approval: 'none' },
  { name: 'query_asset_library', description: '搜索资产库图片/视频', scope: 'client', approval: 'none' },
  { name: 'deconstruct_image', description: '深度分析图片并反推结构化信息', scope: 'client', approval: 'none' },
  { name: 'inspect_video_media', description: '读取视频物理参数', scope: 'client', approval: 'none' },
  { name: 'extract_video_storyboard', description: '从视频提取分镜关键帧', scope: 'client', approval: 'none' },
  { name: 'extract_video_detailed_frames', description: '深度截取视频高清连续帧', scope: 'client', approval: 'none' },
];

export default function AssistantToolPermissions({ allowedTools, allTools, onChange, onClose }: Props) {
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<'all' | 'dangerous' | 'disabled'>('all');

  const effectiveTools = allTools.length > 0 ? allTools : BUILTIN_TOOLS;

  const modeOf = (name: string): ToolPermission['mode'] => {
    if (name.startsWith('mcp_')) return 'none';
    if (allowedTools.includes(name)) return 'none';
    // 高危写操作需要审批
    const dangerous = ['workspace_navigate', 'workspace_load_workshop_product', 'set_workshop_arch', 'trigger_generate', 'spawn_subagent'];
    if (dangerous.includes(name)) return 'per_turn';
    return 'per_turn'; // 默认都需要审批
  };

  const toggle = (name: string, mode: ToolPermission['mode']) => {
    if (mode === 'none') {
      // 白名单模式：从 allowed 移除，下次变为 per_turn
      onChange(allowedTools.filter((t) => t !== name));
    } else {
      // 永久批准：加入 allowed
      onChange([...new Set([...allowedTools, name])]);
    }
  };

  const filtered = effectiveTools.filter((t) => {
    const match = t.name.includes(search) || (t.description || '').includes(search);
    const mode = modeOf(t.name);
    if (tab === 'dangerous') return match && (mode === 'per_turn');
    if (tab === 'disabled') return match && mode === 'blocked';
    return match;
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
      <div className="w-[540px] max-h-[80vh] rounded-2xl border border-slate-200 bg-white shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-indigo-500" />
            <span className="text-sm font-semibold text-slate-800">工具权限管理</span>
          </div>
          {onClose && (
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-slate-600 cursor-pointer"
            >
              ✕
            </button>
          )}
        </div>

        {/* Search + Tabs */}
        <div className="px-5 py-3 border-b border-slate-50 space-y-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="搜索工具…"
              className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-300"
            />
          </div>
          <div className="flex gap-1">
            {([['all', '全部'], ['dangerous', '需审批'], ['disabled', '已禁用']] as const).map(([k, label]) => (
              <button
                key={k}
                onClick={() => setTab(k)}
                className={`px-3 py-1 rounded-lg text-[11px] font-medium transition-colors cursor-pointer ${
                  tab === k
                    ? 'bg-indigo-50 text-indigo-600 border border-indigo-200'
                    : 'text-slate-500 hover:bg-slate-50'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Tool List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-1">
          {filtered.length === 0 && (
            <div className="py-10 text-center text-xs text-slate-400">没有匹配的工具</div>
          )}
          {filtered.map((tool) => {
            const mode = modeOf(tool.name);
            const isAllowed = mode === 'none';
            const isDangerous = ['workspace_navigate', 'workspace_load_workshop_product', 'set_workshop_arch', 'trigger_generate', 'spawn_subagent'].includes(tool.name);
            return (
              <div
                key={tool.name}
                className={`flex items-start gap-3 px-3 py-2.5 rounded-xl border transition-colors ${
                  isAllowed
                    ? 'border-emerald-100 bg-emerald-50/40'
                    : mode === 'per_turn'
                      ? 'border-amber-100 bg-amber-50/40'
                      : 'border-slate-100 bg-slate-50/40'
                }`}
              >
                {/* Icon */}
                <div className={`mt-0.5 shrink-0 ${isAllowed ? 'text-emerald-500' : 'text-slate-400'}`}>
                  {isAllowed ? (
                    <ShieldCheck className="w-3.5 h-3.5" />
                  ) : mode === 'per_turn' ? (
                    <Shield className="w-3.5 h-3.5" />
                  ) : (
                    <ShieldX className="w-3.5 h-3.5" />
                  )}
                </div>
                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <code className="text-[11px] font-mono font-medium text-slate-800">{tool.name}</code>
                    {isDangerous && (
                      <span className="text-[9px] px-1 py-0.5 rounded bg-rose-100 text-rose-600 font-medium">写操作</span>
                    )}
                    <span className={`text-[9px] px-1 py-0.5 rounded font-medium ${
                      tool.scope === 'client' ? 'bg-blue-50 text-blue-500' : 'bg-purple-50 text-purple-500'
                    }`}>
                      {tool.scope}
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-500 mt-0.5 leading-relaxed">
                    {tool.description || '—'}
                  </p>
                </div>
                {/* Toggle */}
                <div className="shrink-0 mt-0.5">
                  {mode === 'per_turn' || mode === 'blocked' ? (
                    <button
                      onClick={() => toggle(tool.name, 'per_turn')}
                      className="px-2 py-1 rounded-lg text-[10px] font-medium bg-emerald-100 text-emerald-700 hover:bg-emerald-200 transition-colors cursor-pointer whitespace-nowrap"
                    >
                      永久批准
                    </button>
                  ) : (
                    <button
                      onClick={() => toggle(tool.name, 'none')}
                      className="px-2 py-1 rounded-lg text-[10px] font-medium bg-slate-100 text-slate-500 hover:bg-slate-200 transition-colors cursor-pointer whitespace-nowrap"
                    >
                      撤销批准
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-slate-100 bg-slate-50/50 flex items-center justify-between">
          <span className="text-[10px] text-slate-400">
            {allowedTools.length} 个工具已永久批准 · 点击「永久批准」将其加入白名单
          </span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-indigo-500 text-white text-xs font-medium hover:bg-indigo-600 transition-colors cursor-pointer"
          >
            保存
          </button>
        </div>
      </div>
    </div>
  );
}
