import type { Tool } from "../_core/llm";

/**
 * Tool definitions for the LLM's function calling interface.
 * The agent can call these tools during execution.
 */

export const AGENT_TOOLS: Tool[] = [
  {
    type: "function",
    function: {
      name: "execute_python",
      description:
        "Execute Python code in a stateful sandbox environment. The sandbox persists variables between calls within the same conversation. Supports matplotlib for charts (auto-captured as images), pandas, numpy, and other data science libraries. Use print() to produce text output.",
      parameters: {
        type: "object",
        properties: {
          code: {
            type: "string",
            description: "The Python code to execute",
          },
        },
        required: ["code"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "web_search",
      description:
        "Search the web for current information. Returns relevant search results with titles, snippets, and URLs. Use this when you need up-to-date information or facts you don't know. IMPORTANT: For experimental protocols, toxicity testing, or C. elegans research, ALWAYS prioritize searching WormAtlas (wormatlas.org), OpenWorm (openworm.org), and WormBase (wormbase.org) by including 'site:wormatlas.org OR site:openworm.org OR site:wormbase.org' in your query, and add 'C. elegans' or '线虫' keywords to prioritize nematode-related results.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "The search query. For C. elegans experiments, include 'C. elegans' or '线虫' and prioritize WormAtlas/OpenWorm/WormBase sites.",
          },
        },
        required: ["query"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "read_webpage",
      description:
        "Read and parse the content of a specific webpage URL. Returns the main content (markdown), title, and description. Use when the user provides a URL and wants you to analyze, summarize, or extract information from that page.",
      parameters: {
        type: "object",
        properties: {
          url: {
            type: "string",
            description: "The full URL of the webpage to read (e.g. https://example.com/article)",
          },
        },
        required: ["url"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "parse_file",
      description:
        "Parse and extract content from user-uploaded files (images, PDF, DOCX, CSV, TXT, etc.). Use when the user uploads a file and asks you to analyze, summarize, extract text, or describe its content. Pass the exact file URL from [Attached files] or [Previously uploaded files] (the part after 'URL: '). For images: uses AI vision model to understand and describe the image content. For PDF/DOCX: extracts text. This tool automatically creates an artifact with the parsed content, so do NOT call create_artifact afterwards for the same file.",
      parameters: {
        type: "object",
        properties: {
          file_url: {
            type: "string",
            description:
              "The exact file URL to parse, e.g. /uploads/uploads/1/xxx.jpg or https://... (copy from the file list)",
          },
          file_type: {
            type: "string",
            enum: [
              "PDF",
              "PNG",
              "JPG",
              "JPEG",
              "DOCX",
              "DOC",
              "XLS",
              "XLSX",
              "PPT",
              "PPTX",
              "CSV",
              "TXT",
              "MD",
            ],
            description:
              "Optional. File type hint. Auto-detected from URL if omitted.",
          },
        },
        required: ["file_url"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "analyze_nematode_video_tracking",
      description:
        "使用 Deep-Worm-Tracker（YOLOv5 + 多目标追踪）对线虫运动视频进行高精度追踪。适用于需要分析多条线虫运动轨迹、速度、方向变化的场景。输入视频 URL（MP4/AVI/MOV），返回每条线虫的 ID、边界框、置信度及轨迹数据。参考：修改2.23.md，Zenodo 7884831。",
      parameters: {
        type: "object",
        properties: {
          file_url: {
            type: "string",
            description:
              "线虫运动视频文件 URL，例如 /uploads/uploads/1/xxx.mp4 或完整 URL。需为视频格式（MP4/AVI/MOV）。",
          },
        },
        required: ["file_url"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "analyze_nematode_image",
      description:
        "使用 Fiji/ImageJ 对线虫图像或视频进行生物图像分析。根据具体需求选择分析流程：荧光图像需 Subtract Background 去背景；运动视频需 wrMTrck 追踪；形态学分析需阈值分割。传入文件 URL 和可选的 analysis_type/options 以定制分析流程。",
      parameters: {
        type: "object",
        properties: {
          file_url: {
            type: "string",
            description:
              "要分析的线虫图像/视频文件 URL，例如 /uploads/uploads/1/xxx.png 或完整 URL",
          },
          analysis_type: {
            type: "string",
            enum: ["auto", "fluorescence", "movement", "morphology", "preprocessing"],
            description:
              "分析类型。auto=根据文件类型自动选择；fluorescence=荧光图像（Subtract Background）；movement=运动视频（wrMTrck）；morphology=形态学（阈值+粒子分析）；preprocessing=仅预处理（8-bit、去背景、阈值）",
          },
          subtract_background: {
            type: "boolean",
            description:
              "是否执行 Subtract Background（滚动球算法去背景）。荧光/明场图像光照不均时建议 true。默认 auto 时由 analysis_type 决定",
          },
          rolling_radius: {
            type: "number",
            description:
              "Subtract Background 的滚动球半径（像素）。荧光斑点较大时用 50-100，细小结构用 20-30。默认 50",
          },
          run_tracking: {
            type: "boolean",
            description:
              "是否运行 wrMTrck 运动追踪。仅对视频/时间序列有效。movement 类型默认 true",
          },
        },
        required: ["file_url"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_artifact",
      description:
        "Create a displayable artifact for the user. Use ONLY for code, HTML, charts, documents, markdown that YOU generate. NEVER use this for image/file analysis results—parse_file already creates that artifact automatically with real content. NEVER pass placeholder text like [图片内容], [图片], [文件内容], [Image Content] as the content parameter.",
      parameters: {
        type: "object",
        properties: {
          type: {
            type: "string",
            enum: ["code", "html", "chart", "image", "document", "markdown", "project_plan", "experiment_questionnaire"],
            description: "The type of artifact to create",
          },
          title: {
            type: "string",
            description: "A short descriptive title for the artifact",
          },
          content: {
            type: "string",
            description: "The content of the artifact (code, HTML, markdown, etc.)",
          },
          language: {
            type: "string",
            description: "Programming language for code artifacts (e.g. python, javascript, html)",
          },
        },
        required: ["type", "title", "content"],
        additionalProperties: false,
      },
    },
  },
];

export type ToolName =
  | "execute_python"
  | "web_search"
  | "read_webpage"
  | "parse_file"
  | "analyze_nematode_image"
  | "analyze_nematode_video_tracking"
  | "create_artifact";