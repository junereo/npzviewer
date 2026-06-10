from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT))

from clean_lyra_ply import read_ply, sigmoid  # noqa: E402

SH_C0 = 0.28209479177387814
FLOATS_PER_POINT = 14


def emit_progress(enabled: bool, step: str, message: str, **extra: object) -> None:
    if enabled:
        print(f"PROGRESS {json.dumps({'step': step, 'message': message, **extra})}", file=sys.stderr, flush=True)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Convert a Lyra/3DGS PLY into a browser viewer asset.")
    parser.add_argument("input", type=Path)
    parser.add_argument("output_dir", type=Path)
    parser.add_argument("--max-points", type=int, default=500_000)
    parser.add_argument("--chunk-size", type=int, default=250_000)
    parser.add_argument("--progress", action="store_true")
    return parser


def main() -> int:
    args = build_parser().parse_args()
    args.output_dir.mkdir(parents=True, exist_ok=True)
    chunks_dir = args.output_dir / "chunks"
    chunks_dir.mkdir(parents=True, exist_ok=True)

    emit_progress(args.progress, "loading", "Reading PLY.")
    ply = read_ply(args.input)
    vertex = ply.elements["vertex"]
    if vertex.data is None:
        raise ValueError("PLY vertex data was not loaded")
    data = vertex.data
    names = data.dtype.names or ()
    for required in ("x", "y", "z"):
        if required not in names:
            raise ValueError(f"PLY vertex data has no {required!r} property")

    total_points = len(data)
    emit_progress(args.progress, "loaded", "PLY loaded.", inputPoints=total_points)
    selected = sample_indices(total_points, args.max_points)
    sampled = data[selected]

    emit_progress(args.progress, "attributes", "Extracting Gaussian attributes.", outputPoints=len(sampled))
    positions = np.column_stack([sampled["x"], sampled["y"], sampled["z"]]).astype(np.float32)
    colors = dc_color(sampled, names)
    opacities = sigmoid(np.asarray(sampled["opacity"], dtype=np.float32)) if "opacity" in names else np.ones(len(sampled), dtype=np.float32)
    scales = gaussian_scales(sampled, names)
    rotations = gaussian_rotations(sampled, names)
    packed = np.column_stack([positions, colors, opacities[:, None], scales, rotations]).astype(np.float32)

    emit_progress(args.progress, "chunks", "Writing viewer chunks.", outputPoints=len(sampled))
    chunks = []
    for chunk_index, start in enumerate(range(0, len(packed), args.chunk_size)):
        chunk = packed[start : start + args.chunk_size]
        chunk_name = f"chunk_{chunk_index:03d}.bin"
        chunk_path = chunks_dir / chunk_name
        chunk.tofile(chunk_path)
        chunks.append(
            {
                "name": chunk_name,
                "pointCount": int(len(chunk)),
                "byteLength": int(chunk_path.stat().st_size),
                "floatStride": FLOATS_PER_POINT,
            }
        )

    bounds_min = positions.min(axis=0).tolist() if len(positions) else [0.0, 0.0, 0.0]
    bounds_max = positions.max(axis=0).tolist() if len(positions) else [0.0, 0.0, 0.0]
    manifest = {
        "version": 1,
        "sourceName": args.input.name,
        "pointCount": int(len(sampled)),
        "sourcePointCount": int(total_points),
        "sampled": bool(len(sampled) != total_points),
        "bounds": {"min": [float(v) for v in bounds_min], "max": [float(v) for v in bounds_max]},
        "layout": {"format": "float32-interleaved", "floatStride": FLOATS_PER_POINT},
        "attributes": {
            "position": {"offset": 0, "itemSize": 3},
            "color": {"offset": 3, "itemSize": 3},
            "opacity": {"offset": 6, "itemSize": 1},
            "scale": {"offset": 7, "itemSize": 3},
            "rotation": {"offset": 10, "itemSize": 4},
        },
        "chunks": chunks,
        "lods": [{"level": 0, "pointCount": int(len(sampled)), "chunkNames": [chunk["name"] for chunk in chunks]}],
    }
    (args.output_dir / "viewer-manifest.json").write_text(json.dumps(manifest), encoding="utf8")
    emit_progress(args.progress, "complete", "Viewer asset written.", outputPoints=len(sampled))
    print(json.dumps(manifest))
    return 0


def sample_indices(total_points: int, max_points: int) -> np.ndarray:
    if total_points <= max_points:
        return np.arange(total_points, dtype=np.int64)
    return np.linspace(0, total_points - 1, max_points, dtype=np.int64)


def dc_color(data: np.ndarray, names: tuple[str, ...]) -> np.ndarray:
    if all(name in names for name in ("f_dc_0", "f_dc_1", "f_dc_2")):
        dc = np.column_stack([data["f_dc_0"], data["f_dc_1"], data["f_dc_2"]]).astype(np.float32)
        return np.clip(0.5 + SH_C0 * dc, 0.0, 1.0)
    return np.full((len(data), 3), 0.82, dtype=np.float32)


def gaussian_scales(data: np.ndarray, names: tuple[str, ...]) -> np.ndarray:
    scale_names = ["scale_0", "scale_1", "scale_2"]
    if all(name in names for name in scale_names):
        raw = np.column_stack([data[name] for name in scale_names]).astype(np.float32)
        return np.exp(np.clip(raw, -12.0, 12.0)).astype(np.float32)
    return np.full((len(data), 3), 0.01, dtype=np.float32)


def gaussian_rotations(data: np.ndarray, names: tuple[str, ...]) -> np.ndarray:
    rot_names = ["rot_0", "rot_1", "rot_2", "rot_3"]
    if all(name in names for name in rot_names):
        rotations = np.column_stack([data[name] for name in rot_names]).astype(np.float32)
    else:
        rotations = np.tile(np.array([1.0, 0.0, 0.0, 0.0], dtype=np.float32), (len(data), 1))
    norm = np.linalg.norm(rotations, axis=1, keepdims=True)
    norm[norm == 0] = 1.0
    return rotations / norm


if __name__ == "__main__":
    raise SystemExit(main())
