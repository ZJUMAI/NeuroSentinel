"""
串珠分割，用于 NeuroSentinel 线虫显微图像分析。
用法：python visualize_bead_segmentation.py --img <path> --out-dir <dir>
"""

import torch
import cv2
import numpy as np

_original_torch_load = torch.load
def _patched_torch_load(*args, **kwargs):
    kwargs.setdefault('weights_only', False)
    return _original_torch_load(*args, **kwargs)
torch.load = _patched_torch_load

from mmseg.apis import init_model, inference_model
from pathlib import Path

from detection_utils import filter_overlapping_boxes_by_area

SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = SCRIPT_DIR
config_path = str(PROJECT_ROOT / 'Model' / 'beads_config.py')
checkpoint_path = str(PROJECT_ROOT / 'Model' / 'iter_144000.pth')
DEFAULT_IMG = PROJECT_ROOT / 'Model' / 'sample.png'
DEFAULT_OUT = str(PROJECT_ROOT / 'work_dirs')


def visualize_with_grayscale_bg(model, img_path, result, opacity=0.8, out_file=None):
    img = cv2.imread(img_path)
    if img is None:
        raise FileNotFoundError(f'无法加载图像: {img_path}')
    img = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
    gray = cv2.cvtColor(img, cv2.COLOR_RGB2GRAY)
    gray_rgb = np.stack([gray, gray, gray], axis=-1)
    pred_mask = result.pred_sem_seg.data
    if hasattr(pred_mask, 'cpu'):
        pred_mask = pred_mask.cpu().numpy()
    pred_mask = np.squeeze(pred_mask).astype(np.uint8)
    if pred_mask.shape != gray.shape[:2]:
        pred_mask = cv2.resize(pred_mask, (img.shape[1], img.shape[0]), interpolation=cv2.INTER_NEAREST)
    palette = [[0, 0, 0], [255, 0, 0]]
    seg_vis = gray_rgb.copy()
    for cls_id in range(1, len(palette)):
        mask = pred_mask == cls_id
        color = np.array(palette[cls_id], dtype=np.uint8)
        seg_vis[mask] = (1 - opacity) * gray_rgb[mask] + opacity * color
    if out_file:
        cv2.imwrite(out_file, cv2.cvtColor(seg_vis, cv2.COLOR_RGB2BGR))
    return seg_vis


def run_bead_segmentation(img_path: str, out_dir: str) -> str:
    import json
    device = 'cuda:0' if torch.cuda.is_available() else 'cpu'
    model = init_model(config_path, checkpoint_path, device=device)
    result = inference_model(model, img_path)
    out_file = str(Path(out_dir) / 'bead_segmentation_result.png')
    Path(out_dir).mkdir(parents=True, exist_ok=True)
    visualize_with_grayscale_bg(model, img_path, result, opacity=1.0, out_file=out_file)
    pred_mask = result.pred_sem_seg.data
    if hasattr(pred_mask, 'cpu'):
        pred_mask = pred_mask.cpu().numpy()
    pred_mask = np.squeeze(pred_mask).astype(np.uint8)
    bead_mask = (pred_mask == 1).astype(np.uint8)
    num_labels, labels, stats, _ = cv2.connectedComponentsWithStats(bead_mask, connectivity=8)
    # 构建 (bbox, area)，bbox 为 [x1, y1, x2, y2]
    bead_items = []
    for i in range(1, num_labels):
        a = stats[i, cv2.CC_STAT_AREA]
        if a <= 0:
            continue
        x = stats[i, cv2.CC_STAT_LEFT]
        y = stats[i, cv2.CC_STAT_TOP]
        w = stats[i, cv2.CC_STAT_WIDTH]
        h = stats[i, cv2.CC_STAT_HEIGHT]
        bbox = [x, y, x + w, y + h]
        bead_items.append((bbox, float(a)))
    # 重叠补救：重叠>90% 且大小差异≤10% 时，保留面积更大的框
    filtered = filter_overlapping_boxes_by_area(bead_items)
    bead_count = len(filtered)
    areas = [a for _, a in filtered]
    avg_bead_size = round(np.mean(areas), 1) if areas else 0
    metrics = {"串珠数量": bead_count, "平均串珠大小": avg_bead_size}
    with open(Path(out_dir) / 'metrics.json', 'w', encoding='utf-8') as f:
        json.dump(metrics, f, ensure_ascii=False, indent=2)
    return out_file


if __name__ == '__main__':
    import argparse
    parser = argparse.ArgumentParser(description='线虫串珠分割')
    parser.add_argument('--img', default=str(DEFAULT_IMG), help='输入图像路径')
    parser.add_argument('--out-dir', default=DEFAULT_OUT, help='输出目录')
    args = parser.parse_args()
    run_bead_segmentation(args.img, args.out_dir)
