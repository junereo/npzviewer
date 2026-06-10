from __future__ import annotations

import argparse
import math
from collections import defaultdict, deque
from dataclasses import dataclass
from pathlib import Path
from typing import BinaryIO, Callable

import numpy as np


PLY_TO_DTYPE = {
    "char": "i1",
    "int8": "i1",
    "uchar": "u1",
    "uint8": "u1",
    "short": "i2",
    "int16": "i2",
    "ushort": "u2",
    "uint16": "u2",
    "int": "i4",
    "int32": "i4",
    "uint": "u4",
    "uint32": "u4",
    "float": "f4",
    "float32": "f4",
    "double": "f8",
    "float64": "f8",
}

DTYPE_TO_STRUCT = {
    "i1": "b",
    "u1": "B",
    "i2": "h",
    "u2": "H",
    "i4": "i",
    "u4": "I",
    "f4": "f",
    "f8": "d",
}


@dataclass(frozen=True)
class PlyProperty:
    name: str
    ply_type: str


@dataclass
class PlyElementData:
    name: str
    count: int
    properties: list[PlyProperty]
    data: np.ndarray | None = None
    raw_ascii_rows: list[str] | None = None
    raw_binary: bytes | None = None


@dataclass
class PlyDocument:
    format_name: str
    comments: list[str]
    obj_infos: list[str]
    element_order: list[str]
    elements: dict[str, PlyElementData]


@dataclass(frozen=True)
class CleanStats:
    input_points: int
    output_points: int
    removed_opacity: int
    removed_scale: int
    removed_sor: int
    removed_dbscan: int
    eps: float


ProgressCallback = Callable[[dict[str, int | float | str | bool | None]], None]


def sigmoid(x: np.ndarray) -> np.ndarray:
    positive = x >= 0
    out = np.empty_like(x, dtype=np.float32)
    out[positive] = 1.0 / (1.0 + np.exp(-x[positive]))
    exp_x = np.exp(x[~positive])
    out[~positive] = exp_x / (1.0 + exp_x)
    return out


def _dtype_for_properties(properties: list[PlyProperty], endian: str = "<") -> np.dtype:
    fields = []
    for prop in properties:
        if prop.ply_type not in PLY_TO_DTYPE:
            raise ValueError(f"Unsupported PLY property type: {prop.ply_type}")
        fields.append((prop.name, np.dtype(endian + PLY_TO_DTYPE[prop.ply_type])))
    return np.dtype(fields)


def _read_header(handle: BinaryIO) -> tuple[list[str], int]:
    lines: list[str] = []
    bytes_read = 0
    while True:
        line = handle.readline()
        if not line:
            raise ValueError("Invalid PLY: missing end_header")
        bytes_read += len(line)
        decoded = line.decode("ascii").rstrip("\r\n")
        lines.append(decoded)
        if decoded == "end_header":
            return lines, bytes_read


def _parse_header(lines: list[str]) -> PlyDocument:
    if not lines or lines[0] != "ply":
        raise ValueError("Input is not a PLY file")

    format_name = ""
    comments: list[str] = []
    obj_infos: list[str] = []
    element_order: list[str] = []
    elements: dict[str, PlyElementData] = {}
    current: PlyElementData | None = None

    for line in lines[1:]:
        if line == "end_header":
            break
        parts = line.split()
        if not parts:
            continue
        if parts[0] == "format":
            format_name = parts[1]
        elif parts[0] == "comment":
            comments.append(line)
        elif parts[0] == "obj_info":
            obj_infos.append(line)
        elif parts[0] == "element":
            if len(parts) != 3:
                raise ValueError(f"Invalid element line: {line}")
            current = PlyElementData(parts[1], int(parts[2]), [])
            element_order.append(current.name)
            elements[current.name] = current
        elif parts[0] == "property":
            if current is None:
                raise ValueError("Property appears before any element")
            if parts[1] == "list":
                raise ValueError("List properties are not supported by this cleaner")
            if len(parts) != 3:
                raise ValueError(f"Invalid property line: {line}")
            current.properties.append(PlyProperty(parts[2], parts[1]))

    if format_name not in {"ascii", "binary_little_endian", "binary_big_endian"}:
        raise ValueError(f"Unsupported PLY format: {format_name}")
    if "vertex" not in elements:
        raise ValueError("PLY has no vertex element")
    return PlyDocument(format_name, comments, obj_infos, element_order, elements)


