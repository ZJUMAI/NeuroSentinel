import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { z } from "zod";
import { nanoid } from "nanoid";
import {
  createConversation,
  createArtifact,
  createProject,
  deleteProject,
  getUserConversations,
  getConversation,
  getConversationMessages,
  getConversationArtifacts,
  deleteConversation,
  updateConversationTitle,
  updateArtifact,
  getArtifact,
  deleteArtifact,
  updateUserProfile,
  getUserLibraryArtifactRows,
  getProjectById,
  listUserProjectsWithTaskCounts,
  setConversationProject,
  updateProject,
} from "./db";
import { regenerateProjectPlanFromQuestionnaire } from "./agent/core";
import {
  parseMetricsFromSummary,
  mergeMetrics,
  type PlanMetrics,
} from "./agent/plan-metrics";
import { predictCompoundNeurodamageIndex } from "./agent/bsr-predict";

function formatLibraryPreview(raw: string | null, artifactType: string): string {
  if (!raw) return "";
  const compact = raw.replace(/\s+/g, " ").trim();
  const bigSlice = raw.length > 130000 ? raw.slice(0, 130000) : raw;

  if (artifactType === "analysis_result" && compact.startsWith("{")) {
    try {
      const j = JSON.parse(bigSlice) as { summary?: string };
      if (typeof j.summary === "string" && j.summary.trim()) {
        return j.summary.trim().slice(0, 4000);
      }
    } catch {
      /* ignore */
    }
  }

  if (artifactType === "project_plan" && compact.startsWith("{")) {
    try {
      const j = JSON.parse(bigSlice) as {
        substance?: string;
        materials?: Array<{ name?: string; quantity?: string; notes?: string }>;
        days?: Array<{ day?: number; title?: string }>;
      };
      const lines: string[] = [];
      if (j.substance) lines.push(`待测物质：${j.substance}`);
      if (j.materials?.length) {
        lines.push("实验材料：");
        for (const m of j.materials) {
          const name = m.name?.trim() || "—";
          const q = m.quantity?.trim();
          const n = m.notes?.trim();
          lines.push(`• ${name}${q ? ` — ${q}` : ""}${n ? `（${n}）` : ""}`);
        }
      }
      if (j.days?.length) {
        lines.push(`实验日程：共 ${j.days.length} 天`);
        const d0 = j.days[0];
        if (d0?.title) lines.push(`第 ${d0.day ?? 1} 天：${d0.title}`);
      }
      if (lines.length) return lines.join("\n").slice(0, 2000);
    } catch {
      /* fall through */
    }
  }

  if (artifactType === "assessment_report" && compact.startsWith("{")) {
    try {
      const j = JSON.parse(bigSlice) as {
        metrics?: Record<string, number | null>;
        compoundNeurodamageIndex?: number | null;
      };
      const m = j.metrics;
      if (m && typeof m === "object") {
        const lines: string[] = [];
        if (j.compoundNeurodamageIndex != null && !Number.isNaN(j.compoundNeurodamageIndex)) {
          lines.push(`化合物神经损伤指数：${j.compoundNeurodamageIndex}`);
        }
        for (const [k, v] of Object.entries(m)) {
          if (v != null && typeof v === "number") lines.push(`${k}：${v}`);
        }
        if (lines.length) return lines.join("\n").slice(0, 2000);
      }
    } catch {
      /* fall through */
    }
  }

  if (artifactType === "experiment_questionnaire") {
    const slice = raw.length > 50000 ? raw.slice(0, 50000) : raw;
    try {
      const j = JSON.parse(slice) as {
        questions?: Array<{ label?: string; id?: string; placeholder?: string }>;
      };
      if (Array.isArray(j.questions) && j.questions.length > 0) {
        return j.questions
          .map((q, i) => {
            const label = (q.label || q.id || `问题 ${i + 1}`).trim();
            const ph = q.placeholder?.trim();
            return ph ? `${i + 1}. ${label}（提示：${ph}）` : `${i + 1}. ${label}`;
          })
          .join("\n")
          .slice(0, 1200);
      }
    } catch {
      /* fall through */
    }
  }

  if (artifactType === "markdown" || artifactType === "document") {
    return raw.replace(/!\[[^\]]*\]\([^)]+\)/g, "[图]").trim().slice(0, 4000);
  }

  return compact.replace(/!\[[^\]]*\]\([^)]+\)/g, "[图]").slice(0, 240);
}

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
    updateProfile: protectedProcedure
      .input(z.object({ name: z.string().max(200).optional() }))
      .mutation(async ({ ctx, input }) => {
        if (input.name !== undefined) {
          await updateUserProfile(ctx.user.id, { name: input.name });
        }
        return { success: true } as const;
      }),
  }),

  /** 项目：任务分组 + 共享上下文（注入 Agent 系统提示） */
  projects: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      return listUserProjectsWithTaskCounts(ctx.user.id);
    }),
    create: protectedProcedure
      .input(
        z.object({
          name: z.string().min(1).max(500),
          context: z.string().max(32000).optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        return createProject({
          userId: ctx.user.id,
          name: input.name.trim(),
          context: input.context?.trim() || null,
        });
      }),
    update: protectedProcedure
      .input(
        z.object({
          id: z.number().int().positive(),
          name: z.string().min(1).max(500).optional(),
          context: z.string().max(32000).nullable().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        await updateProject(input.id, ctx.user.id, {
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.context !== undefined ? { context: input.context } : {}),
        });
        return { success: true };
      }),
    delete: protectedProcedure
      .input(z.object({ id: z.number().int().positive() }))
      .mutation(async ({ ctx, input }) => {
        await deleteProject(input.id, ctx.user.id);
        return { success: true };
      }),
  }),

  // Conversation management
  conversations: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      return getUserConversations(ctx.user.id);
    }),

    get: protectedProcedure
      .input(z.object({ uniqueId: z.string() }))
      .query(async ({ ctx, input }) => {
        const conv = await getConversation(input.uniqueId, ctx.user.id);
        if (!conv) return null;

        const msgs = await getConversationMessages(conv.id);
        const arts = await getConversationArtifacts(conv.id);

        return {
          ...conv,
          messages: msgs,
          artifacts: arts,
        };
      }),

    create: protectedProcedure
      .input(
        z
          .object({
            projectId: z.number().int().positive().optional(),
          })
          .optional()
      )
      .mutation(async ({ ctx, input }) => {
        if (input?.projectId != null) {
          const p = await getProjectById(input.projectId, ctx.user.id);
          if (!p) throw new Error("Project not found");
        }
        const uniqueId = nanoid(12);
        const conv = await createConversation({
          uniqueId,
          userId: ctx.user.id,
          title: "New Conversation",
          ...(input?.projectId != null ? { projectId: input.projectId } : {}),
        });
        return conv;
      }),

    setProject: protectedProcedure
      .input(
        z.object({
          uniqueId: z.string(),
          projectId: z.number().int().positive().nullable(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        await setConversationProject(input.uniqueId, ctx.user.id, input.projectId);
        return { success: true };
      }),

    updateTitle: protectedProcedure
      .input(z.object({ uniqueId: z.string(), title: z.string().min(1).max(500) }))
      .mutation(async ({ ctx, input }) => {
        await updateConversationTitle(input.uniqueId, ctx.user.id, input.title);
        return { success: true };
      }),

    delete: protectedProcedure
      .input(z.object({ uniqueId: z.string() }))
      .mutation(async ({ ctx, input }) => {
        await deleteConversation(input.uniqueId, ctx.user.id);
        return { success: true };
      }),

    /** 知识库：按任务汇总的工件列表（成果归档） */
    library: protectedProcedure.query(async ({ ctx }) => {
      const rows = await getUserLibraryArtifactRows(ctx.user.id);
      const groups = new Map<
        string,
        {
          conversationUniqueId: string;
          conversationTitle: string | null;
          conversationUpdatedAt: Date | null;
          artifacts: Array<{
            id: number;
            type: string;
            title: string | null;
            createdAt: Date;
            preview: string;
          }>;
        }
      >();
      for (const r of rows) {
        const uid = r.conversationUniqueId;
        if (!groups.has(uid)) {
          groups.set(uid, {
            conversationUniqueId: uid,
            conversationTitle: r.conversationTitle,
            conversationUpdatedAt: r.conversationUpdatedAt,
            artifacts: [],
          });
        }
        groups.get(uid)!.artifacts.push({
          id: r.artifactId,
          type: r.artifactType,
          title: r.artifactTitle,
          createdAt: r.artifactCreatedAt,
          preview: formatLibraryPreview(r.contentPreview, r.artifactType),
        });
      }
      return Array.from(groups.values());
    }),

    artifacts: router({
      update: protectedProcedure
        .input(
          z.object({
            artifactId: z.number(),
            content: z.string(),
          })
        )
        .mutation(async ({ ctx, input }) => {
          // Get artifact and verify it belongs to user's conversation
          const artifact = await getArtifact(input.artifactId);
          if (!artifact) {
            throw new Error("Artifact not found");
          }
          
          // Verify conversation belongs to user by checking all user conversations
          const userConvs = await getUserConversations(ctx.user.id);
          const hasAccess = userConvs.some((c) => c.id === artifact.conversationId);
          if (!hasAccess) {
            throw new Error("Access denied");
          }
          
          await updateArtifact(input.artifactId, input.content);
          return { success: true };
        }),

      delete: protectedProcedure
        .input(z.object({ artifactId: z.number() }))
        .mutation(async ({ ctx, input }) => {
          await deleteArtifact(input.artifactId, ctx.user.id);
          return { success: true };
        }),

      /** 根据实验参数问卷重新生成 project_plan */
      regeneratePlan: protectedProcedure
        .input(z.object({ uniqueId: z.string() }))
        .mutation(async ({ ctx, input }) => {
          const conv = await getConversation(input.uniqueId, ctx.user.id);
          if (!conv) throw new Error("Conversation not found");
          const result = await regenerateProjectPlanFromQuestionnaire(conv.id);
          if (!result.success) throw new Error(result.error || "Regeneration failed");
          return { success: true, artifact: result.artifact };
        }),

      /** 聚合十项评价指标（从 Neorual 分析结果 artifact 中解析） */
      aggregatePlanMetrics: protectedProcedure
        .input(z.object({ uniqueId: z.string() }))
        .query(async ({ ctx, input }): Promise<PlanMetrics> => {
          const conv = await getConversation(input.uniqueId, ctx.user.id);
          if (!conv) throw new Error("Conversation not found");
          const arts = await getConversationArtifacts(conv.id);
          const neorualTitles = [
            "ViT 神经元形态分类结果",
            "串珠分割结果",
            "细胞体实例分割结果",
            "树突检测结果",
          ];
          const partials: Partial<PlanMetrics>[] = [];
          for (const art of arts) {
            const title = art.title ?? "";
            const content = art.content ?? "";
            if (art.type !== "analysis_result" || !title || !content) continue;
            if (!neorualTitles.includes(title)) continue;
            try {
              const parsed = JSON.parse(content) as { summary?: string };
              const summary = parsed.summary || "";
              const m = parseMetricsFromSummary(title, summary);
              if (Object.keys(m).length > 0) partials.push(m);
            } catch {
              /* ignore */
            }
          }
          return mergeMetrics(partials);
        }),

      /** 生成十项评价指标报告并保存为 artifact（在 Analysis Results 侧栏展示） */
      createAssessmentReport: protectedProcedure
        .input(z.object({
          uniqueId: z.string(),
          /** 图像分辨率 μm/px，用于将 px、px² 转换为 μm、μm² */
          imageResolutionUmPerPx: z.number().positive().optional(),
        }))
        .mutation(async ({ ctx, input }) => {
          const conv = await getConversation(input.uniqueId, ctx.user.id);
          if (!conv) throw new Error("未找到会话，请确认您已登录且拥有该对话的访问权限");
          const arts = await getConversationArtifacts(conv.id);
          const msgs = await getConversationMessages(conv.id);
          const firstUserMsg = msgs.find((m) => m.role === "user");
          const firstContent = (firstUserMsg?.content ?? "") as string;
          const taskLang = /[\u4e00-\u9fff\u3000-\u303f\uff00-\uffef]/.test(firstContent) ? "zh" : "en";
          const neorualBaseTitles = [
            "ViT 神经元形态分类结果",
            "串珠分割结果",
            "细胞体实例分割结果",
            "树突检测结果",
          ];
          /** 从标题提取基础类型和浓度组，如 "ViT 神经元形态分类结果 (1g/ml (1))" -> { base: "ViT...", group: "1g/ml (1)" } */
          function parseArtifactTitle(title: string): { base: string; group: string } | null {
            for (const base of neorualBaseTitles) {
              if (title === base) return { base, group: "" };
              const suffix = title.startsWith(base + " (") ? title.slice(base.length) : null;
              if (suffix) {
                // 支持嵌套括号如 (1g/ml (1))，用 .+ 贪婪匹配到最后一个 )
                const m = suffix.match(/^\s*\((.+)\)\s*$/);
                if (m) return { base, group: m[1].trim() };
              }
            }
            return null;
          }
          // 按 (group, baseType) 取每种组合的最新 artifact；同时支持 analysis_result 与 markdown（Neorual 无图时存为 markdown）
          const latestByGroupAndBase = new Map<string, Map<string, string>>();
          for (const art of arts) {
            const title = art.title ?? "";
            const content = art.content ?? "";
            if ((art.type !== "analysis_result" && art.type !== "markdown") || !title || !content) continue;
            const parsed = parseArtifactTitle(title);
            if (!parsed) continue;
            const { base, group } = parsed;
            let byBase = latestByGroupAndBase.get(group);
            if (!byBase) {
              byBase = new Map();
              latestByGroupAndBase.set(group, byBase);
            }
            if (byBase.has(base)) continue;
            let summary = "";
            try {
              if (art.type === "analysis_result") {
                const json = JSON.parse(content) as { summary?: string };
                summary = json.summary || "";
              } else {
                // markdown：直接使用 content 作为 summary，parseMetricsFromSummary 可解析表格行
                summary = content;
              }
              if (summary) byBase.set(base, summary);
            } catch {
              /* ignore */
            }
          }
          if (latestByGroupAndBase.size === 0) {
            throw new Error(
              "未找到可用的分析结果。请确保已完成 ViT 神经元形态分类、串珠分割、细胞体实例分割、树突检测等步骤并上传图像进行分析，且分析结果已成功保存。"
            );
          }
          const partials: Partial<PlanMetrics>[] = [];
          const byGroup: Record<string, { metrics: PlanMetrics; compoundNeurodamageIndex: number | null }> = {};
          for (const [group, byBase] of latestByGroupAndBase) {
            const groupPartials: Partial<PlanMetrics>[] = [];
            for (const [base, summary] of byBase) {
              const m = parseMetricsFromSummary(base, summary);
              if (Object.keys(m).length > 0) {
                groupPartials.push(m);
                partials.push(m);
              }
            }
            const groupMetrics = mergeMetrics(groupPartials);
            const groupScore = await predictCompoundNeurodamageIndex(groupMetrics);
            byGroup[group || "默认"] = { metrics: groupMetrics, compoundNeurodamageIndex: groupScore };
          }
          const metrics = mergeMetrics(partials);
          const compoundNeurodamageIndex = await predictCompoundNeurodamageIndex(metrics);

          /** 收集 ImageJ 线虫行为学形态学结果（线虫层级），与神经元层级指标分开 */
          const imageJBehavioralResults: Array<{
            filename?: string;
            status?: string;
            date?: string;
            group?: string;
            condition?: string;
            conditionLabel?: string;
            downloadBend2?: string;
            downloadBend3?: string;
            bend2Table?: { headers: string[]; rows: string[][] };
            bend3Table?: { headers: string[]; rows: string[][] };
          }> = [];
          const imageJBaseTitle = "ImageJ 线虫图像分析结果";

          function parseImageJMeta(content: string): {
            date?: string;
            group?: string;
            condition?: string;
            conditionLabel?: string;
          } {
            const match = content.match(/<!--\s*imagej_meta:(.+?)\s*-->/s);
            if (match) {
              try {
                const parsed = JSON.parse(match[1].trim()) as {
                  date?: string;
                  group?: string;
                  condition?: string;
                };
                return {
                  date: parsed.date,
                  group: parsed.group,
                  condition: parsed.condition,
                  conditionLabel: parsed.condition,
                };
              } catch {
                /* ignore */
              }
            }
            return {};
          }

          function unescapeHtml(s: string): string {
            return s
              .replace(/&amp;/g, "&")
              .replace(/&lt;/g, "<")
              .replace(/&gt;/g, ">")
              .replace(/&quot;/g, '"');
          }
          function parseTsvTable(raw: string): { headers: string[]; rows: string[][] } | undefined {
            const lines = raw.trim().split(/\r?\n/).filter((l) => l.length > 0);
            if (lines.length < 2) return undefined;
            const headers = lines[0].split(/\t/).map((h) => h.trim());
            const rows = lines.slice(1).map((line) => line.split(/\t/).map((c) => c.trim()));
            return { headers, rows };
          }
          function parseFilenameMeta(filename: string): {
            date?: string;
            group?: string;
            condition?: string;
            conditionLabel?: string;
          } {
            const meta: { date?: string; group?: string; condition?: string; conditionLabel?: string } = {};
            if (!filename) return meta;
            const onFood = filename.includes("on_food");
            const offFood = filename.includes("off_food");
            meta.condition = onFood ? "on_food" : offFood ? "off_food" : undefined;
            meta.conditionLabel = onFood ? "有食物" : offFood ? "无食物" : undefined;
            const dateMatch = filename.match(/(\d{1,2}-\d{1,2}(?:_\d{2})?)/);
            if (dateMatch) meta.date = dateMatch[1];
            const groupMatch = filename.match(/(?:^|[-_])(dq[\d.]+|[\d.]+g\/ml)/i);
            if (groupMatch) meta.group = groupMatch[1];
            return meta;
          }

          for (const art of arts) {
            const title = art.title ?? "";
            const content = art.content ?? "";
            if (!title.startsWith(imageJBaseTitle) || !content) continue;
            if (art.type !== "markdown") continue;
            const filenameMatch = content.match(/\*\*文件名\*\*:\s*([^\n*]+)/);
            const statusMatch = content.match(/\*\*状态\*\*:\s*([^\n*]+)/);
            const bend2Match = content.match(/\[下载 bendthreshold2\.txt\]\(([^)]+)\)/);
            const bend3Match = content.match(/\[下载 bendthreshold3\.txt\]\(([^)]+)\)/);
            const filename = filenameMatch ? filenameMatch[1].trim() : undefined;

            const metaFromContent = parseImageJMeta(content);
            const metaFromFilename = parseFilenameMeta(filename ?? "");
            const meta = {
              date: metaFromContent.date ?? metaFromFilename.date,
              group:
                metaFromContent.group ??
                metaFromFilename.group ??
                (title.startsWith(imageJBaseTitle + " (") ? title.slice(imageJBaseTitle.length).replace(/^\s*\(|\)\s*$/g, "").trim() : undefined),
              condition: metaFromContent.condition ?? metaFromFilename.condition,
              conditionLabel: metaFromContent.conditionLabel ?? metaFromFilename.conditionLabel,
            };

            let bend2Table: { headers: string[]; rows: string[][] } | undefined;
            let bend3Table: { headers: string[]; rows: string[][] } | undefined;
            const codeBlocks = content.matchAll(/<code>([\s\S]*?)<\/code>/g);
            const blocks = [...codeBlocks];
            if (blocks.length >= 1) {
              const raw2 = unescapeHtml(blocks[0][1]);
              bend2Table = parseTsvTable(raw2);
            }
            if (blocks.length >= 2) {
              const raw3 = unescapeHtml(blocks[1][1]);
              bend3Table = parseTsvTable(raw3);
            }

            imageJBehavioralResults.push({
              filename,
              status: statusMatch ? statusMatch[1].trim() : undefined,
              date: meta.date,
              group: meta.group,
              condition: meta.condition,
              conditionLabel: meta.conditionLabel,
              downloadBend2: bend2Match ? bend2Match[1].trim() : undefined,
              downloadBend3: bend3Match ? bend3Match[1].trim() : undefined,
              bend2Table,
              bend3Table,
            });
          }

          const content = JSON.stringify(
            {
              metrics,
              compoundNeurodamageIndex: compoundNeurodamageIndex ?? undefined,
              byConcentrationGroup: Object.keys(byGroup).length > 0 ? byGroup : undefined,
              imageResolutionUmPerPx: input.imageResolutionUmPerPx,
              imageJBehavioralResults:
                imageJBehavioralResults.length > 0 ? imageJBehavioralResults : undefined,
              /** 任务语言：根据用户首次请求所用语言（含中文则 zh，否则 en），用于报告内 ENTI 等文案显示 */
              taskLanguage: taskLang,
            },
            null,
            2
          );
          try {
            const saved = await createArtifact({
              conversationId: conv.id,
              type: "assessment_report",
              title: "神经毒性评估报告",
              content,
              language: taskLang,
            });
            return {
              id: saved.id,
              type: "assessment_report" as const,
              title: "神经毒性评估报告",
              content,
              language: taskLang,
            };
          } catch (err) {
            console.error("[createAssessmentReport] createArtifact failed:", err);
            throw new Error("保存报告失败，请检查数据库连接后重试");
          }
        }),
    }),
  }),
});

export type AppRouter = typeof appRouter;
