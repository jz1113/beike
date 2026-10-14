import { useState } from 'react';
import { ImageOff } from 'lucide-react';

interface Props {
  image: string;
  rawUrl?: string;
  alt?: string;
  load: boolean;
}

function CarouselImage({ image, rawUrl, alt, load }: Props) {
  const [retried, setRetried] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const source = retried && rawUrl ? rawUrl : image;
  return (
    <>
      {!loaded && !failed && <div className="depth-carousel__skeleton"><div className="flex h-full flex-col items-center justify-center gap-2 text-slate-500"><div className="h-5 w-5 animate-spin rounded-full border-2 border-slate-300 border-t-indigo-500" /><span className="text-xs">加载中</span></div></div>}
      <img
        className={`depth-carousel__img transition-opacity duration-300 ${loaded && !failed ? 'opacity-100' : 'opacity-0'}`}
        src={load || loaded || retried ? source : undefined}
        alt={alt || ''}
        draggable={false}
        decoding="async"
        referrerPolicy="no-referrer"
        onLoad={() => setLoaded(true)}
        onError={() => {
          if (!retried && rawUrl && rawUrl !== image) setRetried(true);
          else setFailed(true);
        }}
      />
      {failed && <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-slate-100 p-4 text-center text-slate-500" role="status"><ImageOff className="h-7 w-7" aria-hidden="true" /><span className="text-xs">图片暂时无法加载</span></div>}
    </>
  );
}

export default function DepthCarouselImage(props: Props) {
  // Source identity owns retry state; unrelated sibling additions keep existing failures stable.
  return <CarouselImage key={JSON.stringify([props.image, props.rawUrl])} {...props} />;
}
