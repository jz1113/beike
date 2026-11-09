import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Clapperboard, Flame, Image, Sparkles } from 'lucide-react';
import { confirmAction } from '@client/shared/utils/confirmAction';
import { getUsageLogs, getUsageSummary, clearUsageLogs, type UsageRange, type UsageSummary } from '@client/shared/utils/usageTracker';
import GatewayBalanceCard from '../components/models/GatewayBalanceCard';
import { CreatorProfileHeader } from '../components/creator/CreatorProfileHeader';
import { type GatewayUserInfo } from '../hooks/useGatewayUser';
import {
  buildUsageHeatmap,
  type UsageHeatmapCell,
  buildUsageCsv,
  formatUsageCost,
  localDateKey,
  formatUsageDate,
} from '../model/usageHeatmap';
import type { UsageLogItem } from '@client/shared/utils/usageScope';
import { usageLogsInRange } from '@client/shared/utils/usageSummary';

const RANGES: { id: UsageRange; label: string }[] = [
  { id: 'today', label: '今天' },
  { id: '30d', label: '最近 30 天' },
  { id: '90d', label: '最近 90 天' },
  { id: '1y', label: '最近一年' },
  { id: 'all', label: '全部时间' },
];

function formatTokens(value: number) {
  return value.toLocaleString();
}

