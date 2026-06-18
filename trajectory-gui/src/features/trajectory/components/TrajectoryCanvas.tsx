import { Html, OrbitControls } from "@react-three/drei";
import { Canvas, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useState } from "react";
import * as THREE from "three";
import { alignOverlayFrames, cameraYawPitchFromW2c, forwardFromYawPitch, toDisplayVec3 } from "../math.mjs";
import type { CameraOverlayFrame, CameraOverlaySet, CamerasDocument, PathPlannerDraft, TrajectoryDocument, VipeDocument } from "../types";

const PLANNER_VIEW_DEPTH = 0.75;

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
  pathPlanner: PathPlannerDraft;
  onSelectFrame: (frame: number) => void;
  onPathPlannerChange: (draft: PathPlannerDraft) => void;
  onPathPlannerPointAdd: (point: [number, number, number]) => void;
  onPathPlannerAnchorEditStart: () => void;
  onPathPlannerAnchorChange: (anchorIndex: number, point: [number, number, number]) => void;
  onPathPlannerViewTargetChange: (anchorIndex: number, target: [number, number, number]) => void;
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
  pathPlanner,
  onSelectFrame,
  onPathPlannerChange,
  onPathPlannerPointAdd,
  onPathPlannerAnchorEditStart,
  onPathPlannerAnchorChange,
  onPathPlannerViewTargetChange,
}: Props) {
  const maxFrameIndex = Math.max(0, (document?.frames.length ?? 1) - 1);

  function selectRelativeFrame(delta: number) {
    const nextFrame = Math.min(maxFrameIndex, Math.max(0, selectedFrame + delta));
    onSelectFrame(nextFrame);
    onPathPlannerChange({
      ...pathPlanner,
      selectedViewAnchor: nearestAnchorIndexForFrame(nextFrame, pathPlanner),
    });
  }

  return (
    <div className="trajectory-canvas">
      <div className="projection-controls" aria-label="경로 편집 뷰">
        <button className={pathPlanner.projection === "free" ? "active" : ""} onClick={() => onPathPlannerChange({ ...pathPlanner, projection: "free" })}>
          3D 자유
        </button>
        <button className={pathPlanner.projection === "xz" ? "active" : ""} onClick={() => onPathPlannerChange({ ...pathPlanner, projection: "xz" })}>
          Y 기준 X-Z
        </button>
        <button className={pathPlanner.projection === "zy" ? "active" : ""} onClick={() => onPathPlannerChange({ ...pathPlanner, projection: "zy" })}>
          X 기준 Z-Y
        </button>
      </div>
      {pathPlanner.viewEditMode ? (
        <div className="view-frame-controls" aria-label="시야 설정 프레임 이동">
          <button
            type="button"
            aria-label="이전 프레임"
            disabled={!document || selectedFrame <= 0}
            onClick={(event) => {
              event.stopPropagation();
              selectRelativeFrame(-1);
            }}
          >
            -
          </button>
          <span>{selectedFrame}F</span>
          <button
            type="button"
            aria-label="다음 프레임"
            disabled={!document || selectedFrame >= maxFrameIndex}
            onClick={(event) => {
              event.stopPropagation();
              selectRelativeFrame(1);
            }}
          >
            +
          </button>
        </div>
      ) : null}
      <Canvas camera={{ position: [3.5, 2.5, 4.5], fov: 45 }}>
        <FixedProjectionCamera projection={pathPlanner.projection} />
        <color attach="background" args={["#101319"]} />
        <ambientLight intensity={0.7} />
        <directionalLight position={[4, 5, 3]} intensity={1.2} />
        <DisplayGrid mode={displayAxisMode} />
        <axesHelper args={[1.2]} />
        <AxisLabels mode={displayAxisMode} yDirection={displayYDirection} />
        <PathPlannerScene
          draft={pathPlanner}
          selectedFrameCenter={document?.frames[selectedFrame]?.center ?? null}
          onChange={onPathPlannerChange}
          onPointAdd={onPathPlannerPointAdd}
          onAnchorEditStart={onPathPlannerAnchorEditStart}
          onAnchorChange={onPathPlannerAnchorChange}
          onViewTargetChange={onPathPlannerViewTargetChange}
          onSelectAnchorFrame={onSelectFrame}
          displayAxisMode={displayAxisMode}
          displayYDirection={displayYDirection}
        />
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
        <OrbitControls
          makeDefault
          enableRotate={pathPlanner.projection === "free"}
          enablePan={pathPlanner.projection === "free"}
          enableZoom
          enableDamping
        />
      </Canvas>
    </div>
  );
}

