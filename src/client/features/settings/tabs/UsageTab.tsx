import React, { useMemo, useState } from 'react';
import { confirmAction } from '@client/shared/utils/confirmAction';
import { getUsageLogs, getUsageSummary, clearUsageLogs, type UsageRange, type UsageSummary } from '@client/shared/utils/usageTracker';
import GatewayBalanceCard from '../components/models/GatewayBalanceCard';
import { CreatorMilestones } from '../components/creator/CreatorMilestones';
import { CreatorMixCards } from '../components/creator/CreatorMixCards';
import { CreatorProfileHeader } from '../components/creator/CreatorProfileHeader';
import { UsageHeatmapPanel } from './UsageHeatmapPanel';
import { UsageRecentList } from './UsageRecentList';
import { type GatewayUserInfo } from '../hooks/useGatewayUser';
import { buildUsageCsv, formatUsageCost, localDateKey } from '../model/usageFormatting';

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
        imageCount={heatmapSummary.imageCount}
        videoCount={heatmapSummary.videoCount}
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
