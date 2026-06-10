import { OrbitControls } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { Box3, Vector3 } from "three";
import type { ViewerJob } from "./types";
import { GaussianPointCloud } from "./GaussianPointCloud";
import { useGaussianAsset } from "./useGaussianAsset";

export function GaussianViewer({ job }: { job: ViewerJob | null }) {
  const { asset, loading, error } = useGaussianAsset(job);
  const center = job ? centerFromBounds(job.manifest.bounds) : [0, 0, 0];

  return (
    <div className="gaussian-viewer">
      <div className="gaussian-viewer-header">
        <div>
          <h2>3DGS Viewer</h2>
          <span>
            {job
              ? `${job.manifest.sourceName} · ${job.manifest.pointCount.toLocaleString()} displayed`
              : "Open a PLY file to generate a splat preview."}
          </span>
        </div>
        <strong>{loading ? "Loading" : asset ? "Ready" : "Idle"}</strong>
      </div>
      <div className="gaussian-canvas">
        {error ? <div className="canvas-empty">{error}</div> : null}
        {!job ? <div className="canvas-empty">No viewer asset loaded.</div> : null}
        <Canvas camera={{ position: [center[0] + 2.5, center[1] + 2.5, center[2] + 2.5], near: 0.001, far: 10000 }}>
          <color attach="background" args={["#05080c"]} />
          <ambientLight intensity={0.8} />
          <gridHelper args={[4, 16, "#253448", "#18202c"]} />
          <axesHelper args={[1]} />
          {asset ? <GaussianPointCloud asset={asset} /> : null}
          <OrbitControls makeDefault target={center as [number, number, number]} />
        </Canvas>
      </div>
      {job ? (
        <div className="gaussian-viewer-stats">
          <span>Source {job.manifest.sourcePointCount.toLocaleString()}</span>
          <span>{job.manifest.sampled ? "Sampled preview" : "Full preview"}</span>
          <span>{job.manifest.chunks.length} chunk(s)</span>
        </div>
      ) : null}
    </div>
  );
}

function centerFromBounds(bounds: { min: [number, number, number]; max: [number, number, number] }): [number, number, number] {
  const box = new Box3(new Vector3(...bounds.min), new Vector3(...bounds.max));
  const center = box.getCenter(new Vector3());
  return [center.x, center.y, center.z];
}