def read_ply(path: str | Path) -> PlyDocument:
    path = Path(path)
    with path.open("rb") as handle:
        header_lines, _ = _read_header(handle)
        doc = _parse_header(header_lines)

        if doc.format_name == "ascii":
            for name in doc.element_order:
                element = doc.elements[name]
                rows = [handle.readline().decode("ascii").rstrip("\r\n") for _ in range(element.count)]
                if name == "vertex":
                    dtype = _dtype_for_properties(element.properties, "=")
                    parsed = []
                    for row in rows:
                        values = row.split()
                        if len(values) != len(element.properties):
                            raise ValueError(f"Invalid vertex row with {len(values)} values")
                        parsed.append(tuple(_parse_ascii_value(value, prop.ply_type) for value, prop in zip(values, element.properties)))
                    element.data = np.array(parsed, dtype=dtype)
                else:
                    element.raw_ascii_rows = rows
        else:
            endian = "<" if doc.format_name == "binary_little_endian" else ">"
            for name in doc.element_order:
                element = doc.elements[name]
                dtype = _dtype_for_properties(element.properties, endian)
                byte_count = dtype.itemsize * element.count
                raw = handle.read(byte_count)
                if len(raw) != byte_count:
                    raise ValueError(f"Unexpected EOF while reading element {name}")
                if name == "vertex":
                    element.data = np.frombuffer(raw, dtype=dtype).copy()
                else:
                    element.raw_binary = raw
        return doc


def _parse_ascii_value(value: str, ply_type: str) -> int | float:
    code = PLY_TO_DTYPE[ply_type]
    return float(value) if code.startswith("f") else int(value)


def write_ply(doc: PlyDocument, path: str | Path) -> None:
    path = Path(path)
    vertex = doc.elements["vertex"]
    if vertex.data is None:
        raise ValueError("PLY document has no loaded vertex data")
    vertex.count = int(len(vertex.data))

    with path.open("wb") as handle:
        header = _build_header(doc)
        handle.write(header.encode("ascii"))
        if doc.format_name == "ascii":
            _write_ascii_body(doc, handle)
        else:
            _write_binary_body(doc, handle)


def _build_header(doc: PlyDocument) -> str:
    lines = ["ply", f"format {doc.format_name} 1.0"]
    lines.extend(doc.comments)
    lines.extend(doc.obj_infos)
    for name in doc.element_order:
        element = doc.elements[name]
        lines.append(f"element {name} {element.count}")
        for prop in element.properties:
            lines.append(f"property {prop.ply_type} {prop.name}")
    lines.append("end_header")
    return "\n".join(lines) + "\n"


def _write_ascii_body(doc: PlyDocument, handle: BinaryIO) -> None:
    for name in doc.element_order:
        element = doc.elements[name]
        if name == "vertex":
            assert element.data is not None
            for row in element.data:
                values = [_format_ascii_value(row[prop.name].item()) for prop in element.properties]
                handle.write((" ".join(values) + "\n").encode("ascii"))
        else:
            for row in element.raw_ascii_rows or []:
                handle.write((row + "\n").encode("ascii"))


def _write_binary_body(doc: PlyDocument, handle: BinaryIO) -> None:
    for name in doc.element_order:
        element = doc.elements[name]
        if name == "vertex":
            assert element.data is not None
            handle.write(element.data.tobytes())
        else:
            handle.write(element.raw_binary or b"")


def _format_ascii_value(value: int | float) -> str:
    if isinstance(value, float):
        return format(value, ".9g")
    return str(value)


