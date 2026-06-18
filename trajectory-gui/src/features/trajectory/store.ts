import { create } from "zustand";
import {
  applyTrajectoryTransform,
  cameraAxesFromW2c,
  generatePathFrames,
  normalizePathDistance,
  pathLengthMeters,
  w2cFromCenterForward,
  yawPitchFromForward,
} from "./math.mjs";
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
  updatePathPlannerLookTarget: (anchorIndex: number, target: [number, number, number]) => void;
  updateFrameCenter: (frameIndex: number, center: [number, number, number]) => void;
  updateFrameForward: (frameIndex: number, forward: [number, number, number]) => void;
  cropFrames: (frameCount: number) => void;
  updateIntrinsics: (fx: number, fy: number, cx: number, cy: number) => void;
  updateResolution: (imageWidth: number, imageHeight: number) => void;
};

const defaultTransform: TransformDraft = { scale: 1, translate: [0, 0, 0], rotateEulerDeg: [0, 0, 0] };
const defaultIntrinsics = [
  [804, 0, 640],
  [0, 804, 360],
  [0, 0, 1],
];
const defaultPoseScale = 1.1;
const defaultExpectedMeters = 3;
const defaultPathPlanner: PathPlannerDraft = {
  fps: 16,
  durationSec: 5,
  frameCount: 80,
  imageWidth: 1280,
  imageHeight: 720,
  fx: 804,
  fy: 804,
  start: [0, 0, 0],
  end: [0, 0, 3],
  anchors: [[0, 0, 0]],
  lookTargets: [null],
  viewEditMode: false,
  selectedViewAnchor: 0,
  clickCreateMode: false,
  projection: "free",
  yawDeg: 0,
  pitchDeg: 0,
  povMode: "follow-path",
  easing: "linear",
  expectedMeters: defaultExpectedMeters,
  observedMeters: defaultExpectedMeters / defaultPoseScale,
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
        lookTargets: [null],
        selectedViewAnchor: 0,
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
    const nextLookTargets = appendInheritedLookTarget(pathPlanner.lookTargets, anchors, nextAnchor);
    setTrajectoryFromAnchors(
      set,
      state,
      nextAnchors,
      {
        ...pathPlanner,
        anchors: nextAnchors,
        lookTargets: nextLookTargets,
        selectedViewAnchor: nextAnchors.length - 1,
        start: lastAnchor,
        end: nextAnchor,
        expectedMeters: pathLengthMeters(lastAnchor, nextAnchor),
      },
      { recordHistory: true, selectedFrame: frameIndexForAnchor(nextAnchors.length - 1, pathPlanner) },
    );
  },
  addPathPlannerPoint: (point) => {
    const state = get();
    const pathPlanner = state.pathPlanner;
    const anchors = pathPlanner.anchors.length ? pathPlanner.anchors : [[...pathPlanner.start] as [number, number, number]];
    const last = anchors[anchors.length - 1];
    if (Math.hypot(point[0] - last[0], point[1] - last[1], point[2] - last[2]) <= 1e-6) return;
    const nextAnchors = [...anchors, point];
    const nextLookTargets = appendInheritedLookTarget(pathPlanner.lookTargets, anchors, point);
    setTrajectoryFromAnchors(
      set,
      state,
      nextAnchors,
      {
        ...pathPlanner,
        anchors: nextAnchors,
        lookTargets: nextLookTargets,
        selectedViewAnchor: nextAnchors.length - 1,
        start: nextAnchors[Math.max(0, nextAnchors.length - 2)],
        end: point,
        clickCreateMode: true,
        expectedMeters: pathLengthMeters(nextAnchors[Math.max(0, nextAnchors.length - 2)], point),
      },
      { recordHistory: true, selectedFrame: frameIndexForAnchor(nextAnchors.length - 1, pathPlanner) },
    );
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
    const oldAnchor = anchors[anchorIndex];
    const nextAnchors = anchors.map((anchor, index) => (index === anchorIndex ? point : anchor)) as [number, number, number][];
    const lookTargets = normalizedLookTargets(pathPlanner.lookTargets, anchors.length).map((target, index) =>
      target && index === anchorIndex
        ? ([target[0] + point[0] - oldAnchor[0], target[1] + point[1] - oldAnchor[1], target[2] + point[2] - oldAnchor[2]] as [number, number, number])
        : target,
    );
    const selectedStartIndex = Math.max(0, Math.min(anchorIndex, nextAnchors.length - 2));
    const selectedEndIndex = Math.min(nextAnchors.length - 1, selectedStartIndex + 1);
    setTrajectoryFromAnchors(
      set,
      state,
      nextAnchors,
      {
        ...pathPlanner,
        anchors: nextAnchors,
        lookTargets,
        selectedViewAnchor: anchorIndex,
        start: nextAnchors[selectedStartIndex],
        end: nextAnchors[selectedEndIndex],
        expectedMeters:
          selectedStartIndex === selectedEndIndex ? 0 : pathLengthMeters(nextAnchors[selectedStartIndex], nextAnchors[selectedEndIndex]),
      },
      { selectedFrame: frameIndexForAnchor(anchorIndex, pathPlanner) },
    );
  },
  updatePathPlannerLookTarget: (anchorIndex, target) => {
    const state = get();
    const pathPlanner = state.pathPlanner;
    const anchors = pathPlanner.anchors.length ? pathPlanner.anchors : anchorsFromDocument(state.document, pathPlanner);
    if (anchorIndex < 0 || anchorIndex >= anchors.length) return;
    const lookTargets = normalizedLookTargets(pathPlanner.lookTargets, anchors.length);
    lookTargets[anchorIndex] = fixedDepthLookTarget(anchors[anchorIndex], target);
    setTrajectoryFromAnchors(
      set,
      state,
      anchors,
      {
        ...pathPlanner,
        anchors,
        lookTargets,
        selectedViewAnchor: anchorIndex,
        povMode: "manual",
      },
      { recordHistory: true, selectedFrame: frameIndexForAnchor(anchorIndex, pathPlanner) },
    );
  },
  updateFrameCenter: (frameIndex, center) => {
    const document = get().document;
    if (!document || frameIndex < 0 || frameIndex >= document.frames.length) return;
    const frames = document.frames.map((frame) => {
      if (frame.index !== frameIndex) return frame;
      const forward = cameraAxesFromW2c(frame.w2c, "plus-z").forward;
      return {
        ...frame,
        center,
        w2c: w2cFromCenterForward(center, forward),
      };
    });
    set({ document: { ...document, frames }, selectedFrame: frameIndex });
  },
  updateFrameForward: (frameIndex, forward) => {
    const document = get().document;
    if (!document || frameIndex < 0 || frameIndex >= document.frames.length) return;
    const frames = document.frames.map((frame) => {
      if (frame.index !== frameIndex) return frame;
      return {
        ...frame,
        w2c: w2cFromCenterForward(frame.center, forward),
      };
    });
    set({ document: { ...document, frames }, selectedFrame: frameIndex });
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
  updateResolution: (imageWidth, imageHeight) => {
    const document = get().document;
    if (!document) return;
    const nextWidth = Math.max(1, Math.round(imageWidth));
    const nextHeight = Math.max(1, Math.round(imageHeight));
    const cx = nextWidth / 2;
    const cy = nextHeight / 2;
    const frames = document.frames.map((frame) => {
      const fx = frame.focal.fx;
      const fy = frame.focal.fy;
      return {
        ...frame,
        focal: { fx, fy, cx, cy },
        intrinsics: [
          [fx, 0, cx],
          [0, fy, cy],
          [0, 0, 1],
        ],
      };
    });
    set({
      document: {
        ...document,
        meta: { ...document.meta, imageWidth: nextWidth, imageHeight: nextHeight },
        frames,
      },
    });
  },
}));

