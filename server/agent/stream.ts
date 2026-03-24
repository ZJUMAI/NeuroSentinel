import type { Express, Request, Response } from "express";
import fs from "fs";
import path from "path";
import { runAgent, regenerateProjectPlanFromQuestionnaire } from "./core";
import {
  getConversation,
  createConversation,
  createFileAttachment,
  createArtifact,
  createMessage,
  getConversationMessages,
  getConversationArtifacts,
  getConversationByShareToken,
  setConversationShareToken,
  removeConversationShareToken,
  getProjectById,
} from "../db";
import { storageGet, storagePut, storagePutOrLocal } from "../storage";
import {
  analyzeNematodeImage,
  formatImageJResult,
  type ImageJTxtDownloadUrls,
  type ImageJAnalysisOptions,
} from "./imagej-api";
import {
  analyzeNematodeVideoTracking,
  formatDeepWormTrackerResult,
} from "./deep-worm-tracker-api";
import {
  analyzeNematodeVitClassification,
  analyzeNematodeBeadSegmentation,
  analyzeNematodeCellbodySegmentation,
  analyzeNematodeDendriteDetection,
} from "./neorual-analysis-api";
import { fetchFileBuffer } from "./file-parser";
import { invokeZhipuLLM } from "./zhipu-llm";
import { nanoid } from "nanoid";
import { ZHIPU_MODELS } from "./zhipu-llm";
import { ENV } from "../_core/env";
import type { AgentStreamEvent } from "../../shared/types";
import { sdk } from "../_core/sdk";
import express from "express";
import type { User } from "../../drizzle/schema";

const UPLOADS_DIR = path.resolve(import.meta.dirname, "../uploads");

async function putLocalFile(fileKey: string, data: Buffer): Promise<string> {
  const filePath = path.join(UPLOADS_DIR, fileKey);
  const dir = path.dirname(filePath);
  await fs.promises.mkdir(dir, { recursive: true });
  await fs.promises.writeFile(filePath, data);
  return `/uploads/${fileKey.replace(/\\/g, "/")}`;
}

/** 获取当前请求用户：跳过认证模式下使用固定测试用户，否则使用 sdk.authenticateRequest */
async function getAuthUser(req: Request): Promise<User | null> {
  if (
    process.env.NODE_ENV === "development" ||
    process.env.SKIP_AUTH === "true"
  ) {
    const db = await import("../db");
    await db.upsertUser({
      openId: "local-dev-user",
      name: "Local Developer",
      email: "dev@localhost",
      role: "admin",
      lastSignedIn: new Date(),
    });
    const user = await db.getUserByOpenId("local-dev-user");
    return user ?? null;
  }
  try {
    return await sdk.authenticateRequest(req);
  } catch {
    return null;
  }
}

/**
 * Register all agent-related routes:
 * - POST /api/agent/stream - SSE streaming agent execution
 * - GET  /api/agent/models - Available LLM models
 * - POST /api/agent/upload - File upload to S3
 * - GET  /api/agent/export/:uniqueId - Export conversation as Markdown
 * - POST /api/agent/share  - Create/remove share link
 * - GET  /api/agent/shared/:token - Get shared conversation (public)
 */
