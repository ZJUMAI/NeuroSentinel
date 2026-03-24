"""
神经细胞图像预处理：将神经细胞转正（竖起来），便于胞体识别和树突检测。
参考 align_celegans_vertical 思路：用 minAreaRect 获取主轴，使最长边竖直。
"""

import cv2
import numpy as np
from pathlib import Path


def orient_neuron_upright(img: np.ndarray, ensure_soma_up: bool = True) -> np.ndarray:
    """
    将秀丽隐杆线虫神经元图像主轴（最长方向）旋转至竖直。
    可选：确保胞体（质量较大的一端）朝上。

    Args:
        img: BGR 或灰度图像
        ensure_soma_up: 是否强制胞体朝上（默认 True）

    Returns:
        转正后的图像
    """
    if img is None or img.size == 0:
        return img
    orig = img.copy()
    if len(orig.shape) == 2:
        gray = orig
        orig = cv2.cvtColor(orig, cv2.COLOR_GRAY2BGR)
    else:
        gray = cv2.cvtColor(orig, cv2.COLOR_BGR2GRAY)
    # Otsu 二值化，提取发光部分
    _, binary = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    contours, _ = cv2.findContours(binary, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not contours:
        return orig
    # 合并所有显著轮廓（胞体+树突），避免仅用最大轮廓（可能为圆形胞体）导致转正失败
    min_area = 50
    significant = [c for c in contours if cv2.contourArea(c) >= min_area]
    if not significant:
        return orig
    if len(significant) == 1:
        combined = significant[0]
    else:
        combined = np.vstack([c.reshape(-1, 2) for c in significant])
    rect = cv2.minAreaRect(combined)
    (center_x, center_y), (width, height), angle = rect
    # minAreaRect 角度在 [-90, 0)，目标：最长边竖直
    if width > height:
        rotation_angle = angle - 90
    else:
        rotation_angle = angle
    h_img, w_img = orig.shape[:2]
    M = cv2.getRotationMatrix2D((w_img / 2, h_img / 2), rotation_angle, 1.0)
    rotated = cv2.warpAffine(orig, M, (w_img, h_img), borderMode=cv2.BORDER_REPLICATE)
    if ensure_soma_up:
        binary_rot = cv2.warpAffine(binary, M, (w_img, h_img), borderMode=cv2.BORDER_CONSTANT)
        top_half = np.sum(binary_rot[: h_img // 2, :])
        bottom_half = np.sum(binary_rot[h_img // 2 :, :])
        if bottom_half > top_half:
            rotated = cv2.rotate(rotated, cv2.ROTATE_180)
    return rotated


def preprocess_and_save(img_path: str, out_path: str) -> str:
    """
    读取图像、转正、保存到 out_path，返回保存路径。
    供胞体识别和树突检测脚本调用。
    """
    img = cv2.imread(img_path)
    if img is None:
        raise FileNotFoundError(f"无法加载图像: {img_path}")
    try:
        upright = orient_neuron_upright(img)
    except Exception as e:
        import sys
        print(f"[neuron_orientation_preprocess] 转正失败，使用原图: {e}", file=sys.stderr)
        upright = img
    Path(out_path).parent.mkdir(parents=True, exist_ok=True)
    cv2.imwrite(out_path, upright)
    return out_path
