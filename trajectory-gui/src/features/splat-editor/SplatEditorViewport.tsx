import { useEffect, useRef } from "react";
import type { EditorTool, SplatSceneSummary } from "./types";
import { PlayCanvasSplatEditor, type BoxDragRect } from "./playcanvas/PlayCanvasSplatEditor";

type Props = {
  activeTool: EditorTool;
  onReady: (editor: PlayCanvasSplatEditor | null) => void;
  onSceneChange: (summary: SplatSceneSummary | null) => void;
};

export function SplatEditorViewport({ activeTool, onReady, onSceneChange }: Props) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const editorRef = useRef<PlayCanvasSplatEditor | null>(null);
  const boxRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const editor = new PlayCanvasSplatEditor(canvas, onSceneChange, (rect: BoxDragRect) => {
      const node = boxRef.current;
      if (!node) return;
      if (!rect) {
        node.style.display = "none";
        return;
      }
      node.style.display = "block";
      node.style.left = `${rect.x}px`;
      node.style.top = `${rect.y}px`;
      node.style.width = `${rect.width}px`;
      node.style.height = `${rect.height}px`;
    });
    editorRef.current = editor;
    onReady(editor);
    void editor.mount();

    let resizeFrame = 0;
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(resizeFrame);
      resizeFrame = requestAnimationFrame(() => editor.resize());
    });
    observer.observe(rootRef.current ?? canvas);

    return () => {
      cancelAnimationFrame(resizeFrame);
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
    <div ref={rootRef} className="splat-editor-viewport">
      <canvas ref={canvasRef} />
      <div ref={boxRef} className="splat-editor-box-selection" />
    </div>
  );
}
