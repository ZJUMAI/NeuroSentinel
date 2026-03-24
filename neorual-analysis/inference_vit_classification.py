"""
ViT 神经元形态分类（arborization/bend/break），用于 NeuroSentinel 线虫显微图像分析。

模型权重：Model/best_arborization.pth, Model/best_bend.pth, Model/best_break.pth
用法：python inference_vit_classification.py --img <path> --out-dir <dir>
"""

import torch
import torch.nn as nn
from functools import partial

_original_torch_load = torch.load
def _patched_torch_load(*args, **kwargs):
    kwargs.setdefault('weights_only', False)
    return _original_torch_load(*args, **kwargs)
torch.load = _patched_torch_load

import cv2
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
plt.rcParams['font.sans-serif'] = ['Microsoft YaHei', 'SimHei', 'SimSun', 'sans-serif']
plt.rcParams['axes.unicode_minus'] = False
import numpy as np
import timm
from PIL import Image
from pathlib import Path

try:
    from pytorch_grad_cam import GradCAM
    from pytorch_grad_cam.utils.model_targets import ClassifierOutputTarget
    from pytorch_grad_cam.utils.image import show_cam_on_image, preprocess_image
    GRADCAM_AVAILABLE = True
except ImportError:
    GRADCAM_AVAILABLE = False

# 脚本所在目录 = neorual-analysis/
SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = SCRIPT_DIR

CHECKPOINTS = {
    'arborization': PROJECT_ROOT / 'Model' / 'best_arborization.pth',
    'bend': PROJECT_ROOT / 'Model' / 'best_bend.pth',
    'break': PROJECT_ROOT / 'Model' / 'best_break.pth',
}
DEFAULT_TASK = 'all'
DEFAULT_IMG = PROJECT_ROOT / 'Model' / 'sample.png'
OUT_DIR = 'work_dirs'
IMG_SIZE = 480
NUM_CLASSES = None
USE_HIST_EQUAL = True
PATCH_GRID_H = IMG_SIZE // 16
PATCH_GRID_W = IMG_SIZE // 16


def infer_num_classes_from_checkpoint(state_dict: dict) -> int:
    if 'head.weight' in state_dict:
        return state_dict['head.weight'].shape[0]
    exclude = ('blocks', 'mlp', 'patch_embed', 'norm', 'pos_embed')
    for k, v in state_dict.items():
        if any(x in k for x in exclude):
            continue
        if ('head' in k or 'classifier' in k) and 'weight' in k and v.dim() == 2:
            return v.shape[0]
    return 2


class VisionTransformer(timm.models.vision_transformer.VisionTransformer):
    def __init__(self, **kwargs):
        super(VisionTransformer, self).__init__(**kwargs)


def vit_base_patch16_480(**kwargs):
    return VisionTransformer(
        img_size=480, patch_size=16, embed_dim=768, depth=12, num_heads=12,
        mlp_ratio=4, qkv_bias=True, norm_layer=partial(nn.LayerNorm, eps=1e-6), **kwargs,
    )


def load_model(MODEL_PATH: str, device: str = 'cpu') -> torch.nn.Module:
    checkpoint = torch.load(MODEL_PATH, map_location='cpu')
    checkpoint_model = checkpoint.get('model', checkpoint.get('state_dict', checkpoint))
    checkpoint_model = {k.replace('module.', ''): v for k, v in checkpoint_model.items()}
    num_classes = NUM_CLASSES or infer_num_classes_from_checkpoint(checkpoint_model)
    model = vit_base_patch16_480(num_classes=num_classes, drop_path_rate=0.0, global_pool='avg')
    model.load_state_dict(checkpoint_model, strict=False)
    return model.to(device).eval()


def get_transform():
    return timm.data.create_transform(
        input_size=(3, IMG_SIZE, IMG_SIZE),
        mean=(0.485, 0.456, 0.406), std=(0.229, 0.224, 0.225),
        interpolation='bicubic', crop_pct=0.875,
    )


def hist_equalize(img: Image.Image) -> Image.Image:
    img_np = np.array(img)
    if len(img_np.shape) == 2:
        return Image.fromarray(cv2.equalizeHist(img_np))
    img_yuv = cv2.cvtColor(img_np, cv2.COLOR_RGB2YUV)
    img_yuv[:, :, 0] = cv2.equalizeHist(img_yuv[:, :, 0])
    return Image.fromarray(cv2.cvtColor(img_yuv, cv2.COLOR_YUV2RGB))


def predict_image(image_path: str, model, transform, device: str = 'cpu', use_hist_equal: bool = True) -> tuple:
    image = Image.open(image_path).convert('RGB')
    if use_hist_equal:
        image = hist_equalize(image)
    image = transform(image).unsqueeze(0).to(device)
    with torch.no_grad():
        outputs = model(image)
        probs = torch.softmax(outputs[0], dim=0).cpu().tolist()
        _, preds = torch.max(outputs, 1)
    return preds.item(), probs


class ViTReshapeTransform:
    def __init__(self, height=PATCH_GRID_H, width=PATCH_GRID_W):
        self.height, self.width = height, width
    def __call__(self, tensor):
        r = tensor[:, 1:, :].reshape(tensor.size(0), self.height, self.width, tensor.size(2))
        return r.transpose(2, 3).transpose(1, 2)


