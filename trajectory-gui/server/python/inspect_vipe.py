import json
import sys
from pathlib import Path

import numpy as np

from inspect_cameras import camera_center_from_w2c, camera_forward_from_w2c, infer_fov


def detect_depth_key(data):
    candidates = [key for key in data.files if "depth" in key.lower()]
    if not candidates:
        return None
    metric = [key for key in candidates if key.lower() == "metric_depth" or "metric" in key.lower()]
    return (metric or candidates)[0]


def summarize_depth(data, frame_ids):
    key = detect_depth_key(data)
    if key is None:
        return None, {}

    depth = np.asarray(data[key], dtype=np.float32)
    if depth.ndim < 2:
        return {
            "key": key,
            "shape": list(depth.shape),
            "dtype": str(data[key].dtype),
            "frames": [],
        }, {}

    frame_count = depth.shape[0] if depth.ndim >= 3 else 1
    if frame_ids is not None and len(frame_ids) == frame_count:
        source_indices = np.asarray(frame_ids, dtype=np.int64)
    else:
        source_indices = np.arange(frame_count)

    frames = []
    by_source = {}
    for index in range(frame_count):
        frame_depth = depth[index] if depth.ndim >= 3 else depth
        finite = frame_depth[np.isfinite(frame_depth)]
        positive = finite[finite > 0]
        valid = positive if positive.size else finite
        source = int(source_indices[index])
        stats = {
            "index": int(index),
            "sourceFrameIndex": source,
            "height": int(frame_depth.shape[-2]) if frame_depth.ndim >= 2 else None,
            "width": int(frame_depth.shape[-1]) if frame_depth.ndim >= 1 else None,
            "validRatio": float(valid.size / frame_depth.size) if frame_depth.size else 0.0,
            "min": float(np.min(valid)) if valid.size else None,
            "max": float(np.max(valid)) if valid.size else None,
            "mean": float(np.mean(valid)) if valid.size else None,
            "median": float(np.median(valid)) if valid.size else None,
        }
        frames.append(stats)
        by_source[source] = stats

    return {
        "key": key,
        "shape": list(depth.shape),
        "dtype": str(data[key].dtype),
        "frames": frames,
    }, by_source


def inspect_vipe(path):
    data = np.load(path, allow_pickle=False)
    frame_ids = data["frame_ids"].astype(int).tolist() if "frame_ids" in data.files else None
    depth_summary, depth_by_source = summarize_depth(data, frame_ids)
    sets = []
    for key in data.files:
        if not key.startswith("w2c_"):
            continue
        w2c = np.asarray(data[key], dtype=np.float32)
        if w2c.ndim != 3 or w2c.shape[1:] != (4, 4):
            continue
        suffix = key.replace("w2c_", "")
        intrinsics_key = f"intrinsics_{suffix}" if f"intrinsics_{suffix}" in data.files else None
        indices_key = f"indices_{suffix}" if f"indices_{suffix}" in data.files else None
        source_indices = np.asarray(data[indices_key], dtype=np.int64) if indices_key and len(data[indices_key]) == w2c.shape[0] else np.arange(w2c.shape[0])
        intrinsics = np.asarray(data[intrinsics_key], dtype=np.float32) if intrinsics_key else None
        centers = [camera_center_from_w2c(w2c[index]) for index in range(w2c.shape[0])]
        cumulative = [0.0]
        for index in range(1, len(centers)):
            cumulative.append(cumulative[-1] + float(np.linalg.norm(centers[index] - centers[index - 1])))
        frames = []
        for index in range(w2c.shape[0]):
            center = centers[index]
            frames.append(
                {
                    "index": int(index),
                    "sourceFrameIndex": int(source_indices[index]),
                    "center": center.tolist(),
                    "forward": camera_forward_from_w2c(w2c[index]).tolist(),
                    "originDistance": float(np.linalg.norm(center - centers[0])),
                    "cumulativeDistance": cumulative[index],
                    "depthStats": depth_by_source.get(int(source_indices[index])),
                    "w2c": w2c[index].astype(float).tolist(),
                }
            )
        sets.append(
            {
                "key": key,
                "label": suffix.upper(),
                "frameCount": int(w2c.shape[0]),
                "intrinsicsKey": intrinsics_key,
                "indicesKey": indices_key,
                "fov": infer_fov(intrinsics),
                "totalDistance": cumulative[-1] if cumulative else 0.0,
                "endToEndDistance": float(np.linalg.norm(centers[-1] - centers[0])) if centers else 0.0,
                "frames": frames,
            }
        )
    return {
        "keys": data.files,
        "frameIds": frame_ids,
        "fps": data["fps"].astype(float).tolist() if "fps" in data.files else None,
        "inputVideoPath": data["input_video_path"].astype(str).tolist() if "input_video_path" in data.files else None,
        "hasDepth": depth_summary is not None,
        "depth": depth_summary,
        "sets": sets,
    }


def main():
    if len(sys.argv) != 2:
        raise SystemExit("Usage: inspect_vipe.py <vipe_predictions.npz>")
    print(json.dumps(inspect_vipe(Path(sys.argv[1]))))


if __name__ == "__main__":
    main()
