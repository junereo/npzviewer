export function projectPointToScreen(point, viewProjectionMatrix, viewport) {
  const [x, y, z] = point;
  const m = viewProjectionMatrix;
  const clipX = m[0] * x + m[4] * y + m[8] * z + m[12];
  const clipY = m[1] * x + m[5] * y + m[9] * z + m[13];
  const clipZ = m[2] * x + m[6] * y + m[10] * z + m[14];
  const clipW = m[3] * x + m[7] * y + m[11] * z + m[15];

  if (clipW <= 0) return null;

  const ndcX = clipX / clipW;
  const ndcY = clipY / clipW;
  const ndcZ = clipZ / clipW;

  if (ndcZ < -1 || ndcZ > 1) return null;

  return {
    x: (ndcX * 0.5 + 0.5) * viewport.width,
    y: (1 - (ndcY * 0.5 + 0.5)) * viewport.height,
    depth: ndcZ,
  };
}

export function findNearestProjectedCenter(centers, viewProjectionMatrix, viewport, pointer, maxDistancePx) {
  let best = null;
  const maxDistanceSquared = maxDistancePx * maxDistancePx;

  for (let cursor = 0; cursor + 2 < centers.length; cursor += 3) {
    const projected = projectPointToScreen([centers[cursor], centers[cursor + 1], centers[cursor + 2]], viewProjectionMatrix, viewport);
    if (!projected) continue;

    const dx = projected.x - pointer.x;
    const dy = projected.y - pointer.y;
    const distanceSquared = dx * dx + dy * dy;
    if (distanceSquared > maxDistanceSquared) continue;
    if (!best || distanceSquared < best.distanceSquared) {
      best = { index: cursor / 3, distanceSquared };
    }
  }

  return best ? { index: best.index, distancePx: Math.sqrt(best.distanceSquared) } : null;
}

export function findProjectedCentersInRect(centers, viewProjectionMatrix, viewport, rect, pred = null) {
  const left = Math.min(rect.x1, rect.x2);
  const right = Math.max(rect.x1, rect.x2);
  const top = Math.min(rect.y1, rect.y2);
  const bottom = Math.max(rect.y1, rect.y2);
  const indices = [];

  for (let cursor = 0; cursor + 2 < centers.length; cursor += 3) {
    const index = cursor / 3;
    if (pred && !pred(index)) continue;
    const projected = projectPointToScreen([centers[cursor], centers[cursor + 1], centers[cursor + 2]], viewProjectionMatrix, viewport);
    if (!projected) continue;
    if (projected.x >= left && projected.x <= right && projected.y >= top && projected.y <= bottom) {
      indices.push(index);
    }
  }

  return indices;
}
