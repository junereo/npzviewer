import json
import sys
from pathlib import Path

import numpy as np


def write_npz(json_path, output_path):
    payload = json.loads(Path(json_path).read_text(encoding="utf-8"))
    meta = payload["meta"]
    frames = payload["frames"]

    w2c = np.asarray([frame["w2c"] for frame in frames], dtype=np.float32)
    intrinsics = np.asarray([frame["intrinsics"] for frame in frames], dtype=np.float32)
    if w2c.ndim != 3 or w2c.shape[1:] != (4, 4):
        raise ValueError(f"w2c must have shape N x 4 x 4, got {w2c.shape}")
    if intrinsics.ndim != 3 or intrinsics.shape[1:] != (3, 3):
        raise ValueError(f"intrinsics must have shape N x 3 x 3, got {intrinsics.shape}")
    if w2c.shape[0] != int(meta["frameCount"]):
        raise ValueError("frameCount must match number of frames")

    np.savez(
        output_path,
        w2c=w2c,
        intrinsics=intrinsics,
        image_height=np.asarray(meta["imageHeight"], dtype=np.int64),
        image_width=np.asarray(meta["imageWidth"], dtype=np.int64),
    )


def main():
    if len(sys.argv) != 3:
        raise SystemExit("Usage: write_npz.py <trajectory.json> <output.npz>")
    write_npz(Path(sys.argv[1]), Path(sys.argv[2]))
    print(json.dumps({"ok": True, "path": sys.argv[2]}))


if __name__ == "__main__":
    main()
