import { Html, OrbitControls } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { alignOverlayFrames, cameraYawPitchFromW2c, forwardFromYawPitch, toDisplayVec3 } from "../math.mjs";
import type { CameraOverlayFrame, CameraOverlaySet, CamerasDocument, TrajectoryDocument, VipeDocument } from "../types";

type Props = {
  document: TrajectoryDocument | null;
  cameras: CamerasDocument | null;
  cameraAlignmentMode: "raw" | "align-start" | "fit" | "normalize";
  cameraAxisRemap: { x: boolean; y: boolean; z: boolean };
  trajectoryForwardConvention: "plus-z" | "minus-z";
  showTrajectoryDirections: boolean;
  displayAxisMode: "y-up" | "z-up";
  displayYDirection: "positive-up" | "positive-down";
  selectedFrame: number;
  playbackFrame: number;
  vipe: VipeDocument | null;
  videoElement: HTMLVideoElement | null;
  onSelectFrame: (frame: number) => void;
};

export function TrajectoryCanvas({
  document,
  cameras,
  cameraAlignmentMode,
  cameraAxisRemap,
  trajectoryForwardConvention,
  showTrajectoryDirections,
  displayAxisMode,
  displayYDirection,
  selectedFrame,
  playbackFrame,
  vipe,
  videoElement,
  onSelectFrame,
}: Props) {
  return (
    <div className="trajectory-canvas">
      <Canvas camera={{ position: [3.5, 2.5, 4.5], fov: 45 }}>
        <color attach="background" args={["#101319"]} />
        <ambientLight intensity={0.7} />
        <directionalLight position={[4, 5, 3]} intensity={1.2} />
        <DisplayGrid mode={displayAxisMode} />
        <axesHelper args={[1.2]} />
        <AxisLabels mode={displayAxisMode} yDirection={displayYDirection} />
        {document ? (
          <TrajectoryScene
            document={document}
            selectedFrame={selectedFrame}
            forwardConvention={trajectoryForwardConvention}
            showDirections={showTrajectoryDirections}
            displayAxisMode={displayAxisMode}
            displayYDirection={displayYDirection}
            onSelectFrame={onSelectFrame}
          />
        ) : (
          <EmptyScene />
        )}
        {cameras && document ? (
          <CameraOverlay
            cameras={cameras}
            trajectory={document}
            mode={cameraAlignmentMode}
            axisRemap={cameraAxisRemap}
            displayAxisMode={displayAxisMode}
            displayYDirection={displayYDirection}
          />
        ) : null}
        <SyncedVideoFrame
          source={cameras ?? vipe}
          trajectory={document}
          mode={cameras ? cameraAlignmentMode : "raw"}
          axisRemap={cameras ? cameraAxisRemap : { x: false, y: false, z: false }}
          displayAxisMode={displayAxisMode}
          displayYDirection={displayYDirection}
          playbackFrame={playbackFrame}
          videoElement={videoElement}
        />
        <OrbitControls makeDefault enableDamping />
      </Canvas>
    </div>
  );
}

