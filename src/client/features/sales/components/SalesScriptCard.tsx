import { useRef, useState } from 'react';
import { Film, FolderEdit, Loader2, Trash2 } from 'lucide-react';
import { SalesCardMenu } from './SalesCardMenu';
import { proxyMediaUrl } from '@client/shared/api/apiClient';
import { confirmAction } from '@client/shared/utils/confirmAction';
import type { ScriptTaxonomyItem, ScriptTaxonomyKind } from '@shared/contracts/salesScriptTaxonomy';
import type { StoredSalesScript } from '../api/salesScripts';
import { formatScriptSeconds } from '../model/salesScriptEditor';
import { scriptTaxonomyEntry } from '../model/salesScriptLibrary';
import { useSalesReferencePreview } from '../hooks/useSalesReferencePreview';
import { SalesScriptQuickClassify } from './SalesScriptQuickClassify';
import { salesFocusClass, salesGhostButtonClass } from './salesChrome';

interface Props {
  item: StoredSalesScript;
  taxonomyItems: readonly ScriptTaxonomyItem[];
  taxonomyLoading: boolean;
  onManageTaxonomy: (kind: ScriptTaxonomyKind) => void;
  onCreateTaxonomy?: (kind: ScriptTaxonomyKind, name: string) => Promise<ScriptTaxonomyItem | null>;
  onQuickClassify?: (item: StoredSalesScript, categoryId: string, styleId: string) => Promise<boolean>;
  onReview: (item: StoredSalesScript) => void;
  onDelete: (id: string) => void | boolean | Promise<boolean>;
}

export function SalesScriptCard({
  item, taxonomyItems, taxonomyLoading,
  onManageTaxonomy, onCreateTaxonomy, onQuickClassify, onReview, onDelete,
}: Props) {
  const [failedVideo, setFailedVideo] = useState('');
  const [classifying, setClassifying] = useState(false);
  const [pending, setPending] = useState('');
  const [error, setError] = useState('');
  const actionLock = useRef(false);
  const category = scriptTaxonomyEntry(item.script, 'category', taxonomyItems)?.name || '未分类';
  const style = scriptTaxonomyEntry(item.script, 'style', taxonomyItems)?.name || '未设风格';
  const remove = async () => {
    if (actionLock.current) return;
    actionLock.current = true; setError('');
    try {
      if (!await confirmAction({ title: `删除「${item.title}」？`, confirmText: '确认删除', danger: true,
        description: '将移除此脚本及其视频关联，独立保存的动作素材保留。删除后不可恢复。' })) return;
      setPending('delete');
      const ok = await onDelete(item.id);
      if (ok === false) setError('删除失败，请重试。');
    } catch (err) { setError(err instanceof Error ? err.message : '操作失败，请重试。'); }
    finally { actionLock.current = false; setPending(''); }
  };
  const coverVideo = item.depthVideoUrl || '';
  const hasCover = Boolean(coverVideo && failedVideo !== coverVideo);
  const { previewStyle, onVideoLoadedMetadata } = useSalesReferencePreview(hasCover ? coverVideo : '');
  return (
    <article className="sales-script-card sales-reference-card" style={previewStyle}>
      <div className="sales-script-preview-slot">
        <button type="button" disabled={Boolean(pending)} className={`sales-script-card-cover ${salesFocusClass}`} onClick={() => onReview(item)} aria-label={`查看分镜 ${item.title}`}>
          {hasCover ? (
            <video key={coverVideo} src={proxyMediaUrl(coverVideo, { asVideo: true })} preload="metadata" muted playsInline
              aria-hidden tabIndex={-1}
              onLoadedMetadata={onVideoLoadedMetadata}
              onError={() => setFailedVideo(coverVideo)} />
          ) : (
            <span className="sales-script-card-placeholder"><Film size={28} aria-hidden />{coverVideo ? '深度视频封面暂不可用' : '暂无深度视频封面'}</span>
          )}
          <span className="sales-script-duration">{formatScriptSeconds(item.script.durationSec)}</span>
        </button>
        {onQuickClassify && <button type="button" disabled={Boolean(pending) || taxonomyLoading} className={`sales-reference-classification ${salesFocusClass}`}
          aria-label={`调整 ${item.title} 分类与风格`} title={`${category} · ${style}，点击调整`} onClick={() => setClassifying(true)}>
          <span>{category} · {style}</span><FolderEdit size={14} aria-hidden />
        </button>}
        <SalesCardMenu title="脚本操作" label={`脚本操作 ${item.title}`}>
          <button type="button" disabled={Boolean(pending)} aria-label={`删除脚本 ${item.title}`} onClick={() => { void remove(); }} className={`is-danger ${salesGhostButtonClass}`}>
            {pending === 'delete' ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}{pending === 'delete' ? '删除中…' : '删除'}</button>
        </SalesCardMenu>
      </div>
      <div className="sales-reference-card-info sales-script-caption">
        <h3><button type="button" disabled={Boolean(pending)} title={item.title} onClick={() => onReview(item)} className={salesFocusClass}>{item.title}</button></h3>
        {item.status === 'draft' && <p>待核对</p>}
        {!item.depthVideoUrl && <p>{item.depthOperationId || item.depthTaskId ? '深度结果待查询' : item.videoUrl ? '可生成深度视频' : '仅脚本 · 可补充深度'}</p>}
      </div>
      {error && <p role="alert" className="sales-reference-card-error">{error}</p>}
      {classifying && onQuickClassify && <SalesScriptQuickClassify item={item} items={taxonomyItems} loading={taxonomyLoading}
        onManage={onManageTaxonomy} onCreateTaxonomy={onCreateTaxonomy} onSave={onQuickClassify} onClose={() => setClassifying(false)} />}
    </article>
  );
}