function FixedProjectionCamera({ projection }: { projection: PathPlannerDraft["projection"] }) {
  const { camera } = useThree();

  useEffect(() => {
    if (projection === "free") {
      camera.position.set(3.5, 2.5, 4.5);
      camera.up.set(0, 1, 0);
      camera.lookAt(0, 0, 0);
      camera.updateProjectionMatrix();
      return;
    }
    if (projection === "zy") {
      camera.position.set(7, 0, 0);
      camera.up.set(0, 1, 0);
    } else {
      camera.position.set(0, -7, 0);
      camera.up.set(0, 0, 1);
    }
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
  }, [camera, projection]);

  return null;
}

function PathPlannerScene({
  draft,
  selectedFrameCenter,
  onChange,
  onPointAdd,
  onAnchorEditStart,
  onAnchorChange,
  onViewTargetChange,
  onSelectAnchorFrame,
  displayAxisMode,
  displayYDirection,
}: {
  draft: PathPlannerDraft;
  selectedFrameCenter: [number, number, number] | null;
  onChange: (draft: PathPlannerDraft) => void;
  onPointAdd: (point: [number, number, number]) => void;
  onAnchorEditStart: () => void;
  onAnchorChange: (anchorIndex: number, point: [number, number, number]) => void;
  onViewTargetChange: (anchorIndex: number, target: [number, number, number]) => void;
  onSelectAnchorFrame: (frame: number) => void;
  displayAxisMode: "y-up" | "z-up";
  displayYDirection: "positive-up" | "positive-down";
}) {
  const [dragging, setDragging] = useState<number | "start" | "end" | null>(null);
  const anchors = draft.anchors.length ? draft.anchors : [draft.start, draft.end];
  const selectedViewAnchor = clampIndex(draft.selectedViewAnchor, anchors.length);
  const editProjection = draft.projection === "zy" ? "zy" : "xz";
  const displayAnchors = useMemo(
    () => anchors.map((anchor) => plannerDisplayTuple(anchor, draft.projection, displayAxisMode, displayYDirection)),
    [anchors, draft.projection, displayAxisMode, displayYDirection],
  );
  const start = displayAnchors[0] ?? ([0, 0, 0] as [number, number, number]);
  const end = displayAnchors[displayAnchors.length - 1] ?? start;
  const points = useMemo(() => displayAnchors.map((anchor) => vec3(anchor)), [displayAnchors]);
  const pathLine = useMemo(
    () =>
      new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(points),
        new THREE.LineBasicMaterial({ color: "#ffcc66" }),
      ),
    [points],
  );
  const viewFrustums = useMemo(
    () =>
      anchors.map((anchor, anchorIndex) =>
        makePlannerViewFrustum(anchor, anchorIndex, anchors, draft, displayAxisMode, displayYDirection),
      ),
    [anchors, draft, displayAxisMode, displayYDirection],
  );

  function pointFromEvent(event: { point: THREE.Vector3 }, baseAnchor = anchors[anchors.length - 1] ?? draft.start) {
    if (editProjection === "zy") {
      return [baseAnchor[0], Number((-event.point.y).toFixed(3)), Number(event.point.z.toFixed(3))] as [number, number, number];
    }
    return [Number(event.point.x.toFixed(3)), baseAnchor[1], Number(event.point.z.toFixed(3))] as [number, number, number];
  }

  function updatePoint(anchorIndex: number | "start" | "end", event: { point: THREE.Vector3; stopPropagation: () => void }) {
    event.stopPropagation();
    const resolvedIndex = anchorIndex === "start" ? 0 : anchorIndex === "end" ? anchors.length - 1 : anchorIndex;
    onAnchorChange(resolvedIndex, pointFromEvent(event, anchors[resolvedIndex]));
  }

  const planeRotation: [number, number, number] = editProjection === "zy" ? [0, Math.PI / 2, 0] : [-Math.PI / 2, 0, 0];

  return (
    <group>
      <mesh
        rotation={planeRotation}
        position={[0, 0, 0]}
        onClick={(event) => {
          event.stopPropagation();
          if (draft.viewEditMode && dragging === null) {
            onViewTargetChange(selectedViewAnchor, pointFromEvent(event, selectedFrameCenter ?? anchors[selectedViewAnchor]));
          } else if (draft.clickCreateMode && dragging === null) {
            onPointAdd(pointFromEvent(event));
          }
        }}
        onPointerMove={(event) => {
          if (dragging !== null) updatePoint(dragging, event);
        }}
        onPointerUp={(event) => {
          event.stopPropagation();
          setDragging(null);
        }}
        onPointerLeave={() => setDragging(null)}
      >
        <planeGeometry args={[8, 8]} />
        <meshBasicMaterial color="#172033" transparent opacity={0.22} side={THREE.DoubleSide} />
      </mesh>
      {viewFrustums.map((frustum) => (
        <PathPlannerViewFrustum
          key={`planner-view-${frustum.anchorIndex}`}
          geometry={frustum.geometry}
          targetPosition={frustum.targetDisplay}
          selected={frustum.anchorIndex === selectedViewAnchor}
          warning={frustum.warning}
        />
      ))}
      <primitive object={pathLine} />
      <PathPlannerPoint
        label="시작"
        color="#22c55e"
        position={start}
        selected={selectedViewAnchor === 0}
        onPointerDown={() => {
          onChange({ ...draft, selectedViewAnchor: 0 });
          onSelectAnchorFrame(0);
          if (!draft.viewEditMode) {
            onAnchorEditStart();
            setDragging("start");
          }
        }}
      />
      <PathPlannerPoint
        label="끝"
        color="#f97316"
        position={end}
        selected={selectedViewAnchor === anchors.length - 1}
        onPointerDown={() => {
          onChange({ ...draft, selectedViewAnchor: anchors.length - 1 });
          onSelectAnchorFrame(frameIndexForAnchor(anchors.length - 1, draft));
          if (!draft.viewEditMode) {
            onAnchorEditStart();
            setDragging("end");
          }
        }}
      />
      {displayAnchors.slice(1, -1).map((position, offset) => {
        const anchorIndex = offset + 1;
        return (
          <PathPlannerPoint
            key={`planner-anchor-${anchorIndex}`}
            label={`${anchorIndex * draft.frameCount + 1}F`}
            color="#ffcc66"
            position={position}
            selected={selectedViewAnchor === anchorIndex}
            onPointerDown={() => {
              onChange({ ...draft, selectedViewAnchor: anchorIndex });
              onSelectAnchorFrame(frameIndexForAnchor(anchorIndex, draft));
              if (!draft.viewEditMode) {
                onAnchorEditStart();
                setDragging(anchorIndex);
              }
            }}
          />
        );
      })}
      {displayAnchors.map((position, anchorIndex) => (
        <Html key={`planner-anchor-label-${anchorIndex}`} position={[position[0], position[1] + 0.18, position[2]]} center>
          <div className="canvas-label">{anchorIndex === 0 ? "0F" : `${anchorIndex * draft.frameCount + 1}F`}</div>
        </Html>
      ))}
      <Html position={[0, 0.08, -3.65]} center>
        <div className="canvas-label">
          {draft.projection === "zy" ? "Z-Y 경로 평면" : draft.projection === "xz" ? "X-Z 경로 평면" : "3D 자유 뷰"}
        </div>
      </Html>
    </group>
  );
}