function cloneDefaultPathPlanner(): PathPlannerDraft {
  return {
    ...defaultPathPlanner,
    start: [...defaultPathPlanner.start],
    end: [...defaultPathPlanner.end],
    anchors: defaultPathPlanner.anchors.map((anchor) => [...anchor] as [number, number, number]),
    lookTargets: defaultPathPlanner.lookTargets.map((target) => (target ? ([...target] as [number, number, number]) : null)),
  };
}

function clonePathPlanner(pathPlanner: PathPlannerDraft): PathPlannerDraft {
  return {
    ...pathPlanner,
    start: [...pathPlanner.start],
    end: [...pathPlanner.end],
    anchors: pathPlanner.anchors.map((anchor) => [...anchor] as [number, number, number]),
    lookTargets: normalizedLookTargets(pathPlanner.lookTargets, pathPlanner.anchors.length).map((target) =>
      target ? ([...target] as [number, number, number]) : null,
    ),
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
  options: Partial<Pick<TrajectoryState, "pathUndoStack" | "pathRedoStack">> & { recordHistory?: boolean; selectedFrame?: number } = {},
) {
  const document = state.document;
  const intrinsics = intrinsicsFromPathPlanner(pathPlanner);
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
        imageWidth: Math.max(1, Math.round(pathPlanner.imageWidth || document?.meta.imageWidth || 1280)),
        imageHeight: Math.max(1, Math.round(pathPlanner.imageHeight || document?.meta.imageHeight || 720)),
        dtype: document?.meta.dtype ?? { w2c: "float32", intrinsics: "float32" },
      },
      frames,
    },
    selectedFrame: selectedFrameForOptions(options, frames.length),
    pathPlanner,
    ...historyPatch,
  });
}

