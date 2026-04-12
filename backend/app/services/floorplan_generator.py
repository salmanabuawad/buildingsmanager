from __future__ import annotations
from pathlib import Path
import json
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import ezdxf
from app.services.e57_reader import E57Data


def _select_height_slice(xyz: np.ndarray) -> np.ndarray:
    zmin = float(np.min(xyz[:, 2]))
    low = zmin + 1.0
    high = zmin + 1.3
    mask = (xyz[:, 2] >= low) & (xyz[:, 2] <= high)
    sliced = xyz[mask]
    if sliced.shape[0] < 1000:
        low = zmin + 0.8
        high = zmin + 1.6
        sliced = xyz[(xyz[:, 2] >= low) & (xyz[:, 2] <= high)]
    return sliced[:, :2]


def _envelope_lines(pts2d: np.ndarray) -> list[tuple[tuple[float, float], tuple[float, float]]]:
    min_x, min_y = np.min(pts2d, axis=0)
    max_x, max_y = np.max(pts2d, axis=0)
    return [
        ((min_x, min_y), (max_x, min_y)),
        ((max_x, min_y), (max_x, max_y)),
        ((max_x, max_y), (min_x, max_y)),
        ((min_x, max_y), (min_x, min_y)),
    ]


def generate_outputs(e57_data: E57Data, dxf_path: Path, preview_path: Path, manifest_path: Path) -> None:
    pts2d = _select_height_slice(e57_data.xyz)
    if pts2d.size == 0:
        pts2d = e57_data.xyz[:, :2]
    lines = _envelope_lines(pts2d)

    doc = ezdxf.new('R2010', setup=True)
    doc.header['$INSUNITS'] = 6  # meters
    msp = doc.modelspace()
    for start, end in lines:
        msp.add_line(start, end, dxfattribs={'layer': 'WALLS'})
    dxf_path.parent.mkdir(parents=True, exist_ok=True)
    doc.saveas(dxf_path)

    fig = plt.figure(figsize=(8, 8))
    plt.scatter(pts2d[:, 0], pts2d[:, 1], s=0.2)
    for start, end in lines:
        plt.plot([start[0], end[0]], [start[1], end[1]], linewidth=2)
    plt.axis('equal')
    plt.tight_layout()
    preview_path.parent.mkdir(parents=True, exist_ok=True)
    plt.savefig(preview_path, dpi=180)
    plt.close(fig)

    manifest = {
        'point_count': e57_data.point_count,
        'bounds': e57_data.bounds,
        'generated_files': {
            'dxf': str(dxf_path),
            'preview': str(preview_path),
        },
        'quality': 'draft_requires_qa',
    }
    manifest_path.parent.mkdir(parents=True, exist_ok=True)
    manifest_path.write_text(json.dumps(manifest, indent=2), encoding='utf-8')
