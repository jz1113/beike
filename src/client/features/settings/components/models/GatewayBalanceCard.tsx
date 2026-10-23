import { useEffect, useId, useState, type FormEvent } from 'react';
import { Wallet, RefreshCw, ExternalLink, Key, AlertTriangle, Eye, EyeOff, AlertCircle } from 'lucide-react';
import type { GatewayUserInfo } from '../../hooks/useGatewayUser';
import { getGatewayClientOverrides } from '@client/shared/api/gatewayClient';
import { ExternalLinkAnchor } from '@client/shared/ui/ExternalLinkAnchor';
import { formatUsageCost } from '../../model/usageFormatting';

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
  onClearCredentials: () => Promise<boolean>;
  showToast: (msg: string) => void;
}

const focus = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2';
const button = `${focus} rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:text-slate-200 dark:hover:bg-white/5 dark:border-white/10 dark:bg-[#18191c]`;

export default function GatewayBalanceCard({
  userId, systemToken, userInfo, isLoading, isConfigured, isLowBalance,
  lastUpdated, error, onRefresh, onSaveCredentials, onClearCredentials, showToast,
}: GatewayBalanceCardProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editUserId, setEditUserId] = useState(userId);
  const [editToken, setEditToken] = useState(systemToken);
  const [showToken, setShowToken] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const id = useId();

  useEffect(() => {
    if (!isEditing) { setEditUserId(userId); setEditToken(systemToken); }
  }, [userId, systemToken, isEditing]);

  const currentBaseUrl = getGatewayClientOverrides().customBaseUrl || 'https://ai.comfly.org';
  const cleanBaseUrl = currentBaseUrl.replace(/\/+$/, '').replace(/\/v1$/i, '');
  const userCenterUrl = `${cleanBaseUrl}/panel/profile`;
  const balanceAvailable = userInfo && userInfo.balanceAvailable !== false;
  const openEdit = () => {
    setEditUserId(userId); setEditToken(systemToken); setShowToken(false);
    setFormError(''); setIsEditing(true);
  };

  const handleSave = async (event: FormEvent) => {
    event.preventDefault();
    if (isSaving) return;
    if (!editUserId.trim() || !editToken.trim()) {
      setFormError('请填写用户 ID 与个人中心系统访问令牌。'); return;
    }
    setIsSaving(true); setFormError('');
    try {
      if (await onSaveCredentials(editUserId, editToken)) { setIsEditing(false); setShowToken(false); }
      else setFormError('凭据未能保存，请检查后重试。');
    } catch {
      setFormError('凭据保存失败，请重试。');
    } finally { setIsSaving(false); }
  };

  const clearCredentials = async () => {
    if (isSaving) return;
    setIsSaving(true); setFormError('');
    try {
      if (!await onClearCredentials()) { setFormError('凭据清除未完成，请重试。'); return; }
      setEditUserId(''); setEditToken(''); setShowToken(false);
    } catch {
      setFormError('凭据清除失败，请重试。');
    } finally { setIsSaving(false); }
  };

  return (
    <section aria-label="网关账户余额" className="settings-balance-card space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <Wallet aria-hidden="true" className="h-4 w-4 shrink-0 text-emerald-600" />
          <h3 className="truncate text-sm font-semibold text-slate-800 dark:text-slate-100">
            {isConfigured ? userInfo?.displayName || userInfo?.username || '网关账户' : '网关账户余额'}
          </h3>
          {isConfigured && <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] text-slate-600 dark:text-slate-300 dark:bg-white/10">ID: {userId}</span>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {isConfigured && <button type="button" onClick={() => void onRefresh(false).catch(() => showToast('余额刷新失败，请重试。'))} disabled={isLoading || isSaving} className={button}><RefreshCw aria-hidden="true" className={`mr-1.5 inline h-3 w-3 ${isLoading ? 'animate-spin' : ''}`} />{isLoading ? '刷新中…' : '刷新余额'}</button>}
          <button type="button" onClick={() => isEditing ? setIsEditing(false) : openEdit()} disabled={isSaving} aria-expanded={isEditing} aria-controls={`${id}-credentials`} className={button}><Key aria-hidden="true" className="mr-1.5 inline h-3 w-3" />{isEditing ? '收起凭据' : isConfigured ? '修改凭据' : '绑定账户'}</button>
        </div>
      </div>

      {isConfigured ? (
        <div className="space-y-2">
          <div role="status" aria-live="polite" className="flex flex-wrap items-baseline gap-2">
            <strong className="font-mono text-xl text-emerald-700">{balanceAvailable ? formatUsageCost(userInfo.quotaFormatted) : '—'}</strong>
            <span className="text-xs text-slate-600 dark:text-slate-300">剩余算力</span>
            <span className="text-xs text-slate-500 dark:text-slate-400">{userInfo?.balanceAvailable === false ? '网关未提供可用余额信息' : balanceAvailable ? `约 ¥${formatUsageCost(userInfo.quotaRmb)} CNY` : isLoading ? '正在获取余额…' : '尚未同步余额'}</span>
          </div>
          {balanceAvailable && <div role="progressbar" aria-label="剩余额度比例" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(100, Math.max(0, userInfo.remainingPercent))} className="h-1 overflow-hidden rounded-full bg-slate-100 dark:bg-white/10"><div style={{ width: `${Math.min(100, Math.max(0, userInfo.remainingPercent))}%` }} className="h-full rounded-full bg-emerald-500" /></div>}
          {lastUpdated && <p className="text-[11px] text-slate-500 dark:text-slate-400">最近同步：{lastUpdated}{error ? ' · 当前显示上次成功同步的余额' : ''}</p>}
        </div>
      ) : <p className="text-xs text-slate-500 dark:text-slate-400">绑定网关账户，查看剩余算力与余额。</p>}
      {error && <p role="alert" className="flex items-start gap-1.5 rounded-lg bg-red-50 p-2 text-xs text-red-700"><AlertCircle aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />{error}</p>}
      {isLowBalance && <div role="status" className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-amber-50 p-2 text-xs text-amber-800"><span><AlertTriangle aria-hidden="true" className="mr-1.5 inline h-3.5 w-3.5" />剩余算力不足 5，建议及时充值。</span><ExternalLinkAnchor href={userCenterUrl} className="text-indigo-600 underline">网关个人中心</ExternalLinkAnchor></div>}

      {isEditing && <form id={`${id}-credentials`} onSubmit={handleSave} className="space-y-3 border-t border-slate-100 pt-3 dark:border-white/10">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h4 className="text-xs font-semibold text-slate-700 dark:text-slate-200">余额查询凭据</h4>
          <ExternalLinkAnchor href={userCenterUrl} className="text-[11px] text-indigo-600 underline">获取用户 ID 与系统令牌 <ExternalLink aria-hidden="true" className="inline h-3 w-3" /></ExternalLinkAnchor>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <label htmlFor={`${id}-user`} className="block text-xs text-slate-600 dark:text-slate-300">用户 ID (New-API-User)</label>
            <input id={`${id}-user`} value={editUserId} onChange={(event) => { setEditUserId(event.target.value); setFormError(''); }} disabled={isSaving} autoComplete="off" placeholder="在网关个人中心查看" className="h-9 w-full rounded-lg border border-slate-200 px-3 text-xs outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 disabled:bg-slate-50 dark:border-white/10" />
          </div>
          <div className="space-y-1">
            <label htmlFor={`${id}-token`} className="block text-xs text-slate-600 dark:text-slate-300">个人中心系统访问令牌</label>
            <div className="relative">
              <input id={`${id}-token`} type={showToken ? 'text' : 'password'} value={editToken} onChange={(event) => { setEditToken(event.target.value); setFormError(''); }} disabled={isSaving} autoComplete="off" spellCheck={false} placeholder="粘贴系统访问令牌" className="h-9 w-full rounded-lg border border-slate-200 pl-3 pr-10 text-xs outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 disabled:bg-slate-50 dark:border-white/10" />
              <button type="button" onClick={() => setShowToken(!showToken)} aria-label={showToken ? '隐藏系统令牌' : '显示系统令牌'} aria-pressed={showToken} className={`${focus} absolute right-1 top-1 flex h-7 w-7 items-center justify-center rounded text-slate-500 dark:text-slate-400`}>{showToken ? <EyeOff aria-hidden="true" className="h-3.5 w-3.5" /> : <Eye aria-hidden="true" className="h-3.5 w-3.5" />}</button>
            </div>
          </div>
        </div>
        <p className="text-[11px] text-slate-500 dark:text-slate-400">输入仅作为草稿；点击保存后才生效。金额为网关折算估值。</p>
        {formError && <p role="alert" className="text-xs text-red-600">{formError}</p>}
        <div className="flex flex-wrap items-center justify-between gap-2">
          {isConfigured ? <button type="button" onClick={() => void clearCredentials()} disabled={isSaving} className={`${button} text-red-600`}>清除凭据</button> : <span />}
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => { setIsEditing(false); setShowToken(false); }} disabled={isSaving} className={button}>取消</button>
            <button type="submit" disabled={isSaving} className={`${focus} rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50`}>{isSaving ? '正在保存…' : '保存并同步余额'}</button>
          </div>
        </div>
      </form>}
    </section>
  );
}
