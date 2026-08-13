# NeuroSentinel

基于秀丽隐杆线虫（C. elegans）的化合物神经毒性评估智能体平台。

---

## 技术栈

- **前端**：React 19、TypeScript、Vite、tRPC、TanStack Query、Tailwind CSS、shadcn/ui、Wouter  
- **后端**：Node.js、Express、tRPC、Drizzle ORM、MySQL、智谱 AI（GLM）、Jose（JWT）  
- **可选能力**：通过 Docker 集成 MinIO（对象存储）、ImageJ、Deep-Worm-Tracker、Neorual 等外围分析服务  

---

## 项目结构

```
NeuroSentinel/
├── client/                      # 前端（React + Vite）
├── server/                      # 后端（Express、tRPC、Agent、RAG）
├── shared/                      # 前后端共享类型与常量
├── drizzle/                     # 数据库 schema 与 SQL 迁移
├── imagej-service/              # 线虫图像分析 Docker 构建上下文
├── deep-worm-tracker-service/   # 线虫视频追踪 Docker 构建上下文
├── neorual-service/             # Neorual 显微分析 Docker 构建上下文
├── neorual-analysis/            # Neorual 侧配置与模型相关（Model 目录见 .gitignore）
├── start.ps1                    # Windows：Docker 依赖 + pnpm dev
├── .env.example                 # 环境变量模板（复制为 .env 后填写）
└── README.md
```

---

## 使用方式

### 1. 安装与数据库配置

```bash
pnpm install
cp .env.example .env
```

确认 **MySQL** 已运行，且 `DATABASE_URL` 指向可写库，然后：

```bash
pnpm db:push
```

### 2. 启动

- **仅 Node 开发服务**（须保证 MySQL 可用，可选服务按需已起）：

  ```bash
  pnpm dev
  ```

  默认 <http://localhost:3000>。

- **Windows 一键**（会检查 Docker，并尝试启动 MinIO、ImageJ、Deep-Worm-Tracker、Neorual 等容器后再 `pnpm dev`）：

  ```powershell
  .\start.ps1
  ```

### 3. 使用前须补充

按功能逐项补齐；未列出的变量含义见 `.env.example` 内注释。

| 空缺 | 说明 |
|------|------|
| **运行必需** | 在 `.env` 中填写 `DATABASE_URL`、`ZHIPU_API_KEY`、`JWT_SECRET`。缺任一无法正常登录/对话。 |
| **MySQL** | 本机或远程实例须已创建库，且账号有 DDL/DML 权限；`pnpm db:push` 会应用 `drizzle/` 迁移。 |
| **Docker 与 `start.ps1`** | 若要用脚本自动起 MinIO/ImageJ 等，需安装并启动 Docker Desktop；否则可只跑 `pnpm dev`，并手动按需起容器或跳过相关工具。 |
| **文件上传（S3/MinIO）** | 若要用上传能力：配置 `S3_*`；本地 MinIO 时需在控制台创建与 `S3_BUCKET` 同名的桶，并设置访问密钥。 |
| **OAuth 登录** | 若不用 `SKIP_AUTH=true` 且要走 Google/GitHub：在 OAuth 控制台配置回调 `http://localhost:3000/api/oauth/callback`（生产改为你的域名 + HTTPS），并填写 `GOOGLE_*` / `GITHUB_*`。 |
| **ImageJ / Deep-Worm-Tracker / Neorual** | 对应工具调用前需服务可达；可 `start.ps1` 构建容器，或自建后把 `IMAGEJ_API_URL`、`DEEP_WORM_TRACKER_API_URL`、`NEORUAL_API_URL` 指到实际地址。Neorual 还需按 `neorual-service`、`neorual-analysis` 说明准备 `Model` 等文件（`neorual-analysis/Model/` 默认不入库）。 |
| **访问统计（Umami）** | 可选：填写 `VITE_ANALYTICS_*`；不填则前端不带统计脚本。 |



---

## 演示视频

[▶️ 点击播放 NeuroSentinel 演示视频](https://github.com/ZJUMAI/NeuroSentinel/raw/refs/heads/main/demo/demovideo.mp4)

---

## License

MIT
