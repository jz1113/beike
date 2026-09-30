import { useEffect, useRef, useState } from 'react';
import { apiFetch, getClientAccessToken } from '@client/shared/api/apiClient';
import { getWorkspaceSecret } from '@client/shared/api/workspaceClient';
import { invalidateGlobalAssetCache } from '@client/shared/api/assetLibraryCache';
import { confirmAction } from '@client/shared/utils/confirmAction';
import type { AssetProductCategory } from '@shared/domain/assets/assetOrganization';
import { folderRuleRoot, folderRuleSignature, folderRulesReadOnly, folderRuleValues, readFolderRuleOrganization, recommendedFolderRules, tokenizeRuleWords, validateFolderRules, type FolderRuleImport, type FolderRuleOrganization } from '../model/promptFolderRules';

export interface PromptFolderRulesProps {
  category: AssetProductCategory;
  categories: AssetProductCategory[];
  onChanged: (organization: FolderRuleOrganization) => void;
  onClose: () => void;
  onNotice: (message: string) => void;
}

function draftFor(category: AssetProductCategory) {
  const values = folderRuleValues(category);
  return { id: category.id, keywords: values.keywords.join('，'), anatomy: values.anatomy.join('，'), baseline: folderRuleSignature(category) };
}

function currentScope() { return JSON.stringify([getClientAccessToken(), getWorkspaceSecret()]); }

export function usePromptFolderRules({ category, categories, onChanged, onClose, onNotice }: PromptFolderRulesProps) {
  const [definitions, setDefinitions] = useState(() => categories.some(item => item.id === category.id) ? categories : [...categories, category]);
  const [draft, setDraft] = useState(() => draftFor(category));
  const [saving, setSaving] = useState<'save' | 'import' | 'migration' | null>(null);
  const [error, setError] = useState('');
  const [importText, setImportText] = useState('');
  const [importMode, setImportMode] = useState<'append' | 'replace'>('append');
  const busyRef = useRef(false);
  const mountedRef = useRef(false);
  const [scope] = useState(currentScope);
  const selected = definitions.find(item => item.id === draft.id);
  const root = selected && folderRuleRoot(selected, definitions);
  const readOnly = !!selected && folderRulesReadOnly(selected);
  const importReadOnly = !!root && folderRulesReadOnly(root);
  const values = { keywords: tokenizeRuleWords(draft.keywords), anatomy: tokenizeRuleWords(draft.anatomy) };
  const errors = validateFolderRules(values);
  const baselineValues: unknown = JSON.parse(draft.baseline)[4];
  const dirty = JSON.stringify(values) !== JSON.stringify(baselineValues);
  const sourceChanged = !selected || folderRuleSignature(selected) !== draft.baseline;

  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false; }; }, []);
  useEffect(() => {
    // External refreshes may update definitions, but must never overwrite an unsaved editor.
    setDefinitions(categories.some(item => item.id === category.id) ? categories : [...categories, category]);
  }, [categories, category]);
  useEffect(() => {
    const preventUnload = (event: BeforeUnloadEvent) => { if (dirty || importText.trim() || busyRef.current) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('beforeunload', preventUnload);
    return () => window.removeEventListener('beforeunload', preventUnload);
  }, [dirty, importText]);

  const allowDiscard = (includeImport = false) => !(dirty || (includeImport && importText.trim())) || confirmAction('当前规则或导入内容尚未保存，放弃修改？');
  const close = async () => {
    if (busyRef.current || !(await allowDiscard(true))) return;
    onClose();
  };
  const select = async (id: string) => {
    if (id === draft.id || busyRef.current) return;
    const next = definitions.find(item => item.id === id && !item.isArchived);
    const changesRoot = next && folderRuleRoot(next, definitions)?.id !== root?.id;
    if (!next || !(await allowDiscard(!!changesRoot))) return;
    if (changesRoot) setImportText('');
    setDraft(draftFor(next));
    setError('');
  };
  const reload = async () => {
    if (busyRef.current || !selected || !(await allowDiscard())) return;
    setDraft(draftFor(selected));
    setError('');
  };
  const recommend = () => {
    if (busyRef.current || !selected || readOnly) return;
    const recommended = recommendedFolderRules(selected, definitions);
    setDraft(previous => ({ ...previous, keywords: recommended.keywords.join('，'), anatomy: recommended.anatomy.join('，') }));
    setError('');
  };
  const edit = (field: 'keywords' | 'anatomy', value: string) => {
    if (!busyRef.current && !readOnly) setDraft(previous => ({ ...previous, [field]: value }));
  };

  const mutate = async (action: 'save' | 'import' | 'migration', payload: Record<string, unknown>): Promise<boolean> => {
    if (busyRef.current) return false;
    if (action === 'save' ? readOnly : importReadOnly) { setError('此文件夹来自只读资产库，不能修改规则'); return false; }
    busyRef.current = true;
    setError('');
    try {
      if (currentScope() !== scope) throw new Error('当前访问空间已变化，请关闭后重新打开规则编辑器');
      if (sourceChanged) throw new Error('文件夹已被更新，请先重新读取规则');
      if (action !== 'save' && !(await allowDiscard())) return false;
      setSaving(action);
      const response = await apiFetch('/api/catalog/assets/library', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      });
      const result: unknown = await response.json();
      const organization = readFolderRuleOrganization(result);
      if (!response.ok || !organization) {
        const serverError = result && typeof result === 'object' && 'error' in result ? String(result.error) : '保存失败，请重试';
        throw new Error(serverError);
      }
      if (!mountedRef.current) return false;
      if (currentScope() !== scope) throw new Error('访问空间已变化，已停止更新当前界面；请重新打开并核实保存结果');
      const updated = organization.categories.find(item => item.id === draft.id);
      setDefinitions(organization.categories);
      if (updated) setDraft(draftFor(updated));
      if (action === 'import') setImportText('');
      onChanged(organization);
      invalidateGlobalAssetCache();
      onNotice(action === 'save' ? '当前文件夹规则已保存' : action === 'migration' ? '旧缓存已合并到当前大类，原备份已保留' : '二级文件夹规则已导入');
      return true;
    } catch (cause) {
      if (mountedRef.current) setError(cause instanceof Error ? cause.message : '保存失败，请重试');
      return false;
    } finally {
      busyRef.current = false;
      if (mountedRef.current) setSaving(null);
    }
  };

  const save = () => {
    if (!selected || selected.isArchived || readOnly || !dirty || errors.length) return Promise.resolve(false);
    return mutate('save', { action: 'save-prompt-folder-rules', id: draft.id, ...values });
  };
  const importItems = (items: FolderRuleImport[], mode: 'append' | 'replace', migration = false) => {
    if (!root || importReadOnly || !items.length || items.length > 100) return Promise.resolve(false);
    if (items.some(item => !item.name || item.name.length > 40 || validateFolderRules({ keywords: item.keywords, anatomy: item.anatomy || [] }).length)) return Promise.resolve(false);
    return mutate(migration ? 'migration' : 'import', { action: 'import-prompt-folder-rules', parentId: root.id, items, mode });
  };

  return { definitions, selected, root, draft, dirty, errors, sourceChanged, readOnly, importReadOnly, saving, error, importText, setImportText, importMode, setImportMode, close, select, reload, recommend, edit, save, importItems };
}
