/** Remove a sliver of a neighboring panel when a row has a second, offset divider. */
export function innerDividerTrim(strip: ImageData, innerEdge: 'left' | 'right'): number {
  const { data, width, height } = strip;
  const step = Math.max(1, Math.floor(height / 64));
  const isLine = (x: number) => {
    let white = 0;
    let samples = 0;
    for (let y = 0; y < height; y += step) {
      const p = (y * width + x) * 4;
      if (Math.min(data[p], data[p + 1], data[p + 2]) >= 247) white++;
      samples++;
    }
    return white >= samples * 0.97;
  };
  let trim = 0;
  for (let x = 1; x < width - 1; x++) {
    if (!isLine(x)) continue;
    const start = x;
    while (x + 1 < width && isLine(x + 1)) x++;
    // A divider is a narrow, isolated stripe. Ignore bright walls and ambiguous layouts.
    if (start <= 2 || x >= width - 3 || x - start + 1 > 6) continue;
    if (trim) return 0;
    trim = innerEdge === 'right' ? width - start + 2 : x + 3;
  }
  return trim;
}

/** A grid without white gutters can still have a sharp scene change across both panels. */
export function findGridSceneSplit(image: ImageData, axis: 'x' | 'y'): number | undefined {
  const vertical = axis === 'x';
  const length = vertical ? image.width : image.height;
  const cross = vertical ? image.height : image.width;
  const start = Math.max(2, Math.floor(length * 0.42));
  const end = Math.min(length - 3, Math.ceil(length * 0.58));
  const scores: number[] = [];
  let peak = 0;
  let split = 0;
  for (let line = start; line <= end; line++) {
    const halves: number[][] = [[], []];
    for (let i = 0; i < 64; i++) {
      const across = Math.floor((i + 0.5) * cross / 64);
      const index = 4 * (vertical ? across * image.width + line : line * image.width + across);
      const stride = vertical ? 8 : 8 * image.width;
      let difference = 0;
      for (let c = 0; c < 3; c++) difference += Math.abs(image.data[index - stride + c] - image.data[index + stride + c]);
      halves[i < 32 ? 0 : 1].push(difference / 3);
    }
    // A furniture edge or a stripe in just one photo is insufficient.
    const score = Math.min(...halves.map(values => values.sort((a, b) => a - b)[11]));
    scores.push(score);
    if (score > peak) { peak = score; split = line; }
  }
  const background = scores.slice().sort((a, b) => a - b)[Math.floor(scores.length * 0.75)];
  if (peak < 14 || peak < background * 3 + 4) return undefined;
  // Two unrelated strong candidates are ambiguous; preserve the midpoint.
  if (scores.some((v, i) => Math.abs(start + i - split) > 8 && v > peak * 0.8)) return undefined;
  return split;
}
