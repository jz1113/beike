import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render, screen } from '@testing-library/react';
import UsageTab from '../UsageTab';
import type { UsageSummary } from '@/lib/usageTracker';

describe('UsageTab - 每日活动热力图展示与防重叠逻辑', () => {
  const mockSummary: UsageSummary = {
    totalRequests: 567,
    totalCostUsd: 12.34,
    totalCostRmb: 14.81,
    totalTokens: 1652638,
    activeDays: 8,
    cacheHitRate: 85,
    peakDayLabel: '2026-09-01',
    peakDayTokens: 1139000,
    peakDayRequests: 71,
    topModelName: 'gemini-3.6-flash',
    topModelTokens: 1652638,
    dailyAvgTokens: 418000,
    dailyAvgRequests: 71,
    heatmapActiveMap: {
      '2026-09-01': 71,
    },
    heatmapDetailsMap: {
      '2026-09-01': {
        requests: 71,
        tokens: 1139000,
        costUsd: 8.5,
        costRmb: 10.2,
      },
    },
    modelBreakdown: [],
    recentDaysActivity: [],
  };

  const defaultProps = {
    usageRange: '30d' as const,
    setUsageRange: vi.fn(),
    usageModelSearch: '',
    setUsageModelSearch: vi.fn(),
    setUsageRefreshKey: vi.fn(),
    usageSummary: mockSummary,
    showToast: vi.fn(),
  };

  it('展示当前自然年年度按钮，而非上一年度全景', () => {
    const currentYear = new Date().getFullYear();
    render(<UsageTab {...defaultProps} />);

    // 应该存在 "{currentYear} 年度" 按钮
    const yearButton = screen.getByRole('button', { name: new RegExp(`${currentYear} 年度`) });
    expect(yearButton).toBeDefined();

    // 页面中热力图区域不应出现上一年度（如 2025年）作为月份标签
    const prevYear = currentYear - 1;
    const prevYearLabels = screen.queryByText(new RegExp(`${prevYear}年`));
    expect(prevYearLabels).toBeNull();
  });

  it('月份刻度标签格式统一且绝不出现 9月0月 等字符黏连', () => {
    const { container } = render(<UsageTab {...defaultProps} />);

    // 获取所有月份刻度文本
    const monthSpans = container.querySelectorAll('.flex.gap-\\[3px\\] span.whitespace-nowrap');
    const labels = Array.from(monthSpans).map((el) => el.textContent?.trim());

    // 验证所有标签都是形如 "1月", "2月" ... "12月" 的短标签
    for (const label of labels) {
      expect(label).toMatch(/^(1[0-2]|[1-9])月$/);
    }

    // 验证不包含 9月0月 或 2025年 9月
    const fullText = container.textContent || '';
    expect(fullText).not.toContain('9月0月');
    expect(fullText).not.toContain('2025年 9月');
  });
});
