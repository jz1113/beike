export type CoverFormatId = 'portrait' | 'square';

export interface CoverFormat {
  id: CoverFormatId;
  importValue: '文字竖' | '文字横';
  label: string;
  aspectRatio: '3:4' | '1:1';
  width: number;
  height: number;
}

export const COVER_FORMATS: Record<CoverFormatId, CoverFormat> = {
  portrait: {
    id: 'portrait', importValue: '文字竖', label: '文字竖 · 720 × 960',
    aspectRatio: '3:4', width: 720, height: 960,
  },
  square: {
    id: 'square', importValue: '文字横', label: '文字横 · 1440 × 1440',
    aspectRatio: '1:1', width: 1440, height: 1440,
  },
};

const PORTRAIT_ALIASES = new Set(['文字竖', '竖', '竖版', '竖图', '34', '3:4', '720x960', '720960']);
const SQUARE_ALIASES = new Set(['文字横', '横', '横版', '横图', '方', '方图', '正方形', '11', '1:1', '720x720', '720720', '1440x1440', '14401440']);

function normalize(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[\s×*]/g, '')
    .replace(/[／]/g, '/');
}

/**
 * A blank third column preserves the former two-column import behaviour.
 * A populated but unrecognised value intentionally returns undefined, so
 * batches never silently generate a portrait cover for a mistyped format.
 */
export function parseCoverFormat(value: unknown): CoverFormat | undefined {
  const normalized = normalize(value);
  if (!normalized) return COVER_FORMATS.portrait;
  if (PORTRAIT_ALIASES.has(normalized)) return COVER_FORMATS.portrait;
  if (SQUARE_ALIASES.has(normalized)) return COVER_FORMATS.square;
  return undefined;
}
