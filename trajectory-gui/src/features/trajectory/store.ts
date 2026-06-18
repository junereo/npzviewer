import { create } from "zustand";
import { applyTrajectoryTransform, generatePathFrames, normalizePathDistance, pathLengthMeters } from "./math.mjs";
import type { CameraFrame, CamerasDocument, PathPlannerDraft, TrajectoryDocument, TransformDraft, VipeDocument } from "./types";

type PathPlannerHistorySnapshot = {
  pathPlanner: PathPlannerDraft;
};

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
  pathPlanner: PathPlannerDraft;
  pathUndoStack: PathPlannerHistorySnapshot[];
  pathRedoStack: PathPlannerHistorySnapshot[];
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
  setPathPlanner: (pathPlanner: PathPlannerDraft) => void;
  resetPathPlanner: () => void;
  normalizePathPlannerDistance: (targetMeters: number) => void;
  applyTransform: () => void;
  applyPathPlanner: () => void;
  appendPathPlannerSegment: () => void;
  addPathPlannerPoint: (point: [number, number, number]) => void;
  checkpointPathPlannerHistory: () => void;
  finishPathPlanner: () => void;
  undoPathPlanner: () => void;
  redoPathPlanner: () => void;
  updatePathPlannerAnchor: (anchorIndex: number, point: [number, number, number]) => void;
  cropFrames: (frameCount: number) => void;
  updateIntrinsics: (fx: number, fy: number, cx: number, cy: number) => void;
};

