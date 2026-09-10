// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import GatewayBalanceCard from '../components/GatewayBalanceCard';

describe('GatewayBalanceCard 输入与持久化交互', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('在输入框输入 User ID 与系统 Token 时实时暂存到 localStorage，打开编辑框正确回显', async () => {
    const showToast = vi.fn();
    const onSave = vi.fn().mockResolvedValue(true);
    const onClear = vi.fn().mockResolvedValue(undefined);
    const onRefresh = vi.fn().mockResolvedValue(true);

    const { rerender } = render(
      <GatewayBalanceCard
        userId=""
        systemToken=""
        userInfo={null}
        isLoading={false}
        isConfigured={false}
        isLowBalance={false}
        lastUpdated={null}
        error={null}
        onRefresh={onRefresh}
        onSaveCredentials={onSave}
        onClearCredentials={onClear}
        showToast={showToast}
      />
    );

    // 点击“绑定账户”展开编辑抽屉
    const bindBtn = screen.getByRole('button', { name: /绑定账户/i });
    fireEvent.click(bindBtn);

    // 找到用户 ID 输入框
    const userIdInput = screen.getByPlaceholderText(/在个人中心查看，如: 10086/i) as HTMLInputElement;
    fireEvent.change(userIdInput, { target: { value: '88434' } });

    // 验证实时写入草稿
    expect(window.localStorage.getItem('gateway_user_id')).toBe('88434');

    // 找到系统令牌输入框
    const tokenInput = screen.getByPlaceholderText(/个人中心生成的系统令牌/i) as HTMLInputElement;
    fireEvent.change(tokenInput, { target: { value: 'my_system_token_abc' } });

    // 验证令牌实时写入草稿，杜绝失焦丢失
    expect(window.localStorage.getItem('gateway_system_token')).toBe('my_system_token_abc');

    // 提交表单保存
    const saveBtn = screen.getByRole('button', { name: /保存并同步余额/i });
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith('88434', 'my_system_token_abc');
    });

    // 模拟从外部回传新凭据后组件回显
    rerender(
      <GatewayBalanceCard
        userId="88434"
        systemToken="my_system_token_abc"
        userInfo={null}
        isLoading={false}
        isConfigured={true}
        isLowBalance={false}
        lastUpdated={null}
        error={null}
        onRefresh={onRefresh}
        onSaveCredentials={onSave}
        onClearCredentials={onClear}
        showToast={showToast}
      />
    );

    // 重新打开编辑抽屉，输入框应完整回显已保存的 88434 与令牌
    const settingBtn = screen.getByRole('button', { name: /修改凭据/i });
    fireEvent.click(settingBtn);

    const reloadedUserId = screen.getByPlaceholderText(/在个人中心查看，如: 10086/i) as HTMLInputElement;
    expect(reloadedUserId.value).toBe('88434');
  });
});
