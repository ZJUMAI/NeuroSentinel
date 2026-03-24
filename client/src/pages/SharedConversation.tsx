import { useLanguage } from "@/contexts/LanguageContext";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { parseNeorualMarkdown, neorualMarkdownHasResultImages } from "@/lib/neorualArtifact";
import { NeorualResultImage } from "@/components/NeorualResultImage";
import { cn } from "@/lib/utils";
import {
  Check,
  ChevronRight,
  Circle,
  Code2,
  FileText,
  Loader2,
  PanelRightClose,
  PanelRightOpen,
  Search,
  Sparkles,
  Terminal,
  X,
  XCircle,
  AlertTriangle,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Streamdown } from "streamdown";
import { useParams } from "wouter";
import type { ArtifactInfo, AgentPlan } from "../../../shared/types";
import { PlanDisplay } from "@/components/PlanDisplay";
import { ProjectPlanViewer } from "@/components/ProjectPlanViewer";

type SharedMessage = {
  id: number;
  role: string;
  type: string;
  content: string;
  createdAt: string;
};

type SharedArtifact = {
  id: number;
  type: string;
  title: string | null;
  content: string | null;
  language: string | null;
};

type SharedData = {
  conversation: {
    title: string;
    createdAt: string;
    userName: string | null;
  };
  messages: SharedMessage[];
  artifacts: SharedArtifact[];
};

