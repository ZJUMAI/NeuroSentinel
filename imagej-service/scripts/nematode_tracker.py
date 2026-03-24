# -*- coding: utf-8 -*-
"""
Fiji/Jython 线虫视频分析脚本 - wrMTrck 运动追踪（备用）
主流程使用 nematode_tracker.ijm 宏（-macro 模式可避免 headless 对话框错误）。
用法: Fiji --headless --console -batch nematode_tracker.py <target_dir>
"""
from __future__ import print_function
from ij import IJ
import sys
import os
import time

if len(sys.argv) < 2:
    print("Error: No input directory provided.")
    sys.exit(1)

target_dir = sys.argv[1]
print("Target directory received: ", target_dir)


def process(video_path):
    try:
        imp = IJ.openImage(video_path)
    except Exception:
        print("Could not load or process file: " + video_path)
        return

    if imp is None:
        print("Failed to open image: " + video_path)
        return

    # 2. 转换为8位
    original_depth = imp.getBitDepth()
    if original_depth != 8:
        IJ.run(imp, "8-bit", "")

    # 3. 背景减除
    IJ.run(imp, "Subtract Background...", "rolling=50 light stack")

    # 4. 阈值处理
    stack = imp.getImageStack()
    for i in range(1, stack.getSize() + 1):
        ip = stack.getProcessor(i)
        ip.threshold(240)
        ip.invert()

    # 5. 调用 wrMTrck 插件
    param_str1_2 = "minsize=2000 maxsize=5000 maxvelocity=100 maxareachange=900 mintracklength=10 bendthreshold=2.0 binsize=0.0 "
    param_str1_3 = "minsize=2000 maxsize=5000 maxvelocity=100 maxareachange=900 mintracklength=10 bendthreshold=3.0 binsize=0.0 "
    param_str2 = "saveresultsfile showpathlengths smoothing "
    param_str3 = "rawdata=0 benddetect=1 fps=60 backsub=0 threshmode=Otsu fontsize=16 "

    # 构建动态保存路径（支持 .avi 及其他扩展名）
    base_path = video_path
    for ext in [".avi", ".mp4", ".mov", ".tif", ".tiff", ".zip"]:
        if video_path.lower().endswith(ext):
            base_path = video_path[: -len(ext)]
            break

    save_path_2 = base_path + "_bendthreshold2.txt"
    save_path_3 = base_path + "_bendthreshold3.txt"

    param_str4_2 = "save=[" + save_path_2 + "]"
    param_str4_3 = "save=[" + save_path_3 + "]"

    # 执行两次分析
    IJ.run(imp, "wrMTrck ", param_str1_2 + param_str2 + param_str3 + param_str4_2)
    IJ.run(imp, "wrMTrck ", param_str1_3 + param_str2 + param_str3 + param_str4_3)

    imp.close()


def load_process_and_save(sourcepath):
    video_extensions = (".avi", ".mp4", ".mov", ".tif", ".tiff", ".zip")
    for root, directories, filenames in os.walk(sourcepath):
        for filename in filenames:
            if filename.lower().endswith(video_extensions):
                video_full_path = os.path.join(root, filename)
                print(
                    time.strftime("%m-%d %H:%M:%S", time.localtime())
                    + " - Start processing: "
                    + filename
                )
                process(video_full_path)
                print(
                    time.strftime("%m-%d %H:%M:%S", time.localtime())
                    + " - Finished processing: "
                    + filename
                )


# 开始执行
load_process_and_save(target_dir)
print("Batch processing complete.")
sys.exit(0)
