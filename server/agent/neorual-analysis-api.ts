/**
 * Neorual 线虫显微图像分析 API
 *
 * 1. 若设置 NEORUAL_API_URL：调用 Docker 服务（推荐，无需本地 Python 3.9）
 * 2. 否则：通过 spawn 子进程执行本地 Python 脚本（需 conda py3.9）
 */

import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { fetchFileBuffer } from "./file-parser";
import { nanoid } from "nanoid";
import { ENV } from "../_core/env";

const _dir = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_NEORUAL_ROOT = path.resolve(_dir, "../../");
const NEORUAL_ROOT = (ENV.neorualAnalysisRoot || process.env.NEORUAL_ANALYSIS_ROOT || "").trim() || DEFAULT_NEORUAL_ROOT;
const NEORUAL_API_URL = (ENV.neorualApiUrl || process.env.NEORUAL_API_URL || "").trim();
const PYTHON_CMD = process.env.NEORUAL_PYTHON || "conda";

export type NeorualAnalysisResult = {
  success: boolean;
  summary?: string;
  images?: string[];
  error?: string;
};

function getProjectRoot(): string {
  return path.resolve(NEORUAL_ROOT);
}

/** 调用 Docker 服务（当 NEORUAL_API_URL 已配置时） */
async function callNeorualDocker(
  endpoint: string,
  fileUrl: string
): Promise<NeorualAnalysisResult> {
  const base = NEORUAL_API_URL.replace(/\/+$/, "");
  const url = `${base}${endpoint}`;
  const buffer = await fetchFileBuffer(fileUrl);
  const form = new FormData();
  form.append("file", new Blob([buffer], { type: "image/png" }), "input.png");
  const res = await fetch(url, {
    method: "POST",
    body: form,
  });
  const data = (await res.json()) as { success?: boolean; summary?: string; images?: string[]; error?: string };
  if (!res.ok) {
    return { success: false, error: data.error || res.statusText };
  }
  return {
    success: data.success ?? false,
    summary: data.summary,
    images: data.images ?? [],
    error: data.error,
  };
}

