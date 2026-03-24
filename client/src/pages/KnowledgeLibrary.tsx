import { useAuth } from "@/_core/hooks/useAuth";
import { BrandName } from "@/components/BrandName";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useLanguage } from "@/contexts/LanguageContext";
import { getLoginUrl } from "@/const";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import {
  ArrowLeft,
  BarChart3,
  BookOpen,
  FileEdit,
  FileText,
  Image as ImageIcon,
  LayoutGrid,
  Library,
  Loader2,
  Search,
  Sparkles,
} from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { useLocation } from "wouter";
import { Streamdown } from "streamdown";

const TEXTS: Record<
  string,
  {
    title: string;
    subtitle: string;
    back: string;
    searchPlaceholder: string;
    empty: string;
    emptyHint: string;
    items: string;
    openTask: string;
    signIn: string;
    untitledTask: string;
    untitledArtifact: string;
  }
> = {
  en: {
    title: "Library",
    subtitle: "Archived deliverables from your tasks: protocols, analysis results, and reports.",
    back: "Back to tasks",
    searchPlaceholder: "Search files and tasks…",
    empty: "No archived items yet",
    emptyHint: "Complete a task to generate experiment plans, analyses, and reports—they will appear here.",
    items: "items",
    openTask: "Open in task",
    signIn: "Sign in",
    untitledTask: "Untitled task",
    untitledArtifact: "Untitled",
  },
  zh: {
    title: "知识库",
    subtitle: "自动汇总各任务中的实验方案、分析结果与报告，便于检索与复用。",
    back: "返回任务",
    searchPlaceholder: "搜索文件或任务标题…",
    empty: "暂无归档成果",
    emptyHint: "完成实验任务后将生成方案、问卷、显微分析与评估报告，并自动汇总至此。",
    items: "项",
    openTask: "在任务中打开",
    signIn: "登录",
    untitledTask: "未命名任务",
    untitledArtifact: "未命名",
  },
};

/** 中文界面下工件类型的展示名（与数据库 type 字段对应，小写） */
const ARTIFACT_TYPE_LABEL_ZH: Record<string, string> = {
  project_plan: "实验方案",
  experiment_questionnaire: "实验参数问卷",
  analysis_result: "分析结果",
  assessment_report: "评估报告",
  markdown: "文档",
  document: "文档",
  code: "代码",
  html: "网页",
  chart: "图表",
  image: "图片",
};

/** 英文界面下工件类型的展示名 */
const ARTIFACT_TYPE_LABEL_EN: Record<string, string> = {
  project_plan: "Project plan",
  experiment_questionnaire: "Questionnaire",
  analysis_result: "Analysis",
  assessment_report: "Assessment report",
  markdown: "Document",
  document: "Document",
  code: "Code",
  html: "Web page",
  chart: "Chart",
  image: "Image",
};

function getArtifactTypeLabel(type: string, lang: string): string {
  const key = type.toLowerCase();
  if (lang === "zh") {
    return ARTIFACT_TYPE_LABEL_ZH[key] ?? type;
  }
  return ARTIFACT_TYPE_LABEL_EN[key] ?? type;
}

/** 常见英文默认会话标题 → 中文（精确匹配，忽略大小写） */
const CONVERSATION_TITLE_ZH_EXACT: Record<string, string> = {
  "new conversation": "新对话",
  "neurotoxicity testing of the sample": "样品神经毒性检测",
  "c. elegans neurotoxicity detection scheme": "秀丽隐杆线虫神经毒性检测方案",
  "c.elegans neurotoxicity detection scheme": "秀丽隐杆线虫神经毒性检测方案",
};

/** 中文界面下对英文标题的模式替换（按顺序尝试） */
const CONVERSATION_TITLE_ZH_PATTERNS: Array<{ test: RegExp; zh: string }> = [
  { test: /^neurotoxicity testing of the sample$/i, zh: "样品神经毒性检测" },
  { test: /c\.?\s*elegans.*neurotoxicity.*(scheme|detection|test)/i, zh: "秀丽隐杆线虫神经毒性检测方案" },
  { test: /neurotoxicity.*sample/i, zh: "样品神经毒性检测" },
  { test: /^sample neurotoxicity/i, zh: "样品神经毒性检测" },
];

function getConversationDisplayTitle(title: string | null | undefined, lang: string, t: (typeof TEXTS)["zh"]): string {
  const raw = title?.trim();
  if (!raw) return t.untitledTask;
  if (lang !== "zh") return raw;
  const lower = raw.toLowerCase();
  if (CONVERSATION_TITLE_ZH_EXACT[lower]) return CONVERSATION_TITLE_ZH_EXACT[lower];
  for (const { test, zh } of CONVERSATION_TITLE_ZH_PATTERNS) {
    if (test.test(raw)) return zh;
  }
  return raw;
}

