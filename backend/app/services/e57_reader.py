from __future__ import annotations
from dataclasses import dataclass
from pathlib import Path
import numpy as np
import pye57


@dataclass
class E57Data:
    xyz: np.ndarray
    bounds: dict
    point_count: int


class E57ReadError(RuntimeError):
    pass


def read_first_scan(file_path: str | Path, sample_limit: int = 300000) -> E57Data:
    try:
        e57 = pye57.E57(str(file_path))
        data = e57.read_scan_raw(0)
        xyz = np.column_stack((data['cartesianX'], data['cartesianY'], data['cartesianZ']))
        xyz = xyz[np.isfinite(xyz).all(axis=1)]
        if xyz.shape[0] > sample_limit:
            idx = np.linspace(0, xyz.shape[0] - 1, sample_limit).astype(int)
            xyz = xyz[idx]
        bounds = {
            'min_x': float(np.min(xyz[:, 0])),
            'min_y': float(np.min(xyz[:, 1])),
            'min_z': float(np.min(xyz[:, 2])),
            'max_x': float(np.max(xyz[:, 0])),
            'max_y': float(np.max(xyz[:, 1])),
            'max_z': float(np.max(xyz[:, 2])),
        }
        return E57Data(xyz=xyz, bounds=bounds, point_count=int(xyz.shape[0]))
    except Exception as exc:
        raise E57ReadError(f'Failed to read E57: {exc}') from exc
