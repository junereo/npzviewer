import type { CameraFrame, CameraOverlayFrame, Matrix4, TransformDraft } from "./types";

export function cameraCenterFromW2c(w2c: Matrix4): [number, number, number];
export function applyTrajectoryTransform(frames: CameraFrame[], transform: TransformDraft): CameraFrame[];
export function alignOverlayFrames(
  overlayFrames: CameraOverlayFrame[],
  trajectoryFrames: CameraFrame[],
  mode: "raw" | "align-start" | "fit" | "normalize",
  axisRemap?: "none" | "flip-x" | "flip-y" | "flip-xy" | "flip-z" | { x: boolean; y: boolean; z: boolean },
): CameraOverlayFrame[];
export function applyAxisRemap(
  frames: CameraOverlayFrame[],
  axisRemap?: "none" | "flip-x" | "flip-y" | "flip-xy" | "flip-z" | { x: boolean; y: boolean; z: boolean },
): CameraOverlayFrame[];
export function fovFromIntrinsics(
  intrinsics: number[][],
  width: number,
  height: number,
): { horizontalDeg: number | null; verticalDeg: number | null };
export function cameraAxesFromW2c(
  w2c: Matrix4,
  forwardConvention?: "plus-z" | "minus-z",
): { right: [number, number, number]; up: [number, number, number]; forward: [number, number, number] };
export function cameraYawPitchFromW2c(
  w2c: Matrix4,
  forwardConvention?: "plus-z" | "minus-z",
): { yawDeg: number; pitchDeg: number };
export function yawPitchFromForward(forward: [number, number, number]): { yawDeg: number; pitchDeg: number };
export function forwardFromYawPitch(yawDeg: number, pitchDeg: number): [number, number, number];
export function describeDirection(vector: [number, number, number]): {
  horizontal: "center" | "right" | "left";
  vertical: "level" | "up" | "down";
  depth: "flat" | "forward(+Z)" | "backward(-Z)";
  dominantAxis: string;
  summary: string;
};
export function toDisplayVec3(vector: [number, number, number], displayAxisMode?: "y-up" | "z-up"): [number, number, number];
