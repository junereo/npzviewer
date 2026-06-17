import { BarChart3, Camera, Download, Eraser, EyeOff, FileUp, Lock, MousePointer2, RotateCcw, Square, Trash2, Unlock } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { SplatEditorViewport } from "./SplatEditorViewport";
import type { PlayCanvasSplatEditor } from "./playcanvas/PlayCanvasSplatEditor";
import type { SplatSceneSummary } from "./types";
import { useSplatEditorStore } from "./useSplatEditorStore";

type EditorMode = "supersplat" | "lyra";

export function SplatEditorApp({ onSwitchToTrajectory }: { onSwitchToTrajectory: () => void }) {
  const editorRef = useRef<PlayCanvasSplatEditor | null>(null);
  const { activeTool, error, scene, status, setActiveTool, setScene, setStatus } = useSplatEditorStore();
  const [file, setFile] = useState<File | null>(null);
  const [editorMode, setEditorMode] = useState<EditorMode>("supersplat");

  const onReady = useCallback((editor: PlayCanvasSplatEditor | null) => {
    editorRef.current = editor;
  }, []);

  const onSceneChange = useCallback(
    (summary: SplatSceneSummary | null) => {
      setScene(summary);
    },
    [setScene],
  );

  async function openPly(nextFile: File | undefined) {
    if (!nextFile || !editorRef.current) return;
    setFile(nextFile);
    setStatus("loading");
    try {
      const summary = await editorRef.current.loadPly(nextFile);
      setScene(summary);
      setStatus("ready");
    } catch (err) {
      setStatus("error", err instanceof Error ? err.message : String(err));
    }
  }

  function deleteSelection() {
    editorRef.current?.deleteSelection();
  }

  function restoreDeleted() {
    editorRef.current?.restoreSelection();
  }

  function hideSelection() {
    editorRef.current?.hideSelection();
  }

  function lockSelection() {
    editorRef.current?.lockSelection();
  }

  function unlockAll() {
    editorRef.current?.unlockAll();
  }

  function clearSelection() {
    editorRef.current?.clearSelection();
  }

  function setHistogramAxis(axis: "x" | "y" | "z") {
    editorRef.current?.setHistogramAxis(axis);
  }

  function selectHistogramRange(axis: "x" | "y" | "z", min: number, max: number) {
    editorRef.current?.selectHistogramRange(axis, min, max);
  }

  function exportPly() {
    if (!editorRef.current || !scene) return;
    try {
      const blob = editorRef.current.exportPly();
      const href = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = href;
      anchor.download = `${scene.fileName.replace(/\.ply$/i, "")}.edited.ply`;
      anchor.click();
      URL.revokeObjectURL(href);
    } catch (err) {
      setStatus("error", err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <main className="app-shell splat-editor-shell">
      <header className="topbar">
        <div>
          <h1>Splat Editor</h1>
          <p>Full SuperSplat editor is embedded as a PlayCanvas/WebGL2 sub-app. Lyra Tools keeps the local PLY edit workflow.</p>
        </div>
        <div className="topbar-actions">
          <div className="segmented two splat-mode-switch" aria-label="Splat editor mode">
            <button className={editorMode === "supersplat" ? "active" : ""} onClick={() => setEditorMode("supersplat")}>
              SuperSplat
            </button>
            <button className={editorMode === "lyra" ? "active" : ""} onClick={() => setEditorMode("lyra")}>
              Lyra Tools
            </button>
          </div>
          <button className="button" onClick={onSwitchToTrajectory}>
            <Camera size={18} />
            <span>Trajectory GUI</span>
          </button>
          {editorMode === "lyra" ? (
            <>
              <label className="button primary">
                <FileUp size={18} />
                <span>Open PLY</span>
                <input type="file" accept=".ply" onChange={(event) => void openPly(event.target.files?.[0])} />
              </label>
              <button className="button" disabled={!scene} onClick={exportPly}>
                <Download size={18} />
                <span>Export edited PLY</span>
              </button>
            </>
          ) : null}
        </div>
      </header>

      {error ? <div className="error">{error}</div> : null}
      {status === "loading" ? <div className="busy">Loading PLY into PlayCanvas...</div> : null}

      {editorMode === "supersplat" ? (
        <section className="supersplat-embed-shell">
          <iframe
            title="SuperSplat Full Editor"
            className="supersplat-embed-frame"
            src="/supersplat/index.html"
            allow="clipboard-read; clipboard-write; fullscreen; web-share"
          />
          <div className="splat-editor-status">
            <span>Upstream: PlayCanvas SuperSplat 2.27.4 / MIT</span>
            <span>Source: trajectory-gui/vendor/supersplat</span>
          </div>
        </section>
      ) : (
        <section className="splat-editor-workspace">
          <aside className="splat-editor-panel">
            <h2>Scene</h2>
            <div className="meta-list">
              <Metric label="File" value={file?.name ?? "No PLY"} />
              <Metric label="Status" value={status} />
              <Metric label="Format" value={scene?.format ?? "-"} />
              <Metric label="Splats" value={scene ? scene.splatCount.toLocaleString() : "-"} />
              <Metric label="Selected" value={scene ? scene.selectedCount.toLocaleString() : "-"} />
              <Metric label="Deleted" value={scene ? scene.deletedCount.toLocaleString() : "-"} />
              <Metric label="Hidden" value={scene ? scene.hiddenCount.toLocaleString() : "-"} />
              <Metric label="Locked" value={scene ? scene.lockedCount.toLocaleString() : "-"} />
            </div>
            <section className="editor-section">
              <h3>Tools</h3>
              <div className="splat-editor-toolgrid">
                <button className={activeTool === "orbit" ? "button primary" : "button"} onClick={() => setActiveTool("orbit")}>
                  <RotateCcw size={16} />
                  <span>Orbit</span>
                </button>
                <button className={activeTool === "pick" ? "button primary" : "button"} onClick={() => setActiveTool("pick")}>
                  <MousePointer2 size={16} />
                  <span>Pick</span>
                </button>
                <button className={activeTool === "box-select" ? "button primary" : "button"} onClick={() => setActiveTool("box-select")}>
                  <Square size={16} />
                  <span>Box</span>
                </button>
              </div>
            </section>
            <section className="editor-section">
              <h3>Edit</h3>
              <div className="splat-editor-commandgrid">
                <button className="button" disabled={!scene || scene.selectedCount === 0} onClick={deleteSelection}>
                  <Trash2 size={16} />
                  <span>Delete</span>
                </button>
                <button className="button" disabled={!scene || scene.selectedCount === 0} onClick={hideSelection}>
                  <EyeOff size={16} />
                  <span>Hide</span>
                </button>
                <button className="button" disabled={!scene || scene.selectedCount === 0} onClick={lockSelection}>
                  <Lock size={16} />
                  <span>Lock</span>
                </button>
                <button className="button" disabled={!scene || scene.deletedCount + scene.hiddenCount === 0} onClick={restoreDeleted}>
                  <Eraser size={16} />
                  <span>Restore all</span>
                </button>
                <button className="button" disabled={!scene || scene.lockedCount === 0} onClick={unlockAll}>
                  <Unlock size={16} />
                  <span>Unlock all</span>
                </button>
                <button className="button" disabled={!scene || scene.selectedCount === 0} onClick={clearSelection}>
                  <MousePointer2 size={16} />
                  <span>Clear</span>
                </button>
              </div>
            </section>
          </aside>

          <section className="splat-editor-main">
            <SplatEditorViewport activeTool={activeTool} onReady={onReady} onSceneChange={onSceneChange} />
            <div className="splat-editor-status">
              <span>{scene ? `${scene.fileName} / ${scene.splatCount.toLocaleString()} splats` : "Open a 3DGS PLY file."}</span>
              <span>Backend: PlayCanvas GSplat / WebGL2</span>
            </div>
          </section>

          <aside className="splat-editor-panel">
            <h2>Bounds</h2>
            <div className="meta-list">
              <Metric label="Min X" value={formatBound(scene?.bounds?.min[0])} />
              <Metric label="Min Y" value={formatBound(scene?.bounds?.min[1])} />
              <Metric label="Min Z" value={formatBound(scene?.bounds?.min[2])} />
              <Metric label="Max X" value={formatBound(scene?.bounds?.max[0])} />
              <Metric label="Max Y" value={formatBound(scene?.bounds?.max[1])} />
              <Metric label="Max Z" value={formatBound(scene?.bounds?.max[2])} />
            </div>
            <section className="editor-section">
              <h3>Selected Bounds</h3>
              <div className="meta-list">
                <Metric label="Min X" value={formatBound(scene?.selectedBounds?.min[0])} />
                <Metric label="Min Y" value={formatBound(scene?.selectedBounds?.min[1])} />
                <Metric label="Min Z" value={formatBound(scene?.selectedBounds?.min[2])} />
                <Metric label="Max X" value={formatBound(scene?.selectedBounds?.max[0])} />
                <Metric label="Max Y" value={formatBound(scene?.selectedBounds?.max[1])} />
                <Metric label="Max Z" value={formatBound(scene?.selectedBounds?.max[2])} />
              </div>
            </section>
            <section className="editor-section">
              <h3>Histogram</h3>
              <div className="segmented three">
                {(["x", "y", "z"] as const).map((axis) => (
                  <button key={axis} className={scene?.histogram?.axis === axis ? "active" : ""} disabled={!scene} onClick={() => setHistogramAxis(axis)}>
                    {axis.toUpperCase()}
                  </button>
                ))}
              </div>
              {scene?.histogram ? (
                <div className="splat-histogram" aria-label="Splat axis histogram">
                  {scene.histogram.bins.map((bin) => {
                    const maxCount = Math.max(...scene.histogram!.bins.map((item) => item.count), 1);
                    return (
                      <button
                        key={bin.index}
                        title={`${scene.histogram!.axis.toUpperCase()} ${bin.min.toFixed(3)} - ${bin.max.toFixed(3)} / ${bin.count.toLocaleString()}`}
                        style={{ height: `${Math.max(6, (bin.count / maxCount) * 88)}px` }}
                        onClick={() => selectHistogramRange(scene.histogram!.axis, bin.min, bin.max)}
                      >
                        <BarChart3 size={10} />
                      </button>
                    );
                  })}
                </div>
              ) : null}
            </section>
          </aside>
        </section>
      )}
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function formatBound(value: number | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? value.toFixed(4) : "-";
}
