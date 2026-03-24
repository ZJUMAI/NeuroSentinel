import { useRef, useEffect, useState, useCallback } from "react";
import { cn } from "@/lib/utils";

interface HorizontalScrollAreaProps {
  children: React.ReactNode;
  className?: string;
}

export function HorizontalScrollArea({ children, className }: HorizontalScrollAreaProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollbarRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [scrollPosition, setScrollPosition] = useState(0);
  const [scrollWidth, setScrollWidth] = useState(0);
  const [clientWidth, setClientWidth] = useState(0);
  const dragStartRef = useRef({ x: 0, scrollLeft: 0 });

  const updateScrollInfo = useCallback(() => {
    if (containerRef.current) {
      // 查找内部的实际滚动元素（可能是 ScrollArea 的 viewport）
      const scrollElement = containerRef.current.querySelector('[data-radix-scroll-area-viewport]') as HTMLElement || containerRef.current;
      const { scrollLeft, scrollWidth: sw, clientWidth: cw } = scrollElement;
      setScrollPosition(scrollLeft);
      setScrollWidth(sw);
      setClientWidth(cw);
    }
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // 查找内部的实际滚动元素
    const scrollElement = container.querySelector('[data-radix-scroll-area-viewport]') as HTMLElement || container;

    updateScrollInfo();

    const handleScroll = () => {
      updateScrollInfo();
    };

    const handleResize = () => {
      updateScrollInfo();
    };

    scrollElement.addEventListener("scroll", handleScroll);
    window.addEventListener("resize", handleResize);

    // 使用 ResizeObserver 监听内容变化
    const resizeObserver = new ResizeObserver(() => {
      updateScrollInfo();
    });
    resizeObserver.observe(scrollElement);
    resizeObserver.observe(container);

    return () => {
      scrollElement.removeEventListener("scroll", handleScroll);
      window.removeEventListener("resize", handleResize);
      resizeObserver.disconnect();
    };
  }, [updateScrollInfo]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (!containerRef.current || !scrollbarRef.current) return;
    
    const scrollElement = containerRef.current.querySelector('[data-radix-scroll-area-viewport]') as HTMLElement || containerRef.current;
    
    setIsDragging(true);
    dragStartRef.current = {
      x: e.clientX,
      scrollLeft: scrollElement.scrollLeft,
    };
    e.preventDefault();
  }, []);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging || !containerRef.current) return;
    
    const scrollElement = containerRef.current.querySelector('[data-radix-scroll-area-viewport]') as HTMLElement || containerRef.current;
    const deltaX = e.clientX - dragStartRef.current.x;
    const scrollRatio = scrollWidth / clientWidth;
    const newScrollLeft = dragStartRef.current.scrollLeft + deltaX * scrollRatio;
    
    scrollElement.scrollLeft = Math.max(
      0,
      Math.min(newScrollLeft, scrollWidth - clientWidth)
    );
  }, [isDragging, scrollWidth, clientWidth]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  useEffect(() => {
    if (isDragging) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "grabbing";
      document.body.style.userSelect = "none";
      
      return () => {
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      };
    }
  }, [isDragging, handleMouseMove, handleMouseUp]);

  const scrollbarWidth = clientWidth > 0 && scrollWidth > clientWidth 
    ? Math.max(20, (clientWidth / scrollWidth) * clientWidth) 
    : 0;
  const scrollbarLeft = scrollWidth > clientWidth && scrollbarWidth > 0
    ? (scrollPosition / (scrollWidth - clientWidth)) * (clientWidth - scrollbarWidth)
    : 0;
  const showScrollbar = scrollWidth > clientWidth;

  return (
    <div className={cn("relative w-full", className)}>
      <div
        ref={containerRef}
        className="w-full overflow-x-auto overflow-y-hidden scrollbar-hide"
        style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
      >
        {children}
      </div>
      {showScrollbar && (
        <div className="absolute bottom-0 left-0 right-0 h-2 bg-muted/30 rounded-b z-10">
          <div
            ref={scrollbarRef}
            className={cn(
              "h-full bg-muted-foreground/40 rounded cursor-grab active:cursor-grabbing transition-colors hover:bg-muted-foreground/60",
              isDragging && "bg-muted-foreground/70"
            )}
            style={{
              width: `${scrollbarWidth}px`,
              transform: `translateX(${scrollbarLeft}px)`,
            }}
            onMouseDown={handleMouseDown}
          />
        </div>
      )}
      <style jsx>{`
        .scrollbar-hide::-webkit-scrollbar {
          display: none;
        }
      `}</style>
    </div>
  );
}