function artifactIcon(type: string) {
  if (type === "analysis_result") return Sparkles;
  if (type === "assessment_report") return BarChart3;
  if (type === "project_plan") return BookOpen;
  if (type === "experiment_questionnaire") return FileEdit;
  if (type === "chart") return ImageIcon;
  return FileText;
}

const METRIC_LABELS: Record<string, string> = {
  串珠数量: "串珠数量",
  平均串珠大小: "平均串珠大小",
  CEP数量: "CEP数量",
  平均CEP大小: "平均CEP大小",
  ADE数量: "ADE数量",
  平均ADE大小: "平均ADE大小",
  树突长度: "树突长度",
  断裂: "树突断裂",
  增生: "树突分支增生",
  异常弯曲: "树突异常弯曲",
};

function looksLikeMarkdown(s: string): boolean {
  const t = s.trim().slice(0, 800);
  return /^#+\s/m.test(t) || /^\|.+\|/m.test(t) || t.includes("## ") || t.includes("| --- |");
}

function MarkdownCardPreview({ text }: { text: string }) {
  return (
    <div
      className={cn(
        "prose prose-sm dark:prose-invert max-w-none mt-2 text-[11px] leading-relaxed",
        "max-h-48 overflow-hidden text-muted-foreground",
        "[&_h1]:text-sm [&_h2]:text-xs [&_h3]:text-[11px] [&_table]:w-full [&_th]:text-foreground [&_td]:border-border/50 [&_td]:px-1.5 [&_td]:py-0.5"
      )}
    >
      <Streamdown>{text}</Streamdown>
    </div>
  );
}

function renderProjectPlanPreview(raw: string): ReactNode {
  try {
    const j = JSON.parse(raw) as {
      substance?: string;
      materials?: Array<{ name?: string; quantity?: string; notes?: string }>;
      days?: Array<{ day?: number; title?: string }>;
    };
    const has =
      j.substance ||
      (j.materials && j.materials.length > 0) ||
      (j.days && j.days.length > 0);
    if (!has) return null;
    return (
      <div className="mt-2 space-y-2 text-xs text-left">
        {j.substance ? (
          <div className="rounded-md bg-muted/45 border border-border/55 px-2.5 py-2">
            <span className="text-muted-foreground">待测物质 </span>
            <span className="font-medium text-foreground">{j.substance}</span>
          </div>
        ) : null}
        {j.materials && j.materials.length > 0 ? (
          <ul className="list-none space-y-1.5">
            {j.materials.slice(0, 8).map((m, i) => (
              <li key={i} className="rounded-md border border-border/50 bg-background/50 px-2.5 py-2">
                <div className="font-medium text-foreground text-[13px]">{m.name?.trim() || "—"}</div>
                <div className="text-[11px] text-muted-foreground mt-0.5">
                  {[m.quantity?.trim(), m.notes?.trim()].filter(Boolean).join(" · ")}
                </div>
              </li>
            ))}
            {j.materials.length > 8 ? (
              <li className="text-[11px] text-muted-foreground text-center">…</li>
            ) : null}
          </ul>
        ) : null}
        {j.days && j.days.length > 0 ? (
          <p className="text-[11px] text-muted-foreground">
            实验日程共 <span className="text-foreground font-medium">{j.days.length}</span> 天
            {j.days[0]?.title ? ` · 第 ${j.days[0].day ?? 1} 天：${j.days[0].title}` : ""}
          </p>
        ) : null}
      </div>
    );
  } catch {
    return null;
  }
}

