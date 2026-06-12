import { useEffect, useRef } from "react";
import type { EditorTool, SplatSceneSummary } from "./types";
import { PlayCanvasSplatEditor } from "./playcanvas/PlayCanvasSplatEditor";

type Props = {
  activeTool: EditorTool;
  onReady: (editor: PlayCanvasSplatEditor | null) => void;
  onSceneChange: (summary: SplatSceneSummary | null) => void;
};

export function SplatEditorViewport({ activeTool, onReady, onSceneChange }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const editorRef = useRef<PlayCanvasSplatEditor | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const editor = new PlayCanvasSplatEditor(canvas, onSceneChange);
    editorRef.current = editor;
    onReady(editor);
    void editor.mount();

    const observer = new ResizeObserver(() => editor.resize());
    observer.observe(canvas);

    return () => {
      observer.disconnect();
      onReady(null);
      editor.destroy();
      editorRef.current = null;
    };
  }, [onReady, onSceneChange]);

  useEffect(() => {
    editorRef.current?.setTool(activeTool);
  }, [activeTool]);

  return (
    <div className="splat-editor-viewport">
      <canvas ref={canvasRef} />
    </div>
  );
}