def clean_3dgs_ply(
    input_path: str | Path,
    output_path: str | Path,
    *,
    opacity_threshold: float = 0.01,
    scale_quantile: float = 0.995,
    eps_ratio: float = 0.004,
    eps: float | None = None,
    min_samples: int = 8,
    min_cluster_ratio: float = 0.0005,
    enable_sor: bool = True,
    sor_neighbors: int = 12,
    sor_std_ratio: float = 2.0,
    progress_callback: ProgressCallback | None = None,
) -> CleanStats:
    def progress(step: str, keep_mask: np.ndarray | None, message: str, eps_value: float | None = None) -> None:
        if progress_callback is None:
            return
        output_points = int(keep_mask.sum()) if keep_mask is not None else int(len(data))
        progress_callback(
            {
                "step": step,
                "message": message,
                "inputPoints": int(len(data)),
                "outputPoints": output_points,
                "removedPoints": int(len(data) - output_points),
                "eps": eps_value,
            }
        )

    ply = read_ply(input_path)
    vertex = ply.elements["vertex"]
    if vertex.data is None:
        raise ValueError("PLY vertex data was not loaded")
    data = vertex.data
    names = data.dtype.names or ()
    for axis in ("x", "y", "z"):
        if axis not in names:
            raise ValueError(f"PLY vertex data has no {axis!r} property")

    xyz = np.column_stack([data["x"], data["y"], data["z"]]).astype(np.float32)
    keep = np.ones(len(data), dtype=bool)
    progress("loaded", keep, "PLY loaded and vertex rows parsed.")

    before = keep.copy()
    if "opacity" in names and opacity_threshold > 0:
        opacity_real = sigmoid(np.asarray(data["opacity"], dtype=np.float32))
        keep &= opacity_real >= opacity_threshold
    removed_opacity = int(before.sum() - keep.sum())
    progress("opacity", keep, "Opacity threshold applied.")

    before = keep.copy()
    scale_names = sorted([name for name in names if name.startswith("scale_")])
    if scale_names and 0 < scale_quantile < 1 and keep.any():
        scales = np.column_stack([np.asarray(data[name], dtype=np.float32) for name in scale_names[:3]])
        max_scale = np.exp(np.clip(scales, -30.0, 30.0)).max(axis=1)
        scale_limit = float(np.quantile(max_scale[keep], scale_quantile))
        keep &= max_scale <= scale_limit
    removed_scale = int(before.sum() - keep.sum())
    progress("scale", keep, "Scale outlier filter applied.")

    before = keep.copy()
    if enable_sor and keep.sum() > max(sor_neighbors + 1, 4):
        keep_indices = np.flatnonzero(keep)
        sor_keep = statistical_outlier_mask(xyz[keep], sor_neighbors, sor_std_ratio)
        keep[keep_indices] = sor_keep
    removed_sor = int(before.sum() - keep.sum())
    progress("sor", keep, "Statistical outlier removal applied.")

    xyz_kept = xyz[keep]
    if len(xyz_kept) == 0:
        raise ValueError("No points left after opacity, scale, and SOR filtering")

    if eps is None:
        bbox_diag = float(np.linalg.norm(xyz_kept.max(axis=0) - xyz_kept.min(axis=0)))
        eps_value = bbox_diag * eps_ratio
    else:
        eps_value = float(eps)

    before = keep.copy()
    if eps_value > 0 and min_samples > 1 and len(xyz_kept) >= min_samples:
        labels = dbscan_labels(xyz_kept, eps_value, min_samples)
        cluster_keep = labels != -1
        valid_labels = labels[cluster_keep]
        if len(valid_labels):
            unique, counts = np.unique(valid_labels, return_counts=True)
            min_cluster_size = max(1, int(len(xyz_kept) * min_cluster_ratio))
            large_labels = set(unique[counts >= min_cluster_size].tolist())
            cluster_keep &= np.array([label in large_labels for label in labels], dtype=bool)
        else:
            cluster_keep[:] = False
        keep[np.flatnonzero(keep)] = cluster_keep
    removed_dbscan = int(before.sum() - keep.sum())
    progress("dbscan", keep, "DBSCAN floating cluster filter applied.", eps_value)

    vertex.data = data[keep].copy()
    progress("writing", keep, "Writing cleaned PLY file.", eps_value)
    write_ply(ply, output_path)
    progress("complete", keep, "Cleaned PLY file written.", eps_value)

    return CleanStats(
        input_points=int(len(data)),
        output_points=int(keep.sum()),
        removed_opacity=removed_opacity,
        removed_scale=removed_scale,
        removed_sor=removed_sor,
        removed_dbscan=removed_dbscan,
        eps=eps_value,
    )


