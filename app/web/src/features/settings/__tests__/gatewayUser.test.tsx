// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import GatewayBalanceCard from '../components/GatewayBalanceCard';
import { type GatewayUserInfo } from '../hooks/useGatewayUser';

describe('GatewayBalanceCard Component', () => {
  const mockUserInfo: GatewayUserInfo = {
    id: 10086,
    username: 'azhuo_designer',
    displayName: '阿卓',
    quota: 25000000,
    usedQuota: 5000000,
    quotaFormatted: 50,
    quotaRmb: 60,
    usedQuotaFormatted: 10,
    usedQuotaRmb: 12,
    remainingPercent: 83,
    requestCount: 42,
    group: 'vip',
  };

  const defaultProps = {
    userId: '10086',
    systemToken: 'sys-tok-123456',
    userInfo: mockUserInfo,
    isLoading: false,
    isConfigured: true,
    isLowBalance: false,
    lastUpdated: '10:30',
    error: null,
    onRefresh: vi.fn().mockResolvedValue(true),
    onSaveCredentials: vi.fn().mockResolvedValue(true),
    onClearCredentials: vi.fn().mockResolvedValue(undefined),
    showToast: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it('在已配置状态下正确渲染用户名、用户 ID、核心剩余算力和折合人民币', () => {
    render(<GatewayBalanceCard {...defaultProps} />);

    expect(screen.getByText('阿卓')).toBeDefined();
    expect(screen.getByText('ID: #10086')).toBeDefined();
    expect(screen.getByText('50.00')).toBeDefined();
    expect(screen.getByText('≈ ¥60.00 CNY')).toBeDefined();
    expect(screen.getByRole('button', { name: /刷新余额/i })).toBeDefined();
  });

  it('点击刷新按钮时调用 onRefresh 回调', () => {
    render(<GatewayBalanceCard {...defaultProps} />);

    const refreshBtn = screen.getByRole('button', { name: /刷新余额/i });
    fireEvent.click(refreshBtn);

    expect(defaultProps.onRefresh).toHaveBeenCalledWith(false);
  });

  it('在未配置状态下展示引导文案和立即配置凭据按钮', () => {
    render(
      <GatewayBalanceCard
        {...defaultProps}
        userId=""
        systemToken=""
        userInfo={null}
        isConfigured={false}
      />
    );

    expect(screen.getByText(/连接网关账户，实时掌握剩余算力/i)).toBeDefined();
    expect(screen.getByRole('button', { name: /立即配置凭据/i })).toBeDefined();
  });

  it('在余额不足 5 算力时显示低额预警条', () => {
    render(
      <GatewayBalanceCard
        {...defaultProps}
        isLowBalance={true}
      />
    );

    expect(screen.getByText(/当前网关剩余算力不足 5 算力/i)).toBeDefined();
    expect(screen.getByText('立即充值')).toBeDefined();
  });
});
