export type AtlasGridDensity = 'sm' | 'md' | 'lg';

export const ATLAS_GRID_GAP = 12;

const CARD_WIDTHS: Record<AtlasGridDensity, number> = {
  sm: 148,
  md: 216,
  lg: 280,
};

/** Keep cards readable when the drawer narrows, then let measured rows set their exact height. */
export function atlasGridLayout(viewportWidth: number, density: AtlasGridDensity) {
  const targetWidth = CARD_WIDTHS[density];
  const width = Number.isFinite(viewportWidth) && viewportWidth > 0 ? viewportWidth : targetWidth;
  const columns = Math.max(1, Math.floor((width + ATLAS_GRID_GAP) / (targetWidth + ATLAS_GRID_GAP)));
  const cardWidth = (width - (columns - 1) * ATLAS_GRID_GAP) / columns;
  return {
    columns,
    cardWidth,
    estimatedRowHeight: Math.ceil(cardWidth * 4 / 3 + 100 + ATLAS_GRID_GAP),
  };
}
