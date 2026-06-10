import json
import sys
from pathlib import Path

import numpy as np


def camera_center_from_w2c(w2c):
    rotation = w2c[:3, :3]
    translation = w2c[:3, 3]
    return (-rotation.T @ translation).astype(float)


def issue(code, message, frame_index=None):
    return {"code": code, "message": message, "frameIndex": frame_index}


def inspect_npz(path):
    data = np.load(path, allow_pickle=False)
    required = ["w2c", "intrinsics", "image_height", "image_width"]
    missing = [key for key in required if key not in data.files]
    if missing:
        raise ValueError(f"Missing required keys: {', '.join(missing)}")

    w2c = np.asarray(data["w2c"], dtype=np.float32)
    intrinsics = np.asarray(data["intrinsics"], dtype=np.float32)
    image_height = int(np.asarray(data["image_height"]).item())
    image_width = int(np.asarray(data["image_width"]).item())

    errors = []
    warnings = []
    if w2c.ndim != 3 or w2c.shape[1:] != (4, 4):
        errors.append(issue("W2C_SHAPE", f"w2c must have shape N x 4 x 4, got {w2c.shape}."))
    if intrinsics.ndim != 3 or intrinsics.shape[1:] != (3, 3):
        errors.append(issue("INTRINSICS_SHAPE", f"intrinsics must have shape N x 3 x 3, got {intrinsics.shape}."))
    if w2c.shape[0] != intrinsics.shape[0]:
        errors.append(issue("FRAME_COUNT_MATCH", "w2c and intrinsics frame counts must match."))

    frame_count = int(w2c.shape[0])
    if (frame_count - 1) % 80 != 0:
        warnings.append(issue("FRAME_COUNT_PATTERN", "Lyra usually works best with 1 + 80k frame counts."))

    frames = []
    if not errors:
        dets = np.linalg.det(w2c[:, :3, :3])
        orth = np.linalg.norm(np.swapaxes(w2c[:, :3, :3], 1, 2) @ w2c[:, :3, :3] - np.eye(3), axis=(1, 2))
        for index in range(frame_count):
            if abs(float(dets[index]) - 1.0) > 1e-3:
                warnings.append(issue("ROTATION_DETERMINANT", f"Frame {index} rotation determinant is {float(dets[index]):.6f}.", index))
            if float(orth[index]) > 1e-3:
                warnings.append(issue("ROTATION_ORTHOGONALITY", f"Frame {index} rotation matrix is not orthogonal.", index))
            center = camera_center_from_w2c(w2c[index])
            K = intrinsics[index]
            frames.append(
                {
                    "index": index,
                    "w2c": w2c[index].astype(float).tolist(),
                    "intrinsics": K.astype(float).tolist(),
                    "center": center.tolist(),
                    "focal": {
                        "fx": float(K[0, 0]),
                        "fy": float(K[1, 1]),
                        "cx": float(K[0, 2]),
                        "cy": float(K[1, 2]),
                    },
                }
            )

    return {
        "meta": {
            "frameCount": frame_count,
            "imageWidth": image_width,
            "imageHeight": image_height,
            "dtype": {"w2c": str(data["w2c"].dtype), "intrinsics": str(data["intrinsics"].dtype)},
        },
        "frames": frames,
        "validation": {"errors": errors, "warnings": warnings},
    }


def main():
    if len(sys.argv) != 2:
        raise SystemExit("Usage: inspect_npz.py <trajectory.npz>")
    payload = inspect_npz(Path(sys.argv[1]))
    print(json.dumps(payload))


if __name__ == "__main__":
    main()