function SyncedVideoFrame({
  source,
  trajectory,
  mode,
  axisRemap,
  displayAxisMode,
  displayYDirection,
  playbackFrame,
  videoElement,
}: {
  source: CamerasDocument | VipeDocument | null;
  trajectory: TrajectoryDocument | null;
  mode: "raw" | "align-start" | "fit" | "normalize";
  axisRemap: { x: boolean; y: boolean; z: boolean };
  displayAxisMode: "y-up" | "z-up";
  displayYDirection: "positive-up" | "positive-down";
  playbackFrame: number;
  videoElement: HTMLVideoElement | null;
}) {
  const texture = useMemo(() => {
    if (!videoElement) return null;
    const nextTexture = new THREE.VideoTexture(videoElement);
    nextTexture.colorSpace = THREE.SRGBColorSpace;
    nextTexture.minFilter = THREE.LinearFilter;
    nextTexture.magFilter = THREE.LinearFilter;
    return nextTexture;
  }, [videoElement]);

  useEffect(() => {
    return () => texture?.dispose();
  }, [texture]);

  const match = useMemo(() => {
    if (!source || !videoElement) return null;
    const set = preferredSet(source.sets);
    if (!set) return null;
    const frames = trajectory ? alignOverlayFrames(set.frames, trajectory.frames, mode, axisRemap as never) : set.frames;
    const frame = nearestSourceFrame(frames, playbackFrame);
    return frame ? { set, frame } : null;
  }, [source, trajectory, mode, axisRemap, playbackFrame, videoElement]);

  const geometry = useMemo(() => {
    if (!match) return null;
    return makeVideoPlaneGeometry(match.frame, match.set, displayAxisMode, displayYDirection, videoElement);
  }, [match, displayAxisMode, displayYDirection, videoElement]);

  const frustum = useMemo(() => {
    if (!match || !geometry) return null;
    const origin = vec3(displayTuple(match.frame.center, displayAxisMode, displayYDirection));
    const positions = geometry.getAttribute("position");
    const corners = [0, 1, 2, 3].map((index) => new THREE.Vector3().fromBufferAttribute(positions, index));
    return new THREE.BufferGeometry().setFromPoints([
      origin,
      corners[0],
      origin,
      corners[1],
      origin,
      corners[2],
      origin,
      corners[3],
      corners[0],
      corners[1],
      corners[1],
      corners[3],
      corners[3],
      corners[2],
      corners[2],
      corners[0],
    ]);
  }, [match, geometry, displayAxisMode, displayYDirection]);

  if (!texture || !match || !geometry || !frustum) return null;

  return (
    <group>
      <lineSegments geometry={frustum}>
        <lineBasicMaterial color="#ffcc66" transparent opacity={0.95} />
      </lineSegments>
      <mesh geometry={geometry}>
        <meshBasicMaterial map={texture} side={THREE.DoubleSide} toneMapped={false} transparent opacity={0.94} />
      </mesh>
      <mesh position={displayTuple(match.frame.center, displayAxisMode, displayYDirection)}>
        <sphereGeometry args={[0.06, 18, 18]} />
        <meshStandardMaterial color="#ffcc66" emissive="#4a3000" />
      </mesh>
      <Html position={labelPosition(match.frame.center, displayAxisMode, displayYDirection)} center>
        <div className="canvas-label">
          video #{match.frame.sourceFrameIndex ?? match.frame.index} {match.set.label}
        </div>
      </Html>
    </group>
  );
}

function DisplayGrid({ mode }: { mode: "y-up" | "z-up" }) {
  return <gridHelper args={[6, 24, "#303746", "#202632"]} rotation={mode === "z-up" ? [Math.PI / 2, 0, 0] : [0, 0, 0]} />;
}

function AxisLabels({ mode, yDirection }: { mode: "y-up" | "z-up"; yDirection: "positive-up" | "positive-down" }) {
  const yPosition: [number, number, number] =
    mode === "z-up" ? [0, 0, yDirection === "positive-down" ? -1.35 : 1.35] : [0, yDirection === "positive-down" ? -1.35 : 1.35, 0];
  return (
    <>
      <Html position={[1.35, 0, 0]} center>
        <div className="axis-label x">X</div>
      </Html>
      <Html position={yPosition} center>
        <div className="axis-label y">Y</div>
      </Html>
      <Html position={mode === "z-up" ? [0, 0, 1.35] : [0, 0, 1.35]} center>
        <div className="axis-label z">Z</div>
      </Html>
    </>
  );
}

