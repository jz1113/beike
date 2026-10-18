import { getAspectRatioFromSize } from '@shared/domain/media/drawing';

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

export function getSingleMediaContainerClass(sizeStr?: string) {
  const ratio = getAspectRatioFromSize(sizeStr);
  switch (ratio) {
    case '16:9':
    case '21:9':
    case '3:2':
      return 'w-[280px] sm:w-[320px] max-w-full';
    case '9:16':
      return 'w-[195px] sm:w-[210px] max-w-full';
    case '3:4':
    case '2:3':
    case '4:5':
      return 'w-[210px] sm:w-[230px] max-w-full';
    case '1:1':
    case '4:3':
    case '5:4':
    default:
      return 'w-[220px] sm:w-[240px] max-w-full';
  }
}

export function getBatchGridClass(count: number) {
  if (count <= 1) return 'grid grid-cols-1 max-w-[240px]';
  if (count === 2) return 'grid grid-cols-2 max-w-md sm:max-w-lg';
  if (count === 3) return 'grid grid-cols-1 sm:grid-cols-3 max-w-2xl';
  if (count === 4) return 'grid grid-cols-2 sm:grid-cols-4 max-w-2xl';
  if (count === 5) return 'grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 max-w-3xl';
  if (count === 6) return 'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 max-w-4xl';
  if (count === 8) return 'grid grid-cols-2 sm:grid-cols-4 max-w-3xl';
  return 'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 max-w-4xl';
}
