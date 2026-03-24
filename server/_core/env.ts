export const ENV = {
  appId: process.env.VITE_APP_ID ?? "",
  cookieSecret: process.env.JWT_SECRET ?? "",
  databaseUrl: process.env.DATABASE_URL ?? "",
  oAuthServerUrl: process.env.OAUTH_SERVER_URL ?? "",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  isProduction: process.env.NODE_ENV === "production",
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? "",
  zhipuApiKey: process.env.ZHIPU_API_KEY ?? "",
  /** Vision model for image analysis. glm-4v-flash only supports URL; glm-4.6v-flash may support base64. */
  zhipuVisionModel: process.env.ZHIPU_VISION_MODEL ?? "glm-4.6v-flash",
  // S3/MinIO 存储（方案 1：本地 MinIO 或 AWS S3 / Cloudflare R2）
  s3Endpoint: process.env.S3_ENDPOINT ?? "",
  s3Bucket: process.env.S3_BUCKET ?? "",
  s3AccessKey: process.env.S3_ACCESS_KEY ?? "",
  s3SecretKey: process.env.S3_SECRET_KEY ?? "",
  s3Region: process.env.S3_REGION ?? "us-east-1",
  // ImageJ/Fiji 线虫分析服务（Docker 部署）
  imagejApiUrl: process.env.IMAGEJ_API_URL ?? "http://localhost:8000",
  // Deep-Worm-Tracker 线虫视频运动追踪服务（YOLOv5 + 多目标追踪，参考修改2.23.md）
  deepWormTrackerApiUrl: process.env.DEEP_WORM_TRACKER_API_URL ?? "http://localhost:8001",
  // Neorual 线虫显微图像分析：Docker 服务 URL（优先）或本地 Python 根目录
  neorualApiUrl: process.env.NEORUAL_API_URL ?? "",
  neorualAnalysisRoot: process.env.NEORUAL_ANALYSIS_ROOT ?? "",
  // OAuth 第三方登录（Google / GitHub）
  googleClientId: process.env.GOOGLE_CLIENT_ID ?? "",
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
  githubClientId: process.env.GITHUB_CLIENT_ID ?? "",
  githubClientSecret: process.env.GITHUB_CLIENT_SECRET ?? "",
};