function CameraOverlay({
  cameras,
  trajectory,
  mode,
  axisRemap,
  displayAxisMode,
  displayYDirection,
}: {
  cameras: CamerasDocument;
  trajectory: TrajectoryDocument;
  mode: "raw" | "align-start" | "fit" | "normalize";
  axisRemap: { x: boolean; y: boolean; z: boolean };
  displayAxisMode: "y-up" | "z-up";
  displayYDirection: "positive-up" | "positive-down";
}) {
  const colors = ["#f97316", "#a78bfa", "#22c55e", "#f43f5e"];
  return (
    <>
      {cameras.sets.map((set, index) => (
        <CameraOverlaySetView
          key={set.key}
          set={set}
          trajectory={trajectory}
          mode={mode}
          axisRemap={axisRemap}
          displayAxisMode={displayAxisMode}
          displayYDirection={displayYDirection}
          color={colors[index % colors.length]}
        />
      ))}
    </>
  );
}

function CameraOverlaySetView({
  set,
  trajectory,
  mode,
  axisRemap,
  displayAxisMode,
  displayYDirection,
  color,
}: {
  set: CameraOverlaySet;
  trajectory: TrajectoryDocument;
  mode: "raw" | "align-start" | "fit" | "normalize";
  axisRemap: { x: boolean; y: boolean; z: boolean };
  displayAxisMode: "y-up" | "z-up";
  displayYDirection: "positive-up" | "positive-down";
  color: string;
}) {
  const alignedFrames = useMemo<CameraOverlayFrame[]>(
    () => alignOverlayFrames(set.frames, trajectory.frames, mode, axisRemap as never),
    [set.frames, trajectory.frames, mode, axisRemap],
  );
  const points = useMemo(
    () => alignedFrames.map((frame) => vec3(displayTuple(frame.center, displayAxisMode, displayYDirection))),
    [alignedFrames, displayAxisMode, displayYDirection],
  );
  const line = useMemo(
    () => new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.85 })),
    [color, points],
  );
  const stride = Math.max(1, Math.floor(alignedFrames.length / 36));
  const arrowLength = arrowLengthForSet(set);

  return (
    <>
      <primitive object={line} />
      {alignedFrames.map((frame) =>
        frame.index % stride === 0 ? (
          <group key={`${set.key}-${frame.index}`} position={displayTuple(frame.center, displayAxisMode, displayYDirection)}>
            <mesh>
              <boxGeometry args={[0.035, 0.035, 0.035]} />
              <meshStandardMaterial color={color} />
            </mesh>
            <arrowHelper
              args={[
                vec3(displayTuple(frame.forward, displayAxisMode, displayYDirection)).normalize(),
                new THREE.Vector3(0, 0, 0),
                arrowLength,
                color,
                arrowLength * 0.28,
                arrowLength * 0.16,
              ]}
            />
          </group>
        ) : null,
      )}
      {alignedFrames[0] ? (
        <Html position={labelPosition(alignedFrames[0].center, displayAxisMode, displayYDirection)} center>
          <div className="overlay-label" style={{ borderColor: color }}>
            {set.label}
          </div>
        </Html>
      ) : null}
    </>
  );
}

function arrowLengthForSet(set: CameraOverlaySet) {
  const fov = set.fov.horizontalDeg ?? 55;
  return Math.max(0.12, Math.min(0.32, fov / 240));
}

