/**
 * File parsing using ZhipuAI APIs.
 * - 文件解析(同步): POST /paas/v4/files/parser/sync - PDF, DOCX, images, etc.
 * - OCR 服务: POST /paas/v4/files/ocr - Image text extraction
 * - 视觉理解: POST /paas/v4/chat/completions with glm-4v-flash - Image content understanding
 * Docs: https://docs.bigmodel.cn/api-reference/工具-api/文件解析
 *       https://docs.bigmodel.cn/api-reference/工具-api/ocr-服务
 *       https://docs.bigmodel.cn/cn/guide/models/free/glm-4v-flash
 */

import { ENV } from "../_core/env";
import { storageGetBuffer } from "../storage";

const ZHIPU_PARSER_SYNC_URL = "https://open.bigmodel.cn/api/paas/v4/files/parser/sync";
const ZHIPU_PARSER_RESULT_URL = "https://open.bigmodel.cn/api/paas/v4/files/parser/result";
const ZHIPU_OCR_URL = "https://open.bigmodel.cn/api/paas/v4/files/ocr";
const ZHIPU_CHAT_URL = "https://open.bigmodel.cn/api/paas/v4/chat/completions";
const ZHIPU_FILES_URL = "https://open.bigmodel.cn/api/paas/v4/files";

// Zhipu file_type enum for parser sync (prime-sync)
const FILE_TYPE_MAP: Record<string, string> = {
  pdf: "PDF",
  docx: "DOCX",
  doc: "DOC",
  xls: "XLS",
  xlsx: "XLSX",
  ppt: "PPT",
  pptx: "PPTX",
  png: "PNG",
  jpg: "JPG",
  jpeg: "JPEG",
  csv: "CSV",
  txt: "TXT",
  md: "MD",
  html: "HTML",
  bmp: "BMP",
  gif: "GIF",
  webp: "WEBP",
};

const IMAGE_TYPES = ["PNG", "JPG", "JPEG", "GIF", "WEBP", "BMP"];

export type FileParseResponse = {
  success: boolean;
  content: string | null;
  error?: string;
};

/**
 * Extract clean URL from LLM-passed string (may include "URL: " prefix or extra text).
 */
function extractFileUrl(input: string): string {
  const s = input.trim();
  const urlMatch = s.match(/(?:URL:\s*)?(https?:\/\/[^\s]+|\/uploads\/[^\s]+)/i);
  if (urlMatch) return urlMatch[1].trim();
  return s;
}

/**
 * Resolve file URL to absolute URL for fetching.
 */
