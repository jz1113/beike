import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { formatUserError } from '@shared/domain/models/upstreamErrors';
import {
  type ApiProvider,
  loadStoredProviders,
  saveStoredProviders,
  sameProviderRoute,
  removeStoredProvider,
  commitProviderConfig,
  type ProviderCommitOptions,
  testModelConnection,
  sameConnectionInputs,
  type ConnectionTestOutcome,
  type ConnectionTestRecord,
} from '../model/apiProviderTypes';
import { notifyProviderCommit, type ProviderCredentials } from '../model/providerCredentialSync';

export type ConfigSaveState = 'idle' | 'saving' | 'saved' | 'error';

export function useConfigSaveState<T extends object>(
  active: boolean,
  showToast: (message: string) => void,
  onSaved: (snapshot: Partial<T>) => void,
) {
  const [states, setStates] = useState<Record<string, ConfigSaveState>>({});
  const versions = useRef<Record<string, number>>({});
  const session = useRef(0);
  useEffect(() => {
    session.current += 1;
    setStates({});
    return () => { session.current += 1; };
  }, [active]);
  const save = async (
    service: string,
    snapshot: Partial<T>,
    operation: () => Promise<void>,
    message: string,
    notify = true,
  ): Promise<boolean> => {
    if (!active) return false;
    const currentSession = session.current;
    const version = versions.current[service] = (versions.current[service] || 0) + 1;
    setStates(previous => ({ ...previous, [service]: 'saving' }));
    try {
      await operation();
      if (currentSession !== session.current) return false;
      onSaved(snapshot);
      if (version !== versions.current[service]) return false;
      setStates(previous => ({ ...previous, [service]: 'saved' }));
      if (notify) showToast(message);
      return true;
    } catch (error) {
      if (currentSession !== session.current || version !== versions.current[service]) return false;
      setStates(previous => ({ ...previous, [service]: 'error' }));
      showToast(formatUserError(error, '配置保存失败，请重试'));
      return false;
    }
  };
  return { save, states, isSaving: Object.values(states).some(state => state === 'saving') };
}

/** Session-only results. Changing credentials/address invalidates evidence; never persist secrets or test results. */
export function useConnectionChecks(inputs: Record<string, readonly unknown[]>, showToast: (message: string) => void, active = true) {
  const [records, setRecords] = useState<Record<string, { inputs: readonly unknown[]; version: number; result: ConnectionTestRecord }>>({});
  const [testing, setTesting] = useState<Record<string, boolean>>({});
  const pending = useRef(new Map<string, object>());
  const latest = useRef(inputs);
  const inputVersions = useRef<Record<string, number>>({});
  for (const [id, values] of Object.entries(inputs)) {
    if (!sameConnectionInputs(values, latest.current[id] ?? [])) inputVersions.current[id] = (inputVersions.current[id] || 0) + 1;
  }
  latest.current = inputs;
  const session = useRef(0);
  useEffect(() => {
    const requests = pending.current;
    session.current += 1;
    requests.clear();
    setTesting({});
    setRecords({});
    return () => { session.current += 1; requests.clear(); };
  }, [active]);
  const run = async (id: string, test: () => Promise<ConnectionTestOutcome>) => {
    if (!active || pending.current.has(id)) return;
    const request = {};
    pending.current.set(id, request);
    const snapshot = [...(inputs[id] ?? [])];
    const currentSession = session.current;
    const version = inputVersions.current[id] || 0;
    setTesting(previous => ({ ...previous, [id]: true }));
    let outcome: ConnectionTestOutcome;
    try { outcome = await test(); }
    catch (error) { outcome = { ok: false, message: formatUserError(error, '连接测试失败') }; }
    finally {
      if (currentSession === session.current && pending.current.get(id) === request) {
        pending.current.delete(id);
        setTesting(previous => ({ ...previous, [id]: false }));
      }
    }
    if (currentSession !== session.current || version !== (inputVersions.current[id] || 0)) return;
    setRecords(previous => ({ ...previous, [id]: { inputs: snapshot, version, result: { ...outcome, checkedAt: Date.now() } } }));
    if (sameConnectionInputs(snapshot, latest.current[id] ?? [])) showToast(outcome.message);
  };
  const results = Object.fromEntries(Object.entries(records).filter(([id, record]) =>
    record.version === (inputVersions.current[id] || 0) && sameConnectionInputs(record.inputs, inputs[id] ?? [])).map(([id, record]) => [id, record.result]));
  const invalidate = (id: string) => {
    inputVersions.current[id] = (inputVersions.current[id] || 0) + 1;
    setRecords(previous => { const next = { ...previous }; delete next[id]; return next; });
  };
  return { run, testing, results, invalidate };
}

