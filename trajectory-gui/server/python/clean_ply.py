from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT))

from clean_lyra_ply import PRESETS, clean_3dgs_ply  # noqa: E402


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Clean a Lyra/3DGS PLY and print JSON stats.")
    parser.add_argument("input", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--preset", choices=PRESETS, default="light")
    parser.add_argument("--opacity-threshold", type=float)
    parser.add_argument("--scale-quantile", type=float, default=0.995)
    parser.add_argument("--eps-ratio", type=float)
    parser.add_argument("--eps", type=float)
    parser.add_argument("--min-samples", type=int)
    parser.add_argument("--min-cluster-ratio", type=float)
    parser.add_argument("--no-sor", action="store_true")
    parser.add_argument("--sor-neighbors", type=int, default=12)
    parser.add_argument("--sor-std-ratio", type=float, default=2.0)
    parser.add_argument("--progress", action="store_true", help="Emit progress JSON lines to stderr.")
    return parser


def main() -> int:
    args = build_parser().parse_args()
    options = dict(PRESETS[args.preset])
    for key in ("opacity_threshold", "eps_ratio", "min_samples", "min_cluster_ratio"):
        value = getattr(args, key)
        if value is not None:
            options[key] = value

    def emit_progress(event: dict[str, object]) -> None:
        if not args.progress:
            return
        print(f"PROGRESS {json.dumps(event)}", file=sys.stderr, flush=True)

    stats = clean_3dgs_ply(
        args.input,
        args.output,
        scale_quantile=args.scale_quantile,
        eps=args.eps,
        enable_sor=not args.no_sor,
        sor_neighbors=args.sor_neighbors,
        sor_std_ratio=args.sor_std_ratio,
        progress_callback=emit_progress if args.progress else None,
        **options,
    )
    print(
        json.dumps(
            {
                "inputPoints": stats.input_points,
                "outputPoints": stats.output_points,
                "removedOpacity": stats.removed_opacity,
                "removedScale": stats.removed_scale,
                "removedSor": stats.removed_sor,
                "removedDbscan": stats.removed_dbscan,
                "eps": stats.eps,
            }
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
