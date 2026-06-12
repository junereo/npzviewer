import { create } from "zustand";
import type { EditorTool, SelectionMode, SplatEditorSnapshot, SplatLoadStatus, SplatSceneSummary } from "./types";

type SplatEditorStore = SplatEditorSnapshot & {
  setStatus: (status: SplatLoadStatus, error?: string | null) => void;
  setActiveTool: (tool: EditorTool) => void;
  setSelectionMode: (mode: SelectionMode) => void;
  setScene: (scene: SplatSceneSummary | null) => void;
};

export const useSplatEditorStore = create<SplatEditorStore>((set) => ({
  status: "idle",
  error: null,
  activeTool: "orbit",
  selectionMode: "centers",
  scene: null,
  setStatus: (status, error = null) => set({ status, error }),
  setActiveTool: (activeTool) => set({ activeTool }),
  setSelectionMode: (selectionMode) => set({ selectionMode }),
  setScene: (scene) => set({ scene }),
}));
