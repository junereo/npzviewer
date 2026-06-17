export function buildAxisHistogram(centers, axis, binCount = 24) {
  const axisIndex = axisToIndex(axis);
  const range = axisRange(centers, axisIndex);
  const bins = Array.from({ length: binCount }, (_, index) => ({
    index,
    min: range.min,
    max: range.max,
    count: 0,
  }));

  if (centers.length === 0 || range.min === range.max) {
    return { axis, min: range.min, max: range.max, bins };
  }

  const width = (range.max - range.min) / binCount;
  for (let cursor = axisIndex; cursor < centers.length; cursor += 3) {
    const value = centers[cursor];
    const index = Math.min(binCount - 1, Math.max(0, Math.floor((value - range.min) / width)));
    bins[index].count += 1;
  }

  for (const bin of bins) {
    bin.min = range.min + bin.index * width;
    bin.max = bin.index === binCount - 1 ? range.max : range.min + (bin.index + 1) * width;
  }

  return { axis, min: range.min, max: range.max, bins };
}

export function indicesInAxisRange(centers, axis, min, max, pred) {
  const axisIndex = axisToIndex(axis);
  const indices = [];
  const low = Math.min(min, max);
  const high = Math.max(min, max);
  for (let cursor = axisIndex; cursor < centers.length; cursor += 3) {
    const index = Math.floor(cursor / 3);
    if (pred && !pred(index)) continue;
    const value = centers[cursor];
    if (value >= low && value <= high) indices.push(index);
  }
  return indices;
}

export function selectedBounds(centers, indices) {
  if (!indices.length) return null;
  const min = [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY];
  const max = [Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY];
  let count = 0;

  for (const index of indices) {
    const cursor = index * 3;
    if (cursor < 0 || cursor + 2 >= centers.length) continue;
    count += 1;
    for (let axis = 0; axis < 3; axis += 1) {
      const value = centers[cursor + axis];
      min[axis] = Math.min(min[axis], value);
      max[axis] = Math.max(max[axis], value);
    }
  }

  return count > 0 ? { min, max } : null;
}

function axisRange(centers, axisIndex) {
  if (centers.length === 0) return { min: 0, max: 0 };
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (let cursor = axisIndex; cursor < centers.length; cursor += 3) {
    const value = centers[cursor];
    min = Math.min(min, value);
    max = Math.max(max, value);
  }
  return { min, max };
}

function axisToIndex(axis) {
  if (axis === "x") return 0;
  if (axis === "y") return 1;
  if (axis === "z") return 2;
  throw new Error(`Unknown axis: ${axis}`);
}
