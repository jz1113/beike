import { useEffect, useRef } from 'react';
import { petFrame, PET_CELL, type PetPose, type PetSpriteVersion } from '@shared/domain/pets/atlas';

interface Props {
  src: string;
  version: PetSpriteVersion;
  pose: PetPose;
  lookIndex: number | null;
  size: number;
  paused?: boolean;
  onVersion?: (version: PetSpriteVersion) => void;
}

export function PetSprite({ src, version, pose, lookIndex, size, paused = false, onVersion }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const height = Math.round(size * PET_CELL.height / PET_CELL.width);
  const paint = (canvas: HTMLCanvasElement | null, image: HTMLImageElement | null, elapsed: number) => {
    if (!canvas || !image?.complete || !image.naturalWidth) return;
    const context = canvas.getContext('2d');
    if (!context) return;
    const cell = petFrame(pose, version, elapsed, lookIndex);
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.imageSmoothingEnabled = true;
    context.drawImage(image, cell.column * PET_CELL.width, cell.row * PET_CELL.height, PET_CELL.width, PET_CELL.height, 0, 0, canvas.width, canvas.height);
  };
  const paintRef = useRef(paint);
  paintRef.current = paint;

  useEffect(() => {
    const canvas = canvasRef.current;
    const image = new Image();
    imageRef.current = image;
    image.onload = () => {
      onVersion?.(image.naturalHeight >= 2200 ? 2 : 1);
      paintRef.current(canvas, image, 0);
    };
    image.src = src;
    return () => { image.onload = null; if (imageRef.current === image) imageRef.current = null; };
  }, [onVersion, src]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const paintAt = (elapsed: number) => paintRef.current(canvas, imageRef.current, elapsed);
    paintAt(0);
    if (paused || pose === 'look') return undefined;
    let frame = 0;
    const started = performance.now();
    const tick = (now: number) => {
      if (!document.hidden) paintAt(now - started);
      frame = window.requestAnimationFrame(tick);
    };
    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [lookIndex, paused, pose, size, src, version]);

  return <canvas ref={canvasRef} width={size} height={height} aria-hidden="true" className="pointer-events-none h-full w-full" />;
}
