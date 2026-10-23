import { useEffect, useRef, useState } from 'react';
import { AppBackgroundLayer } from '@client/shared/media/backgrounds/AppBackgroundLayer';
import { getBackgroundCatalogItem, type AppBackgroundStyle } from '@client/shared/media/backgrounds/backgroundCatalog';
import { studioAccent, type StudioValues } from '@client/shared/media/backgrounds/studio';
import { BackgroundPreviewArt } from './BackgroundPreviewArt';

export function BackgroundLivePreview({
  style,
  isDark,
  studio,
  mode = 'thumb',
  paused = false,
}: {
  style: AppBackgroundStyle;
  isDark: boolean;
  studio?: StudioValues;
  mode?: 'thumb' | 'stage';
  paused?: boolean;
}) {
  const frameRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(mode === 'stage');
  const item = getBackgroundCatalogItem(style);
  const accent = studioAccent(style, studio) ?? (isDark ? item.darkAccent : item.lightAccent);

  useEffect(() => {
    if (mode === 'stage') {
      setVisible(true);
      return undefined;
    }
    const node = frameRef.current;
    if (!node || typeof IntersectionObserver === 'undefined') {
      setVisible(true);
      return undefined;
    }
    const observer = new IntersectionObserver(
      ([entry]) => setVisible(entry.isIntersecting),
      { rootMargin: '80px' },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [mode]);

  return (
    <div
      ref={frameRef}
      className="absolute inset-0 overflow-hidden"
      style={{ background: isDark ? '#0D0F14' : '#F6F7FA' }}
    >
      {visible && (!paused || style === 'clean') ? (
        <AppBackgroundLayer
          style={style}
          isDark={isDark}
          studio={studio}
          mode={mode}
        />
      ) : (
        <BackgroundPreviewArt style={style} isDark={isDark} accent={accent} />
      )}
    </div>
  );
}
