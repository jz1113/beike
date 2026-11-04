import { useState } from 'react';
import { Film, Image, Link2, Trash2 } from 'lucide-react';
import { SalesCardMenu } from './SalesCardMenu';
import { proxyMediaUrl } from '@client/shared/api/apiClient';
import type { SalesMaterialCard } from '../model/salesMaterialCatalog';
import { useSalesReferencePreview } from '../hooks/useSalesReferencePreview';
import { salesFocusClass, salesGhostButtonClass } from './salesChrome';

export function SalesActionCard({ card, disabled, onReview, onLink, onDelete }: {
  card: SalesMaterialCard; disabled?: boolean; onReview: () => void; onLink?: () => void; onDelete: () => void;
}) {
  const [failedVideo, setFailedVideo] = useState('');
  const [failedImage, setFailedImage] = useState('');
  const [activeAngle, setActiveAngle] = useState('');
  const angles = card.angleEntries && card.angleEntries.length > 1 ? card.angleEntries : [];
  const currentAngleEntry = angles.length
    ? angles.find((entry) => entry.angle === activeAngle) || angles.find((entry) => entry.isDefault) || angles[0]
    : null;
  const activeImageUrl = currentAngleEntry ? currentAngleEntry.url : card.image;
  const hasVideoPreview = Boolean(card.video && failedVideo !== card.video);
  const hasImagePreview = Boolean(activeImageUrl && failedImage !== activeImageUrl);
  const previewFailed = Boolean(card.video ? failedVideo === card.video : activeImageUrl && failedImage === activeImageUrl);
  const { previewStyle, onImageLoad, onVideoLoadedMetadata } = useSalesReferencePreview(hasVideoPreview ? card.video! : hasImagePreview ? activeImageUrl : '');

  return (
    <article className="sales-script-card sales-reference-card" style={previewStyle}>
      <div className="sales-action-card-media-wrap">
        <button type="button" className={`sales-script-card-cover ${salesFocusClass}`} onClick={onReview} aria-label={`查看素材 ${card.title}`}>
          {hasVideoPreview ? (
            <video
              key={card.video}
              muted
              playsInline
              preload="metadata"
              src={proxyMediaUrl(card.video!, { asVideo: true })}
              aria-hidden
              tabIndex={-1}
              poster={hasImagePreview ? proxyMediaUrl(activeImageUrl) : undefined}
              onLoadedMetadata={onVideoLoadedMetadata}
              onError={() => setFailedVideo(card.video!)}
            />
          ) : hasImagePreview ? (
            <img src={proxyMediaUrl(activeImageUrl)} alt={card.title} loading="lazy" onLoad={onImageLoad} onError={() => setFailedImage(activeImageUrl)} />
          ) : (
            <span className="sales-script-card-placeholder">
              {card.video ? <Film size={28} aria-hidden /> : <Image size={28} aria-hidden />}
              <span>{previewFailed ? (card.video ? '视频预览暂不可用' : '图片预览暂不可用') : '暂无预览'}</span>
              <small>点击查看素材详情</small>
            </span>
          )}
          <span className="sales-script-status is-media">{angles.length > 1 ? `${card.badge} · ${angles.length}视角` : card.badge}</span>
        </button>
        {angles.length > 1 && !hasVideoPreview && hasImagePreview ? (
          <div className="sales-action-angle-pills" role="group" aria-label="切换动作机位">
            {angles.map((entry) => (
              <button
                key={entry.angle}
                type="button"
                title={entry.label}
                aria-pressed={entry.angle === currentAngleEntry?.angle}
                onClick={(event) => {
                  event.stopPropagation();
                  setActiveAngle(entry.angle);
                }}
                className={entry.angle === currentAngleEntry?.angle ? 'is-active' : ''}
              >
                {entry.shortLabel}
              </button>
            ))}
          </div>
        ) : null}
      </div>
      {card.editable !== false && <SalesCardMenu title="素材操作" label={`素材操作 ${card.title}`}>
          <button type="button" disabled={disabled} onClick={onDelete}
            aria-label={`删除动作素材 ${card.title}`} className={`is-danger ${salesGhostButtonClass}`}><Trash2 size={13} />删除</button>
      </SalesCardMenu>}
      <div className="sales-reference-card-info">
        <h3><button type="button" title={card.title} onClick={onReview} className={salesFocusClass}>{card.title}</button></h3>
        <p>{card.video ? '独立视频 · 未关联脚本' : currentAngleEntry ? `机位：${currentAngleEntry.label}` : '独立动作图片'}</p>
      </div>
      <div className="sales-reference-card-footer">
        {onLink ? (
          <button type="button" disabled={disabled} onClick={onLink} className={salesFocusClass}>
            <Link2 size={13} />
            关联脚本
          </button>
        ) : (
          <button type="button" onClick={onReview} className={salesFocusClass}>
            查看素材
          </button>
        )}
      </div>
    </article>
  );
}
