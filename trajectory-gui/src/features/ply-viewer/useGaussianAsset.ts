import { useEffect, useMemo, useState } from "react";
import { loadViewerChunk } from "../trajectory/api";
import type { ViewerJob } from "./types";

export type GaussianAsset = {
  positions: Float32Array;
  colors: Float32Array;
  opacities: Float32Array;
  averageScale: number;
  pointCount: number;
};

export function useGaussianAsset(job: ViewerJob | null) {
  const [asset, setAsset] = useState<GaussianAsset | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!job) {
        setAsset(null);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const buffers = await Promise.all(job.manifest.chunks.map((chunk) => loadViewerChunk(job.jobId, chunk.name)));
        if (cancelled) return;
        setAsset(decodeGaussianBuffers(buffers, job));
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [job]);

  return useMemo(() => ({ asset, loading, error }), [asset, loading, error]);
}

function decodeGaussianBuffers(buffers: ArrayBuffer[], job: ViewerJob): GaussianAsset {
  const stride = job.manifest.layout.floatStride;
  const pointCount = job.manifest.pointCount;
  const positions = new Float32Array(pointCount * 3);
  const colors = new Float32Array(pointCount * 3);
  const opacities = new Float32Array(pointCount);
  let scaleSum = 0;
  let cursor = 0;

  for (const buffer of buffers) {
    const floats = new Float32Array(buffer);
    const chunkPoints = Math.floor(floats.length / stride);
    for (let index = 0; index < chunkPoints; index += 1) {
      const base = index * stride;
      positions.set(floats.subarray(base, base + 3), cursor * 3);
      colors.set(floats.subarray(base + 3, base + 6), cursor * 3);
      opacities[cursor] = floats[base + 6];
      scaleSum += Math.max(floats[base + 7], floats[base + 8], floats[base + 9]);
      cursor += 1;
    }
  }

  return {
    positions,
    colors,
    opacities,
    averageScale: cursor > 0 ? scaleSum / cursor : 0.01,
    pointCount: cursor,
  };
}
