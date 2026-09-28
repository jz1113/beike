export interface ConnectionTestOutcome { ok: boolean; message: string }
export interface ConnectionTestRecord extends ConnectionTestOutcome { checkedAt: number }
export interface ServiceStatus {
  state: 'unconfigured' | 'disabled' | 'untested' | 'testing' | 'passed' | 'failed';
  label: string;
  detail: string;
}
export function resolveServiceStatus(configured: boolean, enabled = true, testing = false, result?: ConnectionTestRecord): ServiceStatus {
  if (!configured) return { state: 'unconfigured', label: '未配置', detail: '请填写并保存所需凭证' };
  if (!enabled) return { state: 'disabled', label: '已停用', detail: '配置已保留；启用后请重新确认测试结果' };
  if (testing) return { state: 'testing', label: '测试中', detail: '正在检查接口，请稍候' };
  if (!result) return { state: 'untested', label: '已填写 · 未测试', detail: '填写凭证不代表已保存或连接成功；修改配置后需要重新测试' };
  return { state: result.ok ? 'passed' : 'failed', label: result.ok ? '测试通过' : '测试失败',
    detail: `${new Date(result.checkedAt).toLocaleString('zh-CN')} · ${result.message}` };
}
export function sameConnectionInputs(a: readonly unknown[], b: readonly unknown[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}
