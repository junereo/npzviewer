import { useMemo } from "react";
import * as THREE from "three";
import type { GaussianAsset } from "./useGaussianAsset";

export function GaussianPointCloud({ asset }: { asset: GaussianAsset }) {
  const geometry = useMemo(() => {
    const next = new THREE.BufferGeometry();
    next.setAttribute("position", new THREE.BufferAttribute(asset.positions, 3));
    next.setAttribute("color", new THREE.BufferAttribute(asset.colors, 3));
    return next;
  }, [asset]);

  const pointSize = Math.max(0.006, Math.min(0.05, asset.averageScale * 4));

  return (
    <points geometry={geometry}>
      <pointsMaterial size={pointSize} vertexColors transparent opacity={0.82} depthWrite={false} sizeAttenuation />
    </points>
  );
}
