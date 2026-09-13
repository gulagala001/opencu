// Locate one connected visual target instead of averaging unrelated text
// antialiasing and controls that happen to share its colour thresholds.
export function largestColorRegion(image, predicate) {
  const { width, height } = image.info, mask = new Uint8Array(width * height);
  let matching = 0, regions = 0, largest;
  for (let i = 0; i < mask.length; i++) {
    const p = i * 4;
    if (predicate(image.data[p], image.data[p + 1], image.data[p + 2], i % width)) { mask[i] = 1; matching++; }
  }
  for (let i = 0; i < mask.length; i++) {
    if (!mask[i]) continue;
    const pending = [i]; mask[i] = 0;
    let n = 0, xSum = 0, ySum = 0, left = width, top = height, right = -1, bottom = -1;
    while (pending.length) {
      const p = pending.pop(), x = p % width, y = Math.floor(p / width);
      n++; xSum += x; ySum += y;
      left = Math.min(left, x); top = Math.min(top, y); right = Math.max(right, x); bottom = Math.max(bottom, y);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
        const q = ny * width + nx;
        if (mask[q]) { mask[q] = 0; pending.push(q); }
      }
    }
    regions++;
    if (!largest || n > largest.n) largest = { n, bbox: { left, top, right, bottom }, centroid: [xSum / n, ySum / n] };
  }
  return { ...(largest ?? { n: 0, bbox: null, centroid: null }), matching, regions };
}

// A thin antialiased ring can have disconnected arcs. Its known fixture
// colour supplies the bounds, then include the original colour mask inside
// those bounds so the centroid includes every arc and its antialiasing.
export function seededColorRegion(image, predicate, color) {
  const { width, height } = image.info;
  let left = width, top = height, right = -1, bottom = -1, seeds = 0;
  for (let i = 0; i < width * height; i++) {
    const p = i * 4, x = i % width, y = Math.floor(i / width);
    if (predicate(image.data[p], image.data[p + 1], image.data[p + 2], x) && color.every((c, channel) => Math.abs(image.data[p + channel] - c) <= 16)) {
      seeds++; left = Math.min(left, x); top = Math.min(top, y); right = Math.max(right, x); bottom = Math.max(bottom, y);
    }
  }
  let n = 0, xSum = 0, ySum = 0;
  if (seeds) for (let y = Math.max(0, top - 3); y <= Math.min(height - 1, bottom + 3); y++) for (let x = Math.max(0, left - 3); x <= Math.min(width - 1, right + 3); x++) {
    const p = (y * width + x) * 4;
    if (predicate(image.data[p], image.data[p + 1], image.data[p + 2], x)) { n++; xSum += x; ySum += y; }
  }
  return { n, seeds, bbox: seeds ? { left, top, right, bottom } : null, centroid: n ? [xSum / n, ySum / n] : null };
}
