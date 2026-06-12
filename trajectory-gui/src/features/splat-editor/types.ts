export type EditorTool = "orbit" | "pick";

export type SelectionMode = "centers";

export type SplatLoadStatus = "idle" | "loading" | "ready" | "error";

export type SplatSceneSummary = {
  fileName: string;
  splatCount: number;
  selectedCount: number;
  deletedCount: number;
  hiddenCount: number;
  lockedCount: number;
  bounds: {
    min: [number, number, number];
    max: [number, number, number];
  } | null;
  format?: string;
};

export type SplatEditorSnapshot = {
  status: SplatLoadStatus;
  error: string | null;
  activeTool: EditorTool;
  selectionMode: SelectionMode;
  scene: SplatSceneSummary | null;
};
