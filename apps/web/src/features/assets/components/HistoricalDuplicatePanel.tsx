import { useState } from 'react';
import { apiFetch } from '@/lib/apiClient';
export function HistoricalDuplicatePanel({ onView }: { onView?: (id: string) => void }) {
  const [groups, setGroups] = useState<Array<Array<{ id: string; name: string }>> | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function scan() {
    setBusy(true); setError('');
    try {
      const response = await apiFetch('/api/catalog/assets/source-check');
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || '扫描失败');
      setGroups(data.data);
    } catch (err) { setError(err instanceof Error ? err.message : '扫描失败'); }
    finally { setBusy(false); }
  }
  return <details className="border rounded-xl p-3 bg-white">
    <summary className="cursor-pointer font-semibold">检查库中已有重复图集</summary>
    <p className="text-xs text-slate-500 my-2">旧资产未保留笔记 ID，仅按完全相同的来源图片查找疑似重复，最多显示 50 组。不自动合并或删除。</p>
    <button type="button" disabled={busy} onClick={() => void scan()} className="text-indigo-600 disabled:opacity-40">{busy ? '正在检查…' : '扫描已有资产'}</button>
    {error && <p role="alert" className="text-red-600">{error}</p>}
    {groups?.length === 0 && <p className="text-xs mt-2">未发现来源图片完全相同的重复图集；这不代表所有内容都不重复。</p>}
    {groups?.map((albums, index) => <div key={albums[0].id} className="mt-3 border-t pt-2">
      <p className="font-medium">疑似重复第 {index + 1} 组</p>
      {albums.map(album => <button type="button" key={album.id} disabled={!onView} className="block text-indigo-600 mt-1" onClick={() => onView?.(album.id)}>查看：{album.name}</button>)}
    </div>)}
  </details>;
}
