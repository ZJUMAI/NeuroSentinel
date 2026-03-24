import { useEffect, useRef } from "react";
import { HorizontalScrollArea } from "./HorizontalScrollArea";
import { createRoot } from "react-dom/client";

interface ScrollableContentProps {
  children: React.ReactNode;
  className?: string;
}

/**
 * 包装组件，为表格和代码块添加独立的水平滚动
 * 使用 HorizontalScrollArea 实现可拖拽滚动条
 */
export function ScrollableContent({ children, className }: ScrollableContentProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const processedRef = useRef(new WeakSet<Element>());
  const rootsRef = useRef<Array<{ root: ReturnType<typeof createRoot>; element: HTMLElement }>>([]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const processElements = () => {
      // 处理表格（排除 Streamdown 组件内的表格，避免在流式渲染完成前克隆导致内容丢失）
      const tables = container.querySelectorAll("table:not(.scrollable-processed)");
      tables.forEach((table) => {
        if (processedRef.current.has(table)) return;
        // 跳过 Streamdown 的 table-wrapper、wrMTrck 数据块内的表格，保持其原生渲染
        if (table.closest('[data-streamdown="table-wrapper"]') || table.closest("[data-wrmtrck-block]")) return;
        processedRef.current.add(table);
        table.classList.add("scrollable-processed");

        const wrapper = document.createElement("div");
        wrapper.className = "scrollable-table-wrapper";
        wrapper.style.width = "100%";
        wrapper.style.margin = "1rem 0";
        
        const tableClone = table.cloneNode(true) as HTMLTableElement;
        table.parentNode?.insertBefore(wrapper, table);
        table.remove();

        const root = createRoot(wrapper);
        root.render(
          <HorizontalScrollArea>
            <div style={{ display: "inline-block", minWidth: "100%" }}>
              {tableClone}
            </div>
          </HorizontalScrollArea>
        );
        rootsRef.current.push({ root, element: wrapper });
      });

      // 处理代码块（排除 Streamdown 组件内的代码块）
      const pres = container.querySelectorAll("pre:not(.scrollable-processed)");
      pres.forEach((pre) => {
        if (processedRef.current.has(pre)) return;
        // 跳过 Streamdown 的 code-block、mermaid-block、以及 wrMTrck 数据块内的 pre，避免重复渲染
        if (
          pre.closest('[data-streamdown="code-block"]') ||
          pre.closest('[data-streamdown="mermaid-block"]') ||
          pre.closest("[data-wrmtrck-block]")
        )
          return;
        processedRef.current.add(pre);
        pre.classList.add("scrollable-processed");

        const wrapper = document.createElement("div");
        wrapper.className = "scrollable-code-wrapper";
        wrapper.style.width = "100%";
        wrapper.style.margin = "1rem 0";
        
        const preClone = pre.cloneNode(true) as HTMLPreElement;
        const codeContent = preClone.textContent || "";
        pre.parentNode?.insertBefore(wrapper, pre);
        pre.remove();

        const root = createRoot(wrapper);
        root.render(
          <HorizontalScrollArea>
            <pre 
              className="bg-muted rounded p-3 m-0" 
              style={{ display: "inline-block", minWidth: "100%", whiteSpace: "pre" }}
            >
              {codeContent}
            </pre>
          </HorizontalScrollArea>
        );
        rootsRef.current.push({ root, element: wrapper });
      });
    };

    // 初始处理
    const timeoutId = setTimeout(processElements, 100);

    // 使用 MutationObserver 监听 DOM 变化
    const observer = new MutationObserver(() => {
      processElements();
    });

    observer.observe(container, {
      childList: true,
      subtree: true,
    });

    return () => {
      clearTimeout(timeoutId);
      observer.disconnect();
      // 清理 React 根
      rootsRef.current.forEach(({ root }) => {
        try {
          root.unmount();
        } catch (e) {
          // 忽略清理错误
        }
      });
      rootsRef.current = [];
    };
  }, [children]);

  // 添加全局样式确保文本自动换行和内容正确显示
  useEffect(() => {
    const styleId = "scrollable-content-text-styles";
    if (!document.getElementById(styleId)) {
      const style = document.createElement("style");
      style.id = styleId;
      style.textContent = `
        /* 普通文字自动换行，完整显示 */
        .scrollable-content-wrapper p,
        .scrollable-content-wrapper li,
        .scrollable-content-wrapper td,
        .scrollable-content-wrapper th {
          word-break: break-word;
          overflow-wrap: break-word;
        }
        /* 代码块、流程图、表格不换行，保持原格式 */
        .scrollable-content-wrapper pre,
        .scrollable-content-wrapper pre code,
        .scrollable-content-wrapper [data-streamdown="code-block"],
        .scrollable-content-wrapper [data-streamdown="code-block"] *,
        .scrollable-content-wrapper [data-streamdown="mermaid-block"],
        .scrollable-content-wrapper [data-streamdown="mermaid-block"] * {
          word-break: normal;
          overflow-wrap: normal;
        }
        .scrollable-content-wrapper code:not(pre code) {
          display: inline;
          padding: 0.125rem 0.25rem;
          background: hsl(var(--muted));
          border-radius: 0.25rem;
        }
        /* 确保列表和标题后的内容正确显示 */
        .scrollable-content-wrapper ul,
        .scrollable-content-wrapper ol,
        .scrollable-content-wrapper [data-streamdown="unordered-list"],
        .scrollable-content-wrapper [data-streamdown="ordered-list"] {
          display: block !important;
          visibility: visible !important;
          opacity: 1 !important;
          margin-top: 0.5em !important;
          margin-bottom: 0.5em !important;
          padding-left: 1.5em !important;
        }
        .scrollable-content-wrapper li,
        .scrollable-content-wrapper [data-streamdown="list-item"] {
          display: list-item !important;
          visibility: visible !important;
          opacity: 1 !important;
        }
        /* 确保标题后的所有内容都显示（使用 ~ 选择器匹配所有后续兄弟元素） */
        .scrollable-content-wrapper h1 ~ *,
        .scrollable-content-wrapper h2 ~ *,
        .scrollable-content-wrapper h3 ~ *,
        .scrollable-content-wrapper h4 ~ *,
        .scrollable-content-wrapper h5 ~ *,
        .scrollable-content-wrapper h6 ~ *,
        .scrollable-content-wrapper [data-streamdown^="heading-"] ~ * {
          display: revert !important;
          visibility: visible !important;
          opacity: 1 !important;
          height: auto !important;
          min-height: auto !important;
          max-height: none !important;
        }
        /* 确保紧跟在标题后的第一个元素也显示 */
        .scrollable-content-wrapper h1 + *,
        .scrollable-content-wrapper h2 + *,
        .scrollable-content-wrapper h3 + *,
        .scrollable-content-wrapper h4 + *,
        .scrollable-content-wrapper h5 + *,
        .scrollable-content-wrapper h6 + *,
        .scrollable-content-wrapper [data-streamdown^="heading-"] + * {
          display: block !important;
          visibility: visible !important;
          opacity: 1 !important;
          height: auto !important;
          min-height: auto !important;
          max-height: none !important;
        }
        /* 特别确保标题后的列表显示 */
        .scrollable-content-wrapper h1 ~ ul,
        .scrollable-content-wrapper h1 ~ ol,
        .scrollable-content-wrapper h2 ~ ul,
        .scrollable-content-wrapper h2 ~ ol,
        .scrollable-content-wrapper h3 ~ ul,
        .scrollable-content-wrapper h3 ~ ol,
        .scrollable-content-wrapper h4 ~ ul,
        .scrollable-content-wrapper h4 ~ ol,
        .scrollable-content-wrapper h5 ~ ul,
        .scrollable-content-wrapper h5 ~ ol,
        .scrollable-content-wrapper h6 ~ ul,
        .scrollable-content-wrapper h6 ~ ol {
          display: block !important;
          visibility: visible !important;
          opacity: 1 !important;
          margin-top: 0.5em !important;
          margin-bottom: 0.5em !important;
          padding-left: 1.5em !important;
        }
        /* 通用规则：确保 scrollable-content-wrapper 内的所有内容都可见 */
        .scrollable-content-wrapper > * {
          display: revert !important;
          visibility: visible !important;
          opacity: 1 !important;
          height: auto !important;
          min-height: auto !important;
          max-height: none !important;
        }
        .scrollable-content-wrapper * {
          max-height: none !important;
        }
        /* 确保所有可能的 markdown 元素都正确显示 */
        .scrollable-content-wrapper p,
        .scrollable-content-wrapper div,
        .scrollable-content-wrapper span,
        .scrollable-content-wrapper section,
        .scrollable-content-wrapper article {
          display: revert !important;
          visibility: visible !important;
          opacity: 1 !important;
          height: auto !important;
          min-height: auto !important;
          max-height: none !important;
        }
        /* Streamdown 表格和代码块内容 */
        .scrollable-content-wrapper [data-streamdown="table-wrapper"],
        .scrollable-content-wrapper [data-streamdown="code-block"],
        .scrollable-content-wrapper [data-streamdown="mermaid-block"] {
          display: block !important;
          visibility: visible !important;
          opacity: 1 !important;
          min-height: auto !important;
          overflow: visible !important;
        }
        .scrollable-content-wrapper [data-streamdown="table-wrapper"] .overflow-x-auto,
        .scrollable-content-wrapper [data-streamdown="code-block"] pre,
        .scrollable-content-wrapper [data-streamdown="code-block"] code {
          display: block !important;
          visibility: visible !important;
          opacity: 1 !important;
        }
        .scrollable-content-wrapper [data-streamdown="table-wrapper"] table {
          display: table !important;
          visibility: visible !important;
          opacity: 1 !important;
        }
        .scrollable-content-wrapper [data-streamdown="table-wrapper"] th,
        .scrollable-content-wrapper [data-streamdown="table-wrapper"] td {
          display: table-cell !important;
          visibility: visible !important;
          opacity: 1 !important;
        }
        /* 代码块、流程图、表格水平滚动 */
        .scrollable-content-wrapper [data-streamdown="code-block"],
        .scrollable-content-wrapper [data-streamdown="mermaid-block"],
        .scrollable-content-wrapper [data-streamdown="table-wrapper"] .overflow-x-auto,
        .scrollable-content-wrapper [data-streamdown="table-wrapper"] > div:last-child {
          overflow-x: auto !important;
          -webkit-overflow-scrolling: touch;
          scrollbar-width: thin;
        }
        .scrollable-content-wrapper [data-streamdown="code-block"]::-webkit-scrollbar,
        .scrollable-content-wrapper [data-streamdown="mermaid-block"]::-webkit-scrollbar,
        .scrollable-content-wrapper [data-streamdown="table-wrapper"] .overflow-x-auto::-webkit-scrollbar {
          height: 8px;
        }
        .scrollable-content-wrapper [data-streamdown="code-block"]::-webkit-scrollbar-thumb,
        .scrollable-content-wrapper [data-streamdown="mermaid-block"]::-webkit-scrollbar-thumb,
        .scrollable-content-wrapper [data-streamdown="table-wrapper"] .overflow-x-auto::-webkit-scrollbar-thumb {
          background: rgba(128, 128, 128, 0.4);
          border-radius: 4px;
        }
      `;
      document.head.appendChild(style);
    }
  }, []);

  return (
    <div 
      ref={containerRef}
      className={`scrollable-content-wrapper min-w-0 w-full max-w-full ${className || ""}`}
      style={{ 
        width: "100%",
        maxWidth: "100%"
      }}
    >
      {children}
    </div>
  );
}