export default function SharedConversation() {
  const params = useParams<{ token: string }>();
  const [data, setData] = useState<SharedData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedArtifact, setSelectedArtifact] = useState<ArtifactInfo | null>(null);
  const [showArtifacts, setShowArtifacts] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await fetch(`/api/agent/shared/${params.token}`);
        if (!res.ok) {
          if (res.status === 404) throw new Error("This shared conversation was not found or has been removed.");
          throw new Error("Failed to load shared conversation");
        }
        const json = await res.json();
        setData(json);
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [params.token]);

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-background">
        <Loader2 className="size-6 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4 max-w-md text-center px-4">
          <AlertTriangle className="size-10 text-destructive" />
          <h1 className="text-xl font-semibold">Conversation Not Found</h1>
          <p className="text-sm text-muted-foreground">{error || "This shared conversation is not available."}</p>
          <Button onClick={() => window.location.href = "/"}>Go Home</Button>
        </div>
      </div>
    );
  }

  const arts: ArtifactInfo[] = data.artifacts.map((a) => ({
    id: a.id,
    type: a.type as ArtifactInfo["type"],
    title: a.title || "Untitled",
    content: a.content || "",
    language: a.language || undefined,
  }));

  const hasArtifacts = arts.length > 0;

  return (
    <div className="h-screen flex flex-col bg-background overflow-hidden">
      {/* Header */}
      <header className="h-14 border-b border-border flex items-center px-4 gap-3 shrink-0 bg-card/50 backdrop-blur">
        <div className="flex items-center gap-2">
          <div className="size-7 rounded-lg bg-primary/15 flex items-center justify-center">
            <img src="/LOGO.png" alt={brandName} className="size-4 shrink-0 object-contain" />
          </div>
          <span className="font-semibold text-sm">Shared Conversation</span>
        </div>
        <span className="text-xs text-muted-foreground truncate">
          {data.conversation.title}
          {data.conversation.userName && ` · by ${data.conversation.userName}`}
        </span>
        <div className="flex-1" />
        {hasArtifacts && (
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            onClick={() => {
              setShowArtifacts(!showArtifacts);
              if (!showArtifacts && arts.length > 0) setSelectedArtifact(arts[arts.length - 1]);
            }}
          >
            {showArtifacts ? <PanelRightClose className="size-4" /> : <PanelRightOpen className="size-4" />}
          </Button>
        )}
      </header>

      <div className="flex-1 flex overflow-hidden">
        <div className="flex-1 flex flex-col min-w-0">
          <ScrollArea className="flex-1">
            <div className="max-w-3xl mx-auto px-4 py-6 space-y-4">
              {data.messages
                .filter((m) => m.type !== "tool_result" && m.type !== "tool_call" && m.type !== "status")
                .map((msg) => {
                  if (msg.type === "plan") {
                    let plan: AgentPlan;
                    try { plan = JSON.parse(msg.content); } catch { return null; }
                    return (
                      <PlanDisplay key={msg.id} plan={plan} />
                    );
                  }

                  if (msg.type === "error") {
                    return (
                      <div key={msg.id} className="flex items-start gap-2 bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2 text-sm text-destructive">
                        <AlertTriangle className="size-4 shrink-0 mt-0.5" />
                        <span>{msg.content}</span>
                      </div>
                    );
                  }

                  if (msg.role === "user") {
                    return (
                      <div key={msg.id} className="flex justify-end">
                        <div className="max-w-[80%] bg-primary text-primary-foreground rounded-2xl rounded-br-md px-4 py-2.5">
                          <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                        </div>
                      </div>
                    );
                  }

                  if (msg.role === "assistant" && msg.type === "text") {
                    return (
                      <div key={msg.id} className="flex items-start gap-3">
                        <div className="size-7 rounded-full bg-primary/15 flex items-center justify-center shrink-0 mt-1">
                          <img src="/LOGO.png" alt={brandName} className="size-4 shrink-0 object-contain" />
                        </div>
                        <div className="min-w-0 flex-1 max-w-[85%]">
                          <div className="prose prose-sm prose-invert max-w-none text-foreground">
                            <Streamdown>{msg.content || ""}</Streamdown>
                          </div>
                        </div>
                      </div>
                    );
                  }

                  return null;
                })}
            </div>
          </ScrollArea>

          {/* Read-only notice */}
          <div className="border-t border-border p-4 bg-card/30">
            <div className="max-w-3xl mx-auto text-center">
              <p className="text-sm text-muted-foreground">
                This is a read-only view of a shared conversation.
              </p>
              <Button variant="link" size="sm" onClick={() => window.location.href = "/"} className="mt-1">
                Start your own conversation
              </Button>
            </div>
          </div>
        </div>

        {/* Artifacts Panel */}
        {showArtifacts && selectedArtifact && (
          <div className="w-[45%] min-w-[360px] max-w-[600px] border-l border-border shrink-0 hidden lg:block">
            <div className="flex flex-col h-full bg-card">
              <div className="flex items-center justify-between px-4 py-3 border-b">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-sm font-medium truncate">{selectedArtifact.title}</span>
                </div>
                <Button variant="ghost" size="icon" className="size-7" onClick={() => { setSelectedArtifact(null); setShowArtifacts(false); }}>
                  <X className="size-4" />
                </Button>
              </div>
              <div className="flex-1 overflow-auto">
                {selectedArtifact.type === "project_plan" ? (
                  <ProjectPlanViewer content={selectedArtifact.content} />
                ) : selectedArtifact.type === "chart" ? (
                  <div className="flex items-center justify-center p-4 h-full">
                    <img src={`data:image/png;base64,${selectedArtifact.content}`} alt={selectedArtifact.title} className="max-w-full max-h-full object-contain rounded" />
                  </div>
                ) : selectedArtifact.type === "html" ? (
                  <iframe srcDoc={selectedArtifact.content} className="w-full h-full border-0" sandbox="allow-scripts allow-same-origin" title={selectedArtifact.title} />
                ) : selectedArtifact.type === "analysis_result" ||
                  (selectedArtifact.type === "markdown" && neorualMarkdownHasResultImages(selectedArtifact.content)) ? (
                  (() => {
                    let data: { summary: string; images: string[] } | null = null;
                    try {
                      const parsed = JSON.parse(selectedArtifact.content) as { summary?: string; images?: string[] };
                      if (parsed && Array.isArray(parsed.images) && parsed.images.length > 0) {
                        data = { summary: parsed.summary || "", images: parsed.images };
                      }
                    } catch {
                      /* markdown */
                    }
                    if (!data) data = parseNeorualMarkdown(selectedArtifact.content);
                    if (!data?.images?.length) {
                      return <pre className="p-4 text-sm overflow-auto"><code>{selectedArtifact.content}</code></pre>;
                    }
                    return (
                      <div className="p-4 flex flex-col gap-4">
                        {data.summary && (
                          <div className="prose prose-sm prose-invert max-w-none">
                            <Streamdown>{data.summary}</Streamdown>
                          </div>
                        )}
                        <div className="grid gap-4">
                          {data.images.map((img, i) => (
                            <NeorualResultImage
                              key={i}
                              rawSrc={img}
                              alt={`结果图 ${i + 1}`}
                              className="w-full h-auto object-contain max-h-[480px] rounded"
                            />
                          ))}
                        </div>
                      </div>
                    );
                  })()
                ) : selectedArtifact.type === "markdown" || selectedArtifact.type === "document" ? (
                  <div className="p-4 prose prose-sm prose-invert max-w-none">
                    <Streamdown>{selectedArtifact.content}</Streamdown>
                  </div>
                ) : (
                  <pre className="p-4 text-sm overflow-auto h-full"><code>{selectedArtifact.content}</code></pre>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
