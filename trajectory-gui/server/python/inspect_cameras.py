import json
import math
import sys
from pathlib import Path

import numpy as np


def camera_center_from_w2c(w2c):
    rotation = w2c[:3, :3]
    translation = w2c[:3, 3]
    return (-rotation.T @ translation).astype(float)


def camera_forward_from_w2c(w2c):
    rotation = w2c[:3, :3]
    forward = rotation.T @ np.asarray([0.0, 0.0, 1.0], dtype=np.float32)
    norm = np.linalg.norm(forward)
    if norm <= 1e-8:
        return np.asarray([0.0, 0.0, 1.0], dtype=float)
    return (forward / norm).astype(float)


def infer_intrinsics_key(w2c_key, data):
    suffix = w2c_key.replace("w2c_", "")
    candidate = f"intrinsics_{suffix}"
    if candidate in data.files:
        return candidate
    if "intrinsics_vipe" in data.files:
        return "intrinsics_vipe"
    if "intrinsics_da3" in data.files:
        return "intrinsics_da3"
    return None


def infer_fov(intrinsics):
    if intrinsics is None or intrinsics.size == 0:
        return {"horizontalDeg": None, "verticalDeg": None, "width": None, "height": None, "source": "missing"}
    k = intrinsics[0]
    fx = float(k[0, 0])
    fy = float(k[1, 1])
    cx = float(k[0, 2])
    cy = float(k[1, 2])
    width = max(1.0, cx * 2.0)
    height = max(1.0, cy * 2.0)
    horizontal = math.degrees(2.0 * math.atan(width / (2.0 * fx))) if fx > 0 else None
    vertical = math.degrees(2.0 * math.atan(height / (2.0 * fy))) if fy > 0 else None
    return {
        "horizontalDeg": horizontal,
        "verticalDeg": vertical,
        "width": width,
        "height": height,
        "source": "principal_point_x2",
    }


def inspect_cameras(path):
    data = np.load(path, allow_pickle=False)
    sets = []
    for key in data.files:
        if not key.startswith("w2c_"):
            continue
        w2c = np.asarray(data[key], dtype=np.float32)
        if w2c.ndim != 3 or w2c.shape[1:] != (4, 4):
            continue
        intrinsics_key = infer_intrinsics_key(key, data)
        intrinsics = None
        if intrinsics_key is not None:
            intrinsics = np.asarray(data[intrinsics_key], dtype=np.float32)

        centers = [camera_center_from_w2c(w2c[index]) for index in range(w2c.shape[0])]
        cumulative = [0.0]
        for index in range(1, len(centers)):
            cumulative.append(cumulative[-1] + float(np.linalg.norm(centers[index] - centers[index - 1])))
        source_indices = None
        suffix = key.replace("w2c_", "")
        candidate_indices = f"indices_{suffix}"
        if candidate_indices in data.files and len(data[candidate_indices]) == w2c.shape[0]:
            source_indices = np.asarray(data[candidate_indices], dtype=np.int64)
        elif "indices_vipe" in data.files and len(data["indices_vipe"]) == w2c.shape[0]:
            source_indices = np.asarray(data["indices_vipe"], dtype=np.int64)

        frames = []
        for index in range(w2c.shape[0]):
            center = centers[index]
            frames.append(
                {
                    "index": int(index),
                    "sourceFrameIndex": int(source_indices[index]) if source_indices is not None else int(index),
                    "center": center.tolist(),
                    "forward": camera_forward_from_w2c(w2c[index]).tolist(),
                    "originDistance": float(np.linalg.norm(center - centers[0])),
                    "cumulativeDistance": cumulative[index],
                    "w2c": w2c[index].astype(float).tolist(),
                }
            )

        sets.append(
            {
                "key": key,
                "label": key.replace("w2c_", "").upper(),
                "frameCount": int(w2c.shape[0]),
                "intrinsicsKey": intrinsics_key,
                "fov": infer_fov(intrinsics),
                "totalDistance": cumulative[-1] if cumulative else 0.0,
                "endToEndDistance": float(np.linalg.norm(centers[-1] - centers[0])) if centers else 0.0,
                "frames": frames,
            }
        )

    return {
        "keys": data.files,
        "sets": sets,
        "metadata": {
            "fps": data["fps"].astype(float).tolist() if "fps" in data.files else None,
            "indices_da3": data["indices_da3"].astype(int).tolist() if "indices_da3" in data.files else None,
            "indices_vipe": data["indices_vipe"].astype(int).tolist() if "indices_vipe" in data.files else None,
        },
    }


def main():
    if len(sys.argv) != 2:
        raise SystemExit("Usage: inspect_cameras.py <cameras.npz>")
    print(json.dumps(inspect_cameras(Path(sys.argv[1]))))


if __name__ == "__main__":
    main()
