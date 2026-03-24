/**
 * Deep-Worm-Tracker 线虫视频运动追踪 API 客户端
 *
 * 调用容器化部署的 Deep-Worm-Tracker 服务（YOLOv5 + 多目标追踪），
 * 对线虫运动视频进行高精度追踪，输出 ID、边界框、轨迹等。
 * 参考：修改2.23.md，Zenodo 7884831
 */

import { ENV } from "../_core/env";
import { fetchFileBuffer } from "./file-parser";

export type DeepWormTrackerResult = {
  success: boolean;
  status?: string;
  filename?: string;
  count?: number;
  totalDetections?: number;
  tracks?: Array<{
    frame: number;
    id: number;
    bbox: number[];
    confidence: number;
  }>;
  details?: Record<string, unknown>;
  error?: string;
};

function getBaseUrl(): string {
  const url =
    process.env.DEEP_WORM_TRACKER_API_URL ||
    ENV.deepWormTrackerApiUrl ||
    "http://localhost:8001";
  return url.replace(/\/+$/, "");
}

/**
 * 对线虫视频进行运动追踪
 * 将视频发送到 Deep-Worm-Tracker 的 /analyze/v2/tracking 端点
 */
export async function analyzeNematodeVideoTracking(
  fileUrl: string
): Promise<DeepWormTrackerResult> {
  const baseUrl = getBaseUrl();

  try {
    const buffer = await fetchFileBuffer(fileUrl);

    const match = fileUrl.match(/\/([^/?]+)(?:\?|$)/);
    const filename = match ? match[1] : "video.mp4";

    const formData = new FormData();
    formData.append("file", new Blob([buffer]), filename);

    const response = await fetch(`${baseUrl}/analyze/v2/tracking`, {
      method: "POST",
      body: formData,
      headers: {
        "User-Agent": "Manus-Agent/1.0",
      },
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error(`[DeepWormTracker] API error: ${response.status} - ${errText}`);
      return {
        success: false,
        error: `Deep-Worm-Tracker 服务错误: ${response.status} ${response.statusText}`,
      };
    }

    const data = (await response.json()) as DeepWormTrackerResult & {
      status?: string;
      count?: number;
      total_detections?: number;
      tracks?: Array<{ frame: number; id: number; bbox: number[]; confidence: number }>;
    };

    return {
      success: data.status === "success",
      status: data.status,
      filename: data.filename,
      count: data.count,
      totalDetections: data.total_detections,
      tracks: data.tracks,
      details: data.details,
      error: data.error,
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[DeepWormTracker] analyzeNematodeVideoTracking failed:", msg);
    return {
      success: false,
      error: `Deep-Worm-Tracker 分析失败: ${msg}。请确保服务已启动（docker run -p 8001:8001 deep-worm-tracker-api）`,
    };
  }
}

/**
 * 检查 Deep-Worm-Tracker 服务是否可用
 */
export async function checkDeepWormTrackerHealth(): Promise<boolean> {
  const baseUrl = getBaseUrl();
  try {
    const res = await fetch(`${baseUrl}/health`, {
      method: "GET",
      headers: { "User-Agent": "Manus-Agent/1.0" },
      signal: AbortSignal.timeout(3000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * 格式化追踪结果为可读文本
 */
export function formatDeepWormTrackerResult(
  result: DeepWormTrackerResult
): string {
  if (result.success) {
    let text = `## Deep-Worm-Tracker 线虫视频追踪结果\n\n`;
    text += `- **状态**: ${result.status || "success"}\n`;
    if (result.filename) text += `- **文件名**: ${result.filename}\n`;
    if (result.count !== undefined)
      text += `- **追踪线虫数**: ${result.count}\n`;
    if (result.totalDetections !== undefined)
      text += `- **总检测帧数**: ${result.totalDetections}\n`;
    if (result.details && Object.keys(result.details).length > 0) {
      text += `- **详情**: ${JSON.stringify(result.details)}\n`;
    }
    if (result.tracks && result.tracks.length > 0) {
      text += `\n### 轨迹摘要（前 20 条）\n`;
      result.tracks.slice(0, 20).forEach((t, i) => {
        text += `${i + 1}. 帧${t.frame} ID=${t.id} 置信度=${(t.confidence * 100).toFixed(1)}%\n`;
      });
    }
    return text;
  }
  return `Deep-Worm-Tracker 分析失败: ${result.error || "未知错误"}`;
}