export const CREATOR_PROFILE_KEY = 'beike_creator_profile';
export const CREATOR_PROFILE_EVENT = 'beike-creator-profile';

export type CreatorProfile = {
  name: string;
  signature: string;
  avatar?: string;
};

export const DEFAULT_CREATOR_PROFILE: CreatorProfile = {
  name: '创作者',
  signature: '把灵感，变成看得见的作品。',
};

export function readCreatorProfile(): CreatorProfile {
  if (typeof window === 'undefined') return DEFAULT_CREATOR_PROFILE;
  try {
    const parsed = JSON.parse(localStorage.getItem(CREATOR_PROFILE_KEY) || '');
    if (!parsed || typeof parsed !== 'object') return DEFAULT_CREATOR_PROFILE;
    const name = typeof parsed.name === 'string' ? parsed.name.trim().slice(0, 24) : '';
    const signature = typeof parsed.signature === 'string' ? parsed.signature.trim().slice(0, 48) : '';
    return {
      name: name || DEFAULT_CREATOR_PROFILE.name,
      signature: signature || DEFAULT_CREATOR_PROFILE.signature,
      avatar: typeof parsed.avatar === 'string' ? parsed.avatar : undefined,
    };
  } catch {
    return DEFAULT_CREATOR_PROFILE;
  }
}

export function writeCreatorProfile(profile: CreatorProfile) {
  const next: CreatorProfile = {
    name: profile.name.trim().slice(0, 24) || DEFAULT_CREATOR_PROFILE.name,
    signature: profile.signature.trim().slice(0, 48) || DEFAULT_CREATOR_PROFILE.signature,
    avatar: profile.avatar,
  };
  localStorage.setItem(CREATOR_PROFILE_KEY, JSON.stringify(next));
  window.dispatchEvent(new Event(CREATOR_PROFILE_EVENT));
  return next;
}

