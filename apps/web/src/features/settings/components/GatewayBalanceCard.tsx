import React, { useState } from 'react';
import { Wallet, RefreshCw, ExternalLink, Key, AlertTriangle, User, Eye, EyeOff, Sparkles, AlertCircle } from 'lucide-react';
import { type GatewayUserInfo } from '../hooks/useGatewayUser';
import { getGatewayClientOverrides } from '../../../shared/api/gatewayClient';

interface GatewayBalanceCardProps {
  userId: string;
  systemToken: string;
  userInfo: GatewayUserInfo | null;
  isLoading: boolean;
  isConfigured: boolean;
  isLowBalance: boolean;
  lastUpdated: string | null;
  error: string | null;
  onRefresh: (silent?: boolean) => Promise<boolean>;
  onSaveCredentials: (id: string, token: string) => Promise<boolean>;
  onClearCredentials: () => Promise<void>;
  showToast: (msg: string) => void;
}

export default function GatewayBalanceCard({ userId, systemToken, userInfo, isLoading, isConfigured, isLowBalance, error, onRefresh, onSaveCredentials, onClearCredentials, showToast }: GatewayBalanceCardProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editUserId, setEditUserId] = useState<string>(
    () => userId || (typeof window !== 'undefined' ? localStorage.getItem('gateway_user_id')?.trim() || '' : '')
  );
  const [editToken, setEditToken] = useState<string>(
    () => systemToken || (typeof window !== 'undefined' ? localStorage.getItem('gateway_system_token')?.trim() || '' : '')
  );
  const [showToken, setShowToken] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // 🌟 当外部异步载入的凭证到达时，实时同步给内部输入框，杜绝输入框出现空值或未回显
  React.useEffect(() => {
    if (userId) {
      setEditUserId(userId);
    } else if (typeof window !== 'undefined') {
      const localId = localStorage.getItem('gateway_user_id')?.trim();
      if (localId) setEditUserId(localId);
    }

    if (systemToken) {
      setEditToken(systemToken);
    } else if (typeof window !== 'undefined') {
      const localToken = localStorage.getItem('gateway_system_token')?.trim();
      if (localToken) setEditToken(localToken);
    }
  }, [userId, systemToken]);

  // 获取当前网关 Base URL，便于打开官网个人中心
  const { customBaseUrl } = getGatewayClientOverrides();
  const currentBaseUrl = customBaseUrl || 'https://ai.comfly.org';
  const cleanBaseUrl = currentBaseUrl.replace(/\/+$/, '').replace(/\/v1$/i, '');
  const userCenterUrl = `${cleanBaseUrl}/panel/profile`;

  // 打开或展开编辑抽屉时，始终使用最新的有效凭据（内存或 localStorage）回显
  const handleOpenEdit = () => {
    const activeId =
      userId ||
      (typeof window !== 'undefined' ? localStorage.getItem('gateway_user_id')?.trim() || '' : '');
    const activeToken =
      systemToken ||
      (typeof window !== 'undefined' ? localStorage.getItem('gateway_system_token')?.trim() || '' : '');
    setEditUserId(activeId);
    setEditToken(activeToken);
    setIsEditing(true);
  };

  const toggleEditing = () => {
    if (!isEditing) {
      handleOpenEdit();
    } else {
      setIsEditing(false);
    }
  };

  // 用户 ID 输入即暂存
  const handleUserIdChange = (val: string) => {
    setEditUserId(val);
    try {
      if (val.trim()) {
        localStorage.setItem('gateway_user_id', val.trim());
      } else {
        localStorage.removeItem('gateway_user_id');
      }
    } catch {
      /* ignore */
    }
  };

  // 令牌输入即暂存，彻底杜绝切换、失焦或重新展开时丢失已输入的令牌
  const handleTokenChange = (val: string) => {
    setEditToken(val);
    try {
      if (val.trim()) {
        localStorage.setItem('gateway_system_token', val.trim());
      } else {
        localStorage.removeItem('gateway_system_token');
      }
    } catch {
      /* ignore */
    }
  };

  // 快速填入主界面已配置的网关 API Key (sk-...)
  

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editUserId.trim()) {
      showToast('⚠️ 请填写用户 ID (可在网关个人中心查看)');
      return;
    }
    if (!editToken.trim()) {
      showToast('⚠️ 请填写个人中心系统访问令牌或 API Key');
      return;
    }

    setIsSaving(true);
    try {
      // 保存前确保本地存储立即持久化
      try {
        localStorage.setItem('gateway_user_id', editUserId.trim());
        localStorage.setItem('gateway_system_token', editToken.trim());
      } catch {
        /* ignore */
      }
      const ok = await onSaveCredentials(editUserId, editToken);
      if (ok) {
        setIsEditing(false);
      }
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-2">
      {/* 极简轻巧条带：白底微光浅色系，与弹窗面板风格浑然一体 */}
      <div className="relative overflow-hidden rounded-xl bg-white text-slate-800 px-3.5 py-2.5 sm:px-4 sm:py-2.5 shadow-2xs border border-slate-200/90 transition-all duration-200">
        {!isConfigured ? (
          /* 未配置状态：单行紧凑引导 */
          <div className="flex items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2 text-slate-600">
              <Sparkles className="w-4 h-4 text-amber-500 shrink-0" />
              <span className="font-medium">连接网关账户，实时掌握剩余算力</span>
            </div>
            {!isEditing && (
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={handleOpenEdit}
                  className="px-3 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white font-bold text-xs shadow-2xs transition-all cursor-pointer shrink-0"
                >
                  立即配置凭据
                </button>
                <button
                  type="button"
                  onClick={toggleEditing}
                  className="px-2 py-1 rounded-lg bg-slate-100 hover:bg-slate-200/80 text-slate-700 text-xs font-semibold flex items-center gap-1 transition-all cursor-pointer border border-slate-200/80"
                >
                  <Key className="w-3 h-3 text-indigo-500" />
                  <span>绑定账户</span>
                </button>
              </div>
            )}
          </div>
        ) : (
          /* 已配置状态：极致紧凑的一体化信息条（白底浅色，与下方面板完美契合） */
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-3 flex-wrap sm:flex-nowrap">
              {/* 要素 1：用户名与用户 ID */}
              <div className="flex items-center gap-2 min-w-0 shrink-0">
                <div className="w-6 h-6 rounded-lg bg-emerald-50 border border-emerald-200/80 flex items-center justify-center text-emerald-600 shrink-0">
                  <Wallet className="w-3.5 h-3.5" />
                </div>
                <span className="font-bold text-xs sm:text-sm text-slate-800 tracking-wide truncate max-w-[140px] sm:max-w-[180px]">
                  {userInfo?.displayName || userInfo?.username || 'Comfly 网关账户'}
                </span>
                {userId && (
                  <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 text-[10px] font-mono font-medium border border-slate-200/80 shrink-0">
                    ID: #{userId}
                  </span>
                )}
              </div>

              {/* 要素 3：核心剩余算力数值与折合 */}
              <div className="flex items-baseline gap-1.5 shrink-0">
                <span className="text-lg sm:text-xl font-black font-mono tracking-tight text-emerald-600">
                  {userInfo ? userInfo.quotaFormatted.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '--'}
                </span>
                <span className="text-[11px] font-bold text-emerald-700">算力</span>
                <span className="text-[10px] font-semibold text-indigo-700 font-mono bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-200/70">
                  ≈ ¥{userInfo ? userInfo.quotaRmb.toFixed(2) : '--'} CNY
                </span>
              </div>

              {/* 要素 2：刷新余额快捷按钮（及配置小钥匙图标） */}
              <div className="flex items-center gap-1.5 shrink-0 ml-auto">
                <button
                  type="button"
                  onClick={() => onRefresh(false)}
                  disabled={isLoading}
                  className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200/80 active:bg-slate-300/60 text-slate-700 text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer border border-slate-200/80 shadow-2xs disabled:opacity-50"
                  title="立即刷新网关余额"
                >
                  <RefreshCw className={`w-3 h-3 ${isLoading ? 'animate-spin text-emerald-600' : 'text-slate-500'}`} />
                  <span>{isLoading ? '刷新中' : '刷新余额'}</span>
                </button>

                <button
                  type="button"
                  onClick={toggleEditing}
                  className={`px-2 py-1 rounded-lg text-xs font-semibold flex items-center gap-1 transition-all cursor-pointer border shadow-2xs ${
                    isEditing
                      ? 'bg-indigo-50 text-indigo-700 border-indigo-200 font-bold'
                      : 'bg-slate-100 hover:bg-slate-200/80 text-slate-700 border-slate-200/80'
                  }`}
                  title={isConfigured ? '修改网关凭据' : '绑定账户'}
                >
                  <Key className={`w-3 h-3 ${isEditing ? 'text-indigo-600' : 'text-slate-500'}`} />
                  <span>{isConfigured ? '修改凭据' : '绑定账户'}</span>
                </button>
              </div>
            </div>

            {/* 要素 4：健康度进度条（极细平滑细条，高度仅 4px） */}
            {userInfo && (
              <div className="w-full h-1 rounded-full bg-slate-100 overflow-hidden flex">
                <div
                  style={{ width: `${Math.min(100, Math.max(0, userInfo.remainingPercent))}%` }}
                  className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 rounded-full transition-all duration-300"
                />
              </div>
            )}
          </div>
        )}

        {/* 错误提示栏 */}
        {error && (
          <div className="mt-2 p-2 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700 flex items-center gap-2">
            <AlertCircle className="w-3.5 h-3.5 text-red-500 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* 余额偏低警告提示条 */}
        {isLowBalance && (
          <div className="mt-2 p-2 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-800 flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
              <span>当前网关剩余算力不足 5 算力，建议及时充值。</span>
            </div>
            <a
              href={userCenterUrl}
              target="_blank"
              rel="noreferrer"
              className="px-2 py-0.5 rounded bg-amber-500 hover:bg-amber-600 text-white font-bold text-[10px] transition-colors inline-flex items-center gap-1 cursor-pointer shrink-0"
            >
              <span>立即充值</span>
              <ExternalLink className="w-2.5 h-2.5" />
            </a>
          </div>
        )}

        {/* 可展开折叠的凭据配置抽屉 */}
        {isEditing && (
          <div className="mt-3 pt-3 border-t border-slate-200/80 animate-fade-in">
            <form onSubmit={handleSave} className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
                  <Key className="w-3 h-3 text-indigo-600" />
                  <span>网关余额查询凭据配置</span>
                </div>
                <a
                  href={userCenterUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[11px] text-indigo-600 hover:text-indigo-700 flex items-center gap-1 underline underline-offset-2"
                >
                  <span>去网关个人中心获取 ID 与系统令牌</span>
                  <ExternalLink className="w-2.5 h-2.5" />
                </a>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-slate-600 block">
                    用户 ID (New-API-User)
                  </label>
                  <div className="relative">
                    <User className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="text"
                      value={editUserId}
                      onChange={(e) => handleUserIdChange(e.target.value)}
                      placeholder="在个人中心查看，如: 10086"
                      className="w-full h-7.5 pl-7 pr-3 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-900 placeholder-slate-400 outline-none focus:bg-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-200 font-mono transition-all"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-slate-600 block">
                    系统令牌 / API Key
                  </label>
                  <div className="relative">
                    <Key className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type={showToken ? 'text' : 'password'}
                      value={editToken}
                      onChange={(e) => handleTokenChange(e.target.value)}
                      placeholder="个人中心生成的系统令牌 或 API Key (sk-...)"
                      className="w-full h-7.5 pl-7 pr-7 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-900 placeholder-slate-400 outline-none focus:bg-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-200 font-mono transition-all"
                    />
                    <button
                      type="button"
                      onClick={() => setShowToken(!showToken)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 cursor-pointer"
                    >
                      {showToken ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                    </button>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between pt-1">
                {isConfigured ? (
                  <button
                    type="button"
                    onClick={async () => {
                      await onClearCredentials();
                      setEditUserId('');
                      setEditToken('');
                      try {
                        localStorage.removeItem('gateway_user_id');
                        localStorage.removeItem('gateway_system_token');
                      } catch {
                        /* ignore */
                      }
                    }}
                    className="px-2.5 py-1 rounded-lg border border-red-200 hover:bg-red-50 text-red-600 text-xs font-semibold transition-all cursor-pointer"
                  >
                    清除凭据
                  </button>
                ) : <div />}

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsEditing(false)}
                    className="px-3.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition-all cursor-pointer"
                  >
                    取消
                  </button>
                  <button
                    type="submit"
                    disabled={isSaving}
                    className="px-4 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-xs transition-all cursor-pointer disabled:opacity-50"
                  >
                    {isSaving ? '正在测试并保存...' : '保存并同步余额'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