function TrajectoryScene({
  document,
  selectedFrame,
  forwardConvention,
  showDirections,
  displayAxisMode,
  displayYDirection,
  onSelectFrame,
}: {
  document: TrajectoryDocument;
  selectedFrame: number;
  forwardConvention: "plus-z" | "minus-z";
  showDirections: boolean;
  displayAxisMode: "y-up" | "z-up";
  displayYDirection: "positive-up" | "positive-down";
  onSelectFrame: (frame: number) => void;
}) {
  const points = useMemo(
    () => document.frames.map((frame) => vec3(displayTuple(frame.center, displayAxisMode, displayYDirection))),
    [document, displayAxisMode, displayYDirection],
  );
  const pathLine = useMemo(() => {
    const line = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(points),
      new THREE.LineBasicMaterial({ color: "#53d6ff" }),
    );
    return line;
  }, [points]);
  const selected = document.frames[selectedFrame];
  const stride = Math.max(1, Math.floor(document.frames.length / 80));

  return (
    <>
      <primitive object={pathLine} />
      {document.frames.map((frame) =>
        frame.index % stride === 0 || frame.index === selectedFrame ? (
          <mesh
            key={frame.index}
            position={displayTuple(frame.center, displayAxisMode, displayYDirection)}
            onClick={(event) => {
              event.stopPropagation();
              onSelectFrame(frame.index);
            }}
          >
            <sphereGeometry args={[frame.index === selectedFrame ? 0.045 : 0.022, 16, 16]} />
            <meshStandardMaterial color={frame.index === selectedFrame ? "#ffcc66" : "#8ddcff"} />
          </mesh>
        ) : null,
      )}
      {showDirections
        ? document.frames.map((frame) =>
            frame.index % stride === 0 || frame.index === selectedFrame ? (
              <TrajectoryDirectionArrow
                key={`dir-${frame.index}`}
                frame={frame}
                convention={forwardConvention}
                displayAxisMode={displayAxisMode}
                displayYDirection={displayYDirection}
                selected={frame.index === selectedFrame}
              />
            ) : null,
          )
        : null}
      {selected ? (
        <Html position={labelPosition(selected.center, displayAxisMode, displayYDirection)} center>
          <div className="canvas-label">#{selected.index}</div>
        </Html>
      ) : null}
    </>
  );
}

function TrajectoryDirectionArrow({
  frame,
  convention,
  displayAxisMode,
  displayYDirection,
  selected,
}: {
  frame: TrajectoryDocument["frames"][number];
  convention: "plus-z" | "minus-z";
  displayAxisMode: "y-up" | "z-up";
  displayYDirection: "positive-up" | "positive-down";
  selected: boolean;
}) {
  const yawPitch = cameraYawPitchFromW2c(frame.w2c, convention);
  const forward = forwardFromYawPitch(yawPitch.yawDeg, yawPitch.pitchDeg) as [number, number, number];
  const length = selected ? 0.34 : 0.22;
  return (
    <group position={displayTuple(frame.center, displayAxisMode, displayYDirection)}>
      <arrowHelper
        args={[
          vec3(displayTuple(forward, displayAxisMode, displayYDirection)).normalize(),
          new THREE.Vector3(0, 0, 0),
          length,
          selected ? "#ffcc66" : "#38bdf8",
          length * 0.28,
          length * 0.16,
        ]}
      />
    </group>
  );
}

function vec3(value: [number, number, number]) {
  return new THREE.Vector3(value[0], value[1], value[2]);
}

function labelPosition(center: [number, number, number], mode: "y-up" | "z-up", yDirection: "positive-up" | "positive-down") {
  const display = displayTuple(center, mode, yDirection);
  const upOffset: [number, number, number] = mode === "z-up" ? [0, 0, yDirection === "positive-down" ? -0.22 : 0.22] : [0, yDirection === "positive-down" ? -0.22 : 0.22, 0];
  return [display[0] + upOffset[0], display[1] + upOffset[1], display[2] + upOffset[2]] as [number, number, number];
}

function displayTuple(value: [number, number, number], mode: "y-up" | "z-up", yDirection: "positive-up" | "positive-down"): [number, number, number] {
  const display = toDisplayVec3(value, mode);
  if (yDirection === "positive-down") {
    return mode === "z-up" ? [display[0], display[1], -display[2]] : [display[0], -display[1], display[2]];
  }
  return [display[0], display[1], display[2]];
}

function preferredSet(sets: CameraOverlaySet[]): CameraOverlaySet | null {
  const priority = ["w2c_render", "w2c_vipe", "w2c_da3"];
  for (const key of priority) {
    const match = sets.find((set) => set.key === key);
    if (match) return match;
  }
  return sets[0] ?? null;
}

