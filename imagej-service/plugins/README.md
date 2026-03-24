# Fiji 插件目录

将 Fiji/ImageJ 插件（如 `.jar` 文件）放入此目录，构建镜像时会自动复制到 Fiji 的 `plugins/` 目录。

## wrMTrck 线虫运动追踪插件（可选）

启用线虫运动追踪功能需安装 wrMTrck 插件：

1. **下载**：访问 https://www.phage.dk/plugins/wrmtrck.html 下载 `wrmtrck.zip`
2. **解压**：将 zip 中的 `wrMTrck_.jar` 复制到本目录（即 `imagej-service/plugins/`）
3. **重新构建**：`docker build -t imagej-analysis-api .`

或从源码编译（需 Java 环境）：
- 源码：https://github.com/jespersp/wrMTrck
