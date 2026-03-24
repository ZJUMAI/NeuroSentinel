# Neorual 线虫显微图像分析服务
# Python 3.9 + mmcv/mmdet/mmseg + ViT/timm/grad-cam
# 端口 8002

FROM python:3.9-slim-bookworm

ENV DEBIAN_FRONTEND=noninteractive
ENV PYTHONUNBUFFERED=1

# 系统依赖
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1-mesa-glx \
    libglib2.0-0 \
    libsm6 \
    libxext6 \
    libxrender-dev \
    git \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# 先安装 PyTorch 2.0（与 mmcv 预编译 wheel 匹配）
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir torch==2.0.1 torchvision==0.15.2

# OpenMMLab：使用预编译 wheel 避免源码编译失败
RUN pip install --no-cache-dir openmim mmengine && \
    pip install --no-cache-dir https://download.openmmlab.com/mmcv/dist/cpu/torch2.0.0/mmcv-2.2.0-cp39-cp39-manylinux1_x86_64.whl && \
    mim install mmdet mmsegmentation

# 其他依赖
RUN pip install --no-cache-dir \
    timm \
    grad-cam \
    opencv-python-headless \
    matplotlib \
    Pillow \
    numpy \
    fastapi \
    uvicorn \
    python-multipart

# 拷贝项目结构：neorual-analysis + projects
COPY neorual-analysis /app/neorual-analysis
COPY projects /app/projects

# 设置 PYTHONPATH（cellbody 需要 projects.ViTDet）
ENV PYTHONPATH=/app

# 拷贝 Web API（构建上下文为 manus-clone 根目录）
COPY neorual-service/app /app/app

EXPOSE 8002

CMD ["python", "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8002"]
