export type EditorTool = "orbit" | "pick" | "box-select";

export type SelectionMode = "centers";
export type HistogramAxis = "x" | "y" | "z";

export type SplatBounds = {
  min: [number, number, number];
  max: [number, number, number];
} | null;

export type SplatHistogramBin = {
  index: number;
  min: number;
  max: number;
  count: number;
};

export type SplatHistogram = {
  axis: HistogramAxis;
  min: number;
  max: number;
  bins: SplatHistogramBin[];
};

export type SplatLoadStatus = "idle" | "loading" | "ready" | "error";

export type SplatSceneSummary = {
  fileName: string;
  splatCount: number;
  selectedCount: number;
  deletedCount: number;
  hiddenCount: number;
  lockedCount: number;
  bounds: SplatBounds;
  selectedBounds: SplatBounds;
  histogram: SplatHistogram | null;
  format?: string;
};

export type SplatEditorSnapshot = {
  status: SplatLoadStatus;
  error: string | null;
  activeTool: EditorTool;
  selectionMode: SelectionMode;
  scene: SplatSceneSummary | null;
};