export function CreatorMilestones({
  usageRange,
  setUsageRange,
  usageSummary,
}: {
  usageRange: UsageRange;
  setUsageRange: (range: UsageRange) => void;
  usageSummary: UsageSummary;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    window.addEventListener('mousedown', close);
    return () => window.removeEventListener('mousedown', close);
  }, [open]);
  const current = RANGES.find(item => item.id === usageRange) ?? RANGES[1];
  const metrics = [
    { icon: Image, label: '生成图片', value: usageSummary.imageCount.toLocaleString(), unit: '张' },
    { icon: Clapperboard, label: '生成视频', value: usageSummary.videoCount.toLocaleString(), unit: '支' },
    { icon: Sparkles, label: '已记录 Token', value: formatTokens(usageSummary.totalTokens), unit: '' },
    { icon: Flame, label: '当前连续创作', value: String(usageSummary.currentStreakDays), unit: '天' },
    { icon: Check, label: '最长连续创作', value: String(usageSummary.longestStreakDays), unit: '天' },
  ];

  return (
    <section className="settings-milestone-wrap" aria-label="我的创作里程">
      <div className="settings-milestone-head">
        <h3>我的创作里程</h3>
        <div className="settings-range" ref={rootRef}>
          <button type="button" aria-expanded={open} aria-haspopup="listbox" onClick={() => setOpen(value => !value)}>
            <span>{current.label}</span><ChevronDown className="h-3.5 w-3.5" />
          </button>
          {open && (
            <div role="listbox" aria-label="统计时间范围">
              {RANGES.map(item => (
                <button
                  key={item.id}
                  type="button"
                  role="option"
                  aria-selected={item.id === usageRange}
                  onClick={() => { setUsageRange(item.id); setOpen(false); }}
                >
                  {item.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
      <div className="settings-milestone">
        <div className="settings-milestone-grid">
          {metrics.map(metric => {
            const Icon = metric.icon;
            return (
              <div key={metric.label}>
                <span><Icon className="h-3.5 w-3.5" />{metric.label}</span>
                <div className="settings-milestone-value">
                  <strong>{metric.value}</strong>
                  {metric.unit && <small>{metric.unit}</small>}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

type FootprintMetric = 'all' | 'image' | 'video' | 'token';

const METRICS: { id: FootprintMetric; label: string }[] = [
  { id: 'all', label: '创作' },
  { id: 'image', label: '图片' },
  { id: 'video', label: '视频' },
  { id: 'token', label: 'Token' },
];

const LEVELS = ['is-0', 'is-1', 'is-2', 'is-3', 'is-4'];

function metricValue(day: UsageHeatmapCell, metric: FootprintMetric) {
  if (metric === 'image') return day.imageCount;
  if (metric === 'video') return day.videoCount;
  if (metric === 'token') return day.tokens;
  return day.count;
}

function heatLevel(value: number, max: number) {
  if (value <= 0 || max <= 0) return 0;
  const ratio = value / max;
  if (ratio > 0.75) return 4;
  if (ratio > 0.4) return 3;
  if (ratio > 0.15) return 2;
  return 1;
}

function heatmapTokenText(value: number) {
  return value > 0 ? value.toLocaleString() : '—';
}

export function UsageHeatmapPanel({ usageSummary }: { usageSummary: UsageSummary }) {
  const [metric, setMetric] = useState<FootprintMetric>('all');
  const [hoveredDay, setHoveredDay] = useState<UsageHeatmapCell | null>(null);
  const [pinnedDay, setPinnedDay] = useState<UsageHeatmapCell | null>(null);
  const weeks = useMemo(
    () => buildUsageHeatmap(usageSummary, 'rolling', new Date().getFullYear()),
    [usageSummary],
  );
  const days = weeks.flatMap(week => week.days).filter(day => !day.isFuture);
  const max = Math.max(0, ...days.map(day => metricValue(day, metric)));
  const activeDays = days.filter(day => metricValue(day, metric) > 0).length;
  const shown = hoveredDay ?? pinnedDay ?? days.find(day => day.isToday) ?? null;

  return (
    <section className="settings-footprint" aria-label="灵感足迹">
      <header>
        <div>
          <h3>灵感足迹 <span>{activeDays} 天留下了灵感</span></h3>
          <p>每一格，都是灵感留下的回声。</p>
        </div>
        <div role="group" aria-label="足迹维度">
          {METRICS.map(item => (
            <button key={item.id} type="button" aria-pressed={metric === item.id} onClick={() => setMetric(item.id)}>{item.label}</button>
          ))}
        </div>
      </header>
      <div className="settings-footprint-scroll">
        <div className="settings-footprint-grid">
          {weeks.map(week => (
            <div key={week.weekIdx}>
              {week.days.map(day => (
                <button
                  key={day.dateKey}
                  type="button"
                  disabled={day.isFuture}
                  aria-label={`${day.dateKey} ${day.dayName}`}
                  className={`${LEVELS[heatLevel(metricValue(day, metric), max)]} ${day.isToday ? 'is-today' : ''} ${shown?.dateKey === day.dateKey ? 'is-selected' : ''}`}
                  onMouseEnter={() => { if (!day.isFuture) setHoveredDay(day); }}
                  onMouseLeave={() => setHoveredDay(null)}
                  onFocus={() => { if (!day.isFuture) setHoveredDay(day); }}
                  onBlur={() => setHoveredDay(null)}
                  onClick={() => setPinnedDay(day)}
                />
              ))}
            </div>
          ))}
        </div>
        <div className="settings-footprint-months">
          {weeks.map(week => <span key={week.weekIdx}>{week.monthLabel || ''}</span>)}
        </div>
      </div>
      <footer>
        <span>{activeDays === 0 ? '第一束灵感，等你点亮' : `累计活跃 ${activeDays} 天`}</span>
        <div className="settings-footprint-scale"><span>少</span>{LEVELS.map(level => <i key={level} className={level} />)}<span>多</span></div>
      </footer>
      <div className="settings-footprint-detail">
        <strong>{shown?.dateKey || '—'}</strong>
        <div>
          <span><b className="is-image" />图片 <em>{shown?.imageCount || 0}</em></span>
          <span><b className="is-video" />视频 <em>{shown?.videoCount || 0}</em></span>
          <span>输入 <em>{heatmapTokenText(shown?.promptTokens || 0)}</em></span>
          <span>输出 <em>{heatmapTokenText(shown?.completionTokens || 0)}</em> Token</span>
        </div>
      </div>
    </section>
  );
}

const TYPE_LABELS: Record<UsageLogItem['type'], string> = {
  image: '图片',
  video: '视频',
  chat: '对话',
  vision: '视觉',
  distill: '提炼',
  audio: '语音',
};

function UsageRecentList({ logs, range }: { logs: UsageLogItem[]; range: UsageRange }) {
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

function tokenText(value: number) {
  return value.toLocaleString();
}

function CreatorMixCards({ usageSummary }: { usageSummary: UsageSummary }) {
  const media = usageSummary.imageCount + usageSummary.videoCount;
  const imagePercent = media > 0 ? Math.round((usageSummary.imageCount / media) * 100) : 0;
  const videoPercent = media > 0 ? 100 - imagePercent : 0;
  const headline = media === 0
    ? '下一件作品，由你定义'
    : usageSummary.videoCount === 0
      ? '这一程，主要是图片'
      : usageSummary.imageCount === 0
        ? '这一程，主要是视频'
        : '图片与视频，一起构成作品';

  return (
    <div className="settings-mix">
      <section>
        <header><h3>创作配方</h3><span>灵感的两种形状</span></header>
        <strong>{headline}</strong>
        <div className="settings-mix-bar" aria-hidden="true">
          <i style={{ width: `${imagePercent}%` }} />
          <i style={{ width: `${videoPercent}%` }} />
        </div>
        <footer>
          <span><b className="is-image" />图片 {imagePercent}%</span>
          <span><b className="is-video" />视频 {videoPercent}%</span>
        </footer>
      </section>
      <section>
        <header><h3>灵感消耗</h3><span>Token</span></header>
        <div className="settings-token-split">
          <div><span>输入 · 含缓存</span><strong>{tokenText(usageSummary.promptTokens)}</strong></div>
          <div><span>输出 · 含推理</span><strong>{tokenText(usageSummary.completionTokens)}</strong></div>
        </div>
        <p>模型调用过后，会在这里留下记录。</p>
      </section>
    </div>
  );
}

export interface UsageTabProps {
  usageRange: UsageRange;
  setUsageRange: (v: UsageRange) => void;
  setUsageRefreshKey: React.Dispatch<React.SetStateAction<number>>;
  usageSummary: UsageSummary;
  showToast: (msg: string) => void;
  gatewayUserId?: string;
  gatewaySystemToken?: string;
  gatewayUserInfo?: GatewayUserInfo | null;
  isGatewayLoading?: boolean;
  isGatewayConfigured?: boolean;
  isGatewayLowBalance?: boolean;
  gatewayLastUpdated?: string | null;
  gatewayError?: string | null;
  onRefreshGatewayUser?: (silent?: boolean) => Promise<boolean>;
  onSaveGatewayCredentials?: (id: string, token: string) => Promise<boolean>;
  onClearGatewayCredentials?: () => Promise<boolean>;
}

export default function UsageTab({
  usageRange,
  setUsageRange,
  setUsageRefreshKey,
  usageSummary,
  showToast,
  gatewayUserId = '',
  gatewaySystemToken = '',
  gatewayUserInfo = null,
  isGatewayLoading = false,
  isGatewayConfigured = false,
  isGatewayLowBalance = false,
  gatewayLastUpdated = null,
  gatewayError = null,
  onRefreshGatewayUser,
  onSaveGatewayCredentials,
  onClearGatewayCredentials,
}: UsageTabProps) {
  const [gatewayOpen, setGatewayOpen] = useState(false);
  const allLogs = useMemo(() => {
    void usageSummary;
    return getUsageLogs();
  }, [usageSummary]);
  const heatmapSummary = useMemo(() => {
    void usageSummary;
    return getUsageSummary('all');
  }, [usageSummary]);

  const handleExportCsv = () => {
    if (allLogs.length === 0) {
      showToast('暂无可用调用日志供导出');
      return;
    }
    const blob = new Blob([buildUsageCsv(allLogs)], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `beike_usage_audit_${localDateKey()}.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
    showToast('已导出全量调用记录');
  };
  const handleClear = async () => {
    if (!await confirmAction('确定要清空所有本地记录的用量统计数据吗？此操作无法撤回。')) return;
    try {
      clearUsageLogs();
      setUsageRefreshKey(key => key + 1);
      showToast('已清空用量统计日志。');
    } catch {
      showToast('用量日志清空失败，请重试。');
    }
  };
  const hasGatewayActions = Boolean(onRefreshGatewayUser && onSaveGatewayCredentials && onClearGatewayCredentials);
  const balanceText = gatewayUserInfo && gatewayUserInfo.balanceAvailable !== false
    ? `算力 ${formatUsageCost(gatewayUserInfo.quotaFormatted)}`
    : isGatewayConfigured
      ? '算力账户'
      : '绑定算力';

  return (
    <div className="settings-creator animate-fade-in">
      <CreatorProfileHeader
        imageCount={usageSummary.imageCount}
        videoCount={usageSummary.videoCount}
        canExport={allLogs.length > 0}
        canClear={allLogs.length > 0}
        onExport={handleExportCsv}
        onRefresh={() => setUsageRefreshKey(key => key + 1)}
        onClear={() => void handleClear()}
        gatewayLabel={balanceText}
        gatewayHasWarning={Boolean(gatewayError || isGatewayLowBalance)}
        gatewayOpen={gatewayOpen}
        onToggleGateway={hasGatewayActions ? () => setGatewayOpen(value => !value) : undefined}
      />
      {gatewayOpen && onRefreshGatewayUser && onSaveGatewayCredentials && onClearGatewayCredentials && (
        <GatewayBalanceCard
          userId={gatewayUserId}
          systemToken={gatewaySystemToken}
          userInfo={gatewayUserInfo}
          isLoading={isGatewayLoading}
          isConfigured={isGatewayConfigured}
          isLowBalance={isGatewayLowBalance}
          lastUpdated={gatewayLastUpdated}
          error={gatewayError}
          onRefresh={onRefreshGatewayUser}
          onSaveCredentials={onSaveGatewayCredentials}
          onClearCredentials={onClearGatewayCredentials}
          showToast={showToast}
        />
      )}
      <CreatorMilestones usageRange={usageRange} setUsageRange={setUsageRange} usageSummary={usageSummary} />
      <UsageHeatmapPanel usageSummary={heatmapSummary} />
      <CreatorMixCards usageSummary={usageSummary} />
      <UsageRecentList logs={allLogs} range={usageRange} />
    </div>
  );
}