export function registerAgentRoutes(app: Express) {
  // Serve local uploads (when Forge not configured)
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  app.use("/uploads", express.static(UPLOADS_DIR));

  /**
   * Neorual 结果图稳定入口：artifact 中存此 URL，避免 S3 预签名链接过期导致历史记录图片失效。
   * 本地存储时直接读盘；S3 时每次请求生成短期 presigned 重定向。
   */
  app.get("/api/agent/neorual-result-file", async (req, res) => {
    const user = await getAuthUser(req);
    if (!user) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const keyParam = req.query.key;
    if (typeof keyParam !== "string" || !keyParam.startsWith("neorual_results/")) {
      res.status(400).json({ error: "Invalid key" });
      return;
    }
    if (!keyParam.startsWith(`neorual_results/${user.id}/`)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    if (keyParam.includes("..") || keyParam.includes("\\")) {
      res.status(400).json({ error: "Invalid key" });
      return;
    }
    try {
      if (ENV.s3Bucket && ENV.s3AccessKey && ENV.s3SecretKey) {
        const { url } = await storageGet(keyParam);
        res.redirect(302, url);
        return;
      }
      const absPath = path.join(UPLOADS_DIR, keyParam);
      if (!fs.existsSync(absPath)) {
        res.status(404).end();
        return;
      }
      res.setHeader("Content-Type", "image/png");
      res.setHeader("Cache-Control", "private, max-age=3600");
      fs.createReadStream(absPath).pipe(res);
    } catch (e) {
      console.error("[neorual-result-file]", e);
      res.status(500).end();
    }
  });

  // Increase body size limit for file uploads (500MB)
  app.use("/api/agent/upload", express.raw({ type: "application/octet-stream", limit: "500mb" }));

  // ---- Model list endpoint ----
  app.get("/api/agent/models", async (_req: Request, res: Response) => {
    const models: Array<{
      id: string;
      name: string;
      description: string;
      provider: string;
    }> = [];

    if (ENV.zhipuApiKey) {
      for (const m of ZHIPU_MODELS) {
        models.push({
          id: m.id,
          name: m.name,
          description: m.description,
          provider: "zhipu",
        });
      }
    }

    if (ENV.forgeApiKey) {
      models.push({
        id: "gemini-2.5-flash",
        name: "Gemini 2.5 Flash",
        description: "Google Gemini model via Forge",
        provider: "forge",
      });
    }

    res.json({ models, defaultModel: "glm-4.7-flash" });
  });

  // ---- File upload endpoint ----
  app.post("/api/agent/upload", async (req: Request, res: Response) => {
    const user = await getAuthUser(req);
    if (!user) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const fileNameRaw = req.headers["x-file-name"] as string;
    let fileName = "";
    if (fileNameRaw) {
      try {
        fileName = decodeURIComponent(fileNameRaw);
      } catch {
        fileName = fileNameRaw;
      }
    }
    const mimeType = req.headers["x-mime-type"] as string || "application/octet-stream";
    const convUniqueId = req.headers["x-conversation-id"] as string;
    const fileSizeStr = req.headers["x-file-size"] as string;

    if (!fileName) {
      res.status(400).json({ error: "File name is required (x-file-name header)" });
      return;
    }

    // Get or create conversation
    let conversation;
    if (convUniqueId) {
      conversation = await getConversation(convUniqueId, user.id);
    }

    // Build S3 key with random suffix to prevent enumeration
    const suffix = nanoid(8);
    const sanitizedName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
    const fileKey = `uploads/${user.id}/${suffix}-${sanitizedName}`;

    try {
      // express.raw() parses body into req.body as Buffer
      const fileBuffer = Buffer.isBuffer(req.body)
        ? req.body
        : Buffer.from(req.body ?? []);

      if (!fileBuffer || fileBuffer.length === 0) {
        res.status(400).json({ error: "Empty file or invalid request body" });
        return;
      }

      let url: string;
      if (
        ENV.s3Bucket &&
        ENV.s3AccessKey &&
        ENV.s3SecretKey
      ) {
        const result = await storagePut(fileKey, fileBuffer, mimeType);
        url = result.url;
      } else {
        url = await putLocalFile(fileKey, fileBuffer);
      }

      // Save file metadata to DB if we have a conversation
      let fileRecord = null;
      if (conversation) {
        fileRecord = await createFileAttachment({
          conversationId: conversation.id,
          userId: user.id,
          fileName,
          fileKey,
          fileUrl: url,
          mimeType,
          fileSize: parseInt(fileSizeStr || String(fileBuffer.length), 10),
        });
      }

      res.json({
        success: true,
        file: {
          id: fileRecord?.id,
          fileName,
          fileUrl: url,
          fileKey,
          mimeType,
          fileSize: fileBuffer.length,
        },
      });
    } catch (error) {
      console.error("[Upload] Failed:", error);
      res.status(500).json({ error: "File upload failed" });
    }
  });

  // ---- ImageJ nematode analysis (triggered by project plan image upload) ----
  app.post("/api/agent/analyze-nematode-image", async (req: Request, res: Response) => {
    const user = await getAuthUser(req);
    if (!user) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const { fileUrl, conversationId: convUniqueId, options, dayIndex, concentrationGroup, condition } = req.body as {
      fileUrl?: string;
      conversationId?: string;
      options?: { analysis_type?: string; rolling_radius?: number; run_tracking?: boolean };
      dayIndex?: number;
      concentrationGroup?: string;
      condition?: "on_food" | "off_food";
    };

    if (!fileUrl || typeof fileUrl !== "string") {
      res.status(400).json({ error: "fileUrl is required" });
      return;
    }

    let conversation = null;
    if (convUniqueId) {
      conversation = await getConversation(convUniqueId, user.id);
      if (!conversation) {
        res.status(404).json({ error: "Conversation not found" });
        return;
      }
    }

    try {
      const result = await analyzeNematodeImage(fileUrl, options as ImageJAnalysisOptions | undefined);

      // 将 wrMTrck .txt 附件上传到 MinIO，获取下载链接
      const downloadUrls: ImageJTxtDownloadUrls = {};
      const details = result.details || {};
      const suffix = nanoid(8);
      const baseKey = `uploads/${user.id}/analysis`;
      for (const [key, urlKey] of [
        ["bendthreshold2_content", "bendthreshold2"] as const,
        ["bendthreshold3_content", "bendthreshold3"] as const,
      ]) {
        const content = details[key] as string | undefined;
        if (typeof content === "string" && content) {
          const fileKey = `${baseKey}/${suffix}-${urlKey}.txt`;
          try {
            downloadUrls[urlKey] = await storagePutOrLocal(
              fileKey,
              Buffer.from(content, "utf-8"),
              "text/plain"
            );
          } catch (err) {
            console.warn(`[analyze-nematode-image] Failed to upload ${urlKey}.txt:`, err);
          }
        }
      }

      const formattedResult = formatImageJResult(result, downloadUrls);

      const baseTitle = "ImageJ 线虫图像分析结果";
      const artifactTitle = concentrationGroup?.trim()
        ? `${baseTitle} (${concentrationGroup.trim()})`
        : baseTitle;

      const dayLabel = typeof dayIndex === "number" ? `第${dayIndex + 1}天` : undefined;
      const conditionLabel = condition === "on_food" ? "有食物" : condition === "off_food" ? "无食物" : undefined;
      const metaLine =
        dayLabel || concentrationGroup || condition
          ? `<!-- imagej_meta:${JSON.stringify({
              date: dayLabel,
              group: concentrationGroup?.trim() || undefined,
              condition: conditionLabel ?? condition,
            })} -->\n\n`
          : "";

      let artifactId: number | undefined;
      if (result.success && conversation && formattedResult) {
        const contentWithMeta = metaLine + formattedResult;
        const saved = await createArtifact({
          conversationId: conversation.id,
          type: "markdown",
          title: artifactTitle,
          content: contentWithMeta,
        });
        artifactId = saved.id;
      }

      res.json({
        success: result.success,
        result: formattedResult,
        artifactId,
        details: result.details,
        downloadUrls: Object.keys(downloadUrls).length > 0 ? downloadUrls : undefined,
      });
    } catch (error) {
      console.error("[analyze-nematode-image] Failed:", error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : "Analysis failed",
      });
    }
  });

  // ---- Deep-Worm-Tracker 视频追踪（project_plan 视频上传触发） ----
  app.post("/api/agent/analyze-nematode-video-tracking", async (req: Request, res: Response) => {
    const user = await getAuthUser(req);
    if (!user) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const { fileUrl, conversationId: convUniqueId } = req.body as {
      fileUrl?: string;
      conversationId?: string;
    };

    if (!fileUrl || typeof fileUrl !== "string") {
      res.status(400).json({ error: "fileUrl is required" });
      return;
    }

    let conversation = null;
    if (convUniqueId) {
      conversation = await getConversation(convUniqueId, user.id);
      if (!conversation) {
        res.status(404).json({ error: "Conversation not found" });
        return;
      }
    }

    try {
      const result = await analyzeNematodeVideoTracking(fileUrl);
      const formattedResult = formatDeepWormTrackerResult(result);

      let artifactId: number | undefined;
      if (result.success && conversation && formattedResult) {
        const saved = await createArtifact({
          conversationId: conversation.id,
          type: "markdown",
          title: "Deep-Worm-Tracker 线虫视频追踪结果",
          content: formattedResult,
        });
        artifactId = saved.id;
      }

      res.json({
        success: result.success,
        result: formattedResult,
        artifactId,
        details: result.details,
      });
    } catch (error) {
      console.error("[analyze-nematode-video-tracking] Failed:", error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : "Analysis failed",
      });
    }
  });

  // ---- 实验数据表格分析（project_plan 填写数据后触发） ----
  app.post("/api/agent/analyze-data-table", async (req: Request, res: Response) => {
    const user = await getAuthUser(req);
    if (!user) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const { fileUrl, conversationId: convUniqueId, stepText } = req.body as {
      fileUrl?: string;
      conversationId?: string;
      stepText?: string;
    };

    if (!fileUrl || typeof fileUrl !== "string") {
      res.status(400).json({ error: "fileUrl is required" });
      return;
    }

    let conversation = null;
    if (convUniqueId) {
      conversation = await getConversation(convUniqueId, user.id);
      if (!conversation) {
        res.status(404).json({ error: "Conversation not found" });
        return;
      }
    }

    try {
      const buffer = await fetchFileBuffer(fileUrl);
      const csvText = buffer.toString("utf-8").replace(/\uFEFF/g, "");
      const lines = csvText.split(/\r?\n/).filter((l) => l.trim());
      if (lines.length < 2) {
        res.status(400).json({ success: false, error: "数据表格内容不足" });
        return;
      }

      const prompt = `你是一位专业的生物统计与线虫实验分析专家。请分析以下实验数据表格，给出：
1. 数据概览（组别、样本量、主要指标）
2. 描述性统计（均值±标准差等）
3. 组间比较建议（如适用 ANOVA、t 检验等）
4. 简要结论与实验建议

实验步骤背景：${stepText || "统计实验数据"}

数据表格（CSV）：
\`\`\`csv
${lines.slice(0, 50).join("\n")}
${lines.length > 50 ? "\n...(省略后续行)" : ""}
\`\`\`

请用中文回答，结构清晰。`;

      const result = await invokeZhipuLLM({
        messages: [
          { role: "system", content: "你是生物统计与线虫实验分析专家，擅长解读实验数据并给出专业建议。" },
          { role: "user", content: prompt },
        ],
        model: "glm-4.7-flash",
        max_tokens: 2048,
      });

      const analysisText = result.content?.trim() || "分析结果为空";
      const formattedResult = `## 实验数据分析结果\n\n${analysisText}`;

      let artifactId: number | undefined;
      if (conversation) {
        const saved = await createArtifact({
          conversationId: conversation.id,
          type: "markdown",
          title: "实验数据分析结果",
          content: formattedResult,
        });
        artifactId = saved.id;
      }

      res.json({
        success: true,
        result: formattedResult,
        artifactId,
      });
    } catch (error) {
      console.error("[analyze-data-table] Failed:", error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : "Analysis failed",
      });
    }
  });

  // ---- Neorual 线虫显微图像分析（project_plan 第七天三步调用） ----
  const neorualHandler = async (
    req: Request,
    res: Response,
    analyzer: (fileUrl: string, uploadsDir: string) => Promise<{ success: boolean; summary?: string; images?: string[]; error?: string }>,
    title: string
  ) => {
    const user = await getAuthUser(req);
    if (!user) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const { fileUrl, conversationId: convUniqueId, concentrationGroup } = req.body as {
      fileUrl?: string;
      conversationId?: string;
      concentrationGroup?: string;
    };
    if (!fileUrl || typeof fileUrl !== "string") {
      res.status(400).json({ error: "fileUrl is required" });
      return;
    }
    let conversation = null;
    if (convUniqueId) {
      conversation = await getConversation(convUniqueId, user.id);
      if (!conversation) {
        res.status(404).json({ error: "Conversation not found" });
        return;
      }
    }
    try {
      const result = await analyzer(fileUrl, UPLOADS_DIR);
      // 存文件并返回 URL（替代 base64，响应更小、可缓存）
      let imageUrls: string[] = [];
      if (result.images?.length) {
        for (let i = 0; i < result.images.length; i++) {
          const img = result.images[i];
          let buffer: Buffer;
          if (img.startsWith("data:")) {
            const base64 = img.replace(/^data:image\/[^;]+;base64,/, "");
            buffer = Buffer.from(base64, "base64");
          } else {
            buffer = Buffer.from(img, "base64");
          }
          const suffix = nanoid(8);
          const fileKey = `neorual_results/${user.id}/${suffix}-result-${i}.png`;
          let displayUrl: string;
          if (ENV.s3Bucket && ENV.s3AccessKey && ENV.s3SecretKey) {
            await storagePut(fileKey, buffer, "image/png");
            // 对象存储用带鉴权的稳定入口，避免预签名 URL 过期
            displayUrl = `/api/agent/neorual-result-file?key=${encodeURIComponent(fileKey)}`;
          } else {
            // 本地文件走静态 /uploads，<img> 无需 Cookie，避免会话未带入导致 401 裂图
            displayUrl = await putLocalFile(fileKey, buffer);
          }
          imageUrls.push(displayUrl);
        }
      }
      let formattedResult = result.summary || "";
      if (imageUrls.length) {
        formattedResult += "\n\n";
        imageUrls.forEach((url, i) => {
          formattedResult += `\n![结果图${i + 1}](${url})\n`;
        });
      }
      if (!result.success) {
        formattedResult = `分析失败: ${result.error || "未知错误"}`;
      }
      let artifactId: number | undefined;
      if (result.success && conversation && formattedResult) {
        const artifactContent = imageUrls.length
          ? JSON.stringify({ summary: result.summary || "", images: imageUrls })
          : formattedResult;
        const artifactType = imageUrls.length ? "analysis_result" : "markdown";
        const artifactTitle = concentrationGroup?.trim()
          ? `${title} (${concentrationGroup.trim()})`
          : title;
        const saved = await createArtifact({
          conversationId: conversation.id,
          type: artifactType,
          title: artifactTitle,
          content: artifactContent,
        });
        artifactId = saved.id;
      }
      res.json({
        success: result.success,
        result: formattedResult,
        analysisResult:
          result.success && imageUrls.length
            ? { summary: result.summary || "", images: imageUrls }
            : undefined,
        artifactId,
        error: result.error,
      });
    } catch (error) {
      console.error(`[${title}] Failed:`, error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : "Analysis failed",
      });
    }
  };

  app.post("/api/agent/analyze-nematode-vit", async (req, res) => {
    await neorualHandler(req, res, analyzeNematodeVitClassification, "ViT 神经元形态分类结果");
  });
  app.post("/api/agent/analyze-nematode-bead", async (req, res) => {
    await neorualHandler(req, res, analyzeNematodeBeadSegmentation, "串珠分割结果");
  });
  app.post("/api/agent/analyze-nematode-cellbody", async (req, res) => {
    await neorualHandler(req, res, analyzeNematodeCellbodySegmentation, "细胞体实例分割结果");
  });
  app.post("/api/agent/analyze-nematode-dendrite", async (req, res) => {
    await neorualHandler(req, res, analyzeNematodeDendriteDetection, "树突检测结果");
  });

  // ---- Agent streaming endpoint ----
  app.post("/api/agent/stream", async (req: Request, res: Response) => {
    const user = await getAuthUser(req);
    if (!user) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const { conversationId: convUniqueId, message, model, fileContext, projectId } = req.body as {
      conversationId?: string;
      message: string;
      model?: string;
      fileContext?: string;
      /** When starting a new conversation, attach it to this project (optional). */
      projectId?: number;
    };

    if (!message || typeof message !== "string" || !message.trim()) {
      res.status(400).json({ error: "Message is required" });
      return;
    }

    let conversation;
    let uniqueId = convUniqueId;

    if (uniqueId) {
      conversation = await getConversation(uniqueId, user.id);
      if (!conversation) {
        res.status(404).json({ error: "Conversation not found" });
        return;
      }
    } else {
      if (projectId != null && typeof projectId === "number") {
        const proj = await getProjectById(projectId, user.id);
        if (!proj) {
          res.status(400).json({ error: "Invalid project" });
          return;
        }
      }
      uniqueId = nanoid(12);
      conversation = await createConversation({
        uniqueId,
        userId: user.id,
        title: "New Conversation",
        ...(projectId != null && typeof projectId === "number" ? { projectId } : {}),
      });
    }

    // Set up SSE
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });

    res.write(
      `data: ${JSON.stringify({ type: "init", conversationId: conversation.uniqueId })}\n\n`
    );

    const onEvent = (event: AgentStreamEvent) => {
      sendSSE(res, event);
    };

    // 若用户发送「重新生成实验方案」类消息且会话已有问卷，直接走 regeneratePlan 流程，生成 project_plan 而非 markdown
    const isRegenerateRequest = /(?:请你?)?(?:重新|再)?生成(?:一个)?(?:实验)?方案|regenerate\s*(?:experiment\s*)?plan/i.test(
      message.trim()
    );
    if (isRegenerateRequest && conversation) {
      const arts = await getConversationArtifacts(conversation.id);
      const hasQuestionnaire = arts.some((a) => a.type === "experiment_questionnaire");
      const hasProjectPlan = arts.some((a) => a.type === "project_plan");
      if (hasQuestionnaire || hasProjectPlan) {
        try {
          await createMessage({
            conversationId: conversation.id,
            role: "user",
            type: "text",
            content: message.trim(),
          });
          const result = await regenerateProjectPlanFromQuestionnaire(
            conversation.id,
            onEvent
          );
          if (!result.success) {
            sendSSE(res, { type: "error", message: result.error || "Regeneration failed" });
          }
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : "Regeneration failed";
          sendSSE(res, { type: "error", message: errMsg });
        }
        res.write("data: [DONE]\n\n");
        res.end();
        return;
      }
    }

    try {
      await runAgent(
        conversation.id,
        message.trim(),
        user.id,
        conversation.uniqueId,
        onEvent,
        model,
        fileContext
      );
    } catch (error) {
      const errMsg =
        error instanceof Error ? error.message : "Agent execution failed";
      sendSSE(res, { type: "error", message: errMsg });
    }

    res.write("data: [DONE]\n\n");
    res.end();
  });

  // ---- Export conversation as Markdown ----
  app.get("/api/agent/export/:uniqueId", async (req: Request, res: Response) => {
    const user = await getAuthUser(req);
    if (!user) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const { uniqueId } = req.params;
    const conversation = await getConversation(uniqueId, user.id);
    if (!conversation) {
      res.status(404).json({ error: "Conversation not found" });
      return;
    }

    const msgs = await getConversationMessages(conversation.id);
    const arts = await getConversationArtifacts(conversation.id);

    const markdown = buildExportMarkdown(conversation.title, msgs, arts);

    const format = req.query.format as string;
    if (format === "json") {
      res.json({ title: conversation.title, messages: msgs, artifacts: arts });
      return;
    }

    // Default: Markdown download
    res.setHeader("Content-Type", "text/markdown; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${encodeURIComponent(conversation.title || "conversation")}.md"`
    );
    res.send(markdown);
  });

  // ---- Share / Unshare conversation ----
  app.post("/api/agent/share", async (req: Request, res: Response) => {
    const user = await getAuthUser(req);
    if (!user) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const { uniqueId, action } = req.body as {
      uniqueId: string;
      action: "create" | "remove";
    };

    if (!uniqueId) {
      res.status(400).json({ error: "Conversation uniqueId is required" });
      return;
    }

    const conversation = await getConversation(uniqueId, user.id);
    if (!conversation) {
      res.status(404).json({ error: "Conversation not found" });
      return;
    }

    if (action === "remove") {
      await removeConversationShareToken(uniqueId, user.id);
      res.json({ success: true, shareToken: null });
      return;
    }

    // Create share token
    if (conversation.shareToken) {
      // Already shared
      res.json({ success: true, shareToken: conversation.shareToken });
      return;
    }

    const shareToken = nanoid(24);
    await setConversationShareToken(uniqueId, user.id, shareToken);
    res.json({ success: true, shareToken });
  });

  // ---- Get shared conversation (public, no auth required) ----
  app.get("/api/agent/shared/:token", async (req: Request, res: Response) => {
    const { token } = req.params;
    const conversation = await getConversationByShareToken(token);
    if (!conversation) {
      res.status(404).json({ error: "Shared conversation not found" });
      return;
    }

    const msgs = await getConversationMessages(conversation.id);
    const arts = await getConversationArtifacts(conversation.id);

    // Filter out sensitive data - only return user and assistant text messages
    const safeMsgs = msgs
      .filter((m) => m.role === "user" || m.role === "assistant")
      .map((m) => ({
        id: m.id,
        role: m.role,
        type: m.type,
        content: m.content,
        createdAt: m.createdAt,
      }));

    res.json({
      conversation: {
        title: conversation.title,
        createdAt: conversation.createdAt,
        userName: null, // We don't expose user info in shared view
      },
      messages: safeMsgs,
      artifacts: arts.map((a) => ({
        id: a.id,
        type: a.type,
        title: a.title,
        content: a.content,
        language: a.language,
      })),
    });
  });
}

function sendSSE(res: Response, event: AgentStreamEvent) {
  res.write(`data: ${JSON.stringify(event)}\n\n`);
}

/**
 * Build a Markdown export from conversation messages and artifacts.
 */
function buildExportMarkdown(
  title: string,
  msgs: Array<{ role: string; type: string; content: string | null; createdAt: Date }>,
  arts: Array<{ type: string; title: string | null; content: string | null; language: string | null }>
): string {
  let md = `# ${title}\n\n`;
  md += `_Exported from Manus Agent_\n\n---\n\n`;

  for (const msg of msgs) {
    if (msg.role === "user" && msg.type === "text") {
      md += `## 🧑 User\n\n${msg.content || ""}\n\n`;
    } else if (msg.role === "assistant" && msg.type === "text") {
      md += `## 🤖 Assistant\n\n${msg.content || ""}\n\n`;
    } else if (msg.role === "assistant" && msg.type === "plan") {
      try {
        const plan = JSON.parse(msg.content || "{}");
        md += `## 📋 Plan: ${plan.goal || ""}\n\n`;
        if (plan.steps) {
          for (const step of plan.steps) {
            const icon = step.status === "completed" ? "✅" : step.status === "failed" ? "❌" : "⏳";
            md += `${icon} ${step.title}\n`;
          }
          md += "\n";
        }
      } catch {
        md += `## 📋 Plan\n\n${msg.content || ""}\n\n`;
      }
    } else if (msg.role === "assistant" && msg.type === "tool_call") {
      try {
        const tc = JSON.parse(msg.content || "{}");
        md += `> 🔧 Tool: **${tc.toolName}**\n\n`;
      } catch {
        // skip
      }
    }
  }

  if (arts.length > 0) {
    md += `---\n\n## 📎 Artifacts\n\n`;
    for (const art of arts) {
      md += `### ${art.title || "Untitled"}\n\n`;
      if (art.type === "code" && art.language) {
        md += `\`\`\`${art.language}\n${art.content || ""}\n\`\`\`\n\n`;
      } else if (art.type === "html") {
        md += `\`\`\`html\n${art.content || ""}\n\`\`\`\n\n`;
      } else if (art.type === "analysis_result" && art.content) {
        try {
          const { summary, images } = JSON.parse(art.content) as { summary?: string; images?: string[] };
          md += `${summary || ""}\n\n`;
          if (images?.length) {
            md += `*(包含 ${images.length} 张分析结果图)*\n\n`;
          }
        } catch {
          md += `${art.content}\n\n`;
        }
      } else {
        md += `${art.content || ""}\n\n`;
      }
    }
  }

  return md;
}
