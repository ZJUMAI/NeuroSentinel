# Deep-Worm-Tracker 线虫运动追踪服务
# 参考：修改2.23.md - YOLOv5 检测 + StrongSORT 追踪
# Zenodo: https://zenodo.org/records/7884831
# 使用 CPU 版 PyTorch 以兼容无 GPU 环境；有 GPU 可改用 pytorch/pytorch:2.0.1-cuda11.7-cudnn8-runtime
FROM pytorch/pytorch:2.0.1-cpu

# 安装 OpenCV 运行依赖
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1-mesa-glx \
    libglib2.0-0 \
    wget \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# 安装 Python 依赖
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 模型目录：将 Zenodo 下载的 yolov5_worm.pt 放入 models/ 后重新构建
# 若无可自定义权重，将使用 ultralytics 内置模型进行通用检测
COPY ./models /app/models
COPY ./app/main.py /app/

EXPOSE 8001

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8001"]
