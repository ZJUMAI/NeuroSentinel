# Fiji/ImageJ + FastAPI 线虫图像分析服务
# 基于修改2.12.md 的架构设计
# 默认使用 Microsoft MCR（Debian bookworm，国内通常可访问，不受 registry-mirrors 影响）
# 可覆盖：docker build --build-arg BASE_IMAGE=ubuntu:22.04 -t xxx .

ARG BASE_IMAGE=mcr.microsoft.com/dotnet/runtime-deps:8.0-bookworm-slim
FROM ${BASE_IMAGE}

ENV DEBIAN_FRONTEND=noninteractive

# 安装 Java、Python、Xvfb 及必要系统库
# Xvfb 提供虚拟显示，解决 wrMTrck 等插件 "Cannot instantiate headless dialog" 错误
# xauth 为 xvfb-run 必需依赖，否则会报 "xauth command not found"
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    python3-pip \
    python3-venv \
    openjdk-17-jre-headless \
    wget \
    unzip \
    xvfb \
    xauth \
    libxrender1 \
    libxext6 \
    libxi6 \
    libxtst6 \
    ca-certificates \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/* \
    && ln -sf /usr/bin/python3 /usr/bin/python

# 下载并安装 Fiji（/fiji/latest/ 已改用新文件名，使用 archive 固定版本）
WORKDIR /opt
ARG FIJI_URL=https://downloads.imagej.net/fiji/archive/20250206-1617/fiji-linux64.zip
RUN wget -q -O fiji.zip "${FIJI_URL}" && \
    unzip fiji.zip && \
    rm fiji.zip

ENV FIJI_PATH=/opt/Fiji.app
ENV PATH=$PATH:$FIJI_PATH

WORKDIR /app

# 安装 Python 依赖（Pillow 用于 RGBA→灰度预处理，无需 PyImageJ）
RUN python3 -m pip install --no-cache-dir --break-system-packages \
    fastapi \
    uvicorn \
    python-multipart \
    Pillow

# 拷贝 wrMTrck 插件（从 CursorCode/wrmtrck，需将 wrMTrck_.jar 放入 plugins 后构建）
COPY ./plugins/ /opt/Fiji.app/plugins/

# 拷贝 Jython 脚本（nematode_tracker.py, image_analyzer.py）
COPY ./scripts/ /app/scripts/

# 拷贝 Web API 代码
COPY ./app /app

EXPOSE 8000

CMD ["python3", "-m", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
