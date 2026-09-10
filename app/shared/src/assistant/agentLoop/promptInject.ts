import type { ToolExecContext } from '../toolRegistry';

export function injectToolAndWorkspaceContext(
  workingMessages: unknown[],
  allowedTools: string[] | undefined,
  toolCtx: ToolExecContext,
): void {
  const sysIdx = workingMessages.findIndex((m: unknown) => (m as { role?: string }).role === 'system');
  const toolHint = allowedTools?.length
    ? `\n\n【智能体工具·技能模式】当前技能仅开放以下工具：${allowedTools.join('、')}。需要外部数据或执行操作时主动调用；纯对话则直接回答。`
    : '\n\n【智能体工具】你可以使用函数工具完成商品/社媒解析、文档阅读、商品库与资产库查询、工作台导航与生图触发等任务。需要外部数据或执行操作时主动调用；纯对话则直接回答。';

  // 工作区地图：让 agent 知道自己现在能做什么
  const cc = toolCtx.clientContext as
    | { currentView?: string; productTitle?: string; productItemId?: string; selectedArchId?: string; workshopStep?: number }
    | undefined;
  const view = cc?.currentView || 'home';
  const workspaceMap = `\n\n【工作区地图】\n- 当前视图: ${view}\n- 已加载商品: ${cc?.productTitle ? `${cc.productTitle} (${cc.productItemId || '-'})` : '无'}\n- 已选架构: ${cc?.selectedArchId || '未选择'}\n- 工坊步骤: ${cc?.workshopStep ?? 0}\n- 仅在用户需要打开工作区时导航；不要为了查询数据切换视图，已有信息足够时不要重复查询。`;

  if (sysIdx >= 0) {
    const sys = workingMessages[sysIdx] as { role: string; content: string };
    workingMessages[sysIdx] = {
      ...sys,
      content: String(sys.content || '') + toolHint + workspaceMap + `

【执行方式：Code Mode + 本地 JavaScript 沙箱】
- 纯问答、写作以及已有图片的视觉分析直接回答，不为形式调用工具。
- 计算、排序、筛选、编号映射、文档整理优先 execute_code；input.documents 与 input.workspace 已可直接使用，避免重复获取。
- 多个有依赖的工具可在一次代码内 await tools.工具名(args)，再用 text() 输出必要摘要；工具结果无需全文回传。
- 沙箱不支持 shell、文件系统、process、require、fetch 或安装依赖；不可声称已经运行不存在的命令。需要外部数据才调用对应已授权工具，不绕过审批。
- 不要为了同一张已可见图片额外调用反推模型。相同只读查询在一轮内复用结果，不重复调用；不要无必要派生子代理。
- 先用一句简短进度说明解释行动，再执行；最终回答具体结果。不要把内部推理当进度，不要添加夸张标题、emoji 装饰或虚构的执行记录。
- 当前为应用自建运行时，不能声称是官方 Codex harness。`,
    };
  }
}