function runPythonScript(
  scriptPath: string,
  args: string[],
  cwd: string,
  timeoutMs = 120_000
): Promise<{ stdout: string; stderr: string; code: number | null }> {
  const useConda = PYTHON_CMD === "conda";
  const cmd = useConda ? "conda" : PYTHON_CMD;
  const cmdArgs = useConda ? ["run", "-n", "py3.9", "python", scriptPath, ...args] : [scriptPath, ...args];
  return new Promise((resolve) => {
    const proc = spawn(cmd, cmdArgs, {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    proc.stdout?.on("data", (d) => { stdout += d.toString(); });
    proc.stderr?.on("data", (d) => { stderr += d.toString(); });
    const t = setTimeout(() => {
      proc.kill("SIGTERM");
      resolve({
        stdout,
        stderr: stderr + "\n[超时] 分析已终止",
        code: null,
      });
    }, timeoutMs);
    proc.on("close", (code) => {
      clearTimeout(t);
      resolve({ stdout, stderr, code });
    });
  });
}

/**
 * ViT 神经元形态分类（arborization, bend, break）+ Grad-CAM
 */
export async function analyzeNematodeVitClassification(
  fileUrl: string,
  uploadsDir: string
): Promise<NeorualAnalysisResult> {
  if (NEORUAL_API_URL) {
    return callNeorualDocker("/analyze/vit", fileUrl);
  }
  const root = getProjectRoot();
  const scriptPath = path.join(root, "neorual-analysis", "inference_vit_classification.py");
  if (!fs.existsSync(scriptPath)) {
    return {
      success: false,
      error: `脚本不存在: ${scriptPath}。请确保 neorual-analysis 已正确放置在项目根目录。`,
    };
  }

  try {
    const buffer = await fetchFileBuffer(fileUrl);
    const suffix = nanoid(8);
    const inputPath = path.join(uploadsDir, `neorual_input_${suffix}.png`);
    const outDir = path.join(uploadsDir, `neorual_vit_${suffix}`);
    await fs.promises.mkdir(path.dirname(inputPath), { recursive: true });
    await fs.promises.mkdir(outDir, { recursive: true });
    await fs.promises.writeFile(inputPath, buffer);

    const { stdout, stderr, code } = await runPythonScript(
      scriptPath,
      ["--img", inputPath, "--out-dir", outDir, "--no-gradcam"],
      root  // cwd=NeuroSentinel，cellbody 脚本需要 projects.ViTDet
    );

    if (code !== 0) {
      console.error("[Neorual ViT] stderr:", stderr);
      return {
        success: false,
        error: stderr || stdout || `进程退出码 ${code}`,
      };
    }

    const images: string[] = [];
    const resultPath = path.join(outDir, "vit_classification_result.png");
    if (fs.existsSync(resultPath)) {
      const data = await fs.promises.readFile(resultPath);
      images.push(`data:image/png;base64,${data.toString("base64")}`);
    }

    // 解析 results.json，输出十项指标中的：断裂、增生、异常弯曲
    const taskToIndicator: Record<string, string> = {
      arborization: "树突分支增生",
      bend: "树突异常弯曲",
      break: "树突断裂",
    };
    const taskNames: Record<string, string> = {
      arborization: "树突分支",
      bend: "弯曲",
      break: "断裂",
    };
    let summary = `## ViT 神经元形态分类结果\n\n### 十项评价指标（本步输出）\n| 指标 | 值 |\n|------|-----|\n`;
    const resultsPath = path.join(outDir, "results.json");
    if (fs.existsSync(resultsPath)) {
      const results = JSON.parse(await fs.promises.readFile(resultsPath, "utf-8")) as Record<
        string,
        { pred: number; probs: number[]; label: string }
      >;
      for (const [task, r] of Object.entries(results)) {
        const ind = taskToIndicator[task];
        const name = taskNames[task] ?? task;
        const p1 = (r.probs[1] * 100).toFixed(1);
        summary += `| ${ind} | ${r.label}（异常概率${p1}%） |\n`;
      }
      summary += `\n三任务分类：树突分支(arborization)、弯曲(bend)、断裂(break)。左图：输入图像；右图：三任务概率柱状图。`;
    } else {
      summary += `| 树突断裂 | — |\n| 树突分支增生 | — |\n| 树突异常弯曲 | — |\n\n三任务分类已完成，详见下方可视化结果。`;
    }
    return { success: true, summary, images };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[Neorual ViT] Failed:", msg);
    return { success: false, error: msg };
  }
}

/**
 * 串珠分割
 */
export async function analyzeNematodeBeadSegmentation(
  fileUrl: string,
  uploadsDir: string
): Promise<NeorualAnalysisResult> {
  if (NEORUAL_API_URL) {
    return callNeorualDocker("/analyze/bead", fileUrl);
  }
  const root = getProjectRoot();
  const scriptPath = path.join(root, "neorual-analysis", "visualize_bead_segmentation.py");
  if (!fs.existsSync(scriptPath)) {
    return {
      success: false,
      error: `脚本不存在: ${scriptPath}。请确保 neorual-analysis 已正确放置在项目根目录。`,
    };
  }

  try {
    const buffer = await fetchFileBuffer(fileUrl);
    const suffix = nanoid(8);
    const inputPath = path.join(uploadsDir, `neorual_input_${suffix}.png`);
    const outDir = path.join(uploadsDir, `neorual_bead_${suffix}`);
    await fs.promises.mkdir(path.dirname(inputPath), { recursive: true });
    await fs.promises.mkdir(outDir, { recursive: true });
    await fs.promises.writeFile(inputPath, buffer);

    const { stdout, stderr, code } = await runPythonScript(
      scriptPath,
      ["--img", inputPath, "--out-dir", outDir],
      root
    );

    if (code !== 0) {
      console.error("[Neorual Bead] stderr:", stderr);
      return {
        success: false,
        error: stderr || stdout || `进程退出码 ${code}`,
      };
    }

    const images: string[] = [];
    const resultPath = path.join(outDir, "bead_segmentation_result.png");
    if (fs.existsSync(resultPath)) {
      const data = await fs.promises.readFile(resultPath);
      images.push(`data:image/png;base64,${data.toString("base64")}`);
    }

    let summary = `## 串珠分割结果\n\n### 十项评价指标（本步输出）\n| 指标 | 值 |\n|------|-----|\n`;
    const metricsPath = path.join(outDir, "metrics.json");
    if (fs.existsSync(metricsPath)) {
      const metrics = JSON.parse(await fs.promises.readFile(metricsPath, "utf-8")) as Record<string, number>;
      summary += `| 串珠数量 | ${metrics["串珠数量"] ?? "—"} |\n| 平均串珠大小 | ${metrics["平均串珠大小"] ?? "—"} px |\n`;
    } else {
      summary += `| 串珠数量 | — |\n| 平均串珠大小 | — |\n`;
    }
    summary += `\n灰度背景叠加红色区域为检测到的串珠结构。`;
    return { success: true, summary, images };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[Neorual Bead] Failed:", msg);
    return { success: false, error: msg };
  }
}

/**
 * 细胞体实例分割
 */
export async function analyzeNematodeCellbodySegmentation(
  fileUrl: string,
  uploadsDir: string
): Promise<NeorualAnalysisResult> {
  if (NEORUAL_API_URL) {
    return callNeorualDocker("/analyze/cellbody", fileUrl);
  }
  const root = getProjectRoot();
  const scriptPath = path.join(root, "neorual-analysis", "visualize_Cellbody_instance_segmentation.py");
  if (!fs.existsSync(scriptPath)) {
    return {
      success: false,
      error: `脚本不存在: ${scriptPath}。请确保 neorual-analysis 已正确放置在项目根目录。`,
    };
  }

  try {
    const buffer = await fetchFileBuffer(fileUrl);
    const suffix = nanoid(8);
    const inputPath = path.join(uploadsDir, `neorual_input_${suffix}.png`);
    const outDir = path.join(uploadsDir, `neorual_cellbody_${suffix}`);
    await fs.promises.mkdir(path.dirname(inputPath), { recursive: true });
    await fs.promises.mkdir(outDir, { recursive: true });
    await fs.promises.writeFile(inputPath, buffer);

    const { stdout, stderr, code } = await runPythonScript(
      scriptPath,
      ["--img", inputPath, "--out-dir", outDir],
      root,
      180_000
    );

    if (code !== 0) {
      console.error("[Neorual Cellbody] stderr:", stderr);
      return {
        success: false,
        error: stderr || stdout || `进程退出码 ${code}`,
      };
    }

    const images: string[] = [];
    const visDir = path.join(outDir, "vis");
    if (fs.existsSync(visDir)) {
      const files = await fs.promises.readdir(visDir);
      for (const f of files) {
        if (/\.(png|jpg|jpeg)$/i.test(f)) {
          const data = await fs.promises.readFile(path.join(visDir, f));
          images.push(`data:image/png;base64,${data.toString("base64")}`);
        }
      }
    }
    if (images.length === 0) {
      const predFiles = await fs.promises.readdir(outDir).catch(() => []);
      for (const f of predFiles) {
        if (/\.(png|jpg|jpeg)$/i.test(f) && f !== "preprocessed_input.png") {
          const fp = path.join(outDir, f);
          const stat = await fs.promises.stat(fp);
          if (stat.isFile()) {
            const data = await fs.promises.readFile(fp);
            images.push(`data:image/png;base64,${data.toString("base64")}`);
          }
        }
      }
    }

    let summary = `## 细胞体实例分割结果\n\n### 十项评价指标（本步输出）\n| 指标 | 值 |\n|------|-----|\n`;
    const metricsPath = path.join(outDir, "metrics.json");
    if (fs.existsSync(metricsPath)) {
      const metrics = JSON.parse(await fs.promises.readFile(metricsPath, "utf-8")) as Record<string, number>;
      summary += `| CEP数量 | ${metrics["CEP数量"] ?? "—"} |\n| 平均CEP大小 | ${metrics["平均CEP大小"] ?? "—"} px² |\n| ADE数量 | ${metrics["ADE数量"] ?? "—"} |\n| 平均ADE大小 | ${metrics["平均ADE大小"] ?? "—"} px² |\n`;
    } else {
      summary += `| CEP数量 | — |\n| 平均CEP大小 | — |\n| ADE数量 | — |\n| 平均ADE大小 | — |\n`;
    }
    summary += `\n每个检测到的细胞体已标注。`;
    return { success: true, summary, images };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[Neorual Cellbody] Failed:", msg);
    return { success: false, error: msg };
  }
}

/**
 * 树突检测（Faster R-CNN）
 */
export async function analyzeNematodeDendriteDetection(
  fileUrl: string,
  uploadsDir: string
): Promise<NeorualAnalysisResult> {
  if (NEORUAL_API_URL) {
    return callNeorualDocker("/analyze/dendrite", fileUrl);
  }
  const root = getProjectRoot();
  const scriptPath = path.join(root, "neorual-analysis", "visualize_Dendrite_detection.py");
  if (!fs.existsSync(scriptPath)) {
    return {
      success: false,
      error: `脚本不存在: ${scriptPath}。请确保 neorual-analysis 已正确放置在项目根目录。`,
    };
  }

  try {
    const buffer = await fetchFileBuffer(fileUrl);
    const suffix = nanoid(8);
    const inputPath = path.join(uploadsDir, `neorual_input_${suffix}.png`);
    const outDir = path.join(uploadsDir, `neorual_dendrite_${suffix}`);
    await fs.promises.mkdir(path.dirname(inputPath), { recursive: true });
    await fs.promises.mkdir(outDir, { recursive: true });
    await fs.promises.writeFile(inputPath, buffer);

    const { stdout, stderr, code } = await runPythonScript(
      scriptPath,
      ["--img", inputPath, "--out-dir", outDir],
      root,
      180_000
    );

    if (code !== 0) {
      console.error("[Neorual Dendrite] stderr:", stderr);
      return {
        success: false,
        error: stderr || stdout || `进程退出码 ${code}`,
      };
    }

    const images: string[] = [];
    const visDir = path.join(outDir, "vis");
    if (fs.existsSync(visDir)) {
      const files = await fs.promises.readdir(visDir);
      for (const f of files) {
        if (/\.(png|jpg|jpeg)$/i.test(f)) {
          const data = await fs.promises.readFile(path.join(visDir, f));
          images.push(`data:image/png;base64,${data.toString("base64")}`);
        }
      }
    }
    if (images.length === 0) {
      const predFiles = await fs.promises.readdir(outDir).catch(() => []);
      for (const f of predFiles) {
        if (/\.(png|jpg|jpeg)$/i.test(f) && f !== "preprocessed_input.png") {
          const fp = path.join(outDir, f);
          const stat = await fs.promises.stat(fp);
          if (stat.isFile()) {
            const data = await fs.promises.readFile(fp);
            images.push(`data:image/png;base64,${data.toString("base64")}`);
          }
        }
      }
    }

    let summary = `## 树突检测结果\n\n### 十项评价指标（本步输出）\n| 指标 | 值 |\n|------|-----|\n`;
    const metricsPath = path.join(outDir, "metrics.json");
    if (fs.existsSync(metricsPath)) {
      const metrics = JSON.parse(await fs.promises.readFile(metricsPath, "utf-8")) as Record<string, number>;
      summary += `| 树突长度 | ${metrics["树突长度"] ?? "—"} px |\n`;
    } else {
      summary += `| 树突长度 | — |\n`;
    }
    summary += `\n每个检测到的树突已用边界框标注。`;
    return { success: true, summary, images };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[Neorual Dendrite] Failed:", msg);
    return { success: false, error: msg };
  }
}
