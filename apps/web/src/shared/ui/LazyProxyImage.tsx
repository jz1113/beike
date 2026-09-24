import { useState } from 'react';
import { proxyMediaUrl } from '@/shared/api/apiClient';

interface Props extends Omit<React.ImgHTMLAttributes<HTMLImageElement>, 'src'> {
  src?: string | null;
  thumb?: boolean;
  width?: number;
}

/** 使用浏览器原生懒加载，源地址变化时独立重建加载状态。 */
export default function LazyProxyImage(props: Props) {
  return <ImageContent key={`${props.src || ''}|${props.thumb ?? true}|${props.width || ''}`} {...props} />;
}

function ImageContent({
  src,
  thumb = true,
  width,
  className = '',
  onLoad,
  onError,
  loading = 'lazy',
  ...rest
}: Props) {
  const [loaded, setLoaded] = useState(false);
  const [useFallbackDirectUrl, setUseFallbackDirectUrl] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const originalUrl = src?.startsWith('//') ? `https:${src}` : src;

  if (!src) {
    return <div className={`bg-slate-100/80 ${className}`} />;
  }

  // 默认走后端轻量 WebP 代理，若代理请求失败，立即无感降级为原始直链
  const currentImgSrc = useFallbackDirectUrl
    ? originalUrl
    : proxyMediaUrl(originalUrl, { thumb, width });

  return (
    <div className="w-full h-full relative bg-slate-100/70 overflow-hidden select-none">
      {/* 优雅低对比度骨架加载动画 */}
      {!loaded && !loadError && (
        <div className="absolute inset-0 bg-gradient-to-br from-slate-100 to-slate-200/50 animate-pulse" />
      )}

      {/* 彻底加载失败时的极简降级保底图 */}
      {loadError && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-100 text-slate-400 p-2 text-center">
          <svg className="w-6 h-6 stroke-[1.5] text-slate-300 mb-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
          </svg>
          <span className="text-[10px] text-slate-400">图片加载失败</span>
        </div>
      )}

      {!loadError && (
        <img
          {...rest}
          src={currentImgSrc || undefined}
          loading={loading}
          ref={(element) => {
            // 命中缓存时 load 事件可能早于事件绑定；以浏览器实际解码状态兜底。
            if (element?.complete && element.naturalWidth > 0) setLoaded(true);
          }}
          decoding="async"
          referrerPolicy="no-referrer"
          className={`w-full h-full object-cover transition-opacity duration-200 ${loaded ? 'opacity-100' : 'opacity-0'} ${className}`}
          onLoad={(e) => {
            setLoaded(true);
            onLoad?.(e);
          }}
          onError={(e) => {
            if (!useFallbackDirectUrl && originalUrl && currentImgSrc !== originalUrl) {
              // 代理失败，快速直连原图
              setUseFallbackDirectUrl(true);
            } else {
              // 直连原图也失败，结束加载状态并展示保底，绝不卡在骨架屏
              setLoaded(true);
              setLoadError(true);
              onError?.(e);
            }
          }}
        />
      )}
    </div>
  );
}