const defaultTransform: TransformDraft = { scale: 1, translate: [0, 0, 0], rotateEulerDeg: [0, 0, 0] };
const defaultIntrinsics = [
  [804, 0, 640],
  [0, 804, 360],
  [0, 0, 1],
];
const defaultPathPlanner: PathPlannerDraft = {
  fps: 16,
  durationSec: 5,
  frameCount: 80,
  start: [0, 0, 0],
  end: [0, 0, 3],
  anchors: [[0, 0, 0]],
  clickCreateMode: false,
  projection: "xz",
  yawDeg: 0,
  pitchDeg: 0,
  povMode: "follow-path",
  easing: "linear",
  expectedMeters: 3,
  observedMeters: 3,
};

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
  pathPlanner: cloneDefaultPathPlanner(),
  pathUndoStack: [],
  pathRedoStack: [],
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
  setPathPlanner: (pathPlanner) => set({ pathPlanner }),
  resetPathPlanner: () => {
    const state = get();
    const nextPlanner = cloneDefaultPathPlanner();
    set({ pathUndoStack: pushHistory(state.pathUndoStack, snapshotPathPlanner(state.pathPlanner)), pathRedoStack: [], pathPlanner: nextPlanner, document: null, selectedFrame: 0 });
  },
  normalizePathPlannerDistance: (targetMeters) =>
    set((state) => ({
      pathUndoStack: pushHistory(state.pathUndoStack, snapshotPathPlanner(state.pathPlanner)),
      pathRedoStack: [],
      pathPlanner: normalizePathDistance(state.pathPlanner, targetMeters),
    })),
  applyTransform: () => {
    const document = get().document;
    if (!document) return;
    const frames = applyTrajectoryTransform(document.frames, get().transform) as CameraFrame[];
    set({
      document: { ...document, frames },
      transform: defaultTransform,
    });
  },
  applyPathPlanner: () => {
    const state = get();
    const pathPlanner = state.pathPlanner;
    set({
      document: null,
      selectedFrame: 0,
      pathUndoStack: pushHistory(state.pathUndoStack, snapshotPathPlanner(pathPlanner)),
      pathRedoStack: [],
      pathPlanner: {
        ...pathPlanner,
        anchors: [[...pathPlanner.start] as [number, number, number]],
        end: [...pathPlanner.start] as [number, number, number],
        clickCreateMode: true,
      },
    });
  },
  appendPathPlannerSegment: () => {
    const state = get();
    const pathPlanner = state.pathPlanner;
    const anchors = pathPlanner.anchors.length ? pathPlanner.anchors : anchorsFromDocument(state.document, pathPlanner);
    const lastAnchor = anchors[anchors.length - 1] ?? pathPlanner.start;
    const delta = [
      pathPlanner.end[0] - pathPlanner.start[0],
      pathPlanner.end[1] - pathPlanner.start[1],
      pathPlanner.end[2] - pathPlanner.start[2],
    ] as [number, number, number];
    const fallbackDelta: [number, number, number] = [0, 0, 3];
    const nextDelta = pathLengthMeters([0, 0, 0], delta) > 1e-6 ? delta : fallbackDelta;
    const nextAnchor = [
      lastAnchor[0] + nextDelta[0],
      lastAnchor[1] + nextDelta[1],
      lastAnchor[2] + nextDelta[2],
    ] as [number, number, number];
    const nextAnchors = [...anchors, nextAnchor];
    setTrajectoryFromAnchors(set, state, nextAnchors, {
      ...pathPlanner,
      anchors: nextAnchors,
      start: lastAnchor,
      end: nextAnchor,
      expectedMeters: pathLengthMeters(lastAnchor, nextAnchor),
    }, { recordHistory: true });
  },
  addPathPlannerPoint: (point) => {
    const state = get();
    const pathPlanner = state.pathPlanner;
    const anchors = pathPlanner.anchors.length ? pathPlanner.anchors : [[...pathPlanner.start] as [number, number, number]];
    const last = anchors[anchors.length - 1];
    if (Math.hypot(point[0] - last[0], point[1] - last[1], point[2] - last[2]) <= 1e-6) return;
    const nextAnchors = [...anchors, point];
    setTrajectoryFromAnchors(set, state, nextAnchors, {
      ...pathPlanner,
      anchors: nextAnchors,
      start: nextAnchors[Math.max(0, nextAnchors.length - 2)],
      end: point,
      clickCreateMode: true,
      expectedMeters: pathLengthMeters(nextAnchors[Math.max(0, nextAnchors.length - 2)], point),
    }, { recordHistory: true });
  },
  checkpointPathPlannerHistory: () => {
    const state = get();
    set({
      pathUndoStack: pushHistory(state.pathUndoStack, snapshotPathPlanner(state.pathPlanner)),
      pathRedoStack: [],
    });
  },
  finishPathPlanner: () => {
    const state = get();
    set({
      pathPlanner: { ...state.pathPlanner, clickCreateMode: false },
    });
  },
  undoPathPlanner: () => {
    const state = get();
    const previous = state.pathUndoStack[state.pathUndoStack.length - 1];
    if (!previous) return;
    const nextUndoStack = state.pathUndoStack.slice(0, -1);
    const nextRedoStack = pushHistory(state.pathRedoStack, snapshotPathPlanner(state.pathPlanner));
    restorePathPlannerSnapshot(set, state, previous, nextUndoStack, nextRedoStack);
  },
  redoPathPlanner: () => {
    const state = get();
    const next = state.pathRedoStack[state.pathRedoStack.length - 1];
    if (!next) return;
    const nextRedoStack = state.pathRedoStack.slice(0, -1);
    const nextUndoStack = pushHistory(state.pathUndoStack, snapshotPathPlanner(state.pathPlanner));
    restorePathPlannerSnapshot(set, state, next, nextUndoStack, nextRedoStack);
  },
  updatePathPlannerAnchor: (anchorIndex, point) => {
    const state = get();
    const pathPlanner = state.pathPlanner;
    const anchors = pathPlanner.anchors.length ? pathPlanner.anchors : anchorsFromDocument(state.document, pathPlanner);
    if (anchorIndex < 0 || anchorIndex >= anchors.length) return;
    const nextAnchors = anchors.map((anchor, index) => (index === anchorIndex ? point : anchor)) as [number, number, number][];
    const selectedStartIndex = Math.max(0, Math.min(anchorIndex, nextAnchors.length - 2));
    const selectedEndIndex = Math.min(nextAnchors.length - 1, selectedStartIndex + 1);
    setTrajectoryFromAnchors(set, state, nextAnchors, {
      ...pathPlanner,
      anchors: nextAnchors,
      start: nextAnchors[selectedStartIndex],
      end: nextAnchors[selectedEndIndex],
      expectedMeters:
        selectedStartIndex === selectedEndIndex ? 0 : pathLengthMeters(nextAnchors[selectedStartIndex], nextAnchors[selectedEndIndex]),
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

function cloneDefaultPathPlanner(): PathPlannerDraft {
  return {
    ...defaultPathPlanner,
    start: [...defaultPathPlanner.start],
    end: [...defaultPathPlanner.end],
    anchors: defaultPathPlanner.anchors.map((anchor) => [...anchor] as [number, number, number]),
  };
}

function clonePathPlanner(pathPlanner: PathPlannerDraft): PathPlannerDraft {
  return {
    ...pathPlanner,
    start: [...pathPlanner.start],
    end: [...pathPlanner.end],
    anchors: pathPlanner.anchors.map((anchor) => [...anchor] as [number, number, number]),
  };
}

function snapshotPathPlanner(pathPlanner: PathPlannerDraft): PathPlannerHistorySnapshot {
  return { pathPlanner: clonePathPlanner(pathPlanner) };
}

function pushHistory(stack: PathPlannerHistorySnapshot[], snapshot: PathPlannerHistorySnapshot) {
  const last = stack[stack.length - 1];
  if (last && JSON.stringify(last.pathPlanner) === JSON.stringify(snapshot.pathPlanner)) return stack;
  return [...stack.slice(-49), snapshot];
}

function restorePathPlannerSnapshot(
  set: (partial: Partial<TrajectoryState>) => void,
  state: TrajectoryState,
  snapshot: PathPlannerHistorySnapshot,
  pathUndoStack: PathPlannerHistorySnapshot[],
  pathRedoStack: PathPlannerHistorySnapshot[],
) {
  const pathPlanner = clonePathPlanner(snapshot.pathPlanner);
  const anchors = pathPlanner.anchors;
  if (anchors.length < 2) {
    set({ document: null, selectedFrame: 0, pathPlanner, pathUndoStack, pathRedoStack });
    return;
  }
  setTrajectoryFromAnchors(set, state, anchors, pathPlanner, { pathUndoStack, pathRedoStack });
}

function anchorsFromDocument(document: TrajectoryDocument | null, pathPlanner: PathPlannerDraft): [number, number, number][] {
  if (!document?.frames.length) return pathPlanner.anchors.length ? pathPlanner.anchors : [[...pathPlanner.start] as [number, number, number]];
  const step = Math.max(2, Math.round(pathPlanner.frameCount || 80));
  const anchors: [number, number, number][] = [];
  for (let index = 0; index < document.frames.length; index += step) {
    anchors.push([...document.frames[index].center] as [number, number, number]);
  }
  const last = document.frames[document.frames.length - 1].center;
  if (!anchors.length || pathLengthMeters(anchors[anchors.length - 1], last) > 1e-6) {
    anchors.push([...last] as [number, number, number]);
  }
  return anchors;
}

function setTrajectoryFromAnchors(
  set: (partial: Partial<TrajectoryState>) => void,
  state: TrajectoryState,
  anchors: [number, number, number][],
  pathPlanner: PathPlannerDraft,
  options: Partial<Pick<TrajectoryState, "pathUndoStack" | "pathRedoStack">> & { recordHistory?: boolean } = {},
) {
  const document = state.document;
  const intrinsics = document?.frames[0]?.intrinsics ?? defaultIntrinsics;
  const frames = generateFramesFromAnchors(anchors, pathPlanner, intrinsics);
  const historyPatch = options.recordHistory
    ? {
        pathUndoStack: pushHistory(state.pathUndoStack, snapshotPathPlanner(state.pathPlanner)),
        pathRedoStack: [],
      }
    : {
        ...(options.pathUndoStack ? { pathUndoStack: options.pathUndoStack } : {}),
        ...(options.pathRedoStack ? { pathRedoStack: options.pathRedoStack } : {}),
      };
  set({
    document: {
      meta: {
        frameCount: frames.length,
        imageWidth: document?.meta.imageWidth ?? 1280,
        imageHeight: document?.meta.imageHeight ?? 720,
        dtype: document?.meta.dtype ?? { w2c: "float32", intrinsics: "float32" },
      },
      frames,
    },
    selectedFrame: Math.max(0, frames.length - 1),
    pathPlanner,
    ...historyPatch,
  });
}

function generateFramesFromAnchors(anchors: [number, number, number][], pathPlanner: PathPlannerDraft, intrinsics: number[][]): CameraFrame[] {
  if (anchors.length < 2) return [];
  const frames: CameraFrame[] = [];
  for (let index = 1; index < anchors.length; index += 1) {
    const segmentDraft = {
      ...pathPlanner,
      start: anchors[index - 1],
      end: anchors[index],
    };
    const segmentFrames = generatePathFrames(segmentDraft, intrinsics) as CameraFrame[];
    const framesToAppend = index === 1 ? segmentFrames : segmentFrames.slice(1);
    frames.push(...framesToAppend.map((frame, offset) => ({ ...frame, index: frames.length + offset })));
  }
  return frames;
}
