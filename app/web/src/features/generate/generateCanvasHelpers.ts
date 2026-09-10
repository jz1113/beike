import { getAspectRatioFromSize } from '@beike/shared/drawing';

export function getAspectRatioClass(sizeStr?: string) {
  if (!sizeStr) return 'aspect-[3/4]';
  const ratio = getAspectRatioFromSize(sizeStr);
  switch (ratio) {
    case '1:1':
      return 'aspect-square';
    case '16:9':
      return 'aspect-[16/9]';
    case '9:16':
      return 'aspect-[9/16]';
    case '4:3':
      return 'aspect-[4/3]';
    case '3:4':
      return 'aspect-[3/4]';
    case '3:2':
      return 'aspect-[3/2]';
    case '2:3':
      return 'aspect-[2/3]';
    case '4:5':
      return 'aspect-[4/5]';
    case '5:4':
      return 'aspect-[5/4]';
    case '21:9':
      return 'aspect-[21/9]';
    default:
      return 'aspect-[3/4]';
  }
}

export function getBatchGridClass(count: number) {
  if (count <= 1) return 'grid grid-cols-1 max-w-sm';
  if (count === 2) return 'grid grid-cols-2 max-w-3xl';
  if (count === 3) return 'grid grid-cols-1 sm:grid-cols-3';
  if (count === 4) return 'grid grid-cols-2 sm:grid-cols-4';
  if (count === 5) return 'grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5';
  if (count === 6) return 'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6';
  if (count === 8) return 'grid grid-cols-2 sm:grid-cols-4';
  return 'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6';
}
