import * as pc from "playcanvas";
import type { EditorTool, SplatSceneSummary } from "../types";
import { createPlayCanvasApp, type PlayCanvasAppHandle } from "./createPlayCanvasApp";
import { exportEditedPlyBytes } from "./exportEditedPly.mjs";
import { loadGsplatAsset } from "./loadGsplatAsset";
import { parsePlySceneData } from "./plyData.mjs";
import { SplatEditState } from "./SplatEditState.mjs";

type PointerState = {
  x: number;
  y: number;
  pointerId: number;
  moved: boolean;
};

export class PlayCanvasSplatEditor {
  private handle: PlayCanvasAppHandle | null = null;
  private activeTool: EditorTool = "orbit";
  private splatEntity: pc.Entity | null = null;
  private asset: pc.Asset | null = null;
  private originalBuffer: ArrayBuffer | null = null;
  private centers: Float32Array | null = null;
  private editState: SplatEditState | null = null;
  private summary: SplatSceneSummary | null = null;
  private pointer: PointerState | null = null;
  private target = new pc.Vec3(0, 0, 0);
  private yaw = 35;
  private pitch = -18;
  private distance = 4;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly onSceneChange: (summary: SplatSceneSummary | null) => void,
  ) {}

  async mount(): Promise<void> {
    if (this.handle) return;
    this.handle = createPlayCanvasApp(this.canvas);
    this.updateCamera();
    this.canvas.addEventListener("pointerdown", this.onPointerDown);
    this.canvas.addEventListener("pointermove", this.onPointerMove);
    this.canvas.addEventListener("pointerup", this.onPointerUp);
    this.canvas.addEventListener("pointercancel", this.onPointerUp);
    this.canvas.addEventListener("wheel", this.onWheel, { passive: false });
    this.resize();
  }

  destroy(): void {
    this.canvas.removeEventListener("pointerdown", this.onPointerDown);
    this.canvas.removeEventListener("pointermove", this.onPointerMove);
    this.canvas.removeEventListener("pointerup", this.onPointerUp);
    this.canvas.removeEventListener("pointercancel", this.onPointerUp);
    this.canvas.removeEventListener("wheel", this.onWheel);
    this.clearScene();
    this.handle?.destroy();
    this.handle = null;
  }

  resize(): void {
    if (!this.handle) return;
    const rect = this.canvas.getBoundingClientRect();
    const width = Math.max(1, Math.floor(rect.width));
    const height = Math.max(1, Math.floor(rect.height));
    this.handle.app.resizeCanvas(width, height);
  }

  setTool(tool: EditorTool): void {
    this.activeTool = tool;
  }

  async loadPly(file: File): Promise<SplatSceneSummary> {
    if (!this.handle) throw new Error("Splat editor viewport is not ready.");
    this.clearScene();

    const originalBuffer = await file.arrayBuffer();
    const sceneData = parsePlySceneData(originalBuffer);
    const asset = await loadGsplatAsset(this.handle.app, file);
    const entity = new pc.Entity(file.name);
    entity.addComponent("gsplat", { asset });
    this.handle.app.root.addChild(entity);

    this.asset = asset;
    this.splatEntity = entity;
    this.originalBuffer = originalBuffer;
    this.centers = sceneData.centers;
    this.editState = new SplatEditState(sceneData.splatCount);
    const bounds = sceneData.bounds
      ? {
          min: sceneData.bounds.min as [number, number, number],
          max: sceneData.bounds.max as [number, number, number],
        }
      : null;
    const summary: SplatSceneSummary = {
      fileName: file.name,
      splatCount: sceneData.splatCount,
      selectedCount: 0,
      deletedCount: 0,
      hiddenCount: 0,
      lockedCount: 0,
      bounds,
      format: sceneData.format,
    };
    this.summary = summary;
    this.fitCamera(bounds);
    this.emitSummary();
    return summary;
  }

  clearScene(): void {
    if (this.splatEntity) {
      this.splatEntity.destroy();
      this.splatEntity = null;
    }
    if (this.asset && this.handle) {
      this.handle.app.assets.remove(this.asset);
      this.asset.unload();
      this.asset = null;
    }
    this.originalBuffer = null;
    this.centers = null;
    this.editState = null;
    this.summary = null;
    this.emitSummary();
  }

  deleteSelection(): SplatSceneSummary | null {
    if (!this.editState || !this.summary) return null;
    this.editState.markDeletedSelection();
    this.summary = { ...this.summary, selectedCount: this.editState.selectedCount, deletedCount: this.editState.deletedCount };
    this.emitSummary();
    return this.summary;
  }

  restoreSelection(): SplatSceneSummary | null {
    if (!this.editState || !this.summary) return null;
    this.editState.restoreDeleted(this.editState.deletedIndices());
    this.summary = { ...this.summary, deletedCount: this.editState.deletedCount };
    this.emitSummary();
    return this.summary;
  }

  clearSelection(): SplatSceneSummary | null {
    if (!this.editState || !this.summary) return null;
    this.editState.clearSelection();
    this.summary = { ...this.summary, selectedCount: 0 };
    this.emitSummary();
    return this.summary;
  }

  exportPly(): Blob {
    if (!this.originalBuffer || !this.editState) throw new Error("No PLY scene is loaded.");
    return new Blob([exportEditedPlyBytes(this.originalBuffer, this.editState.deletedIndexSet())], { type: "application/octet-stream" });
  }

  private readonly onPointerDown = (event: PointerEvent) => {
    this.canvas.setPointerCapture(event.pointerId);
    this.pointer = { x: event.clientX, y: event.clientY, pointerId: event.pointerId, moved: false };
  };

  private readonly onPointerMove = (event: PointerEvent) => {
    if (!this.pointer) return;
    const dx = event.clientX - this.pointer.x;
    const dy = event.clientY - this.pointer.y;
    if (Math.hypot(dx, dy) > 2) this.pointer.moved = true;

    if (this.activeTool === "orbit") {
      this.yaw -= dx * 0.25;
      this.pitch = clamp(this.pitch - dy * 0.18, -85, 85);
      this.updateCamera();
    }

    this.pointer.x = event.clientX;
    this.pointer.y = event.clientY;
  };

  private readonly onPointerUp = (event: PointerEvent) => {
    const pointer = this.pointer;
    this.pointer = null;
    if (!pointer) return;
    this.canvas.releasePointerCapture(pointer.pointerId);
    if (this.activeTool === "pick" && !pointer.moved) {
      this.pickAt(event, { add: event.shiftKey, remove: event.ctrlKey || event.metaKey });
    }
  };

  private readonly onWheel = (event: WheelEvent) => {
    if (this.activeTool !== "orbit") return;
    event.preventDefault();
    this.distance = clamp(this.distance * (event.deltaY > 0 ? 1.12 : 0.9), 0.02, 10000);
    this.updateCamera();
  };

  private pickAt(event: PointerEvent, mode: { add: boolean; remove: boolean }): void {
    if (!this.handle || !this.centers || !this.editState || !this.summary) return;
    const camera = this.handle.camera as pc.Entity & { camera: { worldToScreen: (world: pc.Vec3, out?: pc.Vec3) => pc.Vec3 } };
    const rect = this.canvas.getBoundingClientRect();
    const pointer = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    let best: { index: number; distanceSquared: number } | null = null;
    const temp = new pc.Vec3();

    for (let cursor = 0; cursor + 2 < this.centers.length; cursor += 3) {
      const index = cursor / 3;
      if (this.editState.isDeleted(index)) continue;
      temp.set(this.centers[cursor], this.centers[cursor + 1], this.centers[cursor + 2]);
      const projected = camera.camera.worldToScreen(temp, temp);
      if (projected.z < 0) continue;
      const dx = projected.x - pointer.x;
      const dy = projected.y - pointer.y;
      const distanceSquared = dx * dx + dy * dy;
      if (distanceSquared > 18 * 18) continue;
      if (!best || distanceSquared < best.distanceSquared) best = { index, distanceSquared };
    }

    if (!best) return;
    if (mode.remove) this.editState.removeSelection([best.index]);
    else if (mode.add) this.editState.addSelection([best.index]);
    else this.editState.selectOnly([best.index]);
    this.summary = { ...this.summary, selectedCount: this.editState.selectedCount };
    this.emitSummary();
  }

  private fitCamera(bounds: SplatSceneSummary["bounds"]): void {
    if (!bounds) return;
    const center = new pc.Vec3(
      (bounds.min[0] + bounds.max[0]) * 0.5,
      (bounds.min[1] + bounds.max[1]) * 0.5,
      (bounds.min[2] + bounds.max[2]) * 0.5,
    );
    const size = Math.max(bounds.max[0] - bounds.min[0], bounds.max[1] - bounds.min[1], bounds.max[2] - bounds.min[2], 0.1);
    this.target.copy(center);
    this.distance = size * 2.5;
    this.updateCamera();
  }

  private updateCamera(): void {
    if (!this.handle) return;
    const yaw = (this.yaw * Math.PI) / 180;
    const pitch = (this.pitch * Math.PI) / 180;
    const x = this.target.x + this.distance * Math.sin(yaw) * Math.cos(pitch);
    const y = this.target.y + this.distance * Math.sin(pitch);
    const z = this.target.z + this.distance * Math.cos(yaw) * Math.cos(pitch);
    this.handle.camera.setPosition(x, y, z);
    this.handle.camera.lookAt(this.target);
  }

  private emitSummary(): void {
    this.onSceneChange(this.summary);
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
