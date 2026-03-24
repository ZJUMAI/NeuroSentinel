/**
 * 调用 BSR 预测模型，根据十项评价指标计算化合物神经损伤指数
 * 使用临时文件传递 JSON，避免 Node 子进程 stdin 在 Windows 上的编码问题
 */

import { spawn } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";
import type { PlanMetrics } from "./plan-metrics";

const _dir = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_EVALUATE_ROOT = path.resolve(_dir, "../../../../evaluate");
const EVALUATE_ROOT = (process.env.EVALUATE_ROOT || DEFAULT_EVALUATE_ROOT).trim() || DEFAULT_EVALUATE_ROOT;
const PREDICT_SCRIPT = path.join(EVALUATE_ROOT, "predict_bsr.py");
const PYTHON_CMD = process.env.NEORUAL_PYTHON || "conda";

function runPredict(cmd: string, args: string[]): Promise<number | null> {
  return new Promise((resolve) => {
    const proc = spawn(cmd, args, {
      cwd: EVALUATE_ROOT,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    proc.stdout?.on("data", (d) => {
      stdout += d.toString();
    });
    proc.stderr?.on("data", (d) => {
      stderr += d.toString();
    });
    proc.on("close", (code) => {
      if (code !== 0) {
        console.warn("[BSR predict] Script failed:", cmd, args.join(" "), "| stderr:", stderr || stdout);
        resolve(null);
        return;
      }
      try {
        const out = JSON.parse(stdout.trim());
        const idx = out.compoundNeurodamageIndex;
        resolve(typeof idx === "number" ? idx : null);
      } catch {
        console.warn("[BSR predict] Parse error:", stdout);
        resolve(null);
      }
    });
    proc.on("error", (err) => {
      console.warn("[BSR predict] Spawn error:", cmd, err.message);
      resolve(null);
    });
  });
}

/**
 * 根据十项指标预测化合物神经损伤指数（0-100，越高表示损伤越严重）
 * 若预测失败则返回 null
 */
export async function predictCompoundNeurodamageIndex(
  metrics: PlanMetrics
): Promise<number | null> {
  const input = JSON.stringify({
    串珠数量: metrics.串珠数量,
    平均串珠大小: metrics.平均串珠大小,
    CEP数量: metrics.CEP数量,
    平均CEP大小: metrics.平均CEP大小,
    ADE数量: metrics.ADE数量,
    平均ADE大小: metrics.平均ADE大小,
    树突长度: metrics.树突长度,
    断裂: metrics.断裂,
    增生: metrics.增生,
    异常弯曲: metrics.异常弯曲,
  });

  const tmpPath = path.join(os.tmpdir(), `bsr-input-${Date.now()}.json`);
  try {
    fs.writeFileSync(tmpPath, input, "utf8");
  } catch (err) {
    console.warn("[BSR predict] Failed to write temp file:", (err as Error).message);
    return null;
  }

  const useConda = PYTHON_CMD === "conda";
  let result: number | null = null;

  if (useConda) {
    result = await runPredict("conda", ["run", "-n", "py3.9", "python", PREDICT_SCRIPT, tmpPath]);
    if (result == null) {
      // conda 在 Node 子进程中常不可用，回退到系统 python
      result = await runPredict("python", [PREDICT_SCRIPT, tmpPath]);
      if (result == null) {
        console.error(
          "[BSR predict] 预测失败。请设置 NEORUAL_PYTHON 为 Python 可执行文件路径（含 sklearn、pandas），或确保 conda 在 PATH 中。",
          "EVALUATE_ROOT=",
          EVALUATE_ROOT,
          "PREDICT_SCRIPT=",
          PREDICT_SCRIPT
        );
      }
    }
  } else {
    result = await runPredict(PYTHON_CMD, [PREDICT_SCRIPT, tmpPath]);
    if (result == null) {
      console.error("[BSR predict] 预测失败。请检查 NEORUAL_PYTHON 路径是否正确。");
    }
  }

  try {
    fs.unlinkSync(tmpPath);
  } catch {
    /* ignore */
  }
  return result;
}
