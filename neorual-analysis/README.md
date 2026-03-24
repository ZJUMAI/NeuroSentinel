# Neorual 线虫显微图像分析

用于 NeuroSentinel 项目方案第七天的分析工具：ViT 神经元形态分类、串珠分割、细胞体实例分割、树突检测。

## 模型权重

请将以下权重文件放入 `Model/` 目录：

- **ViT 分类**：`best_arborization.pth`、`best_bend.pth`、`best_break.pth`
- **串珠分割**：`iter_144000.pth`
- **细胞体分割**：`ADECEP_iter_10000.pth`
- **树突检测**：`iter_10000.pth`

可从原 `D:\CursorCode\Model\` 复制。

## 安装依赖

```bash
cd neorual-analysis
pip install -r requirements.txt
```

或使用 OpenMMLab 推荐方式安装 mmdet/mmseg：

```bash
pip install -U openmim
mim install mmengine mmcv mmdet mmsegmentation
pip install torch timm opencv-python matplotlib Pillow grad-cam
```

## 运行脚本

```bash
# ViT 分类
python inference_vit_classification.py --img <图像路径> --out-dir <输出目录>

# 串珠分割
python visualize_bead_segmentation.py --img <图像路径> --out-dir <输出目录>

# 细胞体实例分割（需 projects/ViTDet，从 NeuroSentinel 根目录运行）
python neorual-analysis/visualize_Cellbody_instance_segmentation.py --img <图像路径> --out-dir <输出目录>

# 树突检测（需 projects/ViTDet，从 NeuroSentinel 根目录运行）
python neorual-analysis/visualize_Dendrite_detection.py --img <图像路径> --out-dir <输出目录>
```
