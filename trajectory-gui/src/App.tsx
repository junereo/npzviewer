import { Camera, Download, FileUp, Info, RotateCcw, Scissors, SlidersHorizontal, Wand2, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cleanPly, exportTrajectory, inspectCameras, inspectTrajectory, inspectVipe } from "./features/trajectory/api";
import { TrajectoryCanvas } from "./features/trajectory/components/TrajectoryCanvas";
import { cameraAxesFromW2c, cameraYawPitchFromW2c, describeDirection, fovFromIntrinsics } from "./features/trajectory/math.mjs";
import { useTrajectoryStore } from "./features/trajectory/store";
import type { CameraFrame, DepthFrameStats } from "./features/trajectory/types";
import type { PlyCleanOptions, PlyCleanPreset, PlyCleanStats, PlyProgressEvent } from "./features/trajectory/api";

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
  const [activeTool, setActiveTool] = useState<"trajectory" | "ply">("trajectory");
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

  if (activeTool === "ply") {
    return <PlyCleanerApp onSwitchToTrajectory={() => setActiveTool("trajectory")} />;
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <h1>Lyra Trajectory GUI</h1>
          <p>world-to-camera pose와 intrinsics를 확인하고 Lyra-2 호환 npz로 내보냅니다.</p>
        </div>
        <div className="topbar-actions">
          <button className="button" onClick={() => setActiveTool("ply")}>
            <SlidersHorizontal size={18} />
            <span>PLY Cleaner</span>
          </button>
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

const presetOptions: Record<PlyCleanPreset, Pick<PlyCleanOptions, "opacityThreshold" | "epsRatio" | "minSamples" | "minClusterRatio">> = {
  light: {
    opacityThreshold: 0.01,
    epsRatio: 0.004,
    minSamples: 8,
    minClusterRatio: 0.0005,
  },
  medium: {
    opacityThreshold: 0.02,
    epsRatio: 0.006,
    minSamples: 12,
    minClusterRatio: 0.002,
  },
  strong: {
    opacityThreshold: 0.03,
    epsRatio: 0.008,
    minSamples: 20,
    minClusterRatio: 0.005,
  },
};

const defaultPlyOptions: PlyCleanOptions = {
  preset: "light",
  opacityThreshold: presetOptions.light.opacityThreshold,
  scaleQuantile: 0.995,
  epsRatio: presetOptions.light.epsRatio,
  eps: null,
  minSamples: presetOptions.light.minSamples,
  minClusterRatio: presetOptions.light.minClusterRatio,
  enableSor: false,
  sorNeighbors: 12,
  sorStdRatio: 2,
};

function PlyCleanerApp({ onSwitchToTrajectory }: { onSwitchToTrajectory: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [options, setOptions] = useState<PlyCleanOptions>(defaultPlyOptions);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<PlyCleanStats | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [downloadName, setDownloadName] = useState("cleaned.ply");
  const [progressEvents, setProgressEvents] = useState<PlyProgressEvent[]>([]);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  useEffect(() => {
    return () => {
      if (downloadUrl) URL.revokeObjectURL(downloadUrl);
    };
  }, [downloadUrl]);

  useEffect(() => {
    if (!busy) return;
    const started = Date.now();
    const timer = window.setInterval(() => {
      setElapsedSeconds((Date.now() - started) / 1000);
    }, 500);
    return () => window.clearInterval(timer);
  }, [busy]);

  function updatePreset(preset: PlyCleanPreset) {
    setOptions((current) => ({
      ...current,
      preset,
      ...presetOptions[preset],
    }));
  }

  async function runCleaner() {
    if (!file) return;
    setBusy(true);
    setError(null);
    setElapsedSeconds(0);
    setProgressEvents([
      {
        jobId: "local",
        phase: "waiting",
        message: "Starting cleaner.",
        startedAt: Date.now(),
        updatedAt: Date.now(),
      },
    ]);
    try {
      const nextName = cleanedFileName(file.name);
      const result = await cleanPly(file, options, nextName, (event) => {
        setProgressEvents((current) => [...current.slice(-11), event]);
      });
      if (downloadUrl) URL.revokeObjectURL(downloadUrl);
      setDownloadName(nextName);
      setStats(result.stats);
      if (result.blob) {
        const nextUrl = URL.createObjectURL(result.blob);
        setDownloadUrl(nextUrl);
        const anchor = globalThis.document.createElement("a");
        anchor.href = nextUrl;
        anchor.download = nextName;
        anchor.click();
      } else {
        setDownloadUrl(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  const removedPoints = stats ? stats.inputPoints - stats.outputPoints : 0;
  const removedPercent = stats && stats.inputPoints > 0 ? (removedPoints / stats.inputPoints) * 100 : 0;
  const latestProgress = progressEvents.at(-1) ?? null;
  const progressPercent = latestProgress ? progressEventPercent(latestProgress) : null;
  const latestPointProgress = progressEvents
    .slice()
    .reverse()
    .find((event) => typeof event.inputPoints === "number" && typeof event.outputPoints === "number");
  const liveInputPoints = latestPointProgress?.inputPoints ?? stats?.inputPoints ?? null;
  const liveOutputPoints = latestPointProgress?.outputPoints ?? stats?.outputPoints ?? null;
  const liveRemovedPoints =
    latestPointProgress?.removedPoints ?? (liveInputPoints !== null && liveOutputPoints !== null ? liveInputPoints - liveOutputPoints : null);
  const liveRemovedRatio = liveInputPoints && liveRemovedPoints !== null ? liveRemovedPoints / liveInputPoints : 0;

  return (
    <main className="app-shell ply-shell">
      <header className="topbar">
        <div>
          <h1>Lyra PLY Cleaner</h1>
          <p>Lyra 2.0 / 3DGS PLY를 업로드하고 outlier Gaussian을 제거한 PLY를 저장합니다.</p>
        </div>
        <div className="topbar-actions">
          <button className="button" onClick={onSwitchToTrajectory}>
            <Camera size={18} />
            <span>Trajectory GUI</span>
          </button>
          <label className="button primary">
            <FileUp size={18} />
            <span>Open PLY</span>
            <input
              type="file"
              accept=".ply"
              onChange={(event) => {
                const nextFile = event.target.files?.[0] ?? null;
                setFile(nextFile);
                setStats(null);
                if (downloadUrl) {
                  URL.revokeObjectURL(downloadUrl);
                  setDownloadUrl(null);
                }
              }}
            />
          </label>
          <button className="button" disabled={!file || busy} onClick={() => void runCleaner()}>
            <Wand2 size={18} />
            <span>{busy ? "Cleaning..." : "Clean PLY"}</span>
          </button>
          <a className={downloadUrl ? "button" : "button disabled-link"} href={downloadUrl ?? undefined} download={downloadName}>
            <Download size={18} />
            <span>Download</span>
          </a>
        </div>
      </header>

      {error ? <div className="error">{error}</div> : null}
      {busy ? <div className="busy">Processing PLY...</div> : null}

      <section className="ply-workspace">
        <aside className="panel ply-options-panel">
          <h2>Cleaner Settings</h2>
          <div className="alignment-control">
            <span>Preset</span>
            <div className="segmented">
              {(["light", "medium", "strong"] as const).map((preset) => (
                <button key={preset} className={options.preset === preset ? "active" : ""} onClick={() => updatePreset(preset)}>
                  {preset}
                </button>
              ))}
            </div>
          </div>

          <section className="editor-section">
            <h3>Opacity and scale</h3>
            <NumberField
              label="Opacity threshold"
              value={options.opacityThreshold}
              onChange={(opacityThreshold) => setOptions((current) => ({ ...current, opacityThreshold }))}
            />
            <NumberField
              label="Scale quantile"
              value={options.scaleQuantile}
              onChange={(scaleQuantile) => setOptions((current) => ({ ...current, scaleQuantile }))}
            />
          </section>

          <section className="editor-section">
            <h3>DBSCAN</h3>
            <NumberField label="EPS ratio" value={options.epsRatio} onChange={(epsRatio) => setOptions((current) => ({ ...current, epsRatio }))} />
            <NumberField
              label="Absolute EPS"
              value={options.eps ?? 0}
              onChange={(eps) => setOptions((current) => ({ ...current, eps: eps > 0 ? eps : null }))}
            />
            <NumberField
              label="Min samples"
              value={options.minSamples}
              onChange={(minSamples) => setOptions((current) => ({ ...current, minSamples }))}
            />
            <NumberField
              label="Min cluster ratio"
              value={options.minClusterRatio}
              onChange={(minClusterRatio) => setOptions((current) => ({ ...current, minClusterRatio }))}
            />
          </section>

            <section className="editor-section">
              <h3>Statistical outlier removal</h3>
              <div className="camera-analysis">
                <span>Large files use fast voxel cluster filtering after opacity/scale. Enable SOR only for smaller test PLY files.</span>
              </div>
              <label className="toggle-row">
              <input
                type="checkbox"
                checked={options.enableSor}
                onChange={(event) => setOptions((current) => ({ ...current, enableSor: event.target.checked }))}
              />
              <span>Enable SOR</span>
            </label>
            <NumberField
              label="SOR neighbors"
              value={options.sorNeighbors}
              onChange={(sorNeighbors) => setOptions((current) => ({ ...current, sorNeighbors }))}
            />
            <NumberField
              label="SOR std ratio"
              value={options.sorStdRatio}
              onChange={(sorStdRatio) => setOptions((current) => ({ ...current, sorStdRatio }))}
            />
          </section>
        </aside>

        <section className="ply-main-panel">
          <div className="ply-drop-zone">
            <div className="ply-file-card">
              <FileUp size={28} />
              <div>
                <strong>{file ? file.name : "No PLY selected"}</strong>
                <span>{file ? formatBytes(file.size) : "Open a Lyra 2.0 / 3DGS .ply file to begin."}</span>
              </div>
            </div>
            <div className="ply-pipeline">
              {["uploading", "processing", "downloading", "saving", "complete"].map((step) => (
                <div key={step} className={latestProgress?.phase === step ? "ply-step active" : "ply-step"}>
                  <span>{step}</span>
                </div>
              ))}
            </div>
            <div className="ply-progress-panel">
              <div className="ply-progress-header">
                <strong>{latestProgress ? latestProgress.message : "Ready"}</strong>
                <span>{busy ? `${elapsedSeconds.toFixed(1)}s elapsed` : stats ? "Finished" : "Idle"}</span>
              </div>
              <div className="ply-progress-bar" aria-label="PLY processing progress">
                <span style={{ width: progressPercent === null ? "0%" : `${Math.min(100, Math.max(0, progressPercent))}%` }} />
              </div>
              <div className="ply-progress-meta">
                <span>Phase: {latestProgress?.phase ?? "ready"}</span>
                <span>{progressPercent === null ? "Progress is stage-based" : `${progressPercent.toFixed(1)}%`}</span>
              </div>
            </div>
            <div className="ply-live-viewer">
              <div className="ply-live-header">
                <div>
                  <h2>Live Point Viewer</h2>
                  <span>{latestPointProgress?.step ? `Current filter: ${latestPointProgress.step}` : "Waiting for filter counts"}</span>
                </div>
                <strong>{liveOutputPoints !== null ? formatInteger(liveOutputPoints) : "-"}</strong>
              </div>
              <div className="ply-count-track">
                <span className="remaining" style={{ width: `${Math.max(0, Math.min(100, (1 - liveRemovedRatio) * 100))}%` }} />
                <span className="removed" style={{ width: `${Math.max(0, Math.min(100, liveRemovedRatio * 100))}%` }} />
              </div>
              <div className="ply-count-cloud" aria-hidden="true">
                {Array.from({ length: 84 }).map((_, index) => (
                  <i
                    key={index}
                    className={liveInputPoints && index / 84 < liveRemovedRatio ? "removed" : "remaining"}
                    style={{
                      left: `${((index * 37) % 97) + 1}%`,
                      top: `${((index * 53) % 89) + 5}%`,
                    }}
                  />
                ))}
              </div>
              <div className="ply-progress-meta">
                <span>Original: {liveInputPoints !== null ? formatInteger(liveInputPoints) : "-"}</span>
                <span>Removed: {liveRemovedPoints !== null ? formatInteger(liveRemovedPoints) : "-"}</span>
              </div>
            </div>
          </div>

          <div className="ply-results-grid">
            <PlyMetric label="Input points" value={stats ? formatInteger(stats.inputPoints) : "-"} />
            <PlyMetric label="Output points" value={stats ? formatInteger(stats.outputPoints) : "-"} />
            <PlyMetric label="Removed" value={stats ? `${formatInteger(removedPoints)} (${removedPercent.toFixed(1)}%)` : "-"} />
            <PlyMetric label="EPS" value={stats ? stats.eps.toPrecision(4) : options.eps ? String(options.eps) : "auto"} />
          </div>

          <div className="ply-detail-panel">
            <h2>Removal Breakdown</h2>
            <div className="ply-breakdown">
              <PlyMetric label="Opacity" value={stats ? formatInteger(stats.removedOpacity) : "-"} />
              <PlyMetric label="Scale" value={stats ? formatInteger(stats.removedScale) : "-"} />
              <PlyMetric label="SOR" value={stats ? formatInteger(stats.removedSor) : "-"} />
              <PlyMetric label="DBSCAN" value={stats ? formatInteger(stats.removedDbscan) : "-"} />
            </div>
            <div className="camera-analysis">
              <span>Vertex row 전체를 같은 mask로 필터링하므로 SH color, rotation, scale, opacity 속성이 함께 유지됩니다.</span>
              <span>처음에는 light, medium, strong 결과를 각각 만들어 SIBR 또는 Unreal viewer에서 비교하는 흐름이 안전합니다.</span>
              <span>Absolute EPS를 0으로 두면 bbox diagonal x EPS ratio로 자동 계산합니다.</span>
            </div>
            <div className="ply-log-panel">
              <h2>Processing Log</h2>
              {progressEvents.length ? (
                progressEvents
                  .slice()
                  .reverse()
                  .map((event, index) => (
                    <div className="ply-log-row" key={`${event.updatedAt}-${index}`}>
                      <strong>{event.phase}</strong>
                      <span>{event.message}</span>
                      <small>{formatProgressDetail(event)}</small>
                    </div>
                  ))
              ) : (
                <div className="ply-log-row">
                  <strong>ready</strong>
                  <span>Select a PLY file and run the cleaner.</span>
                </div>
              )}
            </div>
          </div>
        </section>
      </section>
    </main>
  );
}

function progressEventPercent(event: PlyProgressEvent): number | null {
  if (event.phase === "uploading" && event.uploadedBytes !== undefined && event.totalBytes) {
    return (event.uploadedBytes / event.totalBytes) * 100;
  }
  if (event.phase === "saving" && event.downloadedBytes !== undefined && event.downloadTotalBytes) {
    return (event.downloadedBytes / event.downloadTotalBytes) * 100;
  }
  const phasePercent: Record<string, number> = {
    waiting: 2,
    uploaded: 30,
    processing: 55,
    downloading: 78,
    saving: 88,
    complete: 100,
    error: 100,
  };
  return phasePercent[event.phase] ?? null;
}

function formatProgressDetail(event: PlyProgressEvent): string {
  if (event.phase === "uploading" && event.uploadedBytes !== undefined) {
    return `${formatBytes(event.uploadedBytes)}${event.totalBytes ? ` / ${formatBytes(event.totalBytes)}` : ""}`;
  }
  if (event.phase === "saving" && event.downloadedBytes !== undefined) {
    return `${formatBytes(event.downloadedBytes)}${event.downloadTotalBytes ? ` / ${formatBytes(event.downloadTotalBytes)}` : ""}`;
  }
  if (event.stats) {
    return `${formatInteger(event.stats.inputPoints)} -> ${formatInteger(event.stats.outputPoints)} points`;
  }
  if (event.inputPoints !== undefined && event.outputPoints !== undefined) {
    return `${formatInteger(event.inputPoints)} -> ${formatInteger(event.outputPoints)} points`;
  }
  return new Date(event.updatedAt).toLocaleTimeString();
}

function PlyMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="ply-metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function cleanedFileName(fileName: string): string {
  return fileName.toLowerCase().endsWith(".ply") ? fileName.replace(/\.ply$/i, "_cleaned.ply") : `${fileName}_cleaned.ply`;
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  return `${(bytes / 1024 ** index).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

function formatInteger(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
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
