import type { UsageLogItem } from '@client/shared/utils/usageLog';
import { usageLogsInRange, type UsageRange } from '@client/shared/utils/usageSummary';
import { formatUsageDate } from '../model/usageFormatting';

const TYPE_LABELS: Record<UsageLogItem['type'], string> = {
  image: '图片',
  video: '视频',
  chat: '对话',
  vision: '视觉',
  distill: '提炼',
  audio: '语音',
};

export function UsageRecentList({ logs, range }: { logs: UsageLogItem[]; range: UsageRange }) {
  const recent = usageLogsInRange(logs, range).slice(0, 12);
  return (
    <section className="settings-usage-log" aria-label="最近调用">
      <h3>最近调用</h3>
      {recent.length === 0 ? <p>这个时间范围内还没有调用记录。</p> : (
        <ul>
          {recent.map((log) => (
            <li key={log.id}>
              <div>
                <b>{log.modelName || log.modelId}</b>
                <small>{formatUsageDate(log.timestamp)} · {TYPE_LABELS[log.type] || log.type}</small>
              </div>
              <span>输入 {(log.promptTokens || 0).toLocaleString('zh-CN')}</span>
              <span>输出 {(log.completionTokens || 0).toLocaleString('zh-CN')}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
