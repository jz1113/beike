import { gatewayFetch } from '../../gateways/http';
import { readJsonBody, safeErrorMessage } from '../../core/validate';
import { jsonResponse } from '../../core/http';
import { getDefaultBaseUrl } from '../../services/models/gatewayCredentials';
import { gatewayBillingAmounts, gatewayBillingDates } from '../../services/models/gatewayBilling';

export interface GatewayUserResponse {
  success: boolean;
  user?: {
    id: number | string;
    username: string;
    displayName: string;
    email?: string;
    quota: number;
    usedQuota: number;
    quotaFormatted: number;      // 折算算力
    quotaRmb: number;            // 折算人民币 (1 算力 = ¥1.20)
    usedQuotaFormatted: number;  // 已消耗算力
    usedQuotaRmb: number;        // 已消耗人民币
    remainingPercent: number;    // 剩余额度百分比 (0 - 100)
    balanceAvailable?: boolean;
    usageAvailable?: boolean;
    requestCount: number;
    group: string;
  };
  error?: string;
  warning?: string;
  rawStatus?: number;
}

export async function POST(req: Request): Promise<Response> {
  try {
    let body: any = {};
    try {
      body = await readJsonBody(req);
    } catch {
      body = {};
    }

    const rawUrl = (
      body.baseUrl ||
      req.headers.get('x-custom-base-url') ||
      getDefaultBaseUrl()
    );
    const targetUrl = String(rawUrl).trim().replace(/\/+$/, '').replace(/\/v1$/i, '');

    const userId = String(
      body.userId ||
      req.headers.get('new-api-user') ||
      ''
    ).trim();

    const systemToken = String(
      body.systemToken ||
      req.headers.get('x-gateway-system-token') ||
      (req.headers.get('authorization')?.startsWith('Bearer ')
        ? req.headers.get('authorization')!.slice(7)
        : '') ||
      ''
    ).trim();

    if (!userId) {
      return jsonResponse({
        success: false,
        error: '缺少用户 ID (New-API-User)，请在个人中心查看并填入用户 ID',
      }, 400);
    }

    if (!systemToken) {
      return jsonResponse({
        success: false,
        error: '缺少系统访问令牌，请在网关个人中心生成并填入系统令牌（非 API 令牌）',
      }, 400);
    }

    const endpoint = `${targetUrl}/api/user/self`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    try {
      const upstreamRes = await gatewayFetch(endpoint, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${systemToken}`,
          'New-API-User': userId,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        signal: controller.signal,
      });

      clearTimeout(timeout);

      const status = upstreamRes.status;
      const resJson = await upstreamRes.json().catch(() => ({}));

      // 🌟 1. 通道 A：若上游成功且未携带失败标识，解析标准 New-API / One-API 用户实体
      if (upstreamRes.ok && resJson && resJson.success !== false && (resJson.data || resJson.quota !== undefined || resJson.username)) {
        const rawUser = resJson?.data || resJson;

        const quota = Number(rawUser.quota ?? 0);
        const usedQuota = Number(rawUser.used_quota ?? 0);
        // 500,000 Quota = 1 算力 ($1.00)，保留 2 位小数
        const quotaFormatted = Number((quota / 500000).toFixed(2));
        const usedQuotaFormatted = Number((usedQuota / 500000).toFixed(2));
        // 系统 Comfly 汇率标准：1 算力 = ¥1.20 CNY
        const quotaRmb = Number((quotaFormatted * 1.2).toFixed(2));
        const usedQuotaRmb = Number((usedQuotaFormatted * 1.2).toFixed(2));

        const totalQuota = quota + usedQuota;
        const remainingPercent = totalQuota > 0
          ? Math.min(100, Math.max(0, Math.round((quota / totalQuota) * 100)))
          : 0;

        return jsonResponse({
          success: true,
          user: {
            id: rawUser.id ?? userId,
            username: rawUser.username || `用户 #${userId}`,
            displayName: rawUser.display_name || rawUser.username || `用户 #${userId}`,
            email: rawUser.email || '',
            quota,
            usedQuota,
            quotaFormatted,
            quotaRmb,
            usedQuotaFormatted,
            usedQuotaRmb,
            remainingPercent,
            requestCount: Number(rawUser.request_count ?? 0),
            group: rawUser.group || 'default',
          },
        });
      }

      // 🌟 2. 通道 B (智能兼容)：若通道 A 未通过，探测 New-API / One-API 官方通用 API Key 账单接口
      try {
        const subRes = await gatewayFetch(`${targetUrl}/dashboard/billing/subscription`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${systemToken}`,
            'Accept': 'application/json',
          },
        });
        if (subRes.ok) {
          const subJson = await subRes.json().catch(() => ({}));
          if (subJson && subJson.object === 'billing_subscription') {
            // 获取消耗用量
            const { startDate, endDate } = gatewayBillingDates(new Date(), typeof body.timeZone === 'string' ? body.timeZone : 'Asia/Shanghai');
            const usageRes = await gatewayFetch(`${targetUrl}/dashboard/billing/usage?start_date=${startDate}&end_date=${endDate}`, {
              method: 'GET',
              headers: {
                'Authorization': `Bearer ${systemToken}`,
                'Accept': 'application/json',
              },
            }).catch(() => null);
            const usageJson = usageRes?.ok ? await usageRes.json().catch(() => ({})) : {};
            const amounts = gatewayBillingAmounts(subJson.hard_limit_usd, usageJson.total_usage);

            return jsonResponse({
              success: true,
              user: {
                id: userId,
                username: `用户 #${userId}`,
                displayName: `用户 #${userId}`,
                email: '',
                quota: amounts.quotaFormatted * 500000,
                usedQuota: amounts.usedQuotaFormatted * 500000,
                ...amounts,
                requestCount: 0,
                group: 'DEFAULT',
              },
            });
          }
        }
      } catch {
        /* ignore fallback error */
      }

      // 3. 错误状态细化提示
      let errorMsg = resJson?.message || resJson?.error?.message || '';
      if (status === 401 || (resJson && resJson.success === false)) {
        errorMsg = '系统访问令牌 (System Token) 无效或未授权，请检查令牌是否正确复制（切勿有多余空格）' + (errorMsg ? ` (${errorMsg})` : '');
      } else if (status === 403) {
        errorMsg = '无权访问该用户信息，请核对用户 ID (New-API-User) 是否匹配' + (errorMsg ? ` (${errorMsg})` : '');
      } else if (status === 404) {
        errorMsg = '网关接口未找到或用户不存在，请检查 Base URL 与用户 ID' + (errorMsg ? ` (${errorMsg})` : '');
      } else {
        errorMsg = errorMsg || `网关响应异常 (HTTP ${status})`;
      }

      return jsonResponse({
        success: false,
        error: errorMsg,
        rawStatus: status,
      }, status >= 400 && status < 600 ? status : 400);

    } catch (fetchErr: unknown) {
      clearTimeout(timeout);
      const isTimeout = fetchErr instanceof Error && fetchErr.name === 'AbortError';
      const msg = isTimeout ? '请求网关接口超时 (15s)，请检查网络或 Base URL 是否可达' : safeErrorMessage(fetchErr, '连接网关失败');
      return jsonResponse({
        success: false,
        error: msg,
      }, 504);
    }

  } catch (err: unknown) {
    return jsonResponse({
      success: false,
      error: safeErrorMessage(err, '服务器内部错误'),
    }, 500);
  }
}