def dbscan_labels(points: np.ndarray, eps: float, min_samples: int) -> np.ndarray:
    labels = np.full(len(points), -99, dtype=np.int32)
    cluster_id = 0
    neighbors_cache: dict[int, list[int]] = {}

    def neighbors(index: int) -> list[int]:
        if index not in neighbors_cache:
            neighbors_cache[index] = radius_neighbors(points, eps, index)
        return neighbors_cache[index]

    for point_index in range(len(points)):
        if labels[point_index] != -99:
            continue
        point_neighbors = neighbors(point_index)
        if len(point_neighbors) < min_samples:
            labels[point_index] = -1
            continue

        labels[point_index] = cluster_id
        queue: deque[int] = deque(point_neighbors)
        while queue:
            neighbor = queue.popleft()
            if labels[neighbor] == -1:
                labels[neighbor] = cluster_id
            if labels[neighbor] != -99:
                continue
            labels[neighbor] = cluster_id
            neighbor_neighbors = neighbors(neighbor)
            if len(neighbor_neighbors) >= min_samples:
                queue.extend(neighbor_neighbors)
        cluster_id += 1

    labels[labels == -99] = -1
    return labels


def radius_neighbors(points: np.ndarray, eps: float, index: int) -> list[int]:
    grid = _grid_index(points, eps)
    cell = _cell_for_point(points[index], eps)
    out: list[int] = []
    eps_sq = eps * eps
    for dx in (-1, 0, 1):
        for dy in (-1, 0, 1):
            for dz in (-1, 0, 1):
                for candidate in grid.get((cell[0] + dx, cell[1] + dy, cell[2] + dz), []):
                    delta = points[candidate] - points[index]
                    if float(np.dot(delta, delta)) <= eps_sq:
                        out.append(candidate)
    return out


def _grid_index(points: np.ndarray, cell_size: float) -> dict[tuple[int, int, int], list[int]]:
    if not hasattr(_grid_index, "_cache"):
        _grid_index._cache = {}  # type: ignore[attr-defined]
    cache_key = (id(points), len(points), float(cell_size))
    cache = _grid_index._cache  # type: ignore[attr-defined]
    if cache_key in cache:
        return cache[cache_key]
    grid: dict[tuple[int, int, int], list[int]] = defaultdict(list)
    cells = np.floor(points / cell_size).astype(np.int64)
    for index, cell in enumerate(cells):
        grid[(int(cell[0]), int(cell[1]), int(cell[2]))].append(index)
    cache.clear()
    cache[cache_key] = grid
    return grid


def _cell_for_point(point: np.ndarray, cell_size: float) -> tuple[int, int, int]:
    cell = np.floor(point / cell_size).astype(np.int64)
    return int(cell[0]), int(cell[1]), int(cell[2])


def statistical_outlier_mask(points: np.ndarray, neighbors: int, std_ratio: float) -> np.ndarray:
    if len(points) <= neighbors:
        return np.ones(len(points), dtype=bool)
    bbox_diag = float(np.linalg.norm(points.max(axis=0) - points.min(axis=0)))
    if bbox_diag == 0:
        return np.ones(len(points), dtype=bool)
    cell_size = bbox_diag / max(1.0, len(points) ** (1.0 / 3.0))
    grid = _grid_index(points, cell_size)
    max_ring = max(1, int(math.ceil((len(grid) ** (1.0 / 3.0)) * 2)))
    mean_distances = np.empty(len(points), dtype=np.float32)
    for index in range(len(points)):
        candidate_indices = _candidate_neighbors_from_grid(points, grid, cell_size, index, neighbors + 1, max_ring)
        candidate_points = points[candidate_indices]
        distances = np.linalg.norm(candidate_points - points[index], axis=1)
        distances.sort()
        usable = distances[1 : min(len(distances), neighbors + 1)]
        mean_distances[index] = float(np.mean(usable)) if len(usable) else 0.0
    limit = float(mean_distances.mean() + std_ratio * mean_distances.std())
    return mean_distances <= limit


