# -*- coding: utf-8 -*-
"""
Fiji/Jython 线虫图像分析脚本 - Analyze Particles 计数与形态学
通过 sys.argv 接收参数，以 headless 模式由 Python 后端 subprocess 调用。

用法: Fiji --headless --console -batch image_analyzer.py <image_path> <output_json_path> [rolling_radius]
"""
from __future__ import print_function
from ij import IJ
from ij.measure import ResultsTable
import sys
import os
import json

if len(sys.argv) < 3:
    print("Error: Usage: image_analyzer.py <image_path> <output_json_path> [rolling_radius]")
    sys.exit(1)

image_path = sys.argv[1]
output_path = sys.argv[2]
rolling_radius = int(sys.argv[3]) if len(sys.argv) > 3 else 50

if not os.path.exists(image_path):
    print("Error: Image file not found: " + image_path)
    sys.exit(1)

try:
    imp = IJ.openImage(image_path)
except Exception as e:
    result = {"status": "error", "error": str(e), "count": 0}
    with open(output_path, "w") as f:
        json.dump(result, f, indent=2)
    sys.exit(1)

if imp is None:
    result = {"status": "error", "error": "Failed to open image", "count": 0}
    with open(output_path, "w") as f:
        json.dump(result, f, indent=2)
    sys.exit(1)

try:
    # 转为灰度
    if imp.getBitDepth() == 24:
        IJ.run(imp, "RGB to Grayscale", "")
    if imp.getBitDepth() != 8:
        IJ.run(imp, "8-bit", "")

    # 多通道堆栈拆分为单张
    if imp.getStack().getSize() > 1:
        IJ.run(imp, "Stack to Images", "")

    # 背景减除
    IJ.run(imp, "Subtract Background...", "rolling=" + str(rolling_radius) + " light")

    # 阈值
    IJ.run(imp, "Set Auto Threshold", "method=Default")
    IJ.run(imp, "Convert to Mask", "")
    IJ.run(
        imp,
        "Analyze Particles...",
        "size=5-100000 circularity=0.00-1.00 show=Nothing display clear add",
    )

    rt = ResultsTable.getResultsTable()
    count = 0
    if rt is not None:
        for attr in ("getCounter", "size", "counter"):
            try:
                m = getattr(rt, attr, None)
                if callable(m):
                    count = int(m())
                elif m is not None:
                    count = int(m)
                if count >= 0:
                    break
            except Exception:
                pass

    result = {
        "status": "success",
        "count": int(count),
        "filename": os.path.basename(image_path),
        "dimensions": [imp.getWidth(), imp.getHeight()],
    }
    imp.close()

    with open(output_path, "w") as f:
        json.dump(result, f, indent=2)
    print("Analysis complete. Count: " + str(count))
    sys.exit(0)

except Exception as e:
    result = {"status": "error", "error": str(e), "count": 0}
    try:
        with open(output_path, "w") as f:
            json.dump(result, f, indent=2)
    except Exception:
        pass
    print("Error: " + str(e))
    sys.exit(1)