function PathPlannerPoint({
  label,
  color,
  position,
  selected = false,
  onPointerDown,
}: {
  label: string;
  color: string;
  position: [number, number, number];
  selected?: boolean;
  onPointerDown: () => void;
}) {
  return (
    <group position={position}>
      <mesh
        onPointerDown={(event) => {
          event.stopPropagation();
          onPointerDown();
        }}
      >
        <sphereGeometry args={[selected ? 0.12 : 0.09, 24, 24]} />
        <meshStandardMaterial color={selected ? "#f8fafc" : color} emissive={color} emissiveIntensity={selected ? 0.55 : 0.25} />
      </mesh>
      <Html position={[0, 0.18, 0]} center>
        <div className="canvas-label path-point-label-hidden">{label}</div>
      </Html>
    </group>
  );
}

function PathPlannerViewFrustum({
  geometry,
  targetPosition,
  selected,
  warning,
}: {
  geometry: THREE.BufferGeometry;
  targetPosition: [number, number, number];
  selected: boolean;
  warning: boolean;
}) {
  const color = warning ? "#fb7185" : selected ? "#38bdf8" : "#8ddcff";
  return (
    <group>
      <lineSegments geometry={geometry}>
        <lineBasicMaterial color={color} transparent opacity={selected ? 0.98 : 0.58} />
      </lineSegments>
      <mesh position={targetPosition}>
        <sphereGeometry args={[selected ? 0.055 : 0.038, 16, 16]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.35} />
      </mesh>
    </group>
  );
}

function plannerDisplayTuple(
  value: [number, number, number],
  projection: PathPlannerDraft["projection"],
  mode: "y-up" | "z-up",
  yDirection: "positive-up" | "positive-down",
): [number, number, number] {
  const display = displayTuple(value, mode, yDirection);
  if (projection === "free") {
    return display;
  }
  return projection === "zy" ? [0, display[1], display[2]] : [display[0], 0, display[2]];
}

