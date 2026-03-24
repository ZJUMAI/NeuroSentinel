import { HorizontalScrollArea } from "./HorizontalScrollArea";

interface ScrollableTableProps {
  children: React.ReactNode;
  className?: string;
}

/**
 * 为表格添加可拖拽的水平滚动
 */
export function ScrollableTable({ children, className }: ScrollableTableProps) {
  return (
    <div className={`my-4 ${className || ""}`} style={{ width: "100%" }}>
      <HorizontalScrollArea>
        <div style={{ display: "inline-block", minWidth: "100%" }}>
          {children}
        </div>
      </HorizontalScrollArea>
    </div>
  );
}
