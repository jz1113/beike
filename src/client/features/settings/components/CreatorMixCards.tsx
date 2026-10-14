import type { UsageSummary } from '@client/shared/utils/usageTracker';

function tokenText(value: number) {
  return value > 0 ? value.toLocaleString() : '—';
}

export function CreatorMixCards({ usageSummary }: { usageSummary: UsageSummary }) {
  const media = usageSummary.imageCount + usageSummary.videoCount;
  const imagePercent = media > 0 ? Math.round((usageSummary.imageCount / media) * 100) : 0;
  const videoPercent = media > 0 ? 100 - imagePercent : 0;
  const headline = media === 0
    ? '下一件作品，由你定义'
    : usageSummary.videoCount === 0
      ? '这一程，主要是图片'
      : usageSummary.imageCount === 0
        ? '这一程，主要是视频'
        : '图片与视频，一起构成作品';

  return (
    <div className="settings-mix">
      <section>
        <header><h3>创作配方</h3><span>灵感的两种形状</span></header>
        <strong>{headline}</strong>
        <div className="settings-mix-bar" aria-hidden="true">
          <i style={{ width: `${imagePercent}%` }} />
          <i style={{ width: `${videoPercent}%` }} />
        </div>
        <footer>
          <span><b className="is-image" />图片 {imagePercent}%</span>
          <span><b className="is-video" />视频 {videoPercent}%</span>
        </footer>
      </section>
      <section>
        <header><h3>灵感消耗</h3><span>Token</span></header>
        <div className="settings-token-split">
          <div><span>输入 · 含缓存</span><strong>{tokenText(usageSummary.promptTokens)}</strong></div>
          <div><span>输出 · 含推理</span><strong>{tokenText(usageSummary.completionTokens)}</strong></div>
        </div>
        <p>模型调用过后，会在这里留下记录。</p>
      </section>
    </div>
  );
}
