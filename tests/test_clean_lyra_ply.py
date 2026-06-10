from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from clean_lyra_ply import clean_3dgs_ply, read_ply


SAMPLE_PLY = """ply
format ascii 1.0
element vertex 7
property float x
property float y
property float z
property float opacity
property float scale_0
property float scale_1
property float scale_2
property float f_dc_0
element camera 1
property float cx
end_header
0.00 0.00 0.00 4.0 -4.0 -4.0 -4.0 10
0.01 0.00 0.00 4.0 -4.0 -4.0 -4.0 11
0.00 0.01 0.00 4.0 -4.0 -4.0 -4.0 12
0.01 0.01 0.00 4.0 -4.0 -4.0 -4.0 13
5.00 5.00 5.00 4.0 -4.0 -4.0 -4.0 99
0.02 0.02 0.00 -10.0 -4.0 -4.0 -4.0 77
0.03 0.03 0.00 4.0 3.0 3.0 3.0 88
123.0
"""


class CleanLyraPlyTests(unittest.TestCase):
    def test_filters_rows_and_preserves_vertex_attributes(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            input_path = Path(tmp) / "input.ply"
            output_path = Path(tmp) / "cleaned.ply"
            input_path.write_text(SAMPLE_PLY, encoding="ascii")

            stats = clean_3dgs_ply(
                input_path,
                output_path,
                opacity_threshold=0.01,
                scale_quantile=0.85,
                eps=0.05,
                min_samples=2,
                min_cluster_ratio=0.0,
                enable_sor=False,
            )

            cleaned = read_ply(output_path)
            vertex = cleaned.elements["vertex"].data

            self.assertEqual(stats.input_points, 7)
            self.assertEqual(stats.output_points, 4)
            self.assertEqual(vertex["f_dc_0"].tolist(), [10.0, 11.0, 12.0, 13.0])
            self.assertIn("camera", cleaned.elements)


if __name__ == "__main__":
    unittest.main()