def _candidate_neighbors_from_grid(
    points: np.ndarray,
    grid: dict[tuple[int, int, int], list[int]],
    cell_size: float,
    index: int,
    minimum: int,
    max_ring: int,
) -> list[int]:
    cell = _cell_for_point(points[index], cell_size)
    candidates: set[int] = set()
    for ring in range(max_ring + 1):
        for dx in range(-ring, ring + 1):
            for dy in range(-ring, ring + 1):
                for dz in range(-ring, ring + 1):
                    if max(abs(dx), abs(dy), abs(dz)) != ring:
                        continue
                    candidates.update(grid.get((cell[0] + dx, cell[1] + dy, cell[2] + dz), []))
        if len(candidates) >= minimum:
            return list(candidates)
    return list(candidates) if candidates else [index]


PRESETS = {
    "light": {
        "opacity_threshold": 0.01,
        "eps_ratio": 0.004,
        "min_samples": 8,
        "min_cluster_ratio": 0.0005,
    },
    "medium": {
        "opacity_threshold": 0.02,
        "eps_ratio": 0.006,
        "min_samples": 12,
        "min_cluster_ratio": 0.002,
    },
    "strong": {
        "opacity_threshold": 0.03,
        "eps_ratio": 0.008,
        "min_samples": 20,
        "min_cluster_ratio": 0.005,
    },
}


def build_arg_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Remove outlier Gaussians from Lyra/3DGS PLY files.")
    parser.add_argument("input", type=Path, help="Input Lyra/3DGS PLY file")
    parser.add_argument("output", type=Path, help="Output cleaned PLY file")
    parser.add_argument("--preset", choices=PRESETS, default="light", help="Filter strength preset")
    parser.add_argument("--opacity-threshold", type=float, help="Minimum sigmoid(opacity) to keep")
    parser.add_argument("--scale-quantile", type=float, default=0.995, help="Remove max scale above this quantile")
    parser.add_argument("--eps-ratio", type=float, help="DBSCAN eps as bbox diagonal ratio")
    parser.add_argument("--eps", type=float, help="Absolute DBSCAN eps. Overrides --eps-ratio")
    parser.add_argument("--min-samples", type=int, help="DBSCAN minimum neighbors")
    parser.add_argument("--min-cluster-ratio", type=float, help="Remove clusters smaller than this point ratio")
    parser.add_argument("--no-sor", action="store_true", help="Disable statistical outlier removal")
    parser.add_argument("--sor-neighbors", type=int, default=12, help="Neighbor count for statistical outlier removal")
    parser.add_argument("--sor-std-ratio", type=float, default=2.0, help="SOR distance stddev multiplier")
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_arg_parser()
    args = parser.parse_args(argv)
    options = dict(PRESETS[args.preset])
    for key in ("opacity_threshold", "eps_ratio", "min_samples", "min_cluster_ratio"):
        value = getattr(args, key)
        if value is not None:
            options[key] = value

    stats = clean_3dgs_ply(
        args.input,
        args.output,
        scale_quantile=args.scale_quantile,
        eps=args.eps,
        enable_sor=not args.no_sor,
        sor_neighbors=args.sor_neighbors,
        sor_std_ratio=args.sor_std_ratio,
        **options,
    )

    print(f"input points:    {stats.input_points:,}")
    print(f"output points:   {stats.output_points:,}")
    print(f"removed opacity: {stats.removed_opacity:,}")
    print(f"removed scale:   {stats.removed_scale:,}")
    print(f"removed SOR:     {stats.removed_sor:,}")
    print(f"removed DBSCAN:  {stats.removed_dbscan:,}")
    print(f"eps:             {stats.eps:.6g}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
