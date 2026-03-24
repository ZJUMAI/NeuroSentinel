"""
树突检测（Faster R-CNN），用于 NeuroSentinel 线虫显微图像分析。
用法：python visualize_Dendrite_detection.py --img <path> --out-dir <dir>
需要 projects.ViTDet，请确保 NeuroSentinel 根目录在 PYTHONPATH 中。
分析前自动将神经细胞转正（竖起来），便于检测。
"""

import sys
import argparse
from pathlib import Path

# 将 NeuroSentinel 根目录加入 Python 路径，以便导入 projects.ViTDet
script_dir = Path(__file__).resolve().parent
project_root = script_dir.parent
sys.path.insert(0, str(project_root))
sys.path.insert(0, str(script_dir))  # 以便导入 neuron_orientation_preprocess

import torch
_original_torch_load = torch.load
def _patched_torch_load(*args, **kwargs):
    kwargs.setdefault('weights_only', False)
    return _original_torch_load(*args, **kwargs)
torch.load = _patched_torch_load
from mmdet.apis import DetInferencer

from neuron_orientation_preprocess import preprocess_and_save
from detection_utils import filter_overlapping_boxes

DEFAULT_IMG = script_dir / 'Model' / 'sample.png'
DEFAULT_OUT = str(script_dir / 'work_dirs')


def run_dendrite_detection(img_path: str, out_dir: str) -> str:
    import json
    Path(out_dir).mkdir(parents=True, exist_ok=True)
    preprocessed_path = str(Path(out_dir) / 'preprocessed_input.png')
    preprocess_and_save(img_path, preprocessed_path)
    config = str(script_dir / 'Model' / 'vitdet_faster-rcnn_vit-b-mae_Dendrite.py')
    weights = str(script_dir / 'Model' / 'iter_10000.pth')
    device = 'cuda:0' if torch.cuda.is_available() else 'cpu'
    inferencer = DetInferencer(model=config, weights=weights, device=device)
    result = inferencer(preprocessed_path, show=False, out_dir=out_dir, no_save_pred=False, no_save_vis=False)
    preds = result.get("predictions", [])
    total_length = 0.0
    if preds:
        pred = preds[0]
        bboxes = pred.get("bboxes", [])
        scores = pred.get("scores", [])
        items = []
        for i, bbox in enumerate(bboxes):
            if len(bbox) >= 4:
                w, h = max(0, bbox[2] - bbox[0]), max(0, bbox[3] - bbox[1])
                area = w * h
                score = scores[i] if i < len(scores) else 1.0
                items.append((list(bbox), area, score))
        # 重叠补救：重叠>90% 且大小差异≤10% 时，保留置信度更高的框
        filtered = filter_overlapping_boxes(items)
        for bbox, _, _ in filtered:
            w, h = max(0, bbox[2] - bbox[0]), max(0, bbox[3] - bbox[1])
            total_length += (w ** 2 + h ** 2) ** 0.5
    metrics = {"树突长度": round(total_length, 1)}
    with open(Path(out_dir) / "metrics.json", "w", encoding="utf-8") as f:
        json.dump(metrics, f, ensure_ascii=False, indent=2)
    return out_dir


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='线虫树突检测')
    parser.add_argument('--img', default=str(DEFAULT_IMG), help='输入图像路径')
    parser.add_argument('--out-dir', default=DEFAULT_OUT, help='输出目录')
    args = parser.parse_args()
    run_dendrite_detection(args.img, args.out_dir)
