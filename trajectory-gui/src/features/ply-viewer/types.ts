export type ViewerManifest = {
  version: number;
  sourceName: string;
  pointCount: number;
  sourcePointCount: number;
  sampled: boolean;
  bounds: { min: [number, number, number]; max: [number, number, number] };
  layout: { format: "float32-interleaved"; floatStride: number };
  attributes: {
    position: { offset: number; itemSize: 3 };
    color: { offset: number; itemSize: 3 };
    opacity: { offset: number; itemSize: 1 };
    scale: { offset: number; itemSize: 3 };
    rotation: { offset: number; itemSize: 4 };
  };
  chunks: ViewerChunk[];
  lods: Array<{ level: number; pointCount: number; chunkNames: string[] }>;
};

export type ViewerChunk = {
  name: string;
  pointCount: number;
  byteLength: number;
  floatStride: number;
};

export type ViewerJob = {
  jobId: string;
  manifest: ViewerManifest;
};
