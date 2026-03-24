// S3/MinIO 存储实现（替代方案 1：本地 MinIO 或 AWS S3 / Cloudflare R2）
// 使用 @aws-sdk/client-s3 直接调用，兼容 MinIO、AWS S3、Cloudflare R2 等

import fs from "fs";
import path from "path";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { ENV } from "./_core/env";

const UPLOADS_DIR = path.resolve(import.meta.dirname, "uploads");

function getS3Client(): S3Client {
  const {
    s3Endpoint,
    s3Bucket,
    s3AccessKey,
    s3SecretKey,
    s3Region,
  } = ENV;

  if (!s3Bucket || !s3AccessKey || !s3SecretKey) {
    throw new Error(
      "S3/MinIO credentials missing: set S3_BUCKET, S3_ACCESS_KEY, S3_SECRET_KEY (and optionally S3_ENDPOINT, S3_REGION)"
    );
  }

  const clientConfig: Record<string, unknown> = {
    region: s3Region,
    credentials: {
      accessKeyId: s3AccessKey,
      secretAccessKey: s3SecretKey,
    },
  };

  if (s3Endpoint) {
    clientConfig.endpoint = s3Endpoint;
    clientConfig.forcePathStyle = true; // MinIO 需要 path-style
  }

  return new S3Client(clientConfig);
}

function normalizeKey(relKey: string): string {
  return relKey.replace(/^\/+/, "");
}

/**
 * 上传文件到 S3/MinIO，返回可访问的 URL。
 * MinIO 本地：使用 presigned URL（私有桶）或直接 URL（公开桶）。
 */
export async function storagePut(
  relKey: string,
  data: Buffer | Uint8Array | string,
  contentType = "application/octet-stream"
): Promise<{ key: string; url: string }> {
  const client = getS3Client();
  const key = normalizeKey(relKey);
  const body = typeof data === "string" ? Buffer.from(data) : data;

  await client.send(
    new PutObjectCommand({
      Bucket: ENV.s3Bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
    })
  );

  // 生成 presigned URL（7 天有效，用于私有桶）
  const url = await getSignedUrl(
    client,
    new GetObjectCommand({
      Bucket: ENV.s3Bucket,
      Key: key,
    }),
    { expiresIn: 60 * 60 * 24 * 7 } // 7 days
  );

  return { key, url };
}

/**
 * 上传到本地 uploads 目录（S3 未配置时使用），返回可访问路径。
 */
export async function putLocalFile(
  fileKey: string,
  data: Buffer
): Promise<string> {
  const filePath = path.join(UPLOADS_DIR, fileKey);
  const dir = path.dirname(filePath);
  await fs.promises.mkdir(dir, { recursive: true });
  await fs.promises.writeFile(filePath, data);
  return `/uploads/${fileKey.replace(/\\/g, "/")}`;
}

/**
 * 上传文件到 S3 或本地，返回可访问的 URL。
 */
export async function storagePutOrLocal(
  fileKey: string,
  data: Buffer | string,
  contentType = "application/octet-stream"
): Promise<string> {
  const buffer = typeof data === "string" ? Buffer.from(data, "utf-8") : data;
  if (ENV.s3Bucket && ENV.s3AccessKey && ENV.s3SecretKey) {
    const result = await storagePut(fileKey, buffer, contentType);
    return result.url;
  }
  return putLocalFile(fileKey, buffer);
}

/**
 * 获取文件的 presigned 下载 URL
 */
export async function storageGet(relKey: string): Promise<{
  key: string;
  url: string;
}> {
  const client = getS3Client();
  const key = normalizeKey(relKey);

  const url = await getSignedUrl(
    client,
    new GetObjectCommand({
      Bucket: ENV.s3Bucket,
      Key: key,
    }),
    { expiresIn: 60 * 60 } // 1 hour
  );

  return { key, url };
}

/**
 * 直接读取 S3/MinIO 文件内容为 Buffer。
 * 用于解析服务获取上传文件，避免通过 presigned URL 拉取时 localhost 不可达（如 Docker）问题。
 */
export async function storageGetBuffer(relKey: string): Promise<Buffer> {
  const client = getS3Client();
  const key = normalizeKey(relKey);
  const res = await client.send(
    new GetObjectCommand({
      Bucket: ENV.s3Bucket,
      Key: key,
    })
  );
  const body = res.Body;
  if (!body) throw new Error("Empty response from S3");
  const chunks: Uint8Array[] = [];
  for await (const chunk of body as AsyncIterable<Uint8Array>) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}
