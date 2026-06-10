import { Camera, Download, FileUp, Info, RotateCcw, Scissors, Wand2, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { exportTrajectory, inspectCameras, inspectTrajectory, inspectVipe } from "./features/trajectory/api";
import { TrajectoryCanvas } from "./features/trajectory/components/TrajectoryCanvas";
import { cameraAxesFromW2c, cameraYawPitchFromW2c, describeDirection, fovFromIntrinsics } from "./features/trajectory/math.mjs";
import { useTrajectoryStore } from "./features/trajectory/store";
import type { CameraFrame, DepthFrameStats } from "./features/trajectory/types";

export function App() {
  const {
    document,
    cameras,
    vipe,
    showCameraOverlay,
    cameraAlignmentMode,
    cameraAxisRemap,
    trajectoryForwardConvention,
    showTrajectoryDirections,
    displayAxisMode,
    displayYDirection,
    selectedFrame,
    selectFrame,
    setDocument,
    setCameras,
    setVipe,
    setShowCameraOverlay,
    setCameraAlignmentMode,
    setCameraAxisRemap,
    setTrajectoryForwardConvention,
    setShowTrajectoryDirections,
    setDisplayAxisMode,
    setDisplayYDirection,
    transform,
    setTransform,
    applyTransform,
    cropFrames,
    updateIntrinsics,
  } =
    useTrajectoryStore();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showStructure, setShowStructure] = useState(false);
  const [showCamerasStructure, setShowCamerasStructure] = useState(false);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoName, setVideoName] = useState<string | null>(null);
  const [videoElement, setVideoElement] = useState<HTMLVideoElement | null>(null);
  const [playbackFrame, setPlaybackFrame] = useState(0);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const selected = document?.frames[selectedFrame] as CameraFrame | undefined;
  const trajectoryFov = document?.frames[0]
    ? fovFromIntrinsics(document.frames[0].intrinsics, document.meta.imageWidth, document.meta.imageHeight)
    : null;
  const selectedAxes = selected ? cameraAxesFromW2c(selected.w2c, trajectoryForwardConvention) : null;
  const selectedYawPitch = selected ? cameraYawPitchFromW2c(selected.w2c, trajectoryForwardConvention) : null;
  const forwardDescription = selectedAxes ? describeDirection(selectedAxes.forward) : null;
  const recommendedFrames = useMemo(() => [81, 161, 241, 321, 401, 481], []);
  const fps = vipe?.fps?.[0] ?? cameras?.metadata.fps?.[0] ?? 16;
  const playbackMinFrame = useMemo(() => {
    if (vipe?.frameIds?.length) return Math.min(...vipe.frameIds);
    return 0;
  }, [vipe]);
  const playbackMaxFrame = useMemo(() => {
    if (vipe?.frameIds?.length) return Math.max(...vipe.frameIds);
    if (vipe?.sets[0]?.frames.length) return vipe.sets[0].frames.length - 1;
    if (cameras?.sets[0]?.frames.length) return cameras.sets[0].frames.length - 1;
    return document?.meta.frameCount ? document.meta.frameCount - 1 : 0;
  }, [vipe, cameras, document]);
  const playbackDuration = Number.isFinite(fps) && fps > 0 ? (playbackMaxFrame - playbackMinFrame + 1) / fps : 0;
  const matchRows = useMemo(() => buildFrameMatches(playbackFrame, cameras, vipe), [playbackFrame, cameras, vipe]);
  const currentDepthStats = useMemo(() => nearestDepthFrame(vipe?.depth?.frames ?? [], playbackFrame), [vipe, playbackFrame]);
  const setVideoNode = useCallback((element: HTMLVideoElement | null) => {
    videoRef.current = element;
    setVideoElement((current) => (current === element ? current : element));
  }, []);

  useEffect(() => {
    if (!videoRef.current || !videoUrl || !Number.isFinite(fps) || fps <= 0) return;
    const nextTime = playbackFrame / fps;
    if (Math.abs(videoRef.current.currentTime - nextTime) > 0.04) {
      videoRef.current.currentTime = nextTime;
    }
  }, [playbackFrame, fps, videoUrl]);

  useEffect(() => {
    return () => {
      if (videoUrl) URL.revokeObjectURL(videoUrl);
    };
  }, [videoUrl]);

  async function onFile(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      setDocument(await inspectTrajectory(file));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function onCamerasFile(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      setCameras(await inspectCameras(file));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function onVipeFile(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const nextVipe = await inspectVipe(file);
      setVipe(nextVipe);
      setPlaybackFrame(nextVipe.frameIds?.length ? Math.min(...nextVipe.frameIds) : 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  function onVideoFile(file: File | undefined) {
    if (!file) return;
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    setVideoUrl(URL.createObjectURL(file));
    setVideoName(file.name);
    setPlaybackFrame(vipe?.frameIds?.length ? Math.min(...vipe.frameIds) : 0);
  }

  function syncFrameFromVideo() {
    if (!videoRef.current || !Number.isFinite(fps) || fps <= 0) return;
    const nextFrame = Math.min(playbackMaxFrame, Math.max(playbackMinFrame, Math.round(videoRef.current.currentTime * fps)));
    setPlaybackFrame(nextFrame);
  }

  async function onExport() {
    if (!document) return;
    setBusy(true);
    setError(null);
    try {
      const blob = await exportTrajectory(document);
      const href = URL.createObjectURL(blob);
      const anchor = globalThis.document.createElement("a");
      anchor.href = href;
      anchor.download = "trajectory.npz";
      anchor.click();
      URL.revokeObjectURL(href);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  function applyLyraCameraToTrajectoryPreset() {
    setCameraAxisRemap({ x: false, y: true, z: true });
    setCameraAlignmentMode("raw");
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <h1>Lyra Trajectory GUI</h1>
          <p>world-to-camera pose와 intrinsics를 확인하고 Lyra-2 호환 npz로 내보냅니다.</p>
        </div>
        <div className="topbar-actions">
          <label className="button primary">
            <FileUp size={18} />
            <span>Open NPZ</span>
            <input type="file" accept=".npz" onChange={(event) => void onFile(event.target.files?.[0])} />
          </label>
          <label className="button">
            <Camera size={18} />
            <span>Open Cameras</span>
            <input type="file" accept=".npz" onChange={(event) => void onCamerasFile(event.target.files?.[0])} />
          </label>
          <label className="button">
            <Info size={18} />
            <span>Open VIPE</span>
            <input type="file" accept=".npz" onChange={(event) => void onVipeFile(event.target.files?.[0])} />
          </label>
          <label className="button">
            <FileUp size={18} />
            <span>Open Video</span>
            <input type="file" accept="video/mp4,video/*" onChange={(event) => onVideoFile(event.target.files?.[0])} />
          </label>
          <button className="button" disabled={!document || busy} onClick={() => void onExport()}>
            <Download size={18} />
            <span>Export</span>
          </button>
        </div>
      </header>

      {error ? <div className="error">{error}</div> : null}

      <section className="workspace">
        <aside className="panel left-panel">
          <div className="base-settings">
            <h2>Display</h2>
            <div className="alignment-control">
              <span>Axis mode</span>
              <div className="segmented two">
                {[
                  ["y-up", "Y-up"],
                  ["z-up", "Z-up"],
                ].map(([value, label]) => (
                  <button
                    key={value}
                    className={displayAxisMode === value ? "active" : ""}
                    onClick={() => setDisplayAxisMode(value as "y-up" | "z-up")}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div className="alignment-control">
              <span>Y direction</span>
              <div className="segmented two">
                {[
                  ["positive-down", "+Y down"],
                  ["positive-up", "+Y up"],
                ].map(([value, label]) => (
                  <button
                    key={value}
                    className={displayYDirection === value ? "active" : ""}
                    onClick={() => setDisplayYDirection(value as "positive-up" | "positive-down")}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <h2>File</h2>
          {document ? (
            <>
              <dl className="meta-list">
                <div>
                  <dt>Frames</dt>
                  <dd>{document.meta.frameCount}</dd>
                </div>
                <div>
                  <dt>Resolution</dt>
                  <dd>
                    {document.meta.imageWidth} x {document.meta.imageHeight}
                  </dd>
                </div>
                <div>
                  <dt>dtype</dt>
                  <dd>{document.meta.dtype?.w2c ?? "float32"}</dd>
                </div>
                <div>
                  <dt>Trajectory FOV</dt>
                  <dd>
                    {trajectoryFov?.horizontalDeg && trajectoryFov?.verticalDeg
                      ? `${trajectoryFov.horizontalDeg.toFixed(1)} x ${trajectoryFov.verticalDeg.toFixed(1)} deg`
                      : "n/a"}
                  </dd>
                </div>
              </dl>
              <div className="validation">
                <strong>Validation</strong>
                <span>{document.validation?.errors.length ?? 0} errors</span>
                <span>{document.validation?.warnings.length ?? 0} warnings</span>
              </div>
              <button className="button full" onClick={() => setShowStructure(true)}>
                <Info size={16} />
                Trajectory structure
              </button>
              <div className="camera-overlay-card">
                <label className="toggle-row">
                  <input
                    type="checkbox"
                    checked={showTrajectoryDirections}
                    onChange={(event) => setShowTrajectoryDirections(event.target.checked)}
                  />
                  <span>Trajectory direction arrows</span>
                </label>
                <div className="alignment-control">
                  <span>Forward convention</span>
                  <div className="segmented two">
                    {[
                      ["plus-z", "+Z"],
                      ["minus-z", "-Z"],
                    ].map(([value, label]) => (
                      <button
                        key={value}
                        className={trajectoryForwardConvention === value ? "active" : ""}
                        onClick={() => setTrajectoryForwardConvention(value as "plus-z" | "minus-z")}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              {cameras ? (
                <div className="camera-overlay-card">
                  <label className="toggle-row">
                    <input
                      type="checkbox"
                      checked={showCameraOverlay}
                      onChange={(event) => setShowCameraOverlay(event.target.checked)}
                    />
                    <span>Camera overlay</span>
                  </label>
                <div className="alignment-control">
                  <span>Axis remap</span>
                    <div className="axis-toggle-row">
                      {[
                        ["x", "Flip X"],
                        ["y", "Flip Y"],
                        ["z", "Flip Z"],
                      ].map(([axis, label]) => (
                        <button
                          key={axis}
                          className={cameraAxisRemap[axis as "x" | "y" | "z"] ? "active" : ""}
                          onClick={() =>
                            setCameraAxisRemap({
                              ...cameraAxisRemap,
                              [axis]: !cameraAxisRemap[axis as "x" | "y" | "z"],
                            })
                          }
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                    <small>
                      Active: {[cameraAxisRemap.x ? "X" : null, cameraAxisRemap.y ? "Y" : null, cameraAxisRemap.z ? "Z" : null]
                        .filter(Boolean)
                        .join(", ") || "None"}
                    </small>
                  </div>
                  <div className="camera-preset-card">
                    <strong>Recommended camera conversion</strong>
                    <span>For Lyra internal cameras: Flip Y + Flip Z, with Alignment Raw.</span>
                    <button className="button full" onClick={applyLyraCameraToTrajectoryPreset}>
                      {"Apply Lyra cameras -> trajectory"}
                    </button>
                  </div>
                  <div className="alignment-control">
                    <span>Alignment</span>
                    <div className="segmented">
                      {[
                        ["raw", "Raw"],
                        ["align-start", "Align start pose"],
                        ["fit", "Fit path"],
                        ["normalize", "Normalize"],
                      ].map(([value, label]) => (
                        <button
                          key={value}
                          className={cameraAlignmentMode === value ? "active" : ""}
                          onClick={() => setCameraAlignmentMode(value as "raw" | "align-start" | "fit" | "normalize")}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <small>{cameras.sets.length} camera sets loaded</small>
                  <div className="camera-analysis">
                    <span>cameras.npz is treated as Lyra internal reconstruction/render cameras.</span>
                  <span>Suggested axis transform: diag(1, -1, -1)</span>
                  <span>Suggested alignment: Raw, because cameras.npz is already an internal normalized/render camera set.</span>
                  <span>Use this for overlay comparison; original trajectory export is unchanged.</span>
                  </div>
                  <button className="button full" onClick={() => setShowCamerasStructure(true)}>
                    <Info size={16} />
                    Cameras structure
                  </button>
                  {cameras.sets.map((set) => (
                    <div className="overlay-set" key={set.key}>
                      <strong>{set.label}</strong>
                      <span>{set.frameCount} frames</span>
                      <span>
                        FOV{" "}
                        {set.fov.horizontalDeg && set.fov.verticalDeg
                          ? `${set.fov.horizontalDeg.toFixed(1)} x ${set.fov.verticalDeg.toFixed(1)} deg`
                          : "n/a"}
                      </span>
                    </div>
                  ))}
                </div>
              ) : null}
              <div className="frame-list">
                {document.frames.map((frame) => (
                  <button
                    key={frame.index}
                    className={frame.index === selectedFrame ? "frame-row active" : "frame-row"}
                    onClick={() => selectFrame(frame.index)}
                  >
                    <span>#{frame.index}</span>
                    <small>
                      {frame.center.map((value) => value.toFixed(2)).join(", ")}
                    </small>
                  </button>
                ))}
              </div>
            </>
          ) : (
            <div className="empty">trajectory.npz 파일을 열어 시작하세요.</div>
          )}
        </aside>

        <section className="canvas-panel">
          <TrajectoryCanvas
            document={document}
            cameras={showCameraOverlay ? cameras : null}
            cameraAlignmentMode={cameraAlignmentMode}
            cameraAxisRemap={cameraAxisRemap}
            displayAxisMode={displayAxisMode}
            displayYDirection={displayYDirection}
            trajectoryForwardConvention={trajectoryForwardConvention}
            showTrajectoryDirections={showTrajectoryDirections}
            selectedFrame={selectedFrame}
            playbackFrame={playbackFrame}
            vipe={vipe}
            videoElement={videoElement}
            onSelectFrame={selectFrame}
          />
          {document ? (
            <input
              className="scrubber"
              type="range"
              min={0}
              max={document.meta.frameCount - 1}
              value={selectedFrame}
              onChange={(event) => selectFrame(Number(event.target.value))}
            />
          ) : null}
          {(cameras || vipe || videoUrl) ? (
            <div className="timeline-editor">
              <div className="timeline-header">
                <div>
                  <strong>Frame matching</strong>
                  <span>VIPE and video playback pair, independent from trajectory selection</span>
                </div>
                <div className="timeline-stats">
                  <span>source frame {playbackFrame}</span>
                  <span>
                    range {playbackMinFrame}-{playbackMaxFrame}
                  </span>
                  <span>{formatSeconds(playbackDuration)} segment</span>
                  <span>fps {fps}</span>
                  {vipe ? <span>depth {vipe.hasDepth ? vipe.depth?.key ?? "available" : "not in npz"}</span> : null}
                </div>
              </div>
              {currentDepthStats ? (
                <div className="depth-strip">
                  <strong>metric depth frame {currentDepthStats.sourceFrameIndex}</strong>
                  <span>
                    mean {formatOptionalNumber(currentDepthStats.mean)} / median {formatOptionalNumber(currentDepthStats.median)}
                  </span>
                  <span>
                    range {formatOptionalNumber(currentDepthStats.min)}-{formatOptionalNumber(currentDepthStats.max)}
                  </span>
                  <span>
                    {currentDepthStats.width ?? "?"} x {currentDepthStats.height ?? "?"}, valid{" "}
                    {(currentDepthStats.validRatio * 100).toFixed(1)}%
                  </span>
                </div>
              ) : null}
              <div className="timeline-body">
                {videoUrl ? (
                  <div className="video-sync large">
                    <video
                      ref={setVideoNode}
                      src={videoUrl}
                      controls
                      muted
                      playsInline
                      onTimeUpdate={syncFrameFromVideo}
                      onSeeked={syncFrameFromVideo}
                    />
                    <span>{videoName} synced to source frame {playbackFrame}</span>
                  </div>
                ) : (
                  <div className="video-placeholder">Open Video to preview gs_trajectory frame sync.</div>
                )}
                <div className="match-list bottom">
                  {matchRows.map((row) => (
                    <div className="match-row" key={`${row.group}-${row.key}`}>
                      <strong>{row.label}</strong>
                      <span>frame {row.frameIndex} / source {row.sourceFrameIndex}</span>
                      <span>origin {row.originDistance.toFixed(4)} units</span>
                      <span>path {row.cumulativeDistance.toFixed(4)} units</span>
                      {row.depthStats ? (
                        <span>
                          depth mean {formatOptionalNumber(row.depthStats.mean)} / range {formatOptionalNumber(row.depthStats.min)}-
                          {formatOptionalNumber(row.depthStats.max)}
                        </span>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>
              <input
                className="playback-scrubber"
                type="range"
                min={playbackMinFrame}
                max={playbackMaxFrame}
                value={Math.min(Math.max(playbackFrame, playbackMinFrame), playbackMaxFrame)}
                onChange={(event) => setPlaybackFrame(Number(event.target.value))}
              />
            </div>
          ) : null}
        </section>

        <aside className="panel right-panel">
          <h2>Edit</h2>
          {selected ? (
            <>
              <section className="editor-section">
                <h3>Selected frame</h3>
                <div className="coordinate-grid">
                  {selected.center.map((value, index) => (
                    <label key={index}>
                      <span>{["X", "Y", "Z"][index]}</span>
                      <input value={value.toFixed(6)} readOnly />
                    </label>
                  ))}
                </div>
                {selectedAxes ? (
                  <div className="axis-readout">
                    {forwardDescription ? (
                      <div className="direction-summary">
                        <strong>Looking: {forwardDescription.summary}</strong>
                        {selectedYawPitch ? (
                          <span>
                            Yaw/Pitch: {selectedYawPitch.yawDeg.toFixed(1)}° / {selectedYawPitch.pitchDeg.toFixed(1)}°
                          </span>
                        ) : null}
                        <span>Dominant: {forwardDescription.dominantAxis}</span>
                        <span>
                          Components: {forwardDescription.horizontal}, {forwardDescription.vertical}, {forwardDescription.depth}
                        </span>
                      </div>
                    ) : null}
                    <span>forward {selectedAxes.forward.map((value) => value.toFixed(3)).join(", ")}</span>
                    <span>up {selectedAxes.up.map((value) => value.toFixed(3)).join(", ")}</span>
                    <span>right {selectedAxes.right.map((value) => value.toFixed(3)).join(", ")}</span>
                  </div>
                ) : null}
              </section>

              <section className="editor-section">
                <h3>Transform all</h3>
                <NumberField
                  label="Scale"
                  value={transform.scale}
                  onChange={(value) => setTransform({ ...transform, scale: value })}
                />
                {(["X", "Y", "Z"] as const).map((axis, index) => (
                  <NumberField
                    key={axis}
                    label={`Translate ${axis}`}
                    value={transform.translate[index]}
                    onChange={(value) => {
                      const translate = [...transform.translate] as [number, number, number];
                      translate[index] = value;
                      setTransform({ ...transform, translate });
                    }}
                  />
                ))}
                <button className="button full" onClick={applyTransform}>
                  <Wand2 size={16} />
                  Apply transform
                </button>
              </section>

              <section className="editor-section">
                <h3>Frame count</h3>
                <div className="chip-row">
                  {recommendedFrames.map((count) => (
                    <button key={count} className="chip" disabled={!document || count > document.meta.frameCount} onClick={() => cropFrames(count)}>
                      {count}
                    </button>
                  ))}
                </div>
                <button className="button full" onClick={() => cropFrames(document?.meta.frameCount ?? 0)}>
                  <Scissors size={16} />
                  Keep current
                </button>
              </section>

              <section className="editor-section">
                <h3>Intrinsics all frames</h3>
                <NumberField label="fx" value={selected.focal.fx} onChange={(fx) => updateIntrinsics(fx, selected.focal.fy, selected.focal.cx, selected.focal.cy)} />
                <NumberField label="fy" value={selected.focal.fy} onChange={(fy) => updateIntrinsics(selected.focal.fx, fy, selected.focal.cx, selected.focal.cy)} />
                <NumberField label="cx" value={selected.focal.cx} onChange={(cx) => updateIntrinsics(selected.focal.fx, selected.focal.fy, cx, selected.focal.cy)} />
                <NumberField label="cy" value={selected.focal.cy} onChange={(cy) => updateIntrinsics(selected.focal.fx, selected.focal.fy, selected.focal.cx, cy)} />
              </section>
            </>
          ) : (
            <div className="empty">NPZ를 열면 편집 패널이 활성화됩니다.</div>
          )}
          <button className="button ghost full" onClick={() => document && setDocument(document)}>
            <RotateCcw size={16} />
            Reset view state
          </button>
        </aside>
      </section>
      {document ? (
        <TrajectoryStructureModal
          open={showStructure}
          onClose={() => setShowStructure(false)}
          document={document}
          fov={trajectoryFov}
        />
      ) : null}
      {cameras ? <CamerasStructureModal open={showCamerasStructure} onClose={() => setShowCamerasStructure(false)} cameras={cameras} /> : null}
      {busy ? <div className="busy">Processing...</div> : null}
    </main>
  );
}

function CamerasStructureModal({
  open,
  onClose,
  cameras,
}: {
  open: boolean;
  onClose: () => void;
  cameras: NonNullable<ReturnType<typeof useTrajectoryStore.getState>["cameras"]>;
}) {
  if (!open) return null;
  const sample = {
    keys: cameras.keys,
    metadata: cameras.metadata,
    sets: cameras.sets.map((set) => ({
      key: set.key,
      label: set.label,
      frameCount: set.frameCount,
      intrinsicsKey: set.intrinsicsKey,
      fov: set.fov,
      firstFrame: set.frames[0]
        ? {
            center: set.frames[0].center,
            forward: set.frames[0].forward,
            w2c: set.frames[0].w2c,
          }
        : null,
    })),
  };

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Cameras structure">
      <div className="modal">
        <div className="modal-header">
          <div>
            <h2>Cameras structure</h2>
            <p>Overlay camera sets loaded from cameras.npz</p>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <div className="structure-grid">
          <div>
            <h3>Detected pose sets</h3>
            <table>
              <tbody>
                {cameras.sets.map((set) => (
                  <tr key={set.key}>
                    <td>{set.key}</td>
                    <td>
                      {set.frameCount} frames, intrinsics {set.intrinsicsKey ?? "n/a"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div>
            <h3>Interpretation</h3>
            <table>
              <tbody>
                <tr>
                  <td>w2c_*</td>
                  <td>World-to-camera matrices used as overlay paths</td>
                </tr>
                <tr>
                  <td>forward</td>
                  <td>Derived from rotation, normalized per frame</td>
                </tr>
                <tr>
                  <td>FOV</td>
                  <td>Derived from intrinsics when available</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div>
            <h3>Recommended overlay conversion</h3>
            <table>
              <tbody>
                <tr>
                  <td>Axis remap</td>
                  <td>Flip Y + Flip Z, equivalent to diag(1, -1, -1)</td>
                </tr>
                <tr>
                  <td>Alignment</td>
                  <td>Raw, because cameras.npz is already a Lyra internal reconstruction/render camera set</td>
                </tr>
                <tr>
                  <td>Meaning</td>
                  <td>Apply only the likely convention conversion without forcing position, scale, or start-pose fitting</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div>
            <h3>Unreal reference</h3>
            <table>
              <tbody>
                <tr>
                  <td>3DGS to UE</td>
                  <td>(x_ue, y_ue, z_ue) = (-z_3dgs, x_3dgs, y_3dgs)</td>
                </tr>
                <tr>
                  <td>Use with care</td>
                  <td>Final PLY/3DGS should be verified against cameras.npz, not input trajectory alone</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
        <pre className="json-preview">{JSON.stringify(sample, null, 2)}</pre>
      </div>
    </div>
  );
}

function NumberField({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return (
    <label className="number-field">
      <span>{label}</span>
      <input type="number" step="0.001" value={Number(value.toFixed(6))} onChange={(event) => onChange(Number(event.target.value))} />
    </label>
  );
}

function buildFrameMatches(
  selectedFrame: number,
  cameras: ReturnType<typeof useTrajectoryStore.getState>["cameras"],
  vipe: ReturnType<typeof useTrajectoryStore.getState>["vipe"],
) {
  const rows: Array<{
    group: string;
    key: string;
    label: string;
    frameIndex: number;
    sourceFrameIndex: number;
    originDistance: number;
    cumulativeDistance: number;
    depthStats: DepthFrameStats | null;
  }> = [];
  for (const [group, doc] of [
    ["cameras", cameras],
    ["vipe", vipe],
  ] as const) {
    if (!doc) continue;
    for (const set of doc.sets) {
      const frame = nearestSourceFrame(set.frames, selectedFrame);
      if (!frame) continue;
      rows.push({
        group,
        key: set.key,
        label: `${group}:${set.label}`,
        frameIndex: frame.index,
        sourceFrameIndex: frame.sourceFrameIndex ?? frame.index,
        originDistance: frame.originDistance ?? 0,
        cumulativeDistance: frame.cumulativeDistance ?? 0,
        depthStats: frame.depthStats ?? null,
      });
    }
  }
  return rows;
}

function nearestDepthFrame(frames: DepthFrameStats[], sourceFrame: number): DepthFrameStats | null {
  return nearestSourceFrame(frames, sourceFrame);
}

function nearestSourceFrame<T extends { sourceFrameIndex?: number; index: number }>(frames: T[], sourceFrame: number): T | null {
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

function formatOptionalNumber(value: number | null | undefined): string {
  return typeof value === "number" && Number.isFinite(value) ? value.toFixed(3) : "n/a";
}

function formatSeconds(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "0.0s";
  const minutes = Math.floor(seconds / 60);
  const rest = seconds - minutes * 60;
  return minutes > 0 ? `${minutes}m ${rest.toFixed(1)}s` : `${rest.toFixed(1)}s`;
}

function TrajectoryStructureModal({
  open,
  onClose,
  document,
  fov,
}: {
  open: boolean;
  onClose: () => void;
  document: NonNullable<ReturnType<typeof useTrajectoryStore.getState>["document"]>;
  fov: { horizontalDeg: number | null; verticalDeg: number | null } | null;
}) {
  if (!open) return null;
  const first = document.frames[0];
  const sample = {
    keys: ["w2c", "intrinsics", "image_height", "image_width"],
    shapes: {
      w2c: [document.meta.frameCount, 4, 4],
      intrinsics: [document.meta.frameCount, 3, 3],
      image_height: [],
      image_width: [],
    },
    dtype: document.meta.dtype ?? { w2c: "float32", intrinsics: "float32" },
    resolution: {
      image_width: document.meta.imageWidth,
      image_height: document.meta.imageHeight,
    },
    fov: {
      source: "intrinsics[0] + image_width/image_height",
      horizontalDeg: fov?.horizontalDeg,
      verticalDeg: fov?.verticalDeg,
    },
    firstFrame: first
      ? {
          center: first.center,
          focal: first.focal,
          w2c: first.w2c,
          intrinsics: first.intrinsics,
        }
      : null,
  };

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Trajectory structure">
      <div className="modal">
        <div className="modal-header">
          <div>
            <h2>Trajectory structure</h2>
            <p>Lyra-2 custom trajectory npz layout</p>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <div className="structure-grid">
          <div>
            <h3>Required keys</h3>
            <table>
              <tbody>
                <tr>
                  <td>w2c</td>
                  <td>N x 4 x 4 world-to-camera matrices</td>
                </tr>
                <tr>
                  <td>intrinsics</td>
                  <td>N x 3 x 3 camera intrinsics</td>
                </tr>
                <tr>
                  <td>image_height</td>
                  <td>scalar input image height</td>
                </tr>
                <tr>
                  <td>image_width</td>
                  <td>scalar input image width</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div>
            <h3>Current file</h3>
            <table>
              <tbody>
                <tr>
                  <td>frames</td>
                  <td>{document.meta.frameCount}</td>
                </tr>
                <tr>
                  <td>resolution</td>
                  <td>
                    {document.meta.imageWidth} x {document.meta.imageHeight}
                  </td>
                </tr>
                <tr>
                  <td>FOV</td>
                  <td>
                    {fov?.horizontalDeg && fov?.verticalDeg
                      ? `${fov.horizontalDeg.toFixed(2)} x ${fov.verticalDeg.toFixed(2)} deg`
                      : "n/a"}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
        <pre className="json-preview">{JSON.stringify(sample, null, 2)}</pre>
      </div>
    </div>
  );
}