function nearestSourceFrame(frames: CameraOverlayFrame[], sourceFrame: number): CameraOverlayFrame | null {
  if (!frames.length) return null;
  let best = frames[0];
  let bestDistance = Math.abs((best.sourceFrameIndex ?? best.index) - sourceFrame);
  for (const frame of frames) {
    const distance = Math.abs((frame.sourceFrameIndex ?? frame.index) - sourceFrame);
    if (distance < bestDistance) {
      best = frame;
      bestDistance = distance;
    }
  }
  return best;
}

function makeVideoPlaneGeometry(
  frame: CameraOverlayFrame,
  set: CameraOverlaySet,
  displayAxisMode: "y-up" | "z-up",
  displayYDirection: "positive-up" | "positive-down",
  videoElement: HTMLVideoElement | null,
) {
  const forward = normalizeVec(frame.forward);
  const upHint: [number, number, number] = Math.abs(forward[1]) > 0.92 ? [1, 0, 0] : [0, 1, 0];
  const right = normalizeVec(crossVec(upHint, forward));
  const up = normalizeVec(crossVec(forward, right));

  const distance = Math.max(0.28, Math.min(0.75, (set.fov.horizontalDeg ?? 55) / 90));
  const aspect = videoElement?.videoWidth && videoElement.videoHeight ? videoElement.videoWidth / videoElement.videoHeight : 16 / 9;
  const horizontalDeg = set.fov.horizontalDeg ?? 55;
  const verticalDeg = set.fov.verticalDeg ?? (2 * Math.atan(Math.tan(degToRad(horizontalDeg) / 2) / aspect) * 180) / Math.PI;
  const width = 2 * distance * Math.tan(degToRad(horizontalDeg) / 2);
  const height = 2 * distance * Math.tan(degToRad(verticalDeg) / 2);

  const center = addVec(frame.center, scaleVec(forward, distance));
  const halfRight = scaleVec(right, width / 2);
  const halfUp = scaleVec(up, height / 2);
  const corners = [
    subVec(subVec(center, halfRight), halfUp),
    addVec(subVec(center, halfUp), halfRight),
    subVec(addVec(center, halfUp), halfRight),
    addVec(addVec(center, halfUp), halfRight),
  ].map((corner) => displayTuple(corner, displayAxisMode, displayYDirection));

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(corners.flat(), 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute([0, 1, 1, 1, 0, 0, 1, 0], 2));
  geometry.setIndex([0, 1, 2, 2, 1, 3]);
  geometry.computeVertexNormals();
  return geometry;
}

function degToRad(value: number) {
  return (value * Math.PI) / 180;
}

function normalizeVec(value: [number, number, number]): [number, number, number] {
  const length = Math.hypot(value[0], value[1], value[2]);
  if (length <= 1e-8) return [0, 0, 1];
  return [value[0] / length, value[1] / length, value[2] / length];
}

function crossVec(left: [number, number, number], right: [number, number, number]): [number, number, number] {
  return [
    left[1] * right[2] - left[2] * right[1],
    left[2] * right[0] - left[0] * right[2],
    left[0] * right[1] - left[1] * right[0],
  ];
}

function scaleVec(value: [number, number, number], scale: number): [number, number, number] {
  return [value[0] * scale, value[1] * scale, value[2] * scale];
}

function addVec(left: [number, number, number], right: [number, number, number]): [number, number, number] {
  return [left[0] + right[0], left[1] + right[1], left[2] + right[2]];
}

function subVec(left: [number, number, number], right: [number, number, number]): [number, number, number] {
  return [left[0] - right[0], left[1] - right[1], left[2] - right[2]];
}

function EmptyScene() {
  return (
    <Html center>
      <div className="canvas-empty">Open trajectory.npz</div>
    </Html>
  );
}