function generateFramesFromAnchors(anchors: [number, number, number][], pathPlanner: PathPlannerDraft, intrinsics: number[][]): CameraFrame[] {
  if (anchors.length < 2) return [];
  const frames: CameraFrame[] = [];
  const lookTargets = normalizedLookTargets(pathPlanner.lookTargets, anchors.length);
  for (let index = 1; index < anchors.length; index += 1) {
    const lookTarget = lookTargets[index - 1];
    const direction = lookTarget ? subVec3(lookTarget, anchors[index - 1]) : null;
    const yawPitch = direction && pathLengthMeters([0, 0, 0], direction) > 1e-6 ? yawPitchFromForward(direction) : null;
    const segmentDraft = {
      ...pathPlanner,
      start: anchors[index - 1],
      end: anchors[index],
      ...(yawPitch ? { povMode: "manual" as const, yawDeg: yawPitch.yawDeg, pitchDeg: yawPitch.pitchDeg } : {}),
    };
    const segmentFrames = generatePathFrames(segmentDraft, intrinsics) as CameraFrame[];
    const framesToAppend = index === 1 ? segmentFrames : segmentFrames.slice(1);
    frames.push(...framesToAppend.map((frame, offset) => ({ ...frame, index: frames.length + offset })));
  }
  return frames;
}

function intrinsicsFromPathPlanner(pathPlanner: PathPlannerDraft) {
  const imageWidth = Math.max(1, Math.round(pathPlanner.imageWidth || 1280));
  const imageHeight = Math.max(1, Math.round(pathPlanner.imageHeight || 720));
  const fx = pathPlanner.fx > 0 ? pathPlanner.fx : defaultIntrinsics[0][0];
  const fy = pathPlanner.fy > 0 ? pathPlanner.fy : defaultIntrinsics[1][1];
  return [
    [fx, 0, imageWidth / 2],
    [0, fy, imageHeight / 2],
    [0, 0, 1],
  ];
}

function appendInheritedLookTarget(
  lookTargets: ([number, number, number] | null)[] | undefined,
  anchors: [number, number, number][],
  nextAnchor: [number, number, number],
) {
  const normalized = normalizedLookTargets(lookTargets, anchors.length);
  const lastAnchor = anchors[anchors.length - 1];
  const lastTarget = normalized[normalized.length - 1];
  const inherited = lastTarget
    ? ([nextAnchor[0] + lastTarget[0] - lastAnchor[0], nextAnchor[1] + lastTarget[1] - lastAnchor[1], nextAnchor[2] + lastTarget[2] - lastAnchor[2]] as [
        number,
        number,
        number,
      ])
    : null;
  return [...normalized, inherited];
}

function normalizedLookTargets(lookTargets: ([number, number, number] | null)[] | undefined, length: number) {
  const next = (lookTargets ?? []).slice(0, length);
  while (next.length < length) next.push(null);
  return next;
}

function subVec3(left: [number, number, number], right: [number, number, number]): [number, number, number] {
  return [left[0] - right[0], left[1] - right[1], left[2] - right[2]];
}

function fixedDepthLookTarget(anchor: [number, number, number], target: [number, number, number]): [number, number, number] {
  const direction = subVec3(target, anchor);
  const length = pathLengthMeters([0, 0, 0], direction);
  if (length <= 1e-6) return [anchor[0], anchor[1], anchor[2] + 1];
  const depth = 1;
  return [
    Number((anchor[0] + (direction[0] / length) * depth).toFixed(6)),
    Number((anchor[1] + (direction[1] / length) * depth).toFixed(6)),
    Number((anchor[2] + (direction[2] / length) * depth).toFixed(6)),
  ];
}

function frameIndexForAnchor(anchorIndex: number, pathPlanner: PathPlannerDraft) {
  return Math.max(0, Math.round(anchorIndex * Math.max(1, pathPlanner.frameCount || 80)));
}

function selectedFrameForOptions(options: { selectedFrame?: number }, frameLength: number) {
  if (frameLength <= 0) return 0;
  if (typeof options.selectedFrame === "number" && Number.isFinite(options.selectedFrame)) {
    return Math.max(0, Math.min(frameLength - 1, Math.round(options.selectedFrame)));
  }
  return Math.max(0, frameLength - 1);
}
