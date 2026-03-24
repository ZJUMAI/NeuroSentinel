/**
 * ImageJ/Fiji 线虫图像分析 API 客户端
 *
 * 调用容器化部署的 ImageJ 服务（FastAPI + PyImageJ），
 * 对上传的线虫图像/视频进行运动分析、追踪等。
 * 参考：修改2.12.md
 */

import axios from "axios";
import FormData from "form-data";
import { ENV } from "../_core/env";
import { fetchFileBuffer } from "./file-parser";

export type ImageJAnalysisResult = {
  success: boolean;
  status?: string;
  filename?: string;
  dimensions?: number[];
  count?: number;
  details?: Record<string, unknown> & {
    bendthreshold2_content?: string;
    bendthreshold3_content?: string;
  };
  error?: string;
};

export type ImageJTxtDownloadUrls = {
  bendthreshold2?: string;
  bendthreshold3?: string;
};

function getImageJBaseUrl(): string {
  const url = process.env.IMAGEJ_API_URL || ENV.imagejApiUrl || "http://localhost:8000";
  return url.replace(/\/+$/, "");
}

export type ImageJAnalysisOptions = {
  analysis_type?: "auto" | "fluorescence" | "movement" | "morphology" | "preprocessing";
  subtract_background?: boolean;
  rolling_radius?: number;
  run_tracking?: boolean;
};

/**
 * 分析线虫图像/视频
 * 将文件发送到 ImageJ 服务的 /analyze/nematode 端点，支持可选的分析参数
 */
export async function analyzeNematodeImage(
  fileUrl: string,
  options?: ImageJAnalysisOptions
): Promise<ImageJAnalysisResult> {
  const baseUrl = getImageJBaseUrl();

  try {
    const buffer = await fetchFileBuffer(fileUrl);
    const sizeMB = (buffer.length / 1024 / 1024).toFixed(1);
    console.log(`[ImageJ] 正在发送文件到 ImageJ 分析 (${sizeMB} MB)，视频 wrMTrck 可能需数分钟...`);

    // 从 URL 推断文件名
    const match = fileUrl.match(/\/([^/?]+)(?:\?|$)/);
    const filename = match ? match[1] : "image.png";

    // 使用 form-data + axios 发送大文件，比 fetch 更稳定（fetch 对 100MB+ 可能连接重置）
    const formData = new FormData();
    formData.append("file", buffer, { filename });
    const opts = options
      ? Object.fromEntries(
          Object.entries(options).filter(([, v]) => v !== undefined && v !== null)
        )
      : {};
    if (Object.keys(opts).length > 0) {
      formData.append("options", JSON.stringify(opts));
    }

    const response = await axios.post<ImageJAnalysisResult & {
      status?: string;
      dimensions?: number[];
      count?: number;
      details?: Record<string, unknown>;
    }>(`${baseUrl}/analyze/nematode`, formData, {
      headers: {
        ...formData.getHeaders(),
        "User-Agent": "Manus-Agent/1.0",
      },
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
      timeout: 10 * 60 * 1000, // 10 分钟
      validateStatus: () => true, // 不自动 throw，手动处理
    });

    console.log(`[ImageJ] 分析完成，状态: ${response.status}`);

    if (response.status !== 200) {
      const errText = typeof response.data === "string" ? response.data : JSON.stringify(response.data);
      console.error(`[ImageJ] API error: ${response.status} - ${errText}`);
      return {
        success: false,
        error: `ImageJ 服务错误: ${response.status} ${response.statusText}`,
      };
    }

    const data = response.data as ImageJAnalysisResult & {
      status?: string;
      dimensions?: number[];
      count?: number;
      details?: Record<string, unknown>;
    };

    return {
      success: data.status === "success" || data.status === "partial",
      status: data.status,
      filename: data.filename,
      dimensions: data.dimensions,
      count: data.count,
      details: data.details,
      error: data.error,
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    const errName = error instanceof Error ? error.name : "";
    const errCode = (error as { code?: string })?.code;
    console.error("[ImageJ] analyzeNematodeImage failed:", msg);
    let hint =
      "请确保 imagej-agent 已用 200MB 限制重新构建：docker stop imagej-agent && docker rm imagej-agent && cd imagej-service && docker build -t imagej-analysis-api . && docker run -d -p 8000:8000 --name imagej-agent imagej-analysis-api";
    if (errName === "AbortError" || msg.includes("abort") || errCode === "ECONNABORTED") {
      hint = "请求超时（视频分析可能需数分钟）。若视频较大，请稍后重试。";
    } else if (msg.includes("ECONNREFUSED") || msg.includes("ECONNRESET") || msg.includes("fetch failed")) {
      hint = "无法连接 ImageJ 服务。请运行 docker start imagej-agent，并确认已用新代码重新构建容器（支持 200MB 大文件）。";
    }
    return {
      success: false,
      error: `ImageJ 分析失败: ${msg}。${hint}`,
    };
  }
}

/**
 * 检查 ImageJ 服务是否可用
 */
export async function checkImageJHealth(): Promise<boolean> {
  const baseUrl = getImageJBaseUrl();
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
 * 格式化分析结果为可读文本
 * @param result - ImageJ 分析结果
 * @param downloadUrls - wrMTrck .txt 附件在 MinIO 的下载链接（可选）
 */
export function formatImageJResult(
  result: ImageJAnalysisResult,
  downloadUrls?: ImageJTxtDownloadUrls
): string {
  if (result.success) {
    let text = `## ImageJ 线虫图像分析结果\n\n`;
    text += `- **状态**: ${result.status || "success"}\n`;
    if (result.filename) text += `- **文件名**: ${result.filename}\n`;
    if (result.dimensions?.length)
      text += `- **图像尺寸**: ${result.dimensions.join(" × ")}\n`;
    if (result.count !== undefined)
      text += `- **检测数量**: ${result.count}\n`;

    const details = result.details || {};
    const {
      bendthreshold2_content,
      bendthreshold3_content,
      bendthreshold2,
      bendthreshold3,
      ...restDetails
    } = details;
    if (Object.keys(restDetails).length > 0) {
      text += `- **详情**: ${JSON.stringify(restDetails)}\n`;
    }

    // wrMTrck 数据：制表符替换为空格 + 围栏代码块，双重避免 remark-gfm 解析为表格
    const toCodeBlock = (s: string) => s.replace(/\t/g, "  "); // 制表符→双空格，保留列对齐且不被解析为表格
    if (bendthreshold2_content) {
      text += `\n### wrMTrck bendthreshold2 数据\n\n`;
      if (downloadUrls?.bendthreshold2) {
        text += `📎 [下载 bendthreshold2.txt](${downloadUrls.bendthreshold2})\n\n`;
      }
      text += "**展开查看原始数据：**\n\n```txt\n" + toCodeBlock(bendthreshold2_content) + "\n```\n\n";
    }
    if (bendthreshold3_content) {
      text += `### wrMTrck bendthreshold3 数据\n\n`;
      if (downloadUrls?.bendthreshold3) {
        text += `📎 [下载 bendthreshold3.txt](${downloadUrls.bendthreshold3})\n\n`;
      }
      text += "**展开查看原始数据：**\n\n```txt\n" + toCodeBlock(bendthreshold3_content) + "\n```\n";
    }
    return text;
  }
  return `ImageJ 分析失败: ${result.error || "未知错误"}`;
}