def _prepare_input_and_rgb(image_path: str, use_hist_equal: bool, device: str):
    image = Image.open(image_path).convert('RGB')
    if use_hist_equal:
        image = hist_equalize(image)
    img_np = np.array(image)
    resize_size = int(IMG_SIZE / 0.875)
    img_resized = cv2.resize(img_np, (resize_size, resize_size), interpolation=cv2.INTER_LINEAR)
    h, w = img_resized.shape[:2]
    top, left = (h - IMG_SIZE) // 2, (w - IMG_SIZE) // 2
    img_crop = img_resized[top:top + IMG_SIZE, left:left + IMG_SIZE]
    rgb_img = np.float32(img_crop) / 255.0
    input_tensor = preprocess_image(rgb_img, mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]).to(device)
    return input_tensor, rgb_img


def _generate_gradcam(model, input_tensor, rgb_img, target_class: int, out_path: str, device: str, gradcam_layer_indices=None):
    if not GRADCAM_AVAILABLE:
        return
    gradcam_layer_indices = gradcam_layer_indices or [-1]
    n_blocks = len(model.blocks)
    target_layers = []
    for idx in gradcam_layer_indices:
        i = n_blocks + idx if idx < 0 else idx
        if 0 <= i < n_blocks:
            target_layers.append(model.blocks[i].norm1)
    if not target_layers:
        return
    with GradCAM(model=model, target_layers=target_layers, reshape_transform=ViTReshapeTransform(PATCH_GRID_H, PATCH_GRID_W)) as cam:
        grayscale_cam = cam(input_tensor=input_tensor, targets=[ClassifierOutputTarget(target_class)])
        cam_image = show_cam_on_image(rgb_img, grayscale_cam[0, :], use_rgb=True)
        cv2.imwrite(out_path, cv2.cvtColor(cam_image, cv2.COLOR_RGB2BGR))


def _visualize_results(img_path: Path, results: dict, out_file: str):
    fig, axes = plt.subplots(1, 2, figsize=(12, 5))
    axes[0].imshow(np.array(Image.open(img_path).convert('RGB')))
    axes[0].set_title('Input Image')
    axes[0].axis('off')
    task_names = list(results.keys())
    x = np.arange(len(task_names))
    width = 0.35
    probs_0 = [results[t][1][0] for t in task_names]
    probs_1 = [results[t][1][1] for t in task_names]
    axes[1].bar(x - width/2, probs_0, width, label='类别 0', color='#2ecc71')
    axes[1].bar(x + width/2, probs_1, width, label='类别 1', color='#e74c3c')
    axes[1].set_ylabel('概率')
    axes[1].set_title('三任务分类结果')
    axes[1].set_xticks(x)
    axes[1].set_xticklabels(task_names)
    axes[1].legend()
    axes[1].set_ylim(0, 1)
    plt.tight_layout()
    plt.savefig(out_file, dpi=150, bbox_inches='tight')
    plt.close()


def run_inference(task: str = 'all', img_path: str = None, device: str = 'cpu', out_dir: str = OUT_DIR,
                  use_hist_equal: bool = True, use_gradcam: bool = False, gradcam_layer_indices=None):
    gradcam_layer_indices = gradcam_layer_indices or [-1]
    img_path = Path(img_path) if img_path else DEFAULT_IMG
    if not img_path.is_absolute():
        img_path = PROJECT_ROOT / img_path
    if not img_path.exists():
        raise FileNotFoundError(f'图像不存在: {img_path}')
    out_path = Path(out_dir) if isinstance(out_dir, str) else out_dir
    if not out_path.is_absolute():
        out_path = PROJECT_ROOT / out_path
    out_path.mkdir(parents=True, exist_ok=True)
    transform = get_transform()
    tasks = list(CHECKPOINTS.keys()) if task == 'all' else [task]
    results = {}
    for t in tasks:
        ckpt = CHECKPOINTS.get(t)
        if not ckpt or not ckpt.exists():
            continue
        model = load_model(str(ckpt), device)
        pred_idx, probs = predict_image(str(img_path), model, transform, device, use_hist_equal)
        results[t] = (pred_idx, probs)
        if use_gradcam and GRADCAM_AVAILABLE:
            input_tensor, rgb_img = _prepare_input_and_rgb(str(img_path), use_hist_equal, device)
            _generate_gradcam(model, input_tensor, rgb_img, pred_idx, str(out_path / f'vit_classification_gradcam_{t}.png'), device, gradcam_layer_indices)
    if results:
        _visualize_results(img_path, results, str(out_path / 'vit_classification_result.png'))
        # 输出结构化结果供 API 解析，与可视化脚本内容一致
        import json
        results_json = {
            t: {"pred": int(r[0]), "probs": r[1], "label": "正常" if r[0] == 0 else "异常"}
            for t, r in results.items()
        }
        with open(out_path / 'results.json', 'w', encoding='utf-8') as f:
            json.dump(results_json, f, ensure_ascii=False, indent=2)
    return results


if __name__ == '__main__':
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument('--task', default='all')
    parser.add_argument('--img', default=str(DEFAULT_IMG))
    parser.add_argument('--device', default='cuda:0' if torch.cuda.is_available() else 'cpu')
    parser.add_argument('--out-dir', default=OUT_DIR)
    parser.add_argument('--no-hist-equal', action='store_true')
    parser.add_argument('--no-gradcam', action='store_true')
    parser.add_argument('--gradcam-layer', default='-1')
    args = parser.parse_args()
    gradcam_layer_indices = [int(x.strip()) for x in args.gradcam_layer.split(',') if x.strip()]
    run_inference(task=args.task, img_path=args.img, device=args.device, out_dir=args.out_dir,
                  use_hist_equal=not args.no_hist_equal, use_gradcam=not args.no_gradcam,
                  gradcam_layer_indices=gradcam_layer_indices)
