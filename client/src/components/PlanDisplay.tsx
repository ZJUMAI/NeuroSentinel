import { BrandName } from "@/components/BrandName";
import { useLanguage } from "@/contexts/LanguageContext";
import { cn } from "@/lib/utils";
import {
  Check,
  ChevronDown,
  ChevronUp,
  Circle,
  Loader2,
  XCircle,
} from "lucide-react";
import { useState } from "react";
import type { AgentPlan } from "../../../shared/types";

export function PlanDisplay({ plan }: { plan: AgentPlan }) {
  const { brandName } = useLanguage();
  const [expandedSteps, setExpandedSteps] = useState<Set<number>>(new Set());

  const toggleStep = (i: number) => {
    setExpandedSteps((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  };

  return (
    <div className="rounded-xl border border-border/60 overflow-hidden bg-card/80 my-2">
      {/* Agent identifier */}
      <div className="flex items-center gap-2 px-4 py-2.5 bg-muted/30 border-b border-border/50">
        <img src="/LOGO.png" alt={brandName} className="size-4 shrink-0 object-contain" />
        <BrandName className="font-semibold text-foreground" />
        <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-primary/15 text-primary border border-primary/30">
          Max
        </span>
      </div>
      {/* Goal */}
      <div className="px-4 py-3 text-sm text-muted-foreground border-b border-border/40">
        {plan.goal}
      </div>
      {/* To-do steps with vertical dotted line */}
      <div className="p-4 pl-2">
        <div className="relative flex">
          {/* Vertical dotted line through all icons */}
          <div className="absolute left-3 top-3 bottom-3 w-px border-l-2 border-dashed border-muted-foreground/35" />
          <div className="flex flex-col gap-0">
            {plan.steps.map((step, i) => {
              const isExpanded = expandedSteps.has(i);
              return (
                <div key={step.id ?? i} className="flex gap-3 items-start">
                  {/* Status icon */}
                  <div
                    className={cn(
                      "relative z-10 size-6 rounded-full flex items-center justify-center shrink-0 border mt-0.5",
                      step.status === "completed" && "bg-muted border-muted-foreground/30",
                      step.status === "running" && "bg-primary/10 border-primary/30",
                      step.status === "failed" && "bg-destructive/10 border-destructive/30",
                      step.status === "pending" && "bg-muted/50 border-muted-foreground/20"
                    )}
                  >
                    {step.status === "completed" && <Check className="size-3.5 text-muted-foreground" />}
                    {step.status === "running" && <Loader2 className="size-3.5 text-primary animate-spin" />}
                    {step.status === "failed" && <XCircle className="size-3.5 text-destructive" />}
                    {step.status === "pending" && <Circle className="size-3 text-muted-foreground" />}
                  </div>
                  {/* Step content */}
                  <div className="flex-1 min-w-0 pb-5">
                    <div className="flex items-start gap-2">
                      <div className="flex-1 min-w-0">
                        <p
                          className={cn(
                            "text-sm font-semibold",
                            step.status === "completed" && "text-foreground",
                            step.status === "running" && "text-foreground",
                            step.status === "failed" && "text-destructive",
                            step.status === "pending" && "text-muted-foreground"
                          )}
                        >
                          {step.title}
                        </p>
                        {isExpanded && (
                          <p className="mt-2 text-xs text-muted-foreground leading-relaxed">
                            {step.result
                              ? step.result
                              : step.description
                                ? step.description
                                : step.status === "running"
                                  ? "执行中..."
                                  : step.status === "completed"
                                    ? "已完成"
                                    : step.status === "pending"
                                      ? "等待执行"
                                      : "执行失败"}
                          </p>
                        )}
                      </div>
                      <button
                        onClick={() => toggleStep(i)}
                        className="shrink-0 p-1 rounded hover:bg-muted/60 transition-colors text-muted-foreground"
                        aria-label={isExpanded ? "收起" : "展开"}
                      >
                        {isExpanded ? (
                          <ChevronUp className="size-4" />
                        ) : (
                          <ChevronDown className="size-4" />
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
