import type { VideoSalesFashionBeat } from './types';

export function fashionBeatLabel(beat?: string): string {
  if (beat === 'lifestyle') return '生活穿搭';
  if (beat === 'accessory') return '鞋包展示';
  if (beat === 'unbox') return '开箱换装';
  return '';
}

export function isFashionBeat(value: unknown): value is VideoSalesFashionBeat {
  return value === 'unbox' || value === 'lifestyle' || value === 'accessory';
}
