import { EXECUTION_LIMITS, SANDBOX_LIMITS } from '@shared/domain/assistant/executionPolicy';
export default function AssistantRuntimeInfo() {
  return <div className="agent-runtime-info">
    <strong>执行与资源边界</strong>
    <p>自动强度按任务选择。不会自动更换你选中的模型。</p>
    <dl>
      <div><dt>每轮上限</dt><dd>{EXECUTION_LIMITS.maxModelRequests} 次助手推理请求 · {EXECUTION_LIMITS.maxToolCalls} 次工具调用</dd></div>
      <div><dt>子任务</dt><dd>最多 {EXECUTION_LIMITS.maxSubAgents} 个，只读分析，共享预算</dd></div>
      <div><dt>超时停止</dt><dd>整轮 {EXECUTION_LIMITS.deadlineMs / 60000} 分钟 · 代码 {SANDBOX_LIMITS.timeoutMs / 1000} 秒</dd></div>
      <div><dt>代码沙箱</dt><dd>QuickJS · {SANDBOX_LIMITS.memoryBytes / 1024 / 1024} MB 内存</dd></div>
    </dl>
    <p>沙箱用于数据计算与工具编排，不开放终端、文件系统或直接联网。工作区操作和外部工具通过各自权限执行，需要确认时会显示具体操作。</p>
    <small>以上是运行上限，并非费用承诺；生成及外部服务另计，实际消耗取决于模型与任务。</small>
  </div>;
}