function resolveFileUrl(url: string): string {
  const u = extractFileUrl(url).trim();
  if (/^https?:\/\//i.test(u)) return u;
  // Relative URL - prepend site base (server must be able to fetch itself)
  const base = process.env.SITE_URL || `http://127.0.0.1:${process.env.PORT || 3000}`;
  return `${base.replace(/\/+$/, "")}${u.startsWith("/") ? "" : "/"}${u}`;
}

/**
 * Extract S3 key from our MinIO/S3 presigned URL.
 * URL 格式: http://localhost:9000/bucket/uploads/1/xxx.jpg?X-Amz-...
 * 返回 key: uploads/1/xxx.jpg
 */
function extractS3KeyFromUrl(url: string): string | null {
  const u = url.trim();
  if (!/^https?:\/\//i.test(u)) return null;
  try {
    const parsed = new URL(u.split("?")[0]);
    const path = parsed.pathname.replace(/^\/+/, "");
    // path: bucket/uploads/1/xxx.jpg -> key = uploads/1/xxx.jpg
    const parts = path.split("/");
    if (parts.length >= 2 && parts[0] === ENV.s3Bucket && parts[1] === "uploads") {
      return parts.slice(1).join("/");
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Fetch file as Buffer from URL.
 * 优先从 S3 直接读取（避免 localhost presigned URL 在 Docker 等环境下不可达），否则 HTTP 拉取。
 * Exported for use by other agent modules (e.g. ImageJ API).
 */
export async function fetchFileBuffer(url: string): Promise<Buffer> {
  // 当 URL 指向我们的 S3/MinIO 桶且已配置 S3 时，直接读取
  const s3Key = extractS3KeyFromUrl(url);
  if (s3Key && ENV.s3Bucket && ENV.s3AccessKey && ENV.s3SecretKey) {
    try {
      const buffer = await storageGetBuffer(s3Key);
      console.log(`[FileParser] Read from S3: key=${s3Key}, size=${buffer.length}`);
      return buffer;
    } catch (err) {
      console.warn(`[FileParser] S3 direct read failed for ${s3Key}, falling back to fetch:`, err);
    }
  }

  const absoluteUrl = resolveFileUrl(url);
  const response = await fetch(absoluteUrl, {
    headers: { "User-Agent": "Manus-Agent/1.0" },
  });
  if (!response.ok) {
    console.error(`[FileParser] Fetch failed: ${absoluteUrl} -> ${response.status}`);
    throw new Error(`Failed to fetch file: ${response.status} ${response.statusText}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

/**
 * Get file_type from URL or mime.
 */
/** Map Zhipu file_type to MIME type for Blob */
function getMimeType(fileType: string): string {
  const m: Record<string, string> = {
    PDF: "application/pdf",
    PNG: "image/png",
    JPG: "image/jpeg",
    JPEG: "image/jpeg",
    GIF: "image/gif",
    WEBP: "image/webp",
    BMP: "image/bmp",
    CSV: "text/csv",
    TXT: "text/plain",
    MD: "text/markdown",
    HTML: "text/html",
  };
  return m[fileType.toUpperCase()] || "application/octet-stream";
}

function getFileType(url: string, mimeType?: string): string {
  const ext = (url.split(".").pop() || "").toLowerCase().split("?")[0];
  const mapped = FILE_TYPE_MAP[ext];
  if (mapped) return mapped;
  if (mimeType) {
    const mimeMap: Record<string, string> = {
      "application/pdf": "PDF",
      "image/png": "PNG",
      "image/jpeg": "JPG",
      "image/jpg": "JPG",
      "image/gif": "GIF",
      "image/webp": "WEBP",
      "text/plain": "TXT",
      "text/csv": "CSV",
      "text/markdown": "MD",
    };
    return mimeMap[mimeType] || "TXT";
  }
  return "TXT";
}

/**
 * Check if a file type is an image type.
 */
function isImageType(fileType: string): boolean {
  return IMAGE_TYPES.includes(fileType.toUpperCase());
}

/** Check if URL is publicly accessible (ZhipuAI can fetch it). */
function isPublicImageUrl(url: string): boolean {
  const u = url.trim();
  if (!/^https:\/\//i.test(u)) return false;
  try {
    const parsed = new URL(u);
    const host = parsed.hostname.toLowerCase();
    return !["localhost", "127.0.0.1", "::1"].includes(host);
  } catch {
    return false;
  }
}

/**
 * Upload image to ZhipuAI files API and return file content URL.
 * Used when Base64 fails (GLM-4V-Flash only supports URL).
 */
async function uploadImageToZhipu(
  buffer: Buffer,
  zhipuFileType: string,
  mimeType: string
): Promise<string | null> {
  const apiKey = ENV.zhipuApiKey;
  const ext = zhipuFileType.toLowerCase();
  const filename = ["png", "jpg", "jpeg", "gif", "webp", "bmp"].includes(ext)
    ? `image.${ext === "jpeg" ? "jpg" : ext}`
    : "image.jpg";

  const formData = new FormData();
  formData.append("file", new Blob([new Uint8Array(buffer)], { type: mimeType }), filename);
  formData.append("purpose", "agent");

  const response = await fetch(ZHIPU_FILES_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: formData,
  });

  if (!response.ok) {
    const errText = await response.text();
    console.warn(`[VisionAnalysis] File upload failed: ${response.status} - ${errText}`);
    return null;
  }

  const data = (await response.json()) as { id?: string };
  const fileId = data?.id;
  if (!fileId) return null;

  return `https://open.bigmodel.cn/api/paas/v4/files/${fileId}/content`;
}

/**
 * Analyze image content using ZhipuAI Vision Model.
 * - GLM-4V-Flash: only supports image URL (https://...), not Base64
 * - GLM-4.6V-Flash: may support Base64; used when URL is not public
 */
export async function performVisionAnalysis(
  fileUrl: string,
  fileType?: string
): Promise<FileParseResponse> {
  const apiKey = ENV.zhipuApiKey;
  if (!apiKey) {
    return {
      success: false,
      content: null,
      error: "ZHIPU_API_KEY is not configured",
    };
  }

  const zhipuFileType = fileType || getFileType(fileUrl);
  const mimeType = getMimeType(zhipuFileType);
  const model = ENV.zhipuVisionModel;

  const callVision = async (imageUrl: string, useModel: string) => {
    const response = await fetch(ZHIPU_CHAT_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: useModel,
        messages: [
          {
            role: "user",
            content: [
              { type: "image_url", image_url: { url: imageUrl } },
              {
                type: "text",
                text: "请详细描述这张图片的内容。包括：图片中有什么物体、人物、场景、文字、颜色、风格等所有可见的视觉信息。如果图片中包含文字，也请提取出来。请尽可能详细和准确。",
              },
            ],
          },
        ],
        max_tokens: 1024,
        temperature: 0.5,
      }),
    });
    return response;
  };

  try {
    const buffer = await fetchFileBuffer(fileUrl);
    console.log(`[VisionAnalysis] Analyzing image with ${model}, type=${zhipuFileType}, size=${buffer.length} bytes`);

    let imageUrl: string;
    let useModel = model;

    if (isPublicImageUrl(fileUrl)) {
      imageUrl = extractFileUrl(fileUrl);
      useModel = "glm-4v-flash";
    } else {
      const base64Data = buffer.toString("base64");
      imageUrl = `data:${mimeType};base64,${base64Data}`;
    }

    let response = await callVision(imageUrl, useModel);

    if (!response.ok && response.status === 400 && imageUrl.startsWith("data:")) {
      console.warn("[VisionAnalysis] Base64 rejected (400), trying file upload + URL");
      const fileContentUrl = await uploadImageToZhipu(buffer, zhipuFileType, mimeType);
      if (fileContentUrl) {
        response = await callVision(fileContentUrl, "glm-4v-flash");
      }
    }

    if (!response.ok) {
      const errText = await response.text();
      console.error(`[VisionAnalysis] API error: ${response.status} - ${errText}`);
      return {
        success: false,
        content: null,
        error: `Vision API error: ${response.status}`,
      };
    }

    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content;

    if (!content || !content.trim()) {
      console.warn("[VisionAnalysis] Empty response from vision model");
      return {
        success: false,
        content: null,
        error: "Vision model returned empty response",
      };
    }

    console.log(`[VisionAnalysis] Successfully analyzed image, content length=${content.length}`);
    return {
      success: true,
      content: content.trim(),
    };
  } catch (error) {
    console.error("[VisionAnalysis] Failed:", error);
    return {
      success: false,
      content: null,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Parse file using Zhipu file parser (sync API).
 * For images: first tries vision model (GLM-4V-Flash) for content understanding,
 * then falls back to file parser and OCR for text extraction.
 * For other files: uses file parser (sync API).
 */
export async function performFileParse(
  fileUrl: string,
  fileType?: string
): Promise<FileParseResponse> {
  const apiKey = ENV.zhipuApiKey;
  if (!apiKey) {
    return {
      success: false,
      content: null,
      error: "ZHIPU_API_KEY is not configured",
    };
  }

  const zhipuFileType = fileType || getFileType(fileUrl);

  // For images: use vision model first for true content understanding
  if (isImageType(zhipuFileType)) {
    console.log(`[FileParser] Image detected (${zhipuFileType}), using vision model for content understanding`);

    // Step 1: Try vision model for image content understanding
    const visionResult = await performVisionAnalysis(fileUrl, zhipuFileType);
    if (visionResult.success && visionResult.content?.trim()) {
      // Also try OCR to extract any text in the image
      const ocrResult = await performOCR(fileUrl);
      let combinedContent = `## 图片内容描述\n\n${visionResult.content}`;
      if (ocrResult.success && ocrResult.content?.trim() && ocrResult.content.trim() !== "(No text detected in image)") {
        combinedContent += `\n\n## 图片中的文字（OCR提取）\n\n${ocrResult.content}`;
      }
      return {
        success: true,
        content: combinedContent,
      };
    }

    // Step 2: Vision model failed, try file parser sync API
    console.warn("[FileParser] Vision model failed, falling back to file parser sync API");
    const parserResult = await performFileParserSync(fileUrl, zhipuFileType);
    if (parserResult.success && parserResult.content?.trim()) {
      return parserResult;
    }

    // Step 3: File parser also failed, try OCR as last resort
    console.warn("[FileParser] File parser failed, falling back to OCR");
    const ocrResult = await performOCR(fileUrl);
    if (ocrResult.success && ocrResult.content?.trim()) {
      return ocrResult;
    }

    // All methods failed
    return {
      success: false,
      content: null,
      error: `Failed to analyze image: vision model, file parser, and OCR all failed. Vision error: ${visionResult.error}`,
    };
  }

  // For non-image files: use file parser sync API
  return performFileParserSync(fileUrl, zhipuFileType);
}

/**
 * Parse file using Zhipu file parser sync API.
 * Supports PDF, DOCX, images (PNG, JPG), CSV, TXT, MD, etc.
 */
async function performFileParserSync(
  fileUrl: string,
  zhipuFileType: string
): Promise<FileParseResponse> {
  const apiKey = ENV.zhipuApiKey;
  if (!apiKey) {
    return {
      success: false,
      content: null,
      error: "ZHIPU_API_KEY is not configured",
    };
  }

  try {
    const buffer = await fetchFileBuffer(fileUrl);
    const ext = zhipuFileType.toLowerCase();
    const filename = ["png", "jpg", "jpeg", "gif", "webp", "bmp"].includes(ext)
      ? `image.${ext === "jpeg" ? "jpg" : ext}`
      : `file.${ext}`;

    const mimeType = getMimeType(zhipuFileType);
    const formData = new FormData();
    formData.append(
      "file",
      new Blob([new Uint8Array(buffer)], { type: mimeType }),
      filename
    );
    formData.append("tool_type", "prime-sync");
    formData.append("file_type", zhipuFileType);

    const response = await fetch(ZHIPU_PARSER_SYNC_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      body: formData,
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error(`[FileParser] API error: ${response.status} - ${errText}`);
      return {
        success: false,
        content: null,
        error: `API error: ${response.status}`,
      };
    }

    let data = await response.json();
    let status = data?.status;
    let content = data?.content ?? null;
    let taskId = data?.task_id;

    // 处理 processing 状态：轮询解析结果
    const maxPollAttempts = 20;
    const pollIntervalMs = 1000;
    for (let i = 0; status === "processing" && taskId && i < maxPollAttempts; i++) {
      await new Promise((r) => setTimeout(r, pollIntervalMs));
      const resultRes = await fetch(
        `${ZHIPU_PARSER_RESULT_URL}/${taskId}/text`,
        {
          headers: { Authorization: `Bearer ${apiKey}` },
        }
      );
      if (!resultRes.ok) break;
      data = await resultRes.json();
      status = data?.status;
      content = data?.content ?? null;
    }

    if (status === "failed") {
      return {
        success: false,
        content: null,
        error: data?.message || "File parsing failed",
      };
    }

    return {
      success: status === "succeeded",
      content: content || "",
    };
  } catch (error) {
    console.error("[FileParser] Failed:", error);
    return {
      success: false,
      content: null,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * OCR image using Zhipu OCR API.
 * Best for extracting text from images (handwriting, printed text).
 */
export async function performOCR(
  fileUrl: string,
  languageType: string = "CHN_ENG"
): Promise<FileParseResponse> {
  const apiKey = ENV.zhipuApiKey;
  if (!apiKey) {
    return {
      success: false,
      content: null,
      error: "ZHIPU_API_KEY is not configured",
    };
  }

  try {
    const buffer = await fetchFileBuffer(fileUrl);
    const fileType = getFileType(fileUrl);
    const mimeType = getMimeType(fileType);
    const ext = fileType.toLowerCase();
    const filename =
      ["png", "jpg", "jpeg", "gif", "webp", "bmp"].includes(ext)
        ? `image.${ext === "jpeg" ? "jpg" : ext}`
        : "image.jpg";

    const formData = new FormData();
    formData.append(
      "file",
      new Blob([new Uint8Array(buffer)], { type: mimeType }),
      filename
    );
    formData.append("tool_type", "hand_write");
    formData.append("language_type", languageType);

    const response = await fetch(ZHIPU_OCR_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      body: formData,
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error(`[OCR] API error: ${response.status} - ${errText}`);
      return {
        success: false,
        content: null,
        error: `API error: ${response.status}`,
      };
    }

    const data = await response.json();
    const status = data?.status;
    const wordsResult = data?.words_result as Array<{ words: string }> | undefined;

    if (status !== "succeeded" || !wordsResult) {
      return {
        success: false,
        content: null,
        error: data?.message || "OCR failed",
      };
    }

    const content = wordsResult.map((r) => r.words).join("\n");
    return {
      success: true,
      content: content || "(No text detected in image)",
    };
  } catch (error) {
    console.error("[OCR] Failed:", error);
    return {
      success: false,
      content: null,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Format parse result for LLM consumption.
 */
export function formatFileParseResult(response: FileParseResponse, fileUrl: string): string {
  if (!response.success) {
    return `Failed to parse file "${fileUrl}": ${response.error || "Unknown error"}.`;
  }
  const content = response.content?.trim() || "(No content extracted)";
  return `Parsed content from ${fileUrl}:\n\n${content}`;
}