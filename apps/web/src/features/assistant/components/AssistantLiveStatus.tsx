import { useEffect, useState } from 'react';
import ThoughtLine from '@/shared/ui/ThoughtLine';

/** 仅展示服务端实际报告的阶段，不模拟搜索或工具执行。 */
export default function AssistantLiveStatus({ message }: { message?: string }) {
  const current = message || '正在准备回应…';
  const [startedAt] = useState(Date.now);
  const [elapsed, setElapsed] = useState(0);
  const [history, setHistory] = useState<string[]>([]);
  useEffect(() => {
    // 未收到服务端阶段事件时只展示“准备回应”，不能把默认文案误记成已完成步骤。
    if (!message) return;
    setHistory((previous) => previous.at(-1) === message ? previous : [...previous, message].slice(-4));
  }, [message]);
  useEffect(() => {
    const timer = setInterval(() => setElapsed(Math.floor((Date.now() - startedAt) / 1000)), 1000);
    return () => clearInterval(timer);
  }, [startedAt]);
  // ThoughtLine 的标题承载当前阶段，轨迹仅显示已走完的阶段，避免重复当前文案。
  const completedSteps = history.slice(0, -1);
  return <div className="py-2" role="status" aria-live="polite">
    <ThoughtLine
      label={current}
      steps={completedSteps}
      collapsible={completedSteps.length > 0}
      collapseOnSettle={false}
      glyph={
        <img
          src="/app_logo.png"
          alt=""
          aria-hidden="true"
          draggable={false}
          className="h-full w-full object-contain"
        />
      }
      color="#64748b"
      glyphColor="#64748b"
      fontSize={12}
      breathPeriod={1.8}
      breathDepth={0.32}
      shimmerDuration={2.1}
      elapsed={elapsed}
    />
    {elapsed >= 20 && <p className="ml-6 mt-1 text-[11px] text-zinc-400">响应耗时较长，仍在等待；可随时停止本轮。</p>}
  </div>;
}

export function activityTarget(args?: string): string {
  if (!args) return '';
  try {
    const parsed = JSON.parse(args);
    for (const key of ['query', 'keyword', 'document_name', 'url', 'asset_id']) {
      if (typeof parsed[key] === 'string') return parsed[key].replace(/\s+/g, ' ').slice(0, 120);
    }
  } catch { /* 流式参数尚未接收完整 */ }
  return '';
}
