"""
细胞体实例分割，用于 NeuroSentinel 线虫显微图像分析。
用法：python visualize_Cellbody_instance_segmentation.py --img <path> --out-dir <dir>
需要 projects.ViTDet，请确保 NeuroSentinel 根目录在 PYTHONPATH 中。
分析前自动将神经细胞转正（竖起来），便于识别。
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
from mmdet.apis import DetInferencer

from neuron_orientation_preprocess import preprocess_and_save
from detection_utils import filter_overlapping_boxes

DEFAULT_IMG = script_dir / 'Model' / 'sample.png'
DEFAULT_OUT = str(script_dir / 'work_dirs')


def run_cellbody_segmentation(img_path: str, out_dir: str) -> str:
    import json
    Path(out_dir).mkdir(parents=True, exist_ok=True)
    preprocessed_path = str(Path(out_dir) / 'preprocessed_input.png')
    preprocess_and_save(img_path, preprocessed_path)
    config = str(script_dir / 'Model' / 'vitdet_mask-rcnn_vit-b-mae_CEPADE.py')
    weights = str(script_dir / 'Model' / 'ADECEP_iter_10000.pth')
    device = 'cuda:0' if torch.cuda.is_available() else 'cpu'
    inferencer = DetInferencer(model=config, weights=weights, device=device)
    result = inferencer(preprocessed_path, show=False, out_dir=out_dir, no_save_pred=False, no_save_vis=False)
    preds = result.get("predictions", [])
    cep_areas, ade_areas = [], []
    if preds:
        pred = preds[0]
        labels = pred.get("labels", [])
        bboxes = pred.get("bboxes", [])
        scores = pred.get("scores", [])
        # 收集 CEP (label=0) 和 ADE (label=1)，格式 (bbox, area, score)
        cep_raw = []
        ade_raw = []
        for i, (lbl, bbox) in enumerate(zip(labels, bboxes)):
            if len(bbox) < 4:
                continue
            w, h = max(0, bbox[2] - bbox[0]), max(0, bbox[3] - bbox[1])
            area = w * h
            score = scores[i] if i < len(scores) else 1.0
            if lbl == 0:
                cep_raw.append((list(bbox), area, score))
            elif lbl == 1:
                ade_raw.append((list(bbox), area, score))
        # 重叠补救：重叠>90% 且大小差异≤10% 时，保留置信度更高的框
        cep_filtered = filter_overlapping_boxes(cep_raw)
        ade_filtered = filter_overlapping_boxes(ade_raw)
        # CEP 取置信度最高的前 4 个作为统计（若不足 4 个则全取）
        # ADE 取置信度最高的前 2 个作为统计（若不足 2 个则全取）
        cep_areas = [a for _, a, _ in cep_filtered[:4]]
        ade_areas = [a for _, a, _ in ade_filtered[:2]]
    metrics = {
        "CEP数量": len(cep_areas),
        "平均CEP大小": round(sum(cep_areas) / len(cep_areas), 1) if cep_areas else 0,
        "ADE数量": len(ade_areas),
        "平均ADE大小": round(sum(ade_areas) / len(ade_areas), 1) if ade_areas else 0,
    }
    with open(Path(out_dir) / "metrics.json", "w", encoding="utf-8") as f:
        json.dump(metrics, f, ensure_ascii=False, indent=2)
    return out_dir


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='线虫细胞体实例分割')
    parser.add_argument('--img', default=str(DEFAULT_IMG), help='输入图像路径')
    parser.add_argument('--out-dir', default=DEFAULT_OUT, help='输出目录')
    args = parser.parse_args()
    run_cellbody_segmentation(args.img, args.out_dir)
