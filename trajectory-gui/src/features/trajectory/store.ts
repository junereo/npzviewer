import { create } from "zustand";
import { applyTrajectoryTransform } from "./math.mjs";
import type { CameraFrame, CamerasDocument, TrajectoryDocument, TransformDraft, VipeDocument } from "./types";

type TrajectoryState = {
  document: TrajectoryDocument | null;
  cameras: CamerasDocument | null;
  vipe: VipeDocument | null;
  showCameraOverlay: boolean;
  cameraAlignmentMode: "raw" | "align-start" | "fit" | "normalize";
  cameraAxisRemap: { x: boolean; y: boolean; z: boolean };
  trajectoryForwardConvention: "plus-z" | "minus-z";
  showTrajectoryDirections: boolean;
  displayAxisMode: "y-up" | "z-up";
  displayYDirection: "positive-up" | "positive-down";
  selectedFrame: number;
  transform: TransformDraft;
  setDocument: (document: TrajectoryDocument) => void;
  setCameras: (cameras: CamerasDocument) => void;
  setVipe: (vipe: VipeDocument) => void;
  setShowCameraOverlay: (show: boolean) => void;
  setCameraAlignmentMode: (mode: "raw" | "align-start" | "fit" | "normalize") => void;
  setCameraAxisRemap: (axisRemap: { x: boolean; y: boolean; z: boolean }) => void;
  setTrajectoryForwardConvention: (mode: "plus-z" | "minus-z") => void;
  setShowTrajectoryDirections: (show: boolean) => void;
  setDisplayAxisMode: (mode: "y-up" | "z-up") => void;
  setDisplayYDirection: (direction: "positive-up" | "positive-down") => void;
  selectFrame: (frame: number) => void;
  setTransform: (transform: TransformDraft) => void;
  applyTransform: () => void;
  cropFrames: (frameCount: number) => void;
  updateIntrinsics: (fx: number, fy: number, cx: number, cy: number) => void;
};

const defaultTransform: TransformDraft = { scale: 1, translate: [0, 0, 0], rotateEulerDeg: [0, 0, 0] };

export const useTrajectoryStore = create<TrajectoryState>((set, get) => ({
  document: null,
  cameras: null,
  vipe: null,
  showCameraOverlay: true,
  cameraAlignmentMode: "raw",
  cameraAxisRemap: { x: false, y: false, z: false },
  trajectoryForwardConvention: "plus-z",
  showTrajectoryDirections: true,
  displayAxisMode: "y-up",
  displayYDirection: "positive-down",
  selectedFrame: 0,
  transform: defaultTransform,
  setDocument: (document) => set({ document, selectedFrame: 0, transform: defaultTransform }),
  setCameras: (cameras) => set({ cameras, showCameraOverlay: true }),
  setVipe: (vipe) => set({ vipe }),
  setShowCameraOverlay: (showCameraOverlay) => set({ showCameraOverlay }),
  setCameraAlignmentMode: (cameraAlignmentMode) => set({ cameraAlignmentMode }),
  setCameraAxisRemap: (cameraAxisRemap) => set({ cameraAxisRemap }),
  setTrajectoryForwardConvention: (trajectoryForwardConvention) => set({ trajectoryForwardConvention }),
  setShowTrajectoryDirections: (showTrajectoryDirections) => set({ showTrajectoryDirections }),
  setDisplayAxisMode: (displayAxisMode) => set({ displayAxisMode }),
  setDisplayYDirection: (displayYDirection) => set({ displayYDirection }),
  selectFrame: (selectedFrame) => set({ selectedFrame }),
  setTransform: (transform) => set({ transform }),
  applyTransform: () => {
    const document = get().document;
    if (!document) return;
    const frames = applyTrajectoryTransform(document.frames, get().transform) as CameraFrame[];
    set({
      document: { ...document, frames },
      transform: defaultTransform,
    });
  },
  cropFrames: (frameCount) => {
    const document = get().document;
    if (!document) return;
    const frames = document.frames.slice(0, frameCount).map((frame, index) => ({ ...frame, index }));
    set({ document: { ...document, meta: { ...document.meta, frameCount: frames.length }, frames }, selectedFrame: 0 });
  },
  updateIntrinsics: (fx, fy, cx, cy) => {
    const document = get().document;
    if (!document) return;
    const frames = document.frames.map((frame) => ({
      ...frame,
      focal: { fx, fy, cx, cy },
      intrinsics: [
        [fx, 0, cx],
        [0, fy, cy],
        [0, 0, 1],
      ],
    }));
    set({ document: { ...document, frames } });
  },
}));
