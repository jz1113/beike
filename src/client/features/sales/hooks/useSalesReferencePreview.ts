import { useState, type CSSProperties, type SyntheticEvent } from 'react';

export function useSalesReferencePreview(source: string) {
  const [dimensions, setDimensions] = useState({ source: '', ratio: 9 / 16 });
  const ratio = dimensions.source === source ? dimensions.ratio : 9 / 16;
  const update = (width: number, height: number) => {
    if (width > 0 && height > 0) setDimensions({ source, ratio: width / height });
  };
  return {
    previewStyle: { '--sales-reference-aspect': ratio } as CSSProperties,
    onImageLoad: (event: SyntheticEvent<HTMLImageElement>) => {
      update(event.currentTarget.naturalWidth, event.currentTarget.naturalHeight);
    },
    onVideoLoadedMetadata: (event: SyntheticEvent<HTMLVideoElement>) => {
      const video = event.currentTarget;
      update(video.videoWidth, video.videoHeight);
      video.currentTime = 0.001;
    },
  };
}
