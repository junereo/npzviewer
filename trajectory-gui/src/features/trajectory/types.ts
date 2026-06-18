export type Matrix4 = number[][];
export type Matrix3 = number[][];

export type ValidationIssue = {
  code: string;
  message: string;
  frameIndex: number | null;
};

export type CameraFrame = {
  index: number;
  w2c: Matrix4;
  intrinsics: Matrix3;
  center: [number, number, number];
  focal: { fx: number; fy: number; cx: number; cy: number };
};

export type TrajectoryDocument = {
  meta: {
    frameCount: number;
    imageWidth: number;
    imageHeight: number;
    dtype?: { w2c: string; intrinsics: string };
  };
  frames: CameraFrame[];
  validation?: {
    errors: ValidationIssue[];
    warnings: ValidationIssue[];
  };
};

export type CameraOverlayFrame = {
  index: number;
  sourceFrameIndex?: number;
  center: [number, number, number];
  forward: [number, number, number];
  originDistance?: number;
  cumulativeDistance?: number;
  depthStats?: DepthFrameStats | null;
  w2c: Matrix4;
};

export type CameraOverlaySet = {
  key: string;
  label: string;
  frameCount: number;
  intrinsicsKey: string | null;
  indicesKey?: string | null;
  fov: {
    horizontalDeg: number | null;
    verticalDeg: number | null;
    width: number | null;
    height: number | null;
    source: string;
  };
  totalDistance?: number;
  endToEndDistance?: number;
  frames: CameraOverlayFrame[];
};

export type CamerasDocument = {
  keys: string[];
  sets: CameraOverlaySet[];
  metadata: {
    fps: number[] | null;
    indices_da3: number[] | null;
    indices_vipe: number[] | null;
  };
};

export type DepthFrameStats = {
  index: number;
  sourceFrameIndex: number;
  width: number | null;
  height: number | null;
  validRatio: number;
  min: number | null;
  max: number | null;
  mean: number | null;
  median: number | null;
};

export type VipeDepthSummary = {
  key: string;
  shape: number[];
  dtype: string;
  frames: DepthFrameStats[];
};

export type VipeDocument = {
  keys: string[];
  frameIds: number[] | null;
  fps: number[] | null;
  inputVideoPath: string[] | null;
  hasDepth: boolean;
  depth: VipeDepthSummary | null;
  sets: CameraOverlaySet[];
};

export type TransformDraft = {
  scale: number;
  translate: [number, number, number];
  rotateEulerDeg: [number, number, number];
};

export type PathPlannerDraft = {
  fps: number;
  durationSec: number;
  frameCount: number;
  imageWidth: number;
  imageHeight: number;
  fx: number;
  fy: number;
  start: [number, number, number];
  end: [number, number, number];
  anchors: [number, number, number][];
  lookTargets: ([number, number, number] | null)[];
  viewEditMode: boolean;
  selectedViewAnchor: number;
  clickCreateMode: boolean;
  projection: "free" | "xz" | "zy";
  yawDeg: number;
  pitchDeg: number;
  povMode: "follow-path" | "manual";
  easing: "linear" | "smoothstep";
  expectedMeters: number;
  observedMeters: number;
};
