import { audienceDimensions } from '@shared/domain/assets/appearanceAudience';

export interface SalesAssetCreation {
  referenceImageUrl: string;
  prompt?: string;
  imageUrl?: string;
  promptModel?: string;
  imageModel?: string;
}

export function readSalesAssetCreation(dimensions?: string): SalesAssetCreation | undefined {
  const value = audienceDimensions(audienceDimensions(dimensions).assetCreation);
  if (typeof value.referenceImageUrl !== 'string' || !value.referenceImageUrl.trim()) return undefined;
  return {
    referenceImageUrl: value.referenceImageUrl,
    ...Object.fromEntries(['prompt', 'imageUrl', 'promptModel', 'imageModel'].flatMap((key) =>
      typeof value[key] === 'string' ? [[key, value[key]]] : [])),
  };
}

export function assetCreationDimensions(dimensions: string | undefined, creation?: SalesAssetCreation): string {
  const current = audienceDimensions(dimensions);
  return JSON.stringify({ ...current, assetCreation: creation });
}

export function readSalesAssetJobId(dimensions?: string): string | undefined {
  const value = audienceDimensions(dimensions).salesAssetViewJobId;
  return typeof value === 'string' && value ? value : undefined;
}
