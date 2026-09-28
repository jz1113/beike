import { useEffect, useState } from 'react';
import { apiFetch } from '@client/shared/api/apiClient';
import {
  SUBCATEGORY_STORAGE_KEY_PREFIX,
  hydrateSubCategoriesFromServer,
  type ActionCategoryId,
  type SubCategoryDef,
} from '@shared/domain/products/productCategory';

function collectLocalCategories(): Array<{ parentId: ActionCategoryId; categories: SubCategoryDef[] }> {
  if (typeof localStorage === 'undefined') return [];
  const reports: Array<{ parentId: ActionCategoryId; categories: SubCategoryDef[] }> = [];
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);
    if (!key?.startsWith(SUBCATEGORY_STORAGE_KEY_PREFIX)) continue;
    const parentId = key.slice(SUBCATEGORY_STORAGE_KEY_PREFIX.length) as ActionCategoryId;
    try {
      const parsed = JSON.parse(localStorage.getItem(key) || '[]');
      if (Array.isArray(parsed) && parsed.length) reports.push({ parentId, categories: parsed });
    } catch { /* ignore broken cache */ }
  }
  return reports;
}

export function CategoryMigrationPanel() {
  const [previewCount, setPreviewCount] = useState(0);
  const [status, setStatus] = useState('');
  useEffect(() => {
    void (async () => {
      const res = await apiFetch('/api/catalog/categories');
      const data = await res.json().catch(() => null);
      if (data?.categories) {
        hydrateSubCategoriesFromServer(data.categories);
        window.dispatchEvent(new Event('antigravity_subcategory_changed'));
      }
      const local = collectLocalCategories();
      if (!local.length) return;
      const previewRes = await apiFetch('/api/catalog/categories/migration-preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ local }),
      });
      const preview = await previewRes.json().catch(() => null);
      setPreviewCount(preview?.preview?.createdCount || 0);
    })();
  }, []);

  const apply = async () => {
    const local = collectLocalCategories();
    const previewRes = await apiFetch('/api/catalog/categories/migration-preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ local }),
    });
    const preview = await previewRes.json().catch(() => null);
    const applyRes = await apiFetch('/api/catalog/categories/migration-apply', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: preview?.preview?.items || [] }),
    });
    const applied = await applyRes.json().catch(() => null);
    if (applied?.categories) {
      hydrateSubCategoriesFromServer(applied.categories);
      window.dispatchEvent(new Event('antigravity_subcategory_changed'));
      setStatus('本地类目已写入服务端，浏览器仅保留缓存');
      setPreviewCount(0);
    } else {
      setStatus(applied?.error || '迁移失败');
    }
  };

  return (
    <div className="mb-3 space-y-2">
      {previewCount > 0 || status ? (
        <div className="rounded-xl border border-amber-200/60 bg-amber-50/70 px-3 py-2 text-[11px] text-amber-800">
          <div className="flex items-center justify-between gap-2">
            <span>{status || `检测到 ${previewCount} 条本地类目可迁到服务端`}</span>
            {previewCount > 0 ? (
              <button type="button" onClick={() => void apply()} className="rounded-lg bg-amber-600 px-2 py-1 font-bold text-white">确认迁移</button>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
