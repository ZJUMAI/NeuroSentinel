import { HorizontalScrollArea } from "./HorizontalScrollArea";
import { cn } from "@/lib/utils";

interface ScrollableCodeProps {
  children: React.ReactNode;
  className?: string;
}

/**
 * 为代码块添加可拖拽的水平滚动
 */
export function ScrollableCode({ children, className }: ScrollableCodeProps) {
  return (
    <div className={cn("my-4", className)} style={{ width: "100%" }}>
      <HorizontalScrollArea>
        <pre className="bg-muted rounded p-3 m-0" style={{ display: "inline-block", minWidth: "100%", whiteSpace: "pre" }}>
          {children}
        </pre>
      </HorizontalScrollArea>
    </div>
  );
}