function renderAssessmentReportPreview(raw: string): ReactNode {
  try {
    const j = JSON.parse(raw) as {
      metrics?: Record<string, number | null>;
      compoundNeurodamageIndex?: number | null;
    };
    const m = j.metrics;
    if (!m || typeof m !== "object") return null;
    const rows = Object.entries(m).filter(
      (e): e is [string, number] => e[1] != null && typeof e[1] === "number"
    );
    if (rows.length === 0) return null;
    return (
      <div className="mt-2 rounded-md border border-border/55 overflow-hidden bg-muted/20">
        {j.compoundNeurodamageIndex != null && !Number.isNaN(j.compoundNeurodamageIndex) ? (
          <div className="px-2.5 py-2 text-[11px] border-b border-border/50 bg-primary/5">
            <span className="text-muted-foreground">化合物神经损伤指数 </span>
            <span className="font-semibold text-foreground tabular-nums">{j.compoundNeurodamageIndex}</span>
          </div>
        ) : null}
        <table className="w-full text-[11px]">
          <tbody>
            {rows.slice(0, 14).map(([k, v]) => (
              <tr key={k} className="border-t border-border/40 first:border-t-0">
                <td className="text-muted-foreground px-2 py-1.5 align-top w-[48%]">
                  {METRIC_LABELS[k] ?? k}
                </td>
                <td className="text-foreground font-medium px-2 py-1.5 tabular-nums">{v}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length > 14 ? (
          <p className="text-[10px] text-muted-foreground text-center py-1 border-t border-border/40">…</p>
        ) : null}
      </div>
    );
  } catch {
    return null;
  }
}

/** 知识库卡片内：按类型渲染结构化预览，避免展示原始 JSON / 原始 Markdown 源码 */
function LibraryArtifactPreview({ art }: { art: { type: string; preview: string } }) {
  const p = art.preview?.trim() ?? "";

  if (art.type === "project_plan" && p.startsWith("{")) {
    const node = renderProjectPlanPreview(art.preview);
    if (node) return node;
  }

  if (art.type === "assessment_report" && p.startsWith("{")) {
    const node = renderAssessmentReportPreview(art.preview);
    if (node) return node;
  }

  let markdownSource = "";
  if (art.type === "analysis_result" && p.startsWith("{")) {
    try {
      const j = JSON.parse(art.preview) as { summary?: string };
      if (typeof j.summary === "string" && j.summary.trim()) markdownSource = j.summary.trim();
    } catch {
      /* ignore */
    }
  }
  if (!markdownSource && (art.type === "analysis_result" || art.type === "markdown" || art.type === "document")) {
    if (p && !p.startsWith("{")) markdownSource = art.preview;
  }
  if (markdownSource && looksLikeMarkdown(markdownSource)) {
    return <MarkdownCardPreview text={markdownSource.slice(0, 12000)} />;
  }

  if (art.type === "experiment_questionnaire" && p.startsWith("{")) {
    try {
      const j = JSON.parse(art.preview) as {
        questions?: Array<{ id?: string; label?: string; placeholder?: string }>;
      };
      if (Array.isArray(j.questions) && j.questions.length > 0) {
        const list = j.questions.slice(0, 10);
        return (
          <ul className="text-xs text-left list-none space-y-2 mt-2">
            {list.map((q, i) => (
              <li
                key={String(q.id ?? i)}
                className="rounded-md bg-muted/45 border border-border/55 px-2.5 py-2"
              >
                <div className="font-medium text-foreground text-[13px] leading-snug">
                  {q.label || q.id || `问题 ${i + 1}`}
                </div>
                {q.placeholder ? (
                  <div className="text-[11px] text-muted-foreground mt-1 leading-relaxed">{q.placeholder}</div>
                ) : null}
              </li>
            ))}
            {j.questions.length > 10 ? (
              <li className="text-[11px] text-muted-foreground text-center pt-0.5">…</li>
            ) : null}
          </ul>
        );
      }
    } catch {
      /* 使用下方文本摘要 */
    }
  }
  if (art.preview && art.type === "experiment_questionnaire") {
    return (
      <p className="text-xs text-muted-foreground mt-2 line-clamp-8 whitespace-pre-line leading-relaxed">
        {art.preview}
      </p>
    );
  }

  if (art.preview && (art.type === "project_plan" || art.type === "assessment_report")) {
    return (
      <p className="text-xs text-muted-foreground mt-2 line-clamp-8 whitespace-pre-line leading-relaxed">
        {art.preview}
      </p>
    );
  }

  if (art.preview) {
    return (
      <p className="text-xs text-muted-foreground mt-2 line-clamp-4 whitespace-pre-line leading-relaxed">
        {art.preview}
      </p>
    );
  }
  return null;
}

export default function KnowledgeLibrary() {
  const { user, loading } = useAuth();
  const [, setLocation] = useLocation();
  const { language } = useLanguage();
  const t = TEXTS[language] ?? TEXTS.en;
  const [q, setQ] = useState("");

  const { data: groups, isLoading } = trpc.conversations.library.useQuery(undefined, {
    enabled: !!user,
  });

  const filtered = useMemo(() => {
    if (!groups?.length) return [];
    const needle = q.trim().toLowerCase();
    if (!needle) return groups;
    return groups
      .map((g) => {
        const displayTitle = getConversationDisplayTitle(g.conversationTitle, language, t);
        const titleMatch =
          (g.conversationTitle || "").toLowerCase().includes(needle) ||
          displayTitle.toLowerCase().includes(needle);
        const arts = g.artifacts.filter((a) => {
          const typeLabel = getArtifactTypeLabel(a.type, language).toLowerCase();
          return (
            titleMatch ||
            (a.title || "").toLowerCase().includes(needle) ||
            (a.preview || "").toLowerCase().includes(needle) ||
            a.type.toLowerCase().includes(needle) ||
            typeLabel.includes(needle)
          );
        });
        return { ...g, artifacts: arts };
      })
      .filter((g) => g.artifacts.length > 0);
  }, [groups, q, language, t]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center agent-page">
        <Loader2 className="size-10 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center agent-page gap-6 px-6">
        <p className="text-muted-foreground text-sm">{t.emptyHint}</p>
        <Button onClick={() => (window.location.href = getLoginUrl())}>{t.signIn}</Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col agent-page text-foreground">
      <header className="shrink-0 border-b border-border/60 bg-card/80 backdrop-blur-sm px-4 py-4 md:px-8">
        <div className="max-w-6xl mx-auto flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-start gap-3">
            <Button variant="ghost" size="icon" className="shrink-0 mt-0.5" onClick={() => setLocation("/chat")} title={t.back}>
              <ArrowLeft className="size-5" />
            </Button>
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-primary mb-1">
                <Library className="size-5 shrink-0" />
                <h1 className="text-xl font-semibold tracking-tight">{t.title}</h1>
              </div>
              <p className="text-sm text-muted-foreground max-w-xl">{t.subtitle}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 w-full md:w-auto md:min-w-[280px]">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={t.searchPlaceholder}
                className="pl-9 bg-background/80 border-border/60"
              />
            </div>
            <LayoutGrid className="size-5 text-muted-foreground hidden sm:block shrink-0" aria-hidden />
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-hidden">
        <ScrollArea className="h-[calc(100vh-120px)]">
          <div className="max-w-6xl mx-auto px-4 py-6 md:px-8 md:py-8 pb-16">
            {isLoading && (
              <div className="flex justify-center py-20">
                <Loader2 className="size-8 animate-spin text-primary" />
              </div>
            )}

            {!isLoading && filtered.length === 0 && (
              <div className="flex flex-col items-center justify-center py-20 text-center max-w-md mx-auto">
                <div className="size-16 rounded-2xl bg-muted/50 flex items-center justify-center mb-4 border border-border/50">
                  <Library className="size-8 text-muted-foreground" />
                </div>
                <p className="font-medium text-foreground mb-2">{t.empty}</p>
                <p className="text-sm text-muted-foreground leading-relaxed">{t.emptyHint}</p>
              </div>
            )}

            {!isLoading &&
              filtered.map((g) => (
                <section key={g.conversationUniqueId} className="mb-10 last:mb-4">
                  <div className="flex items-center justify-between gap-3 mb-4">
                    <h2 className="text-base font-semibold text-foreground truncate pr-2">
                      {getConversationDisplayTitle(g.conversationTitle, language, t)}
                    </h2>
                    <span className="text-xs text-muted-foreground shrink-0 tabular-nums">
                      {g.artifacts.length}/{g.artifacts.length} {t.items}
                    </span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {g.artifacts.map((art) => {
                      const Icon = artifactIcon(art.type);
                      return (
                        <button
                          key={art.id}
                          type="button"
                          onClick={() =>
                            setLocation(`/chat/${g.conversationUniqueId}?artifact=${art.id}`)
                          }
                          className={cn(
                            "text-left rounded-xl border border-border/60 bg-card/60 hover:bg-accent/40 hover:border-primary/25",
                            "transition-all duration-200 p-4 flex flex-col gap-3 min-h-[140px] group shadow-sm"
                          )}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-center gap-2 min-w-0">
                              <div className="size-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 border border-primary/10">
                                <Icon className="size-4 text-primary" />
                              </div>
                              <span
                                className={cn(
                                  "text-xs tracking-wide text-muted-foreground truncate",
                                  language !== "zh" && "uppercase"
                                )}
                              >
                                {getArtifactTypeLabel(art.type, language)}
                              </span>
                            </div>
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-foreground line-clamp-2 group-hover:text-primary transition-colors">
                              {art.title || t.untitledArtifact}
                            </p>
                            <LibraryArtifactPreview art={art} />
                          </div>
                          <span className="text-xs text-primary/80 font-medium mt-auto pt-1">{t.openTask} →</span>
                        </button>
                      );
                    })}
                  </div>
                </section>
              ))}
          </div>
        </ScrollArea>
      </main>

      <footer className="shrink-0 border-t border-border/40 py-3 text-center text-xs text-muted-foreground">
        <BrandName className="inline font-medium text-muted-foreground" />
      </footer>
    </div>
  );
}