function makePlannerViewFrustum(
  anchor: [number, number, number],
  anchorIndex: number,
  anchors: [number, number, number][],
  draft: PathPlannerDraft,
  displayAxisMode: "y-up" | "z-up",
  displayYDirection: "positive-up" | "positive-down",
) {
  const forward = plannerForwardForAnchor(anchor, anchorIndex, anchors, draft);
  const target = addVec(anchor, scaleVec(forward, PLANNER_VIEW_DEPTH));
  const distance = PLANNER_VIEW_DEPTH;
  const upHint: [number, number, number] = Math.abs(forward[1]) > 0.92 ? [1, 0, 0] : [0, 1, 0];
  const right = normalizeVec(crossVec(upHint, forward));
  const up = normalizeVec(crossVec(forward, right));
  const horizontalFov = 2 * Math.atan(Math.max(1, draft.imageWidth) / (2 * Math.max(1, draft.fx)));
  const verticalFov = 2 * Math.atan(Math.max(1, draft.imageHeight) / (2 * Math.max(1, draft.fy)));
  const center = addVec(anchor, scaleVec(forward, distance));
  const halfRight = scaleVec(right, Math.tan(horizontalFov / 2) * distance);
  const halfUp = scaleVec(up, Math.tan(verticalFov / 2) * distance);
  const corners = [
    subVec(subVec(center, halfRight), halfUp),
    addVec(subVec(center, halfUp), halfRight),
    subVec(addVec(center, halfUp), halfRight),
    addVec(addVec(center, halfUp), halfRight),
  ].map((corner) => vec3(plannerDisplayTuple(corner, draft.projection, displayAxisMode, displayYDirection)));
  const origin = vec3(plannerDisplayTuple(anchor, draft.projection, displayAxisMode, displayYDirection));
  const targetDisplay = plannerDisplayTuple(target, draft.projection, displayAxisMode, displayYDirection);
  const previousForward = anchorIndex > 0 ? plannerForwardForAnchor(anchors[anchorIndex - 1], anchorIndex - 1, anchors, draft) : null;

  return {
    anchorIndex,
    targetDisplay,
    warning: previousForward ? angleBetweenDeg(previousForward, forward) >= 90 : false,
    geometry: new THREE.BufferGeometry().setFromPoints([
      origin,
      vec3(targetDisplay),
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
    ]),
  };
}

function plannerForwardForAnchor(anchor: [number, number, number], anchorIndex: number, anchors: [number, number, number][], draft: PathPlannerDraft) {
  const lookTarget = draft.lookTargets?.[anchorIndex];
  if (lookTarget && vecLength(subVec(lookTarget, anchor)) > 1e-6) {
    return normalizeVec(subVec(lookTarget, anchor));
  }
  const next = anchors[anchorIndex + 1];
  if (next && vecLength(subVec(next, anchor)) > 1e-6) {
    return normalizeVec(subVec(next, anchor));
  }
  const previous = anchors[anchorIndex - 1];
  if (previous && vecLength(subVec(anchor, previous)) > 1e-6) {
    return normalizeVec(subVec(anchor, previous));
  }
  return [0, 0, 1] as [number, number, number];
}

function angleBetweenDeg(left: [number, number, number], right: [number, number, number]) {
  const normalizedLeft = normalizeVec(left);
  const normalizedRight = normalizeVec(right);
  const dot = Math.min(1, Math.max(-1, normalizedLeft[0] * normalizedRight[0] + normalizedLeft[1] * normalizedRight[1] + normalizedLeft[2] * normalizedRight[2]));
  return (Math.acos(dot) * 180) / Math.PI;
}

function vecLength(value: [number, number, number]) {
  return Math.hypot(value[0], value[1], value[2]);
}

function clampIndex(index: number, length: number) {
  if (length <= 0) return 0;
  return Math.min(length - 1, Math.max(0, Math.round(index || 0)));
}

function nearestAnchorIndexForFrame(frameIndex: number, draft: PathPlannerDraft) {
  const frameCount = Math.max(1, Math.round(draft.frameCount || 80));
  const anchorCount = Math.max(1, draft.anchors.length || 1);
  return clampIndex(Math.round(frameIndex / frameCount), anchorCount);
}

function frameIndexForAnchor(anchorIndex: number, draft: PathPlannerDraft) {
  return Math.max(0, Math.round(anchorIndex * Math.max(1, draft.frameCount || 80)));
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
