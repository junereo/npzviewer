import { Camera, Download, Eraser, FileUp, MousePointer2, RotateCcw, Trash2 } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { useSplatEditorStore } from "./useSplatEditorStore";
import { SplatEditorViewport } from "./SplatEditorViewport";
import type { SplatSceneSummary } from "./types";
import type { PlayCanvasSplatEditor } from "./playcanvas/PlayCanvasSplatEditor";

export function SplatEditorApp({ onSwitchToTrajectory }: { onSwitchToTrajectory: () => void }) {
  const editorRef = useRef<PlayCanvasSplatEditor | null>(null);
  const { activeTool, error, scene, status, setActiveTool, setScene, setStatus } = useSplatEditorStore();
  const [file, setFile] = useState<File | null>(null);

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

  function clearSelection() {
    editorRef.current?.clearSelection();
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
          <p>PlayCanvas/GSplat 기반으로 원본 3DGS PLY를 로드하고 비파괴 삭제 후 edited PLY로 내보냅니다.</p>
        </div>
        <div className="topbar-actions">
          <button className="button" onClick={onSwitchToTrajectory}>
            <Camera size={18} />
            <span>Trajectory GUI</span>
          </button>
          <label className="button primary">
            <FileUp size={18} />
            <span>Open PLY</span>
            <input type="file" accept=".ply" onChange={(event) => void openPly(event.target.files?.[0])} />
          </label>
          <button className="button" disabled={!scene} onClick={exportPly}>
            <Download size={18} />
            <span>Export edited PLY</span>
          </button>
        </div>
      </header>

      {error ? <div className="error">{error}</div> : null}
      {status === "loading" ? <div className="busy">Loading PLY into PlayCanvas...</div> : null}

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
            </div>
          </section>
          <section className="editor-section">
            <h3>Edit</h3>
            <div className="splat-editor-commandgrid">
              <button className="button" disabled={!scene || scene.selectedCount === 0} onClick={deleteSelection}>
                <Trash2 size={16} />
                <span>Delete</span>
              </button>
              <button className="button" disabled={!scene || scene.deletedCount === 0} onClick={restoreDeleted}>
                <Eraser size={16} />
                <span>Restore</span>
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
        </aside>
      </section>
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
