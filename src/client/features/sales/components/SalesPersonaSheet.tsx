import { useEffect, useState } from 'react';
import { Download } from 'lucide-react';
import { proxyMediaUrl } from '@client/shared/api/apiClient';
import { PERSONA_ANGLES } from '../model/salesAssetViews';

async function joinLegacyAngles(urls: string[]): Promise<Blob> {
  const images = await Promise.all(urls.map(async (url) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.src = proxyMediaUrl(url);
    await image.decode();
    return image;
  }));
  const height = Math.min(2048, ...images.map((image) => image.naturalHeight));
  const widths = images.map((image) => Math.max(1, Math.round(image.naturalWidth * height / image.naturalHeight)));
  const canvas = document.createElement('canvas');
  canvas.width = widths.reduce((total, width) => total + width, 0);
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('无法合成人物视图');
  let x = 0;
  images.forEach((image, index) => {
    context.drawImage(image, x, 0, widths[index], height);
    x += widths[index];
  });
  return new Promise((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('无法合成人物视图')), 'image/png'));
}

export function SalesPersonaSheet({ views, busy }: { views: Record<string, string>; busy: boolean }) {
  const angles = PERSONA_ANGLES.map(({ id }) => views[id]);
  const legacy = !views.sheet && angles.every(Boolean) ? JSON.stringify(angles) : '';
  const [preview, setPreview] = useState({ key: '', url: '' });
  useEffect(() => {
    if (!legacy) return;
    let closed = false;
    let url = '';
    void joinLegacyAngles(JSON.parse(legacy)).then((blob) => {
      if (closed) return;
      url = URL.createObjectURL(blob);
      setPreview({ key: legacy, url });
    }).catch(() => { if (!closed) setPreview({ key: legacy, url: '' }); });
    return () => { closed = true; if (url) URL.revokeObjectURL(url); };
  }, [legacy]);
  const merged = legacy && preview.key === legacy ? preview.url : '';
  const sheet = views.sheet ? proxyMediaUrl(views.sheet) : merged;
  const url = sheet || (!legacy && views.main ? proxyMediaUrl(views.main) : '');
  const title = !sheet && url ? '人物参考图' : '人物三视图与脸部特写';
  return <section className="sales-persona-sheet" aria-label={title}>
    <header><h3>{title}</h3>{url && <a href={url} download={merged ? '人物三视图.png' : true} aria-label={`下载${title}`}><Download size={15} />下载</a>}</header>
    {url ? <a href={url} target="_blank" rel="noreferrer" aria-label={`查看${title}大图`}><img src={url} alt={title} /></a>
      : <p role="status">{busy ? '正在处理人物图片…' : legacy ? preview.key === legacy ? '已有视角图片读取失败，请重新打开。' : '正在合成已有视角…' : '生成后在这里查看完整三视图'}</p>}
  </section>;
}