export function useCreatorProfile() {
  const [profile, setProfile] = useState<CreatorProfile>(readCreatorProfile);

  useEffect(() => {
    const sync = () => setProfile(readCreatorProfile());
    window.addEventListener(CREATOR_PROFILE_EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(CREATOR_PROFILE_EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  const saveProfile = useCallback((next: CreatorProfile) => {
    setProfile(writeCreatorProfile(next));
  }, []);

  return { profile, saveProfile };
}

/** Capture the opener before focusing; keep keyboard navigation inside the active dialog. */
export function useSettingsDialogFocus<T extends HTMLElement>(isOpen: boolean, onClose: () => void) {
  const dialogRef = useRef<T>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    if (!isOpen) return;
    const dialog = dialogRef.current;
    if (!dialog) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusable = () => Array.from(dialog.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'))
      .filter(element => !element.hidden && element.getClientRects().length > 0);
    const frame = requestAnimationFrame(() => {
      (dialog.querySelector<HTMLElement>('[data-initial-focus]') || focusable()[0] || dialog).focus();
    });
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        closeRef.current();
        return;
      }
      if (event.key !== 'Tab') return;
      const items = focusable();
      const first = items[0], last = items[items.length - 1];
      if (!first) {
        event.preventDefault();
        dialog.focus();
        return;
      }
      if (event.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement))) {
        event.preventDefault();
        first.focus();
      }
    };
    dialog.addEventListener('keydown', onKeyDown);
    return () => {
      cancelAnimationFrame(frame);
      dialog.removeEventListener('keydown', onKeyDown);
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, [isOpen]);
  return dialogRef;
}

interface UseApiProvidersOptions {
  isOpen: boolean;
  showToast: (msg: string) => void;
  onProviderRemoved?: (providerId: string) => void;
}

export function useApiProviders({ isOpen, showToast, onProviderRemoved }: UseApiProvidersOptions) {
  const [providers, setProviders] = useState<ApiProvider[]>(() => loadStoredProviders());
  const [selectedProviderId, setSelectedProviderId] = useState<string>(() => {
    const list = loadStoredProviders();
    return list[0]?.id || 'comfly_gateway';
  });
  const checks = useConnectionChecks(Object.fromEntries(providers.map(p => [p.id,
    [p.baseUrl, p.apiKey, p.providerType, p.catalogPath, p.enabled, JSON.stringify(p.requestTemplate)],
  ])), showToast, isOpen);

  useEffect(() => {
    if (isOpen) {
      const list = loadStoredProviders();
      setProviders(list);
      setSelectedProviderId(previous => list.some(p => p.id === previous) ? previous : (list[0]?.id || 'comfly_gateway'));
    }
  }, [isOpen]);

  const currentProvider = useMemo(() => {
    return providers.find(p => p.id === selectedProviderId) || providers[0];
  }, [providers, selectedProviderId]);

  const updateCurrentProvider = useCallback((updates: Partial<ApiProvider>) => {
    if (!currentProvider) return;
    checks.invalidate(currentProvider.id);
    setProviders(prev => prev.map(p => p.id === currentProvider.id ? { ...p, ...updates } : p));
  }, [currentProvider, checks]);

  const addProvider = useCallback((newInfo: Omit<ApiProvider, 'id' | 'isRemovable'>) => {
    const existing = loadStoredProviders().find(item => sameProviderRoute(item, newInfo));
    if (existing) {
      setSelectedProviderId(existing.id);
      showToast(`该线路已存在，已选中「${existing.name}」`);
      return existing.id;
    }
    const id = `provider_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const created: ApiProvider = {
      ...newInfo,
      id,
      isRemovable: true,
      isCustom: true,
    };
    try { saveStoredProviders([...loadStoredProviders(), created]); }
    catch { showToast('添加服务商失败，请检查存储权限或可用空间后重试'); return false; }
    setProviders(prev => [...prev, created]);
    notifyProviderCommit(id);
    setSelectedProviderId(id);
    showToast(`已添加服务商「${created.name}」`);
    return id;
  }, [showToast]);

  const removeProvider = useCallback((id: string) => {
    const target = providers.find(p => p.id === id);
    if (!target) return false;

    try { removeStoredProvider(id); }
    catch { showToast('移除服务商失败，请检查存储权限或可用空间后重试'); return false; }
    checks.invalidate(id);
    const nextList = providers.filter(p => p.id !== id);
    setProviders(nextList);
    notifyProviderCommit(id);

    if (selectedProviderId === id) {
      const fallback = nextList[0]?.id || '';
      setSelectedProviderId(fallback);
    }

    onProviderRemoved?.(id);
    showToast(`已移除服务商「${target.name}」`);
    return true;
  }, [providers, selectedProviderId, onProviderRemoved, showToast, checks]);

  const testProvider = useCallback(async (providerId?: string) => {
    const target = providers.find(p => p.id === (providerId || selectedProviderId));
    if (!target) return;
    if (!target.apiKey.trim()) {
      showToast('请先输入该服务商的 API 密钥');
      return;
    }
    await checks.run(target.id, () => testModelConnection(target.name, {
      provider: target.providerType, providerType: target.providerType,
      baseUrl: target.baseUrl.trim(), apiKey: target.apiKey.trim(), catalogPath: target.catalogPath,
    }));
  }, [providers, selectedProviderId, showToast, checks]);

  const saveProvider = (draft: ApiProvider, previous: ProviderCredentials, options?: ProviderCommitOptions) => {
    const result = commitProviderConfig(draft, previous, options);
    checks.invalidate(draft.id);
    setProviders(items => items.map(item => item.id === draft.id ? result.provider : item));
    return result;
  };

  return {
    providers,
    selectedProviderId,
    setSelectedProviderId,
    currentProvider,
    updateCurrentProvider,
    addProvider,
    removeProvider,
    testProvider,
    saveProvider,
    isTesting: Object.values(checks.testing).some(Boolean),
    testResults: Object.fromEntries(Object.entries(checks.results).map(([id, result]) => [id, { ...result, timestamp: result.checkedAt }])),
  };
}
