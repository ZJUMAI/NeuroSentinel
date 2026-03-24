import { useAuth } from "@/_core/hooks/useAuth";
import { BrandName } from "@/components/BrandName";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ScrollableContent } from "@/components/ScrollableContent";
import { Textarea } from "@/components/ui/textarea";
import { getLoginUrl } from "@/const";
import { useAgentStream, type StreamMessage } from "@/hooks/useAgentStream";
import { useFileUpload } from "@/hooks/useFileUpload";
import { useModels } from "@/hooks/useModels";
import {
  parseNeorualMarkdown,
  neorualMarkdownHasResultImages,
} from "@/lib/neorualArtifact";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import {
  BookOpen,
  Check,
  ChevronDown,
  ChevronRight,
  Circle,
  Code2,
  Copy,
  Download,
  ExternalLink,
  FileText,
  FolderOpen,
  Image as ImageIcon,
  Link2,
  Loader2,
  MessageSquarePlus,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Paperclip,
  Play,
  Search,
  Send,
  Settings,
  Share2,
  SkipBack,
  SkipForward,
  Sparkles,
  Square,
  SquarePlus,
  Terminal,
  Trash2,
  Upload,
  X,
  XCircle,
  AlertTriangle,
  Zap,
  Database,
  BookMarked,
  Microscope,
  FlaskConical,
  Brain,
  Activity,
  Clock,
  ChevronUp,
  BarChart3,
  ArrowLeft,
  ArrowRight,
  ZoomIn,
  ZoomOut,
  Maximize2,
  FileEdit,
  Lightbulb,
  Folder,
  Layers,
  MoreHorizontal,
} from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type {
  ProjectPlanViewerRef,
  ProjectPlanUploadReminderType,
} from "@/components/ProjectPlanViewer";
import { TransformWrapper, TransformComponent } from "react-zoom-pan-pinch";
import { Streamdown } from "streamdown";
import { useLocation } from "wouter";
import { toast } from "sonner";
import type { ArtifactInfo, AgentPlan, RAGRetrievalResult, RAGRetrievalHit } from "../../../shared/types";
import { ProjectPlanViewer } from "@/components/ProjectPlanViewer";
import { AssessmentReportViewer } from "@/components/AssessmentReportViewer";
import { ExperimentQuestionnaireViewer } from "@/components/ExperimentQuestionnaireViewer";
import { NeorualResultImage } from "@/components/NeorualResultImage";
import { PlanDisplay } from "@/components/PlanDisplay";
import { SearchTasksModal } from "@/components/SearchTasksModal";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useLanguage } from "@/contexts/LanguageContext";

// ---- Chat Page Translations ----
const CHAT_TEXTS: Record<string, {
  newTask: string; search: string; library: string; settings: string;
  projects: string; newProject: string; allTasks: string; taskListSection: string; noTasksYet: string;
  enterGoalHint: string; closeSidebar: string; openSidebar: string;
  goalRequirement: string; whatCanIDoForYou: string; enterQuestionHint: string;
  placeholder: string; send: string; poweredBy: string; verifyInfo: string;
  analysisResults: string; noAnalysisResults: string; fillExperimentHint: string;
  thinking: string; signInToGetStarted: string; attachFile: string; export: string; share: string;
  suggestedPrompts: string[];
  shareTitle: string; shareDesc: string; createShareLink: string; removeLink: string;
  copyLink: string; copied: string; linkCopied: string; shareLinkRemoved: string;
  failedCreate: string; failedRemove: string;
  searchPlaceholder: string; searchResults: string; last30Days: string;
  noMatchingTasks: string; noTasksLast30Days: string;
  today: string; yesterday: string; daysAgo: string; weeksAgo: string;
  runningPython: string; searching: string; reading: string; creating: string; using: string;
  webPageResult: string; searchResult: string; resultSuffix: string; failed: string;
  executionError: string; codeExecuted: string;
  noRAGRetrieval: string; onRegenerateStart: string;
  allTasksScope: string;
  allTasksScopeHint: string;
  createProjectTitle: string;
  editProjectTitle: string;
  projectNameLabel: string;
  sharedContextLabel: string;
  sharedContextHint: string;
  dialogSave: string;
  dialogCancel: string;
  moveToProject: string;
  removeFromProject: string;
  deleteProject: string;
  deleteProjectConfirm: string;
  projectSaved: string;
  projectDeleted: string;
  moreActions: string;
  tasksCountTemplate: string;
  deleteTask: string;
  noTasksInProject: string;
  conversationsListFailed: string;
  conversationsListFailedHint: string;
  retryLoad: string;
}> = {
  en: {
    newTask: "New task", search: "Search", library: "Library", settings: "Settings",
    projects: "Projects", newProject: "New project", allTasks: "All tasks", taskListSection: "Task list", noTasksYet: "No tasks yet",
    enterGoalHint: "Enter your goal in the center panel and click Send to start.",
    closeSidebar: "Close sidebar", openSidebar: "Open sidebar",
    goalRequirement: "Goal / Requirement", whatCanIDoForYou: "What can I do for you?",
    enterQuestionHint: "Enter your question and click Send to get a reply",
    placeholder: "e.g. What date is it today? Analyze image risk...",
    send: "Send", poweredBy: "Powered by ZhipuAI GLM ·", verifyInfo: "can make mistakes. Verify important information.",
    analysisResults: "Analysis Results", noAnalysisResults: "No analysis results",
    fillExperimentHint: "Please fill in experiment parameters and upload images to start analysis",
    thinking: "Thinking...", signInToGetStarted: "Sign in to get started",
    attachFile: "Attach file", export: "Export", share: "Share",
    suggestedPrompts: [
      "Please help me test the neurotoxicity of this sample",
      "Evaluate the neurotoxicity risk of this drug using the C. elegans model",
      "Analyze the effect of the sample on neuronal activity and generate an experimental plan",
      "Search for literature on the neurotoxicity of this compound and summarize the findings",
    ],
    shareTitle: "Share Conversation", shareDesc: "Create a public link to share this conversation. Anyone with the link can view the messages and artifacts.",
    createShareLink: "Create Share Link", removeLink: "Remove Link", copyLink: "Copy Link",
    copied: "Copied!", linkCopied: "Link copied to clipboard", shareLinkRemoved: "Share link removed",
    failedCreate: "Failed to create share link", failedRemove: "Failed to remove share link",
    searchPlaceholder: "Search tasks...", searchResults: "Search results", last30Days: "Last 30 days",
    noMatchingTasks: "No matching tasks", noTasksLast30Days: "No tasks in the last 30 days",
    today: "Today", yesterday: "Yesterday", daysAgo: "days ago", weeksAgo: "weeks ago",
    runningPython: "Running Python code", searching: "Searching", reading: "Reading", creating: "Creating", using: "Using",
    webPageResult: "Web page result", searchResult: "Search result", resultSuffix: "result", failed: "Failed",
    executionError: "Execution Error", codeExecuted: "Code Executed",
    noRAGRetrieval: "No relevant expertise retrieved; using general knowledge to generate the plan.",
    onRegenerateStart: "Received the information. Generating customized experiment plan...",
    allTasksScope: "Unfiltered",
    allTasksScopeHint:
      "Sidebar scope: show every conversation (in any project or ungrouped). Your task history is still here—not moved.",
    createProjectTitle: "New project",
    editProjectTitle: "Edit project",
    projectNameLabel: "Name",
    sharedContextLabel: "Shared context",
    sharedContextHint:
      "Tech stack, writing style, background — injected into the agent for every task in this project.",
    dialogSave: "Save",
    dialogCancel: "Cancel",
    moveToProject: "Move to project",
    removeFromProject: "Remove from project",
    deleteProject: "Delete project",
    deleteProjectConfirm: "Delete this project? Its tasks will become ungrouped.",
    projectSaved: "Project saved",
    projectDeleted: "Project deleted",
    moreActions: "More",
    tasksCountTemplate: "{count} tasks",
    deleteTask: "Delete task",
    noTasksInProject: "No tasks in this project yet",
    conversationsListFailed: "Couldn't load conversations",
    conversationsListFailedHint:
      "Check server logs. If you upgraded the app recently, run the SQL in drizzle/0004_projects.sql on your MySQL database (adds projects table and conversations.projectId).",
    retryLoad: "Retry",
  },
  zh: {
    newTask: "新建任务", search: "搜索", library: "知识库", settings: "设置",
    projects: "项目", newProject: "新建项目", allTasks: "全部任务", taskListSection: "任务列表", noTasksYet: "暂无任务",
    enterGoalHint: "在中间面板输入您的目标并点击发送开始。",
    closeSidebar: "关闭侧边栏", openSidebar: "打开侧边栏",
    goalRequirement: "目标 / 需求", whatCanIDoForYou: "我能为您做什么？",
    enterQuestionHint: "输入您的问题并点击发送获取回复",
    placeholder: "例如：今天几号？分析图像风险...",
    send: "发送", poweredBy: "由 ZhipuAI GLM 驱动 ·", verifyInfo: "可能出错，请核实重要信息。",
    analysisResults: "分析结果", noAnalysisResults: "暂无分析结果",
    fillExperimentHint: "请填写实验参数并上传图像以开始分析",
    thinking: "思考中...", signInToGetStarted: "登录以开始",
    attachFile: "附加文件", export: "导出", share: "分享",
    suggestedPrompts: [
      "请帮我测试该样本的神经毒性",
      "使用 C. elegans 模型评估该药物的神经毒性风险",
      "分析样本对神经元活性的影响并生成实验方案",
      "检索该化合物神经毒性相关文献并总结发现",
    ],
    shareTitle: "分享对话", shareDesc: "创建公开链接以分享此对话。拥有链接的人可查看消息和成果。",
    createShareLink: "创建分享链接", removeLink: "移除链接", copyLink: "复制链接",
    copied: "已复制！", linkCopied: "链接已复制到剪贴板", shareLinkRemoved: "分享链接已移除",
    failedCreate: "创建分享链接失败", failedRemove: "移除分享链接失败",
    searchPlaceholder: "搜索任务...", searchResults: "搜索结果", last30Days: "最近 30 天",
    noMatchingTasks: "无匹配任务", noTasksLast30Days: "最近 30 天无任务",
    today: "今天", yesterday: "昨天", daysAgo: "天前", weeksAgo: "周前",
    runningPython: "运行 Python 代码", searching: "搜索中", reading: "读取中", creating: "创建中", using: "使用",
    webPageResult: "网页读取结果", searchResult: "搜索结果", resultSuffix: "结果", failed: "失败",
    executionError: "执行错误", codeExecuted: "代码已执行",
    noRAGRetrieval: "未检索到相关专业知识，将使用通用知识生成方案",
    onRegenerateStart: "已接收对应信息，正在生成定制化实验方案...",
    allTasksScope: "不限项目",
    allTasksScopeHint:
      "侧边栏筛选：显示全部会话（含各项目内与未分组）。历史任务仍在下方列表中，未被移动或删除。",
    createProjectTitle: "新建项目",
    editProjectTitle: "编辑项目",
    projectNameLabel: "项目名称",
    sharedContextLabel: "共享上下文 / 项目说明",
    sharedContextHint:
      "例如技术栈、写作风格、课题背景；将自动注入该项目下所有任务的智能体系统提示，无需在每个任务里重复说明。",
    dialogSave: "保存",
    dialogCancel: "取消",
    moveToProject: "移至项目",
    removeFromProject: "移出项目（归入全局）",
    deleteProject: "删除项目",
    deleteProjectConfirm: "确定删除该项目？下属任务将变为未分组，不会被删除。",
    projectSaved: "项目已保存",
    projectDeleted: "项目已删除",
    moreActions: "更多",
    tasksCountTemplate: "{count} 个任务",
    deleteTask: "删除任务",
    noTasksInProject: "该项目下暂无任务",
    conversationsListFailed: "会话列表加载失败",
    conversationsListFailedHint:
      "请查看服务端日志。若刚更新过代码，请在 MySQL 中执行 drizzle/0004_projects.sql（创建 projects 表并为 conversations 增加 projectId 列）。执行成功后刷新页面。",
    retryLoad: "重试",
  },
  es: {
    newTask: "Nueva tarea", search: "Buscar", library: "Biblioteca", settings: "Configuración",
    projects: "Proyectos", newProject: "Nuevo proyecto", allTasks: "Todas las tareas", noTasksYet: "Sin tareas aún",
    enterGoalHint: "Ingrese su objetivo en el panel central y haga clic en Enviar para comenzar.",
    closeSidebar: "Cerrar barra lateral", openSidebar: "Abrir barra lateral",
    goalRequirement: "Objetivo / Requisito", whatCanIDoForYou: "¿En qué puedo ayudarle?",
    enterQuestionHint: "Ingrese su pregunta y haga clic en Enviar para obtener una respuesta",
    placeholder: "ej. ¿Qué fecha es hoy? Analizar riesgo de imagen...",
    send: "Enviar", poweredBy: "Impulsado por ZhipuAI GLM ·", verifyInfo: "puede cometer errores. Verifique la información importante.",
    analysisResults: "Resultados del análisis", noAnalysisResults: "Sin resultados de análisis",
    fillExperimentHint: "Complete los parámetros del experimento y suba imágenes para iniciar el análisis",
    thinking: "Pensando...", signInToGetStarted: "Inicie sesión para comenzar",
    attachFile: "Adjuntar archivo", export: "Exportar", share: "Compartir",
    suggestedPrompts: [
      "Ayúdeme a probar la neurotoxicidad de esta muestra",
      "Evalúe el riesgo de neurotoxicidad de este fármaco usando el modelo C. elegans",
      "Analice el efecto de la muestra en la actividad neuronal y genere un plan experimental",
      "Busque literatura sobre la neurotoxicidad de este compuesto y resuma los hallazgos",
    ],
    shareTitle: "Compartir conversación", shareDesc: "Cree un enlace público para compartir esta conversación. Cualquiera con el enlace puede ver los mensajes y artefactos.",
    createShareLink: "Crear enlace compartido", removeLink: "Eliminar enlace", copyLink: "Copiar enlace",
    copied: "¡Copiado!", linkCopied: "Enlace copiado al portapapeles", shareLinkRemoved: "Enlace compartido eliminado",
    failedCreate: "Error al crear enlace compartido", failedRemove: "Error al eliminar enlace compartido",
    searchPlaceholder: "Buscar tareas...", searchResults: "Resultados de búsqueda", last30Days: "Últimos 30 días",
    noMatchingTasks: "Sin tareas coincidentes", noTasksLast30Days: "Sin tareas en los últimos 30 días",
    today: "Hoy", yesterday: "Ayer", daysAgo: "días atrás", weeksAgo: "semanas atrás",
    runningPython: "Ejecutando código Python", searching: "Buscando", reading: "Leyendo", creating: "Creando", using: "Usando",
    webPageResult: "Resultado de página web", searchResult: "Resultado de búsqueda", resultSuffix: "resultado", failed: "Fallido",
    executionError: "Error de ejecución", codeExecuted: "Código ejecutado",
    noRAGRetrieval: "No se recuperó conocimiento relevante; se usará conocimiento general.",
    onRegenerateStart: "Información recibida. Generando plan de experimento personalizado...",
    allTasksScope: "Unfiltered",
    allTasksScopeHint:
      "Sidebar scope: show every conversation (in any project or ungrouped). Your task history is still here—not moved.",
    taskListSection: "Task list",
    createProjectTitle: "New project",
    editProjectTitle: "Edit project",
    projectNameLabel: "Name",
    sharedContextLabel: "Shared context",
    sharedContextHint:
      "Tech stack, writing style, background — injected into the agent for every task in this project.",
    dialogSave: "Save",
    dialogCancel: "Cancel",
    moveToProject: "Move to project",
    removeFromProject: "Remove from project",
    deleteProject: "Delete project",
    deleteProjectConfirm: "Delete this project? Its tasks will become ungrouped.",
    projectSaved: "Project saved",
    projectDeleted: "Project deleted",
    moreActions: "More",
    tasksCountTemplate: "{count} tasks",
    deleteTask: "Delete task",
    noTasksInProject: "No tasks in this project yet",
    conversationsListFailed: "Couldn't load conversations",
    conversationsListFailedHint:
      "Check server logs. If you upgraded the app recently, run the SQL in drizzle/0004_projects.sql on your MySQL database.",
    retryLoad: "Retry",
  },
  fr: {
    newTask: "Nouvelle tâche", search: "Rechercher", library: "Bibliothèque", settings: "Paramètres",
    projects: "Projets", newProject: "Nouveau projet", allTasks: "Toutes les tâches", noTasksYet: "Aucune tâche",
    enterGoalHint: "Entrez votre objectif dans le panneau central et cliquez sur Envoyer pour commencer.",
    closeSidebar: "Fermer la barre latérale", openSidebar: "Ouvrir la barre latérale",
    goalRequirement: "Objectif / Exigence", whatCanIDoForYou: "Que puis-je faire pour vous ?",
    enterQuestionHint: "Entrez votre question et cliquez sur Envoyer pour obtenir une réponse",
    placeholder: "ex. Quelle est la date aujourd'hui ? Analyser le risque d'image...",
    send: "Envoyer", poweredBy: "Propulsé par ZhipuAI GLM ·", verifyInfo: "peut faire des erreurs. Vérifiez les informations importantes.",
    analysisResults: "Résultats d'analyse", noAnalysisResults: "Aucun résultat d'analyse",
    fillExperimentHint: "Remplissez les paramètres d'expérience et téléchargez des images pour commencer l'analyse",
    thinking: "Réflexion...", signInToGetStarted: "Connectez-vous pour commencer",
    attachFile: "Joindre un fichier", export: "Exporter", share: "Partager",
    suggestedPrompts: [
      "Aidez-moi à tester la neurotoxicité de cet échantillon",
      "Évaluez le risque de neurotoxicité de ce médicament en utilisant le modèle C. elegans",
      "Analysez l'effet de l'échantillon sur l'activité neuronale et générez un plan expérimental",
      "Recherchez la littérature sur la neurotoxicité de ce composé et résumez les résultats",
    ],
    shareTitle: "Partager la conversation", shareDesc: "Créez un lien public pour partager cette conversation. Toute personne disposant du lien peut voir les messages et artefacts.",
    createShareLink: "Créer un lien de partage", removeLink: "Supprimer le lien", copyLink: "Copier le lien",
    copied: "Copié !", linkCopied: "Lien copié dans le presse-papiers", shareLinkRemoved: "Lien de partage supprimé",
    failedCreate: "Échec de la création du lien de partage", failedRemove: "Échec de la suppression du lien de partage",
    searchPlaceholder: "Rechercher des tâches...", searchResults: "Résultats de recherche", last30Days: "30 derniers jours",
    noMatchingTasks: "Aucune tâche correspondante", noTasksLast30Days: "Aucune tâche dans les 30 derniers jours",
    today: "Aujourd'hui", yesterday: "Hier", daysAgo: "jours", weeksAgo: "semaines",
    runningPython: "Exécution du code Python", searching: "Recherche", reading: "Lecture", creating: "Création", using: "Utilisation",
    webPageResult: "Résultat de page web", searchResult: "Résultat de recherche", resultSuffix: "résultat", failed: "Échec",
    executionError: "Erreur d'exécution", codeExecuted: "Code exécuté",
    noRAGRetrieval: "Aucune expertise pertinente récupérée ; utilisation des connaissances générales.",
    onRegenerateStart: "Informations reçues. Génération du plan d'expérience personnalisé...",
    allTasksScope: "Unfiltered",
    allTasksScopeHint:
      "Sidebar scope: show every conversation (in any project or ungrouped). Your task history is still here—not moved.",
    taskListSection: "Task list",
    createProjectTitle: "New project",
    editProjectTitle: "Edit project",
    projectNameLabel: "Name",
    sharedContextLabel: "Shared context",
    sharedContextHint:
      "Tech stack, writing style, background — injected into the agent for every task in this project.",
    dialogSave: "Save",
    dialogCancel: "Cancel",
    moveToProject: "Move to project",
    removeFromProject: "Remove from project",
    deleteProject: "Delete project",
    deleteProjectConfirm: "Delete this project? Its tasks will become ungrouped.",
    projectSaved: "Project saved",
    projectDeleted: "Project deleted",
    moreActions: "More",
    tasksCountTemplate: "{count} tasks",
    deleteTask: "Delete task",
    noTasksInProject: "No tasks in this project yet",
    conversationsListFailed: "Couldn't load conversations",
    conversationsListFailedHint:
      "Check server logs. If you upgraded the app recently, run the SQL in drizzle/0004_projects.sql on your MySQL database.",
    retryLoad: "Retry",
  },
  de: {
    newTask: "Neue Aufgabe", search: "Suchen", library: "Bibliothek", settings: "Einstellungen",
    projects: "Projekte", newProject: "Neues Projekt", allTasks: "Alle Aufgaben", noTasksYet: "Noch keine Aufgaben",
    enterGoalHint: "Geben Sie Ihr Ziel im mittleren Bereich ein und klicken Sie auf Senden, um zu starten.",
    closeSidebar: "Seitenleiste schließen", openSidebar: "Seitenleiste öffnen",
    goalRequirement: "Ziel / Anforderung", whatCanIDoForYou: "Womit kann ich Ihnen helfen?",
    enterQuestionHint: "Geben Sie Ihre Frage ein und klicken Sie auf Senden für eine Antwort",
    placeholder: "z.B. Welches Datum ist heute? Bildrisiko analysieren...",
    send: "Senden", poweredBy: "Unterstützt von ZhipuAI GLM ·", verifyInfo: "kann Fehler machen. Wichtige Informationen überprüfen.",
    analysisResults: "Analyseergebnisse", noAnalysisResults: "Keine Analyseergebnisse",
    fillExperimentHint: "Füllen Sie die Versuchsparameter aus und laden Sie Bilder hoch, um die Analyse zu starten",
    thinking: "Denke...", signInToGetStarted: "Anmelden zum Starten",
    attachFile: "Datei anhängen", export: "Exportieren", share: "Teilen",
    suggestedPrompts: [
      "Helfen Sie mir, die Neurotoxizität dieser Probe zu testen",
      "Bewerten Sie das Neurotoxizitätsrisiko dieses Medikaments mit dem C. elegans-Modell",
      "Analysieren Sie die Wirkung der Probe auf die neuronale Aktivität und erstellen Sie einen Versuchsplan",
      "Suchen Sie in der Literatur nach der Neurotoxizität dieser Verbindung und fassen Sie die Ergebnisse zusammen",
    ],
    shareTitle: "Konversation teilen", shareDesc: "Erstellen Sie einen öffentlichen Link zum Teilen dieser Konversation. Jeder mit dem Link kann Nachrichten und Artefakte anzeigen.",
    createShareLink: "Teil-Link erstellen", removeLink: "Link entfernen", copyLink: "Link kopieren",
    copied: "Kopiert!", linkCopied: "Link in Zwischenablage kopiert", shareLinkRemoved: "Teil-Link entfernt",
    failedCreate: "Teil-Link konnte nicht erstellt werden", failedRemove: "Teil-Link konnte nicht entfernt werden",
    searchPlaceholder: "Aufgaben suchen...", searchResults: "Suchergebnisse", last30Days: "Letzte 30 Tage",
    noMatchingTasks: "Keine passenden Aufgaben", noTasksLast30Days: "Keine Aufgaben in den letzten 30 Tagen",
    today: "Heute", yesterday: "Gestern", daysAgo: "Tage", weeksAgo: "Wochen",
    runningPython: "Python-Code ausführen", searching: "Suchen", reading: "Lesen", creating: "Erstellen", using: "Verwenden",
    webPageResult: "Webseiten-Ergebnis", searchResult: "Suchergebnis", resultSuffix: "Ergebnis", failed: "Fehlgeschlagen",
    executionError: "Ausführungsfehler", codeExecuted: "Code ausgeführt",
    noRAGRetrieval: "Keine relevante Expertise abgerufen; allgemeines Wissen wird verwendet.",
    onRegenerateStart: "Informationen erhalten. Generierung des angepassten Versuchsplans...",
    allTasksScope: "Unfiltered",
    allTasksScopeHint:
      "Sidebar scope: show every conversation (in any project or ungrouped). Your task history is still here—not moved.",
    taskListSection: "Task list",
    createProjectTitle: "New project",
    editProjectTitle: "Edit project",
    projectNameLabel: "Name",
    sharedContextLabel: "Shared context",
    sharedContextHint:
      "Tech stack, writing style, background — injected into the agent for every task in this project.",
    dialogSave: "Save",
    dialogCancel: "Cancel",
    moveToProject: "Move to project",
    removeFromProject: "Remove from project",
    deleteProject: "Delete project",
    deleteProjectConfirm: "Delete this project? Its tasks will become ungrouped.",
    projectSaved: "Project saved",
    projectDeleted: "Project deleted",
    moreActions: "More",
    tasksCountTemplate: "{count} tasks",
    deleteTask: "Delete task",
    noTasksInProject: "No tasks in this project yet",
    conversationsListFailed: "Couldn't load conversations",
    conversationsListFailedHint:
      "Check server logs. If you upgraded the app recently, run the SQL in drizzle/0004_projects.sql on your MySQL database.",
    retryLoad: "Retry",
  },
  ja: {
    newTask: "新規タスク", search: "検索", library: "ライブラリ", settings: "設定",
    projects: "プロジェクト", newProject: "新規プロジェクト", allTasks: "すべてのタスク", noTasksYet: "タスクはまだありません",
    enterGoalHint: "中央パネルで目標を入力し、送信をクリックして開始してください。",
    closeSidebar: "サイドバーを閉じる", openSidebar: "サイドバーを開く",
    goalRequirement: "目標 / 要件", whatCanIDoForYou: "何をお手伝いしましょうか？",
    enterQuestionHint: "質問を入力して送信をクリックすると返信が届きます",
    placeholder: "例：今日は何日？画像リスクを分析...",
    send: "送信", poweredBy: "ZhipuAI GLM 提供 ·", verifyInfo: "は誤りを犯す可能性があります。重要な情報を確認してください。",
    analysisResults: "分析結果", noAnalysisResults: "分析結果はありません",
    fillExperimentHint: "実験パラメータを入力し、画像をアップロードして分析を開始してください",
    thinking: "考え中...", signInToGetStarted: "ログインして開始",
    attachFile: "ファイルを添付", export: "エクスポート", share: "共有",
    suggestedPrompts: [
      "このサンプルの神経毒性をテストするのを手伝ってください",
      "C. elegans モデルを使用してこの薬の神経毒性リスクを評価してください",
      "サンプルの神経活動への影響を分析し、実験計画を生成してください",
      "この化合物の神経毒性に関する文献を検索し、結果をまとめてください",
    ],
    shareTitle: "会話を共有", shareDesc: "この会話を共有するための公開リンクを作成します。リンクを持つ人はメッセージと成果物を表示できます。",
    createShareLink: "共有リンクを作成", removeLink: "リンクを削除", copyLink: "リンクをコピー",
    copied: "コピーしました！", linkCopied: "リンクをクリップボードにコピーしました", shareLinkRemoved: "共有リンクを削除しました",
    failedCreate: "共有リンクの作成に失敗しました", failedRemove: "共有リンクの削除に失敗しました",
    searchPlaceholder: "タスクを検索...", searchResults: "検索結果", last30Days: "過去30日間",
    noMatchingTasks: "一致するタスクがありません", noTasksLast30Days: "過去30日間にタスクがありません",
    today: "今日", yesterday: "昨日", daysAgo: "日前", weeksAgo: "週前",
    runningPython: "Python コードを実行中", searching: "検索中", reading: "読み取り中", creating: "作成中", using: "使用中",
    webPageResult: "ウェブページ結果", searchResult: "検索結果", resultSuffix: "結果", failed: "失敗",
    executionError: "実行エラー", codeExecuted: "コード実行済み",
    noRAGRetrieval: "関連する専門知識が取得されませんでした。一般的な知識を使用します。",
    onRegenerateStart: "情報を受信しました。カスタマイズされた実験計画を生成中...",
    allTasksScope: "Unfiltered",
    allTasksScopeHint:
      "Sidebar scope: show every conversation (in any project or ungrouped). Your task history is still here—not moved.",
    taskListSection: "Task list",
    createProjectTitle: "New project",
    editProjectTitle: "Edit project",
    projectNameLabel: "Name",
    sharedContextLabel: "Shared context",
    sharedContextHint:
      "Tech stack, writing style, background — injected into the agent for every task in this project.",
    dialogSave: "Save",
    dialogCancel: "Cancel",
    moveToProject: "Move to project",
    removeFromProject: "Remove from project",
    deleteProject: "Delete project",
    deleteProjectConfirm: "Delete this project? Its tasks will become ungrouped.",
    projectSaved: "Project saved",
    projectDeleted: "Project deleted",
    moreActions: "More",
    tasksCountTemplate: "{count} tasks",
    deleteTask: "Delete task",
    noTasksInProject: "No tasks in this project yet",
    conversationsListFailed: "Couldn't load conversations",
    conversationsListFailedHint:
      "Check server logs. If you upgraded the app recently, run the SQL in drizzle/0004_projects.sql on your MySQL database.",
    retryLoad: "Retry",
  },
  ko: {
    newTask: "새 작업", search: "검색", library: "라이브러리", settings: "설정",
    projects: "프로젝트", newProject: "새 프로젝트", allTasks: "모든 작업", noTasksYet: "아직 작업 없음",
    enterGoalHint: "중앙 패널에 목표를 입력하고 보내기를 클릭하여 시작하세요.",
    closeSidebar: "사이드바 닫기", openSidebar: "사이드바 열기",
    goalRequirement: "목표 / 요구사항", whatCanIDoForYou: "무엇을 도와드릴까요?",
    enterQuestionHint: "질문을 입력하고 보내기를 클릭하여 답변을 받으세요",
    placeholder: "예: 오늘 날짜는? 이미지 위험 분석...",
    send: "보내기", poweredBy: "ZhipuAI GLM 제공 ·", verifyInfo: "는 실수를 할 수 있습니다. 중요한 정보를 확인하세요.",
    analysisResults: "분석 결과", noAnalysisResults: "분석 결과 없음",
    fillExperimentHint: "실험 매개변수를 입력하고 이미지를 업로드하여 분석을 시작하세요",
    thinking: "생각 중...", signInToGetStarted: "시작하려면 로그인",
    attachFile: "파일 첨부", export: "내보내기", share: "공유",
    suggestedPrompts: [
      "이 샘플의 신경독성을 테스트하는 데 도움을 주세요",
      "C. elegans 모델을 사용하여 이 약물의 신경독성 위험을 평가하세요",
      "샘플이 신경 활동에 미치는 영향을 분석하고 실험 계획을 생성하세요",
      "이 화합물의 신경독성에 대한 문헌을 검색하고 결과를 요약하세요",
    ],
    shareTitle: "대화 공유", shareDesc: "이 대화를 공유하기 위한 공개 링크를 만드세요. 링크가 있는 사람은 메시지와 결과물을 볼 수 있습니다.",
    createShareLink: "공유 링크 만들기", removeLink: "링크 제거", copyLink: "링크 복사",
    copied: "복사됨!", linkCopied: "링크가 클립보드에 복사됨", shareLinkRemoved: "공유 링크가 제거됨",
    failedCreate: "공유 링크 생성 실패", failedRemove: "공유 링크 제거 실패",
    searchPlaceholder: "작업 검색...", searchResults: "검색 결과", last30Days: "최근 30일",
    noMatchingTasks: "일치하는 작업 없음", noTasksLast30Days: "최근 30일 동안 작업 없음",
    today: "오늘", yesterday: "어제", daysAgo: "일 전", weeksAgo: "주 전",
    runningPython: "Python 코드 실행 중", searching: "검색 중", reading: "읽는 중", creating: "만드는 중", using: "사용 중",
    webPageResult: "웹 페이지 결과", searchResult: "검색 결과", resultSuffix: "결과", failed: "실패",
    executionError: "실행 오류", codeExecuted: "코드 실행됨",
    noRAGRetrieval: "관련 전문 지식이 검색되지 않았습니다. 일반 지식을 사용합니다.",
    onRegenerateStart: "정보를 받았습니다. 맞춤형 실험 계획 생성 중...",
    allTasksScope: "Unfiltered",
    allTasksScopeHint:
      "Sidebar scope: show every conversation (in any project or ungrouped). Your task history is still here—not moved.",
    taskListSection: "Task list",
    createProjectTitle: "New project",
    editProjectTitle: "Edit project",
    projectNameLabel: "Name",
    sharedContextLabel: "Shared context",
    sharedContextHint:
      "Tech stack, writing style, background — injected into the agent for every task in this project.",
    dialogSave: "Save",
    dialogCancel: "Cancel",
    moveToProject: "Move to project",
    removeFromProject: "Remove from project",
    deleteProject: "Delete project",
    deleteProjectConfirm: "Delete this project? Its tasks will become ungrouped.",
    projectSaved: "Project saved",
    projectDeleted: "Project deleted",
    moreActions: "More",
    tasksCountTemplate: "{count} tasks",
    deleteTask: "Delete task",
    noTasksInProject: "No tasks in this project yet",
    conversationsListFailed: "Couldn't load conversations",
    conversationsListFailedHint:
      "Check server logs. If you upgraded the app recently, run the SQL in drizzle/0004_projects.sql on your MySQL database.",
    retryLoad: "Retry",
  },
};

// ---- Model Selector ----
function ModelSelector({
  selectedModel,
  onSelect,
  compact,
}: {
  selectedModel: string;
  onSelect: (modelId: string) => void;
  compact?: boolean;
}) {
  const { models, loading } = useModels();
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (open && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      const dropdownWidth = 256; // w-64
      let left = rect.left;
      if (left + dropdownWidth > window.innerWidth - 8) {
        left = Math.max(8, window.innerWidth - dropdownWidth - 8);
      }
      if (left < 8) left = 8;
      setPosition({ top: rect.bottom + 4, left });
    }
  }, [open]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        !open ||
        (triggerRef.current?.contains(target) || dropdownRef.current?.contains(target))
      ) {
        return;
      }
      setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const currentModel = models.find((m) => m.id === selectedModel);

  if (loading) {
    return (
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Loader2 className="size-3 animate-spin" />
      </div>
    );
  }

  const dropdownContent = open && (
    <div
      ref={dropdownRef}
      className="fixed w-64 bg-popover text-popover-foreground border border-border rounded-lg shadow-xl z-[9999] overflow-hidden"
      style={{ top: position.top, left: position.left }}
    >
      <div className="p-1.5 max-h-64 overflow-y-auto">
        {models.map((model) => (
          <button
            key={model.id}
            onClick={() => {
              onSelect(model.id);
              setOpen(false);
            }}
            className={cn(
              "w-full flex items-start gap-2.5 rounded-md px-2.5 py-2 text-left transition-colors",
              model.id === selectedModel ? "bg-accent text-accent-foreground" : "hover:bg-accent/50"
            )}
          >
            <Zap className="size-3.5 mt-0.5 shrink-0 text-primary" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-medium">{model.name}</span>
                {model.id === selectedModel && <Check className="size-3 text-primary shrink-0" />}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">{model.description}</p>
            </div>
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        onClick={() => setOpen(!open)}
        className={cn(
          "flex items-center gap-1.5 rounded-md transition-colors text-muted-foreground hover:text-foreground",
          compact
            ? "text-xs px-2.5 py-1.5 rounded-lg hover:bg-muted/60"
            : "text-sm px-3 py-2 rounded-lg border border-border/70 bg-background hover:bg-muted/60"
        )}
      >
        <Zap className="size-3" />
        <span className="truncate max-w-[120px]">{currentModel?.name || selectedModel}</span>
        <ChevronDown className={cn("size-3 transition-transform", open && "rotate-180")} />
      </button>
      {dropdownContent && createPortal(dropdownContent, document.body)}
    </div>
  );
}

// ---- Artifact Viewer with Controls ----
function ArtifactViewerWithControls({ 
  artifact, 
  onClose,
  onArtifactUpdate,
  onAnalysisComplete,
  onViewResult,
  onBack,
  hasResult,
  returnToPage,
  onReturnToPageComplete,
  onRegenerateStart,
  onRegenerateComplete,
  onRegenerateEnd,
  onAddStatusMessage,
  conversationId,
  uploadFile,
  onDelete,
  onAssessmentReportCreated,
  allArtifacts,
}: { 
  artifact: ArtifactInfo; 
  onClose: () => void;
  onArtifactUpdate?: (artifactId: number, content: string) => void;
  /** 分析完成时添加新 artifact 到列表（ImageJ / Deep-Worm-Tracker），fromPage 为当前所在页（用于返回时定位） */
  onAnalysisComplete?: (newArtifact: ArtifactInfo, fromPage?: number) => void;
  /** 从 Project Plan 点击「查看结果」时跳转 */
  onViewResult?: (artifactTitle: string, fromPage?: number) => void;
  /** 返回上一页面（列表或实验方案等） */
  onBack?: () => void;
  /** 是否已生成该步骤的结果（有结果时才显示「查看结果」按钮） */
  hasResult?: (artifactTitle: string) => boolean;
  /** 返回 Project Plan 时要跳转到的页码（由父组件在 onViewResult 时记录） */
  returnToPage?: number | null;
  /** 完成跳转到指定页后的回调（用于清除 returnToPage） */
  onReturnToPageComplete?: () => void;
  /** 点击「根据填写内容重新生成方案」时的即时反馈 */
  onRegenerateStart?: () => void;
  /** 问卷填写后重新生成方案完成时的回调 */
  onRegenerateComplete?: (artifact: { id: number; type: string; title: string; content: string }) => void;
  /** 问卷重新生成结束（成功或失败）时的回调，用于清除任务列表的「工作中」标记 */
  onRegenerateEnd?: () => void;
  /** 将进度/状态消息添加到智能体对话框（如「正在使用 Neorual 分析...」） */
  onAddStatusMessage?: (message: string) => void;
  conversationId?: string | null;
  uploadFile?: (file: File, conversationId?: string | null) => Promise<any>;
  /** 删除当前 artifact */
  onDelete?: (artifact: ArtifactInfo) => void;
  /** 生成评估报告后，将新 artifact 加入列表并选中 */
  onAssessmentReportCreated?: (artifact: ArtifactInfo) => void;
  /** 同会话下所有 artifacts，用于从 project_plan 获取图像分辨率以在分析结果中换算 px→μm */
  allArtifacts?: ArtifactInfo[];
}) {
  const projectPlanViewerRef = useRef<ProjectPlanViewerRef>(null);
  const updateArtifactMut = trpc.conversations.artifacts.update.useMutation();
  const createReportMut = trpc.conversations.artifacts.createAssessmentReport.useMutation();

  const handleGenerateReport = useCallback(async (planContent?: string) => {
    if (!conversationId) {
      toast.error("无法生成报告：缺少会话 ID");
      return;
    }
    let imageResolutionUmPerPx: number | undefined;
    if (planContent) {
      try {
        const plan = JSON.parse(planContent) as { imageResolutionUmPerPx?: number };
        if (typeof plan.imageResolutionUmPerPx === "number" && plan.imageResolutionUmPerPx > 0) {
          imageResolutionUmPerPx = plan.imageResolutionUmPerPx;
        }
      } catch {
        /* ignore */
      }
    }
    try {
      const result = await createReportMut.mutateAsync({
        uniqueId: conversationId,
        imageResolutionUmPerPx,
      });
      const newArtifact: ArtifactInfo = {
        id: result.id,
        type: "assessment_report",
        title: result.title,
        content: result.content,
        language: (result as { language?: string }).language,
      };
      onAssessmentReportCreated?.(newArtifact);
      toast.success("评估报告已生成");
    } catch (e: unknown) {
      console.error("Failed to create assessment report:", e);
      const msg =
        e && typeof e === "object" && "message" in e && typeof (e as { message: unknown }).message === "string"
          ? (e as { message: string }).message
          : "生成评估报告失败，请重试";
      toast.error(msg);
    }
  }, [conversationId, createReportMut, onAssessmentReportCreated]);

  // 从结果页返回时，跳转到对应步骤所在页
  useEffect(() => {
    if (artifact.type === "project_plan" && returnToPage != null) {
      const t = setTimeout(() => {
        projectPlanViewerRef.current?.goToPage(returnToPage);
        onReturnToPageComplete?.();
      }, 0);
      return () => clearTimeout(t);
    }
  }, [artifact.type, returnToPage, onReturnToPageComplete]);

  const handleUpdate = async (updatedContent: string) => {
    if (!artifact.id) {
      toast.error("无法更新：缺少 artifact ID");
      return;
    }
    try {
      await updateArtifactMut.mutateAsync({
        artifactId: artifact.id,
        content: updatedContent,
      });
      // 更新本地状态
      onArtifactUpdate?.(artifact.id, updatedContent);
      toast.success("项目方案已保存");
    } catch (error) {
      console.error("Failed to update artifact:", error);
      toast.error("保存失败，请重试");
    }
  };

  const utils = trpc.useUtils();
  const handleFileUpload = async (
    file: File,
    stepIndex: number,
    dayIndex: number,
    reminderType?: "upload_image" | "upload_video" | "upload_data" | "upload_both" | "upload_video_both" | "upload_media" | "upload_result" | "upload_record",
    triggerImageJ?: boolean,
    imageJOptions?: { analysis_type?: string; rolling_radius?: number; run_tracking?: boolean },
    triggerDeepWormTracker?: boolean,
    triggerNeorualTool?: "vit_classification" | "bead_segmentation" | "cellbody_segmentation" | "dendrite_detection",
    concentrationGroup?: string,
    stepText?: string
  ): Promise<{ fileName: string; fileUrl: string; mimeType?: string } | null> => {
    if (!uploadFile) {
      toast.error("文件上传功能不可用");
      return null;
    }
    try {
      // 项目方案步骤上传：不添加到聊天输入框的待发送附件，仅上传并触发 ImageJ 分析
      const uploaded = await uploadFile(file, conversationId, false);
      if (!uploaded?.fileUrl) return null;

      // 仅当步骤涉及定量分析时调用分析工具
      const isImageStep =
        reminderType === "upload_image" || reminderType === "upload_both";
      const isVideoStep =
        reminderType === "upload_video" || reminderType === "upload_video_both" || reminderType === "upload_media";
      // upload_record / upload_data 若带 trigger，也支持上传视频/图片触发自动分析
      const isRecordWithMediaTrigger =
        reminderType === "upload_record" && (triggerImageJ || triggerDeepWormTracker);
      const isDataWithMediaTrigger =
        reminderType === "upload_data" && (triggerImageJ || triggerDeepWormTracker);
      const isImageFile = /^image\//i.test(file.type);
      const isVideoFile = /^video\//i.test(file.type);
      const canAnalyzeByType =
        (isImageStep && isImageFile) ||
        (isVideoStep && (isImageFile || isVideoFile)) ||
        ((isRecordWithMediaTrigger || isDataWithMediaTrigger) && (isImageFile || isVideoFile));

      // Neorual 线虫显微分析（ViT/串珠/细胞体）：优先于 ImageJ
      const shouldAnalyzeNeorual =
        canAnalyzeByType && isImageFile && !!triggerNeorualTool;
      // Deep-Worm-Tracker：多虫、长时程、复杂场景下的视频追踪（与 wrMTrck 二选一）
      const shouldAnalyzeDeepWormTracker =
        canAnalyzeByType && isVideoFile && triggerDeepWormTracker === true;
      // ImageJ wrMTrck：游泳/摆动计数、路径长度、速度等基础运动指标；图像分析
      const shouldAnalyzeImageJ =
        canAnalyzeByType && triggerImageJ === true && !shouldAnalyzeNeorual && !shouldAnalyzeDeepWormTracker;

      const neorualTitles: Record<string, string> = {
        vit_classification: "ViT 神经元形态分类结果",
        bead_segmentation: "串珠分割结果",
        cellbody_segmentation: "细胞体实例分割结果",
        dendrite_detection: "树突检测结果",
      };
      const neorualEndpoints: Record<string, string> = {
        vit_classification: "/api/agent/analyze-nematode-vit",
        bead_segmentation: "/api/agent/analyze-nematode-bead",
        cellbody_segmentation: "/api/agent/analyze-nematode-cellbody",
        dendrite_detection: "/api/agent/analyze-nematode-dendrite",
      };

      if (shouldAnalyzeNeorual && triggerNeorualTool) {
        const title = neorualTitles[triggerNeorualTool];
        const endpoint = neorualEndpoints[triggerNeorualTool];
        const statusStart = "正在使用 Neorual 分析线虫图像...";
        toast.loading(statusStart, { id: "neorual" });
        onAddStatusMessage?.(statusStart);
        try {
          const base = window.location.origin;
          const res = await fetch(`${base}${endpoint}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              fileUrl: uploaded.fileUrl,
              conversationId: conversationId ?? undefined,
              concentrationGroup: concentrationGroup ?? undefined,
            }),
          });
          const data = await res.json();
          toast.dismiss("neorual");
          if (data.success) {
            const statusDone = `${title}已完成，结果已保存`;
            toast.success(statusDone);
            onAddStatusMessage?.(statusDone);
            if (conversationId) {
              utils.conversations.get.invalidate({ uniqueId: conversationId });
            }
            if (data.result && onAnalysisComplete) {
              // 直接使用脚本生成的图片，以 analysis_result 展示（避免 base64 被当作文本）
              const ar = data.analysisResult as { summary: string; images: string[] } | undefined;
              let payload: { type: "analysis_result" | "markdown"; content: string };
              if (ar?.images?.length) {
                payload = { type: "analysis_result", content: JSON.stringify(ar) };
              } else {
                const parsed = parseNeorualMarkdown(data.result);
                if (parsed?.images?.length) {
                  payload = { type: "analysis_result", content: JSON.stringify(parsed) };
                } else {
                  payload = { type: "markdown", content: data.result };
                }
              }
              const displayTitle = concentrationGroup?.trim()
                ? `${title} (${concentrationGroup.trim()})`
                : title;
              onAnalysisComplete(
                {
                  id: data.artifactId ?? -Date.now(),
                  ...payload,
                  title: displayTitle,
                },
                dayIndex + 1
              );
            }
          } else {
            const errMsg = data.error || `${title}分析失败`;
            toast.error(errMsg);
            onAddStatusMessage?.(errMsg);
          }
        } catch (err) {
          toast.dismiss("neorual");
          const errMsg = "Neorual 分析请求失败，请确保 NEORUAL_ANALYSIS_ROOT 已配置且 Python 环境正确";
          toast.error(errMsg);
          onAddStatusMessage?.(errMsg);
          console.error("[Neorual] Analyze failed:", err);
        }
      } else if (shouldAnalyzeDeepWormTracker) {
        const statusStart = "正在使用 Deep-Worm-Tracker 分析线虫视频...";
        toast.loading(statusStart, { id: "deepworm" });
        onAddStatusMessage?.(statusStart);
        try {
          const base = window.location.origin;
          const res = await fetch(`${base}/api/agent/analyze-nematode-video-tracking`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              fileUrl: uploaded.fileUrl,
              conversationId: conversationId ?? undefined,
            }),
          });
          const data = await res.json();
          toast.dismiss("deepworm");
          if (data.success) {
            const statusDone = "Deep-Worm-Tracker 线虫视频追踪完成，结果已保存";
            toast.success(statusDone);
            onAddStatusMessage?.(statusDone);
            if (conversationId) {
              utils.conversations.get.invalidate({ uniqueId: conversationId });
            }
            if (data.result && onAnalysisComplete) {
              onAnalysisComplete(
                {
                  id: data.artifactId ?? -Date.now(),
                  type: "markdown",
                  title: "Deep-Worm-Tracker 线虫视频追踪结果",
                  content: data.result,
                },
                dayIndex + 1
              );
            }
          } else {
            const errMsg = data.error || "Deep-Worm-Tracker 分析失败";
            toast.error(errMsg);
            onAddStatusMessage?.(errMsg);
          }
        } catch (err) {
          toast.dismiss("deepworm");
          const errMsg = "Deep-Worm-Tracker 请求失败，请确保服务已启动";
          toast.error(errMsg);
          onAddStatusMessage?.(errMsg);
          console.error("[Deep-Worm-Tracker] Analyze failed:", err);
        }
      } else if (shouldAnalyzeImageJ) {
        const mediaType = isVideoFile ? "视频" : "图像";
        const statusStart = `正在使用 ImageJ 分析线虫${mediaType}...`;
        toast.loading(statusStart, { id: "imagej" });
        onAddStatusMessage?.(statusStart);
        try {
          const base = window.location.origin;
          // 视频分析需 run_tracking: true 以触发 wrMTrck
          const opts = isVideoFile ? { ...imageJOptions, run_tracking: true } : imageJOptions;
          const condition = stepText?.includes("线虫在食物中") ? "on_food" : stepText?.includes("线虫不在食物中") ? "off_food" : undefined;
          const res = await fetch(`${base}/api/agent/analyze-nematode-image`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              fileUrl: uploaded.fileUrl,
              conversationId: conversationId ?? undefined,
              options: opts,
              dayIndex,
              concentrationGroup: concentrationGroup ?? undefined,
              condition,
            }),
          });
          const data = await res.json();
          toast.dismiss("imagej");
          if (data.success) {
            const statusDone = "ImageJ 线虫分析完成，结果已保存";
            toast.success(statusDone);
            onAddStatusMessage?.(statusDone);
            if (conversationId) {
              utils.conversations.get.invalidate({ uniqueId: conversationId });
            }
            if (data.result && onAnalysisComplete) {
              const displayTitle = concentrationGroup?.trim()
                ? `ImageJ 线虫图像分析结果 (${concentrationGroup.trim()})`
                : "ImageJ 线虫图像分析结果";
              onAnalysisComplete(
                {
                  id: data.artifactId ?? -Date.now(),
                  type: "markdown",
                  title: displayTitle,
                  content: data.result,
                },
                dayIndex + 1
              );
            }
          } else {
            const errMsg = data.error || "ImageJ 分析失败";
            toast.error(errMsg);
            onAddStatusMessage?.(errMsg);
          }
        } catch (err) {
          toast.dismiss("imagej");
          const errMsg = "ImageJ 分析请求失败，请确保 ImageJ 服务已启动";
          toast.error(errMsg);
          onAddStatusMessage?.(errMsg);
          console.error("[ImageJ] Analyze failed:", err);
        }
      }
      return { fileName: uploaded.fileName, fileUrl: uploaded.fileUrl, mimeType: uploaded.mimeType };
    } catch (error) {
      throw error;
    }
  };

  const imageResolutionUmPerPx = (() => {
    const plan = allArtifacts?.find((a) => a.type === "project_plan");
    if (!plan?.content) return undefined;
    try {
      const p = JSON.parse(plan.content) as { imageResolutionUmPerPx?: number };
      return typeof p.imageResolutionUmPerPx === "number" && p.imageResolutionUmPerPx > 0
        ? p.imageResolutionUmPerPx
        : undefined;
    } catch {
      return undefined;
    }
  })();

  const { concentrationGroups: concentrationGroupsFromQuestionnaire, concentrationCount: concentrationCountFromQuestionnaire } = (() => {
    const empty = { concentrationGroups: undefined as string[] | undefined, concentrationCount: undefined as number | undefined };
    if (artifact.type !== "project_plan" || !allArtifacts) return empty;
    const questionnaire = allArtifacts.find((a) => a.type === "experiment_questionnaire");
    if (!questionnaire?.content) return empty;
    try {
      const data = JSON.parse(questionnaire.content) as { answers?: Record<string, string> };
      const countStr = data.answers?.concentration_count?.trim();
      const valuesStr = data.answers?.concentration_values?.trim();
      const n = Math.min(Math.max(0, parseInt(countStr || "0", 10) || 0), 20);
      if (valuesStr) {
        const parts = valuesStr.split(/[,，、;；\s]+/).map((s) => s.trim()).filter(Boolean);
        if (parts.length > 0) {
          const groups = n > 0 ? parts.slice(0, n) : parts;
          return { concentrationGroups: groups, concentrationCount: n > 0 ? n : undefined };
        }
      }
      if (n > 0) {
        return {
          concentrationGroups: Array.from({ length: n }, (_, i) => `浓度${i + 1}`),
          concentrationCount: n,
        };
      }
    } catch {
      /* ignore */
    }
    return empty;
  })();

  return (
    <>
      <ArtifactViewer
        artifact={artifact}
        onClose={onClose}
        onDelete={onDelete}
        projectPlanControlsRef={projectPlanViewerRef}
        onUpdate={artifact.type === "project_plan" || artifact.type === "experiment_questionnaire" ? handleUpdate : undefined}
        onFileUpload={artifact.type === "project_plan" ? handleFileUpload : undefined}
        conversationId={artifact.type === "project_plan" || artifact.type === "experiment_questionnaire" ? conversationId : undefined}
        onViewResult={artifact.type === "project_plan" ? onViewResult : undefined}
        hasResult={artifact.type === "project_plan" ? hasResult : undefined}
        onGenerateReport={artifact.type === "project_plan" ? handleGenerateReport : undefined}
        onBack={artifact.type !== "project_plan" ? onBack : undefined}
        onRegenerateStart={onRegenerateStart}
        onRegenerateComplete={onRegenerateComplete}
        onRegenerateEnd={onRegenerateEnd}
        imageResolutionUmPerPx={imageResolutionUmPerPx}
        concentrationGroupsFromQuestionnaire={concentrationGroupsFromQuestionnaire}
        concentrationCountFromQuestionnaire={concentrationCountFromQuestionnaire}
      />
      {/* Media controls at bottom - only show for project_plan artifacts */}
      {artifact.type === "project_plan" && (
        <div className="px-4 py-3 border-t border-border flex items-center justify-center gap-4 shrink-0">
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            title="第一页"
            onClick={() => projectPlanViewerRef.current?.goToFirstPage()}
          >
            <SkipBack className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            title="上一页"
            onClick={() => projectPlanViewerRef.current?.goToPreviousPage()}
          >
            <Play className="size-4 rotate-180" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            title="下一页"
            onClick={() => projectPlanViewerRef.current?.goToNextPage()}
          >
            <Play className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            title="最后一页"
            onClick={() => projectPlanViewerRef.current?.goToLastPage()}
          >
            <SkipForward className="size-4" />
          </Button>
        </div>
      )}
    </>
  );
}

/** 将 summary 中的 "X px" 转为 "Y μm"、"X px²" 转为 "Y μm²" */
function convertSummaryUnits(summary: string, resolutionUmPerPx: number): string {
  return summary
    .replace(/(\d+\.?\d*)\s*px²/g, (_, n) => `${(parseFloat(n) * resolutionUmPerPx * resolutionUmPerPx).toFixed(6)} μm²`)
    .replace(/(\d+\.?\d*)\s*px\b/g, (_, n) => `${(parseFloat(n) * resolutionUmPerPx).toFixed(6)} μm`);
}

// ---- Analysis Result Viewer（直接显示脚本生成的图片，不依赖 markdown） ----
function AnalysisResultViewer({ content, title, imageResolutionUmPerPx }: { content: string; title: string; imageResolutionUmPerPx?: number }) {
  let data: { summary: string; images: string[] } | null = null;
  try {
    const parsed = JSON.parse(content) as { summary?: string; images?: string[] };
    if (parsed && Array.isArray(parsed.images) && parsed.images.length > 0) {
      data = { summary: parsed.summary || "", images: parsed.images };
    }
  } catch {
    data = parseNeorualMarkdown(content);
  }
  // 兜底：内容为纯 base64 或 data URL 时直接当图片显示
  if (!data && content && content.length > 200) {
    const clean = content.replace(/\s/g, "");
    if (content.startsWith("data:image")) {
      data = { summary: "", images: [content] };
    } else if (/^[A-Za-z0-9+/=]+$/.test(clean)) {
      data = { summary: "", images: [`data:image/png;base64,${clean}`] };
    }
  }
  if (!data || !data.images?.length) {
    return (
      <div className="p-4 text-sm text-muted-foreground">
        无法解析分析结果
      </div>
    );
  }
  const { summary, images } = data;
  let displaySummary = imageResolutionUmPerPx ? convertSummaryUnits(summary, imageResolutionUmPerPx) : summary;
  const conversionNote = "<small style=\"font-size:0.8em;color:var(--muted-foreground)\">已按分辨率将 px、px² 换算为 μm、μm²</small>";
  if (imageResolutionUmPerPx && displaySummary) {
    for (const suffix of ["每个检测到的树突已用边界框标注。", "每个检测到的细胞体已标注。"]) {
      if (displaySummary.includes(suffix)) {
        displaySummary = displaySummary.replace(suffix, `${conversionNote}\n\n${suffix}`);
        break;
      }
    }
  }
  return (
    <div className="p-4 flex flex-col gap-4 overflow-auto">
      {displaySummary && (
        <div className="prose prose-sm prose-invert max-w-none text-foreground">
          <Streamdown>{displaySummary}</Streamdown>
        </div>
      )}
      {images?.length > 0 && (
        <div className="grid gap-4">
          {images.map((img, i) => (
              <div key={i} className="rounded-lg overflow-hidden border border-border bg-muted/30 relative group">
                <TransformWrapper
                  initialScale={1}
                  minScale={0.5}
                  maxScale={5}
                  centerOnInit
                  doubleClick={{ mode: "reset" }}
                  wheel={{ step: 0.1 }}
                  pinch={{ step: 5 }}
                >
                  {({ zoomIn, zoomOut, resetTransform }) => (
                    <>
                      <div className="absolute top-2 right-2 z-10 flex gap-1 opacity-80 group-hover:opacity-100 transition-opacity">
                        <Button
                          size="icon"
                          variant="secondary"
                          className="size-8"
                          onClick={() => zoomIn()}
                          title="放大"
                        >
                          <ZoomIn className="size-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="secondary"
                          className="size-8"
                          onClick={() => zoomOut()}
                          title="缩小"
                        >
                          <ZoomOut className="size-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="secondary"
                          className="size-8"
                          onClick={() => resetTransform()}
                          title="重置"
                        >
                          <Maximize2 className="size-4" />
                        </Button>
                      </div>
                      <TransformComponent
                        wrapperStyle={{ width: "100%", height: "480px" }}
                        contentStyle={{ display: "flex", alignItems: "center", justifyContent: "center" }}
                      >
                        <NeorualResultImage
                          rawSrc={img}
                          alt={`结果图 ${i + 1}`}
                          className="max-w-full max-h-[480px] object-contain select-none"
                          draggable={false}
                        />
                      </TransformComponent>
                    </>
                  )}
                </TransformWrapper>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}

// ---- Artifact Viewer ----
function ArtifactViewer({ 
  artifact, 
  onClose,
  onDelete,
  projectPlanControlsRef,
  onUpdate,
  onFileUpload,
  onViewResult,
  hasResult,
  onGenerateReport,
  onBack,
  onRegenerateStart,
  onRegenerateComplete,
  onRegenerateEnd,
  conversationId,
  imageResolutionUmPerPx,
  concentrationGroupsFromQuestionnaire,
  concentrationCountFromQuestionnaire,
}: { 
  artifact: ArtifactInfo; 
  onClose: () => void;
  onDelete?: (artifact: ArtifactInfo) => void;
  projectPlanControlsRef?: React.RefObject<ProjectPlanViewerRef>;
  onUpdate?: (updatedContent: string) => void;
  onViewResult?: (artifactTitle: string) => void;
  hasResult?: (artifactTitle: string) => boolean;
  onGenerateReport?: (planContent?: string) => Promise<void>;
  onBack?: () => void;
  onRegenerateStart?: () => void;
  onRegenerateComplete?: (artifact: { id: number; type: string; title: string; content: string }) => void;
  onRegenerateEnd?: () => void;
  onFileUpload?: (
    file: File,
    stepIndex: number,
    dayIndex: number,
    reminderType?: ProjectPlanUploadReminderType,
    triggerImageJ?: boolean,
    imageJOptions?: { analysis_type?: string; rolling_radius?: number; run_tracking?: boolean },
    triggerDeepWormTracker?: boolean,
    triggerNeorualTool?: "vit_classification" | "bead_segmentation" | "cellbody_segmentation" | "dendrite_detection",
    triggerAuddit?: boolean
  ) => Promise<{ fileName: string; fileUrl: string; mimeType?: string } | null>;
  conversationId?: string | null;
  /** 图像分辨率 μm/px，用于在分析结果中换算 px→μm */
  imageResolutionUmPerPx?: number;
  /** 当方案中无 concentrationGroups 时，从问卷解析的浓度组别作为备用 */
  concentrationGroupsFromQuestionnaire?: string[];
  /** 问卷中的浓度梯度数量，用于限制显示的组别数量 */
  concentrationCountFromQuestionnaire?: number;
}) {
  const [activeTab, setActiveTab] = useState<"preview" | "code">(
    artifact.type === "html" ? "preview" : "code"
  );
  // 使用父组件传递的ref，如果没有则创建本地ref
  const localProjectPlanViewerRef = useRef<ProjectPlanViewerRef>(null);
  const projectPlanViewerRef = projectPlanControlsRef || localProjectPlanViewerRef;

  return (
    <div className="flex flex-col h-full bg-card">
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-border/60 bg-card/95">
        <div className="flex items-center gap-2 min-w-0">
          {artifact.type === "code" && <Code2 className="size-4 text-primary shrink-0" />}
          {artifact.type === "html" && <FileText className="size-4 text-primary shrink-0" />}
          {artifact.type === "chart" && <Sparkles className="size-4 text-primary shrink-0" />}
          {(artifact.type === "markdown" || artifact.type === "document") && (
            <FileText className="size-4 text-primary shrink-0" />
          )}
          {artifact.type === "project_plan" && <BookOpen className="size-4 text-primary shrink-0" />}
          {artifact.type === "experiment_questionnaire" && <FileEdit className="size-4 text-primary shrink-0" />}
          {artifact.type === "analysis_result" && <Sparkles className="size-4 text-primary shrink-0" />}
          {artifact.type === "assessment_report" && <BarChart3 className="size-4 text-primary shrink-0" />}
          <span className="text-sm font-medium truncate">{artifact.title}</span>
          {artifact.language && (
            <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
              {artifact.language}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {artifact.type === "html" && (
            <div className="flex items-center bg-muted rounded-md p-0.5 mr-2">
              <button
                onClick={() => setActiveTab("preview")}
                className={cn(
                  "px-2 py-1 text-xs rounded transition-colors",
                  activeTab === "preview"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                Preview
              </button>
              <button
                onClick={() => setActiveTab("code")}
                className={cn(
                  "px-2 py-1 text-xs rounded transition-colors",
                  activeTab === "code"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                Code
              </button>
            </div>
          )}
          {onBack && (
            <Button variant="ghost" size="icon" className="size-7" onClick={onBack} title="返回上一页面">
              <ArrowLeft className="size-4" />
            </Button>
          )}
          {onDelete && (
            <Button variant="ghost" size="icon" className="size-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10" onClick={() => onDelete(artifact)} title="删除">
              <Trash2 className="size-4" />
            </Button>
          )}
          <Button variant="ghost" size="icon" className="size-7" onClick={onClose}>
            <X className="size-4" />
          </Button>
        </div>
      </div>
      <div className="flex-1 overflow-auto">
        {artifact.type === "project_plan" ? (
          <ProjectPlanViewer
            ref={projectPlanViewerRef}
            content={artifact.content}
            artifactId={artifact.id}
            onUpdate={onUpdate}
            onFileUpload={onFileUpload}
            conversationId={conversationId}
            onViewResult={onViewResult}
            hasResult={hasResult}
            onGenerateReport={onGenerateReport}
            concentrationGroupsFromQuestionnaire={concentrationGroupsFromQuestionnaire}
            concentrationCountFromQuestionnaire={concentrationCountFromQuestionnaire}
          />
        ) : artifact.type === "assessment_report" ? (
          <AssessmentReportViewer content={artifact.content} taskLanguage={artifact.language} />
        ) : artifact.type === "chart" ? (
          <div className="flex items-center justify-center p-4 h-full">
            <img
              src={`data:image/png;base64,${artifact.content}`}
              alt={artifact.title}
              className="max-w-full max-h-full object-contain rounded"
            />
          </div>
        ) : artifact.type === "html" && activeTab === "preview" ? (
          <iframe
            srcDoc={artifact.content}
            className="w-full h-full border-0"
            sandbox="allow-scripts allow-same-origin"
            title={artifact.title}
          />
        ) : artifact.type === "experiment_questionnaire" ? (
          <ExperimentQuestionnaireViewer
            content={artifact.content}
            title={artifact.title}
            artifactId={artifact.id}
            onUpdate={onUpdate}
            conversationUniqueId={conversationId}
            onRegenerateStart={onRegenerateStart}
            onRegenerateComplete={onRegenerateComplete}
            onRegenerateEnd={onRegenerateEnd}
          />
        ) : artifact.type === "analysis_result" ||
          (artifact.type === "markdown" && neorualMarkdownHasResultImages(artifact.content)) ||
          (artifact.content && artifact.content.length > 200 && (
            artifact.content.startsWith("data:image") ||
            (/^[A-Za-z0-9+/=\s]+$/.test(artifact.content) && artifact.content.replace(/\s/g, "").length > 200)
          )) ? (
          <AnalysisResultViewer content={artifact.content} title={artifact.title} imageResolutionUmPerPx={imageResolutionUmPerPx} />
        ) : artifact.type === "markdown" || artifact.type === "document" ? (
          <div className="p-4 prose prose-sm prose-invert max-w-none text-foreground">
            <ScrollableContent>
              <Streamdown>{artifact.content}</Streamdown>
            </ScrollableContent>
          </div>
        ) : (
          <pre className="p-4 text-sm overflow-auto h-full">
            <code>{artifact.content}</code>
          </pre>
        )}
      </div>
    </div>
  );
}

// ---- Category Label Helpers ----
const CATEGORY_CONFIG: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  protocol: { label: "实验方案", icon: <FlaskConical className="size-3" />, color: "text-blue-400" },
  neuron_system: { label: "神经系统", icon: <Brain className="size-3" />, color: "text-purple-400" },
  neuron_types: { label: "神经元类型", icon: <Microscope className="size-3" />, color: "text-pink-400" },
  neurotransmitter: { label: "神经递质", icon: <Activity className="size-3" />, color: "text-green-400" },
  connectome: { label: "连接组", icon: <Database className="size-3" />, color: "text-orange-400" },
  ion_channel: { label: "离子通道", icon: <Zap className="size-3" />, color: "text-yellow-400" },
  cell_description: { label: "细胞描述", icon: <BookMarked className="size-3" />, color: "text-teal-400" },
};

function getCategoryConfig(category: string) {
  return CATEGORY_CONFIG[category] || { label: category, icon: <Database className="size-3" />, color: "text-muted-foreground" };
}

// ---- RAG Retrieval Display ----
function RAGRetrievalDisplay({ msg }: { msg: StreamMessage }) {
  const { language } = useLanguage();
  const t = CHAT_TEXTS[language] ?? CHAT_TEXTS.en;
  const [expanded, setExpanded] = useState(true);
  const ragResult = msg.ragRetrieval;
  if (!ragResult) return null;

  const { hitCount, hits, webHits, categories, durationMs, queryCount, success } = ragResult;

  return (
    <div className="rounded-xl border border-border/60 overflow-hidden text-sm my-1">
      {/* Header - always visible */}
      <button
        onClick={() => setExpanded(!expanded)}
        className={cn(
          "flex items-center gap-2.5 w-full px-4 py-3 text-left transition-colors",
          success
            ? "bg-blue-500/10 text-blue-300 hover:bg-blue-500/15"
            : "bg-muted/30 text-muted-foreground hover:bg-muted/50"
        )}
      >
        <Database className="size-3.5 shrink-0" />
        <span className="font-medium">
          {success
            ? webHits?.length
              ? `检索完成：知识库 ${hits.length} 条 + 网络 ${webHits.length} 条`
              : `知识库检索完成：找到 ${hitCount} 条相关知识`
            : "知识库检索未找到相关结果"}
        </span>
        <div className="flex items-center gap-2 ml-auto text-muted-foreground">
          <span className="flex items-center gap-1">
            <Clock className="size-3" />
            {durationMs}ms
          </span>
          <span>{queryCount} 次查询</span>
          <ChevronRight className={cn("size-3.5 transition-transform", expanded && "rotate-90")} />
        </div>
      </button>

      {/* Expanded content - retrieval details */}
      {expanded && (
        <div className="border-t border-border/50 bg-background/50">
          {/* Category tags */}
          {categories.length > 0 && (
            <div className="px-3 pt-2.5 pb-1.5 flex flex-wrap gap-1.5">
              <span className="text-muted-foreground text-xs mr-1 self-center">检索范围:</span>
              {categories.map((cat) => {
                const config = getCategoryConfig(cat);
                return (
                  <span
                    key={cat}
                    className={cn(
                      "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium border border-border/50",
                      config.color
                    )}
                  >
                    {config.icon}
                    {config.label}
                  </span>
                );
              })}
            </div>
          )}

          {/* Hit cards */}
          {hits.length > 0 && (
            <div className="px-3 pb-3 space-y-2">
              <div className="flex items-center gap-1.5 text-muted-foreground pt-1">
                <ArrowRight className="size-3" />
                <span className="text-xs font-medium">检索命中的知识条目：</span>
              </div>
              {hits.map((hit, i) => {
                const config = getCategoryConfig(hit.category);
                const scorePercent = (hit.score * 100).toFixed(1);
                const scoreColor =
                  hit.score >= 0.7 ? "text-green-400" :
                  hit.score >= 0.5 ? "text-yellow-400" :
                  "text-muted-foreground";

                return (
                  <div
                    key={hit.id || i}
                    className="rounded-md border border-border/40 bg-muted/20 p-2.5 hover:bg-muted/30 transition-colors"
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2">
                        <span className={cn("inline-flex items-center gap-1 text-xs font-medium", config.color)}>
                          {config.icon}
                          {config.label}
                        </span>
                        <span className="text-xs text-muted-foreground">来源: {hit.origin}</span>
                      </div>
                      <span className={cn("text-xs font-mono font-medium", scoreColor)}>
                        {scorePercent}% 相关
                      </span>
                    </div>
                    <p className="text-sm text-foreground/80 leading-relaxed line-clamp-3">
                      {hit.preview}
                    </p>
                  </div>
                );
              })}
            </div>
          )}

          {/* Web search hits */}
          {webHits && webHits.length > 0 && (
            <div className="px-3 pb-3 space-y-2">
              <div className="flex items-center gap-1.5 text-muted-foreground pt-1">
                <Search className="size-3" />
                <span className="text-xs font-medium">网络实时检索:</span>
              </div>
              {webHits.map((hit, i) => (
                <a
                  key={hit.id || i}
                  href={hit.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block rounded-md border border-border/40 bg-muted/20 p-2.5 hover:bg-muted/30 transition-colors"
                >
                  <span className="text-xs font-medium text-primary">{hit.title}</span>
                  {hit.media && <span className="text-xs text-muted-foreground ml-1">({hit.media})</span>}
                  <p className="text-sm text-foreground/80 leading-relaxed line-clamp-2 mt-1">
                    {hit.preview}
                  </p>
                </a>
              ))}
            </div>
          )}

          {/* Empty state */}
          {hits.length === 0 && !(webHits?.length) && (
            <div className="px-3 py-4 text-center text-muted-foreground">
              <Database className="size-6 mx-auto mb-1.5 opacity-30" />
              <p className="text-sm">{t.noRAGRetrieval}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ---- Tool Call Display ----
function ToolCallDisplay({ msg }: { msg: StreamMessage }) {
  const { language } = useLanguage();
  const t = CHAT_TEXTS[language] ?? CHAT_TEXTS.en;
  const toolName = msg.toolCall?.toolName || "";
  const icon =
    toolName === "execute_python" ? <Terminal className="size-3.5" /> :
    toolName === "web_search" ? <Search className="size-3.5" /> :
    toolName === "read_webpage" ? <ExternalLink className="size-3.5" /> :
    <Code2 className="size-3.5" />;

  const label =
    toolName === "execute_python" ? t.runningPython :
    toolName === "web_search" ? `${t.searching}: "${msg.toolCall?.arguments?.query || ""}"` :
    toolName === "read_webpage" ? `${t.reading}: "${msg.toolCall?.arguments?.url || ""}"` :
    toolName === "create_artifact" ? `${t.creating}: ${msg.toolCall?.arguments?.title || "artifact"}` :
    `${t.using} ${toolName}`;

  return (
    <div className="flex items-center gap-2.5 text-xs text-muted-foreground bg-muted/40 rounded-lg px-4 py-2.5 border border-border/50">
      <div className="text-primary">{icon}</div>
      <span>{label}</span>
      <Loader2 className="size-3 animate-spin ml-auto" />
    </div>
  );
}

// ---- Tool Result Display ----
function ToolResultDisplay({ msg }: { msg: StreamMessage }) {
  const { language } = useLanguage();
  const t = CHAT_TEXTS[language] ?? CHAT_TEXTS.en;
  const [expanded, setExpanded] = useState(true);
  const toolResult = msg.toolResult;
  if (!toolResult) return null;

  const isWebPageRead = toolResult.toolName === "read_webpage";
  const isWebSearch = toolResult.toolName === "web_search";
  const icon = isWebPageRead ? <ExternalLink className="size-3.5" /> : 
               isWebSearch ? <Search className="size-3.5" /> : 
               <Code2 className="size-3.5" />;
  
  const title = isWebPageRead ? t.webPageResult :
                isWebSearch ? t.searchResult :
                `${toolResult.toolName} ${t.resultSuffix}`;

  return (
    <div className="rounded-lg border border-border/50 overflow-hidden text-xs">
      <button
        onClick={() => setExpanded(!expanded)}
        className={cn(
          "flex items-center gap-2 w-full px-3 py-2 text-left transition-colors",
          toolResult.success ? "bg-muted/30 text-foreground" : "bg-destructive/10 text-destructive"
        )}
      >
        {icon}
        <span className="font-medium">{title}</span>
        {!toolResult.success && <span className="text-destructive ml-1">({t.failed})</span>}
        <ChevronRight className={cn("size-3.5 transition-transform ml-auto", expanded && "rotate-90")} />
      </button>
      {expanded && toolResult.output && (
        <div className="border-t border-border/50">
          <div className="p-3 bg-background/50">
            <ScrollableContent>
              <div className="prose prose-sm prose-invert max-w-none text-foreground">
                <Streamdown>{toolResult.output}</Streamdown>
              </div>
            </ScrollableContent>
          </div>
        </div>
      )}
    </div>
  );
}

// ---- Execution Result Display ----
function ExecutionDisplay({ msg }: { msg: StreamMessage }) {
  const { language } = useLanguage();
  const t = CHAT_TEXTS[language] ?? CHAT_TEXTS.en;
  const [expanded, setExpanded] = useState(false);
  const exec = msg.execution;
  if (!exec) return null;

  const hasError = !!exec.stderr;
  const hasOutput = !!exec.stdout;

  return (
    <div className="rounded-lg border border-border/50 overflow-hidden text-xs">
      <button
        onClick={() => setExpanded(!expanded)}
        className={cn(
          "flex items-center gap-2 w-full px-3 py-2 text-left transition-colors",
          hasError ? "bg-destructive/10 text-destructive" : "bg-muted/30 text-green-400"
        )}
      >
        <Terminal className="size-3.5 shrink-0" />
        <span className="font-medium">{hasError ? t.executionError : t.codeExecuted}</span>
        <span className="text-muted-foreground ml-auto">{exec.executionTimeMs}ms</span>
        <ChevronRight className={cn("size-3.5 transition-transform", expanded && "rotate-90")} />
      </button>
      {expanded && (
        <div className="border-t border-border/50">
          {hasOutput && (
            <pre className="p-3 bg-background/50 text-foreground overflow-x-auto whitespace-pre-wrap">
              {exec.stdout}
            </pre>
          )}
          {hasError && (
            <pre className="p-3 bg-destructive/5 text-destructive overflow-x-auto whitespace-pre-wrap">
              {exec.stderr}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}

// ---- File Attachment Display in User Messages ----
function FileAttachmentChips({
  files,
}: {
  files: Array<{ fileName: string; fileUrl: string; mimeType: string }>;
}) {
  if (!files || files.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5 mt-1.5">
      {files.map((f, i) => {
        const isImage = f.mimeType.startsWith("image/");
        return (
          <a
            key={i}
            href={f.fileUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 bg-primary-foreground/10 rounded-md px-2 py-1 text-xs hover:bg-primary-foreground/20 transition-colors"
          >
            {isImage ? <ImageIcon className="size-3" /> : <Paperclip className="size-3" />}
            <span className="truncate max-w-[120px]">{f.fileName}</span>
            <ExternalLink className="size-2.5 opacity-50" />
          </a>
        );
      })}
    </div>
  );
}

// ---- Message Bubble ----
function MessageBubble({
  msg,
  onArtifactClick,
}: {
  msg: StreamMessage;
  onArtifactClick: (artifact: ArtifactInfo) => void;
}) {
  if (msg.type === "rag_retrieval" && msg.ragRetrieval) return <RAGRetrievalDisplay msg={msg} />;
  if (msg.type === "plan" && msg.plan) return <PlanDisplay plan={msg.plan} />;
  if (msg.type === "tool_call") return <ToolCallDisplay msg={msg} />;
  if (msg.type === "execution") return <ExecutionDisplay msg={msg} />;
  if (msg.type === "tool_result") return <ToolResultDisplay msg={msg} />;

  if (msg.type === "artifact" && msg.artifact) {
    return (
      <button
        onClick={() => onArtifactClick(msg.artifact!)}
        className="flex items-center gap-3 bg-primary/10 border border-primary/20 rounded-xl px-4 py-3 text-sm hover:bg-primary/15 hover:border-primary/30 transition-all duration-200 text-left w-full"
      >
        <div className="size-9 rounded-lg bg-primary/20 flex items-center justify-center shrink-0 border border-primary/10">
          {msg.artifact.type === "code" && <Code2 className="size-4 text-primary" />}
          {msg.artifact.type === "html" && <FileText className="size-4 text-primary" />}
          {msg.artifact.type === "chart" && <Sparkles className="size-4 text-primary" />}
          {(msg.artifact.type === "markdown" || msg.artifact.type === "document") && (
            <FileText className="size-4 text-primary" />
          )}
          {msg.artifact.type === "image" && <Sparkles className="size-4 text-primary" />}
          {msg.artifact.type === "project_plan" && <BookOpen className="size-4 text-primary" />}
          {msg.artifact.type === "experiment_questionnaire" && <FileEdit className="size-4 text-primary" />}
          {msg.artifact.type === "analysis_result" && <Sparkles className="size-4 text-primary" />}
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium truncate text-foreground">{msg.artifact.title}</p>
          <p className="text-xs text-muted-foreground">
            {msg.artifact.type}{msg.artifact.language ? ` · ${msg.artifact.language}` : ""}
          </p>
        </div>
        <PanelRightOpen className="size-4 text-muted-foreground ml-auto shrink-0" />
      </button>
    );
  }

  if (msg.type === "error") {
    return (
      <div className="flex items-start gap-2 bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2 text-sm text-destructive">
        <AlertTriangle className="size-4 shrink-0 mt-0.5" />
        <span>{msg.content}</span>
      </div>
    );
  }

  // User message
  if (msg.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] bg-primary text-primary-foreground rounded-2xl rounded-br-md px-4 py-3 shadow-md">
          <p className="text-sm whitespace-pre-wrap leading-relaxed">{msg.content}</p>
          {msg.files && <FileAttachmentChips files={msg.files} />}
        </div>
      </div>
    );
  }

  // Assistant text message
  const { brandName } = useLanguage();
  return (
    <div className="flex items-start gap-3.5">
      <div className="size-8 rounded-xl bg-primary/10 flex items-center justify-center shrink-0 mt-1 border border-primary/10">
        <img src="/LOGO.png" alt={brandName} className="size-4 shrink-0 object-contain" />
      </div>
      <div className="min-w-0 flex-1 max-w-[95%]">
        <div className="prose prose-sm prose-invert max-w-none text-foreground break-words">
          <ScrollableContent>
            <Streamdown>{msg.content || ""}</Streamdown>
          </ScrollableContent>
          {msg.isStreaming && <span className="inline-block w-1.5 h-4 bg-primary ml-0.5 animate-blink rounded-sm" />}
        </div>
      </div>
    </div>
  );
}

// ---- Pending Files Bar ----
function PendingFilesBar({
  files,
  onRemove,
}: {
  files: Array<{ fileName: string; mimeType: string }>;
  onRemove: (index: number) => void;
}) {
  if (files.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5 mb-2">
      {files.map((f, i) => {
        const isImage = f.mimeType.startsWith("image/");
        return (
          <div
            key={i}
            className="flex items-center gap-1.5 bg-muted rounded-md px-2 py-1 text-xs text-foreground"
          >
            {isImage ? <ImageIcon className="size-3 text-primary" /> : <Paperclip className="size-3 text-primary" />}
            <span className="truncate max-w-[120px]">{f.fileName}</span>
            <button onClick={() => onRemove(i)} className="hover:text-destructive transition-colors">
              <X className="size-3" />
            </button>
          </div>
        );
      })}
    </div>
  );
}

// ---- Share Dialog ----
function ShareDialog({
  conversationId,
  onClose,
  texts,
}: {
  conversationId: string;
  onClose: () => void;
  texts: typeof CHAT_TEXTS.en;
}) {
  const [shareToken, setShareToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const createShare = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/agent/share", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uniqueId: conversationId, action: "create" }),
      });
      const data = await res.json();
      if (data.shareToken) {
        setShareToken(data.shareToken);
      }
    } catch {
      toast.error(texts.failedCreate);
    } finally {
      setLoading(false);
    }
  };

  const removeShare = async () => {
    setLoading(true);
    try {
      await fetch("/api/agent/share", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uniqueId: conversationId, action: "remove" }),
      });
      setShareToken(null);
      toast.success(texts.shareLinkRemoved);
    } catch {
      toast.error(texts.failedRemove);
    } finally {
      setLoading(false);
    }
  };

  const shareUrl = shareToken ? `${window.location.origin}/shared/${shareToken}` : "";

  const copyLink = () => {
    navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    toast.success(texts.linkCopied);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-card border border-border/80 rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Share2 className="size-5 text-primary" />
            <h3 className="text-base font-semibold">{texts.shareTitle}</h3>
          </div>
          <Button variant="ghost" size="icon" className="size-7" onClick={onClose}>
            <X className="size-4" />
          </Button>
        </div>

        {!shareToken ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {texts.shareDesc}
            </p>
            <Button onClick={createShare} disabled={loading} className="w-full">
              {loading ? <Loader2 className="size-4 animate-spin mr-2" /> : <Link2 className="size-4 mr-2" />}
              {texts.createShareLink}
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center gap-2 bg-muted rounded-lg p-2.5">
              <Link2 className="size-4 text-primary shrink-0" />
              <span className="text-xs truncate flex-1 text-foreground">{shareUrl}</span>
              <Button variant="ghost" size="icon" className="size-7 shrink-0" onClick={copyLink}>
                {copied ? <Check className="size-3.5 text-green-400" /> : <Copy className="size-3.5" />}
              </Button>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="flex-1" onClick={removeShare} disabled={loading}>
                {texts.removeLink}
              </Button>
              <Button size="sm" className="flex-1" onClick={copyLink}>
                {copied ? texts.copied : texts.copyLink}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ---- Left Navigation Sidebar (Layout from reference) ----
function LeftNavSidebar({
  onNewChat,
  onSelectConversation,
  onOpenSearch,
  onCloseSidebar,
  activeConversationId,
  streamingConversationId,
  regeneratingConversationId,
  projectFilterId,
  onProjectFilterChange,
}: {
  onNewChat: () => void;
  onSelectConversation: (id: string) => void;
  onOpenSearch: () => void;
  onCloseSidebar: () => void;
  activeConversationId: string | null;
  streamingConversationId: string | null;
  regeneratingConversationId: string | null;
  /** null = 显示全部任务；数字 = 仅显示该项目下的任务 */
  projectFilterId: number | null;
  onProjectFilterChange: (projectId: number | null) => void;
}) {
  const [, setLocation] = useLocation();
  const { brandName, language } = useLanguage();
  const t = CHAT_TEXTS[language] ?? CHAT_TEXTS.en;
  const {
    data: convList,
    isLoading: convListLoading,
    isError: convListError,
    refetch: refetchConversations,
  } = trpc.conversations.list.useQuery();
  const { data: projectList, isLoading: projectsLoading } = trpc.projects.list.useQuery();
  const deleteMut = trpc.conversations.delete.useMutation();
  const setProjectMut = trpc.conversations.setProject.useMutation();
  const createProjectMut = trpc.projects.create.useMutation();
  const updateProjectMut = trpc.projects.update.useMutation();
  const deleteProjectMut = trpc.projects.delete.useMutation();
  const utils = trpc.useUtils();

  const [allTasksExpanded, setAllTasksExpanded] = useState(true);
  const [projectDialogOpen, setProjectDialogOpen] = useState(false);
  const [editingProjectId, setEditingProjectId] = useState<number | null>(null);
  const [formName, setFormName] = useState("");
  const [formContext, setFormContext] = useState("");

  const openCreateProject = () => {
    setEditingProjectId(null);
    setFormName("");
    setFormContext("");
    setProjectDialogOpen(true);
  };

  const openEditProject = (p: { id: number; name: string; context: string | null }) => {
    setEditingProjectId(p.id);
    setFormName(p.name);
    setFormContext(p.context ?? "");
    setProjectDialogOpen(true);
  };

  const saveProject = () => {
    const name = formName.trim();
    if (!name) return;
    if (editingProjectId == null) {
      createProjectMut.mutate(
        { name, context: formContext.trim() || undefined },
        {
          onSuccess: (row) => {
            void utils.projects.list.invalidate();
            setProjectDialogOpen(false);
            onProjectFilterChange(row.id);
            toast.success(t.projectSaved);
          },
        }
      );
    } else {
      updateProjectMut.mutate(
        { id: editingProjectId, name, context: formContext.trim() || null },
        {
          onSuccess: () => {
            void utils.projects.list.invalidate();
            setProjectDialogOpen(false);
            toast.success(t.projectSaved);
          },
        }
      );
    }
  };

  const tryDeleteProject = (id: number) => {
    if (!window.confirm(t.deleteProjectConfirm)) return;
    deleteProjectMut.mutate(
      { id },
      {
        onSuccess: () => {
          void utils.projects.list.invalidate();
          void utils.conversations.list.invalidate();
          if (projectFilterId === id) onProjectFilterChange(null);
          toast.success(t.projectDeleted);
        },
      }
    );
  };

  const visibleConversations = useMemo(() => {
    if (!convList) return [];
    if (projectFilterId === null) return convList;
    return convList.filter((c) => c.projectId === projectFilterId);
  }, [convList, projectFilterId]);

  const moveTaskToProject = (uniqueId: string, pid: number | null) => {
    setProjectMut.mutate(
      { uniqueId, projectId: pid },
      { onSuccess: () => void utils.conversations.list.invalidate() }
    );
  };

  return (
    <div className="hidden md:flex flex-col h-full w-[15%] min-w-[200px] shrink-0 agent-left-sidebar text-foreground">
      <div className="px-3 pt-4 pb-2 flex items-center justify-between gap-2">
        <button
          onClick={() => setLocation("/")}
          className="flex items-center gap-2.5 flex-1 min-w-0 rounded-lg px-2 py-2 text-left hover:bg-muted/60 transition-all duration-200 group"
        >
          <img src="/LOGO.png" alt={brandName} className="size-7 shrink-0 object-contain" />
          <BrandName className="font-semibold text-xl text-foreground group-hover:text-foreground truncate" />
        </button>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={onCloseSidebar}
              className="shrink-0 rounded-lg p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-all duration-200"
              aria-label="Close sidebar"
            >
              <PanelLeftClose className="size-4" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom">{t.closeSidebar}</TooltipContent>
        </Tooltip>
      </div>
      <nav className="flex flex-col gap-0.5 px-3">
        <button
          onClick={onNewChat}
          className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-base text-left text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-all duration-200 w-full"
        >
          <SquarePlus className="size-4" />
          {t.newTask}
        </button>
        <button
          onClick={onOpenSearch}
          className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-base text-left text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-all duration-200 w-full"
        >
          <Search className="size-4" />
          {t.search}
        </button>
        <button
          type="button"
          onClick={() => setLocation("/library")}
          className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-base text-left text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-all duration-200 w-full"
        >
          <BookOpen className="size-4" />
          {t.library}
        </button>
        <button
          onClick={() => setLocation("/settings")}
          className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-base text-left text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-all duration-200 w-full"
        >
          <Settings className="size-4" />
          {t.settings}
        </button>
      </nav>
      <div className="mt-6 px-3 flex-1 flex flex-col min-h-0 overflow-hidden">
        <div className="flex items-center justify-between mb-2 shrink-0">
          <span className="text-base font-semibold text-muted-foreground">{t.projects}</span>
          <button
            type="button"
            onClick={openCreateProject}
            className="rounded-lg p-1.5 hover:bg-muted/60 transition-colors text-muted-foreground hover:text-foreground"
            aria-label={t.createProjectTitle}
          >
            <span className="text-sm font-medium">+</span>
          </button>
        </div>
        <div
          className="space-y-1 max-h-[28vh] overflow-y-auto overflow-x-hidden pr-1 shrink-0 mb-2"
          style={{
            scrollbarWidth: "thin",
            scrollbarColor: "rgba(128, 128, 128, 0.4) transparent",
          }}
        >
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={() => onProjectFilterChange(null)}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-left w-full transition-all duration-200 border-l-2",
                  projectFilterId === null
                    ? "bg-primary/10 text-foreground border-l-primary"
                    : "text-muted-foreground hover:text-foreground border-l-transparent hover:bg-muted/60"
                )}
              >
                <Layers className="size-4 shrink-0" />
                <span className="truncate">{t.allTasksScope}</span>
              </button>
            </TooltipTrigger>
            <TooltipContent side="right" className="max-w-[240px] text-xs leading-snug">
              {t.allTasksScopeHint}
            </TooltipContent>
          </Tooltip>
          {projectsLoading && (
            <div className="flex justify-center py-2">
              <Loader2 className="size-4 animate-spin text-primary" />
            </div>
          )}
          {projectList?.map((p) => (
            <div
              key={p.id}
              className={cn(
                "flex items-stretch gap-0.5 rounded-lg border-l-2 transition-all duration-200",
                projectFilterId === p.id
                  ? "bg-primary/10 border-l-primary"
                  : "border-l-transparent hover:bg-muted/50"
              )}
            >
              <button
                type="button"
                onClick={() => onProjectFilterChange(p.id)}
                className="flex flex-1 min-w-0 items-center gap-2.5 px-3 py-2 text-sm text-left text-foreground"
              >
                <Folder className="size-4 shrink-0 text-muted-foreground" />
                <span className="truncate flex-1 font-medium">{p.name}</span>
                <span className="text-[10px] text-muted-foreground tabular-nums shrink-0">
                  {t.tasksCountTemplate.replace("{count}", String(p.taskCount))}
                </span>
              </button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="shrink-0 px-2 rounded-r-lg text-muted-foreground hover:text-foreground hover:bg-muted/60"
                    aria-label={t.moreActions}
                  >
                    <MoreHorizontal className="size-4" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <DropdownMenuItem onClick={() => openEditProject(p)}>{t.editProjectTitle}</DropdownMenuItem>
                  <DropdownMenuItem variant="destructive" onClick={() => tryDeleteProject(p.id)}>
                    {t.deleteProject}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          ))}
          <button
            type="button"
            onClick={openCreateProject}
            className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-left w-full text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-all duration-200"
          >
            <FolderOpen className="size-4" />
            {t.newProject}
          </button>
        </div>

        <Dialog open={projectDialogOpen} onOpenChange={setProjectDialogOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>{editingProjectId == null ? t.createProjectTitle : t.editProjectTitle}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 py-2">
              <div className="space-y-1.5">
                <Label htmlFor="proj-name">{t.projectNameLabel}</Label>
                <Input
                  id="proj-name"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="Drug-Neuro-Risk-Monitoring-System"
                  maxLength={500}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="proj-ctx">{t.sharedContextLabel}</Label>
                <Textarea
                  id="proj-ctx"
                  value={formContext}
                  onChange={(e) => setFormContext(e.target.value)}
                  placeholder={t.sharedContextHint}
                  className="min-h-[120px] text-sm resize-y"
                  maxLength={32000}
                />
              </div>
            </div>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button type="button" variant="outline" onClick={() => setProjectDialogOpen(false)}>
                {t.dialogCancel}
              </Button>
              <Button
                type="button"
                onClick={saveProject}
                disabled={!formName.trim() || createProjectMut.isPending || updateProjectMut.isPending}
              >
                {t.dialogSave}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <div className="relative flex-1 flex flex-col min-h-0 border-t border-border/40 pt-2">
          <div className="flex items-center justify-between mb-2 shrink-0">
            <button
              type="button"
              onClick={() => setAllTasksExpanded((prev) => !prev)}
              className="flex items-center gap-1.5 text-base font-semibold text-muted-foreground hover:text-foreground transition-colors"
            >
              {t.taskListSection}
              <ChevronDown
                className={cn("size-3 transition-transform duration-200", !allTasksExpanded && "rotate-[-90deg]")}
                aria-hidden
              />
            </button>
            <span className="text-[10px] text-muted-foreground truncate max-w-[100px]" title="">
              {projectFilterId != null
                ? projectList?.find((x) => x.id === projectFilterId)?.name ?? ""
                : ""}
            </span>
          </div>
          {allTasksExpanded && (
            <div
              className="tasks-scroll-container flex-1 overflow-y-auto overflow-x-hidden pr-1 min-h-0"
              style={{
                scrollbarWidth: "thin",
                scrollbarColor: "rgba(128, 128, 128, 0.4) transparent",
              }}
            >
              <div className="space-y-1">
                {convListLoading && !convListError && (
                  <div className="flex justify-center py-6">
                    <Loader2 className="size-5 animate-spin text-primary" />
                  </div>
                )}
                {convListError && (
                  <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-3 space-y-2">
                    <p className="text-xs font-medium text-destructive">{t.conversationsListFailed}</p>
                    <p className="text-[11px] text-muted-foreground leading-snug">
                      {t.conversationsListFailedHint}
                    </p>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8 text-xs"
                      onClick={() => void refetchConversations()}
                    >
                      {t.retryLoad}
                    </Button>
                  </div>
                )}
                {!convListError &&
                  visibleConversations.map((conv) => (
                  <div
                    key={conv.uniqueId}
                    onClick={() => onSelectConversation(conv.uniqueId)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => e.key === "Enter" && onSelectConversation(conv.uniqueId)}
                    className={cn(
                      "flex items-center gap-1 rounded-lg pl-3 pr-1 py-2.5 text-base text-left transition-all duration-200 group cursor-pointer border-l-2",
                      activeConversationId === conv.uniqueId
                        ? "bg-primary/10 text-foreground border-l-primary"
                        : "border-l-transparent hover:bg-muted/60"
                    )}
                  >
                    {(streamingConversationId === conv.uniqueId || regeneratingConversationId === conv.uniqueId) && (
                      <Loader2
                        className="size-3.5 shrink-0 animate-spin text-primary"
                        title={t.thinking}
                        aria-label={t.thinking}
                      />
                    )}
                    <span className="truncate flex-1 min-w-0">{conv.title}</span>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          type="button"
                          onClick={(e) => e.stopPropagation()}
                          className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0 p-1 rounded hover:bg-muted/80"
                          aria-label={t.moreActions}
                        >
                          <MoreHorizontal className="size-3.5 text-muted-foreground" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-52">
                        <DropdownMenuSub>
                          <DropdownMenuSubTrigger>{t.moveToProject}</DropdownMenuSubTrigger>
                          <DropdownMenuSubContent>
                            <DropdownMenuItem
                              onClick={(e) => {
                                e.stopPropagation();
                                moveTaskToProject(conv.uniqueId, null);
                              }}
                            >
                              {t.removeFromProject}
                            </DropdownMenuItem>
                            {projectList?.map((p) => (
                              <DropdownMenuItem
                                key={p.id}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  moveTaskToProject(conv.uniqueId, p.id);
                                }}
                              >
                                {p.name}
                              </DropdownMenuItem>
                            ))}
                          </DropdownMenuSubContent>
                        </DropdownMenuSub>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          variant="destructive"
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteMut.mutate(
                              { uniqueId: conv.uniqueId },
                              { onSuccess: () => utils.conversations.list.invalidate() }
                            );
                          }}
                        >
                          <Trash2 className="size-3.5" />
                          <span className="ml-1">{t.deleteTask}</span>
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                  ))}
                {!convListLoading && !convListError && visibleConversations.length === 0 && (
                  <p className="text-xs text-muted-foreground px-3 py-4 text-center">
                    {projectFilterId != null ? t.noTasksInProject : t.noTasksYet}
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
      <div className="mt-auto p-4 border-t border-border/60 shrink-0">
        <p className="text-[11px] text-muted-foreground text-center leading-relaxed">
          {t.enterGoalHint}
        </p>
      </div>
    </div>
  );
}

// ---- Main Chat Page ----
export default function ChatPage() {
  const { user, loading } = useAuth();
  const [location, setLocation] = useLocation();
  const { brandName, language } = useLanguage();
  const t = CHAT_TEXTS[language] ?? CHAT_TEXTS.en;
  const {
    messages: streamMessages,
    artifacts,
    isRunning,
    status,
    conversationId,
    streamingConversationId,
    sendMessage,
    stopAgent,
    resetState,
    loadConversation,
    addAssistantMessage,
    addArtifactMessage,
    addPlanMessage,
  } = useAgentStream();

  const { selectedModel, setSelectedModel } = useModels();
  const {
    isUploading,
    pendingFiles,
    error: uploadError,
    uploadFile,
    clearPendingFiles,
    removePendingFile,
    clearError: clearUploadError,
  } = useFileUpload();

  const [input, setInput] = useState("");
  const [selectedArtifact, setSelectedArtifact] = useState<ArtifactInfo | null>(null);
  const [lastViewResultFromPage, setLastViewResultFromPage] = useState<number | null>(null);
  const previousViewRef = useRef<ArtifactInfo | null>(null);
  const [showShareDialog, setShowShareDialog] = useState(false);
  const [showSearchModal, setShowSearchModal] = useState(false);
  const [showLeftSidebar, setShowLeftSidebar] = useState(true);
  /** 侧边栏项目筛选；新建任务时若当前无会话，首条消息会创建归属该项目的会话 */
  const [projectFilterId, setProjectFilterId] = useState<number | null>(null);
  const [regeneratingConversationId, setRegeneratingConversationId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const utils = trpc.useUtils();
  const deleteArtifactMut = trpc.conversations.artifacts.delete.useMutation({
    onSuccess: () => {
      if (conversationId) utils.conversations.get.invalidate({ uniqueId: conversationId });
      void utils.conversations.library.invalidate();
    },
  });

  // 本地 artifacts 状态，用于更新
  const [localArtifacts, setLocalArtifacts] = useState<ArtifactInfo[]>(artifacts);
  const prevConvIdRef = useRef<string | null>(null);

  // 同步 artifacts：切换任务时替换为当前任务的 artifacts；同任务内合并本地未保存的 artifact
  // 不在此处清空 selectedArtifact，避免覆盖从 URL ?artifact= 或 handleSelectConversation 刚设置的选中项
  useEffect(() => {
    if (prevConvIdRef.current !== conversationId) {
      prevConvIdRef.current = conversationId ?? null;
      setLocalArtifacts(artifacts);
    } else {
      setLocalArtifacts((prev) => {
        const serverIds = new Set(artifacts.map((a) => a.id));
        const localOnly = prev.filter((a) => !serverIds.has(a.id));
        return [...artifacts, ...localOnly];
      });
    }
  }, [conversationId, artifacts]);

  // 删除 artifact
  const handleDeleteArtifact = useCallback(
    async (art: ArtifactInfo, e?: React.MouseEvent) => {
      e?.stopPropagation();
      if (art.id < 0) {
        setLocalArtifacts((prev) => prev.filter((a) => a.id !== art.id));
        setSelectedArtifact((prev) => (prev?.id === art.id ? null : prev));
        return;
      }
      try {
        await deleteArtifactMut.mutateAsync({ artifactId: art.id });
        setLocalArtifacts((prev) => prev.filter((a) => a.id !== art.id));
        setSelectedArtifact((prev) => (prev?.id === art.id ? null : prev));
        toast.success("已删除");
      } catch {
        toast.error("删除失败");
      }
    },
    [deleteArtifactMut]
  );

  // 更新 artifact 的处理函数
  const handleArtifactUpdate = useCallback((artifactId: number, content: string) => {
    setLocalArtifacts((prev) =>
      prev.map((art) => (art.id === artifactId ? { ...art, content } : art))
    );
    setSelectedArtifact((prev) =>
      prev && prev.id === artifactId ? { ...prev, content } : prev
    );
  }, []);

  // Show upload error as toast
  useEffect(() => {
    if (uploadError) {
      toast.error(uploadError);
      clearUploadError();
    }
  }, [uploadError, clearUploadError]);

  // Auto-scroll to bottom
  useEffect(() => {
    const el = scrollRef.current;
    if (el) {
      const viewport = el.querySelector("[data-radix-scroll-area-viewport]") as HTMLDivElement;
      const scrollEl = viewport || el;
      requestAnimationFrame(() => {
        scrollEl.scrollTo({ top: scrollEl.scrollHeight, behavior: "smooth" });
      });
    }
  }, [streamMessages]);


  const handleFileSelect = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (!files) return;
      for (let i = 0; i < files.length; i++) {
        await uploadFile(files[i], conversationId);
      }
      e.target.value = "";
    },
    [uploadFile, conversationId]
  );

  const handleSend = useCallback(() => {
    const msg = input.trim();
    if (!msg || isRunning) return;
    setInput("");

    const filesToSend = pendingFiles.length > 0 ? [...pendingFiles] : undefined;
    clearPendingFiles();

    sendMessage(msg, conversationId, selectedModel, filesToSend, {
      projectId: projectFilterId,
    });
    setTimeout(() => utils.conversations.list.invalidate(), 2000);
  }, [
    input,
    isRunning,
    sendMessage,
    conversationId,
    selectedModel,
    pendingFiles,
    clearPendingFiles,
    utils,
    projectFilterId,
  ]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleNewChat = useCallback(() => {
    resetState();
    clearPendingFiles();
    setSelectedArtifact(null);
  }, [resetState, clearPendingFiles]);

  const handleSelectConversation = useCallback(
    async (uniqueId: string, openArtifactId?: number) => {
      const data = await utils.conversations.get.fetch({ uniqueId });
      if (!data) return;

      const msgs: StreamMessage[] = data.messages
        .map((m) => {
          const base = {
            id: `db_${m.id}`,
            role: m.role as StreamMessage["role"],
            type: m.type as StreamMessage["type"],
            content: m.content || "",
            timestamp: new Date(m.createdAt).getTime(),
          };

          // Restore plan data
          if (m.type === "plan") {
            return { ...base, plan: JSON.parse(m.content || "{}") };
          }

          // Restore RAG retrieval data from persisted JSON
          if (m.type === "rag_retrieval") {
            try {
              const ragData = JSON.parse(m.content || "{}");
              return { ...base, ragRetrieval: ragData };
            } catch {
              return base;
            }
          }

          // Restore tool_call data
          if (m.type === "tool_call") {
            try {
              const toolData = JSON.parse(m.content || "{}");
              return { ...base, toolCall: toolData };
            } catch {
              return base;
            }
          }

          // Restore tool_result data
          if (m.type === "tool_result") {
            try {
              const resultData = JSON.parse(m.content || "{}");
              return {
                ...base,
                toolResult: {
                  toolName: resultData.toolName || "unknown",
                  success: resultData.success ?? true,
                  output: typeof resultData === "string" ? resultData : (resultData.output || m.content || ""),
                },
              };
            } catch {
              return {
                ...base,
                toolResult: {
                  toolName: "unknown",
                  success: true,
                  output: m.content || "",
                },
              };
            }
          }

          return base;
        });

      const arts: ArtifactInfo[] = data.artifacts.map((a) => ({
        id: a.id,
        type: a.type as ArtifactInfo["type"],
        title: a.title || "Untitled",
        content: a.content || "",
        language: a.language || undefined,
      }));

      loadConversation(uniqueId, msgs, arts);
      clearPendingFiles();
      if (openArtifactId != null) {
        const target = arts.find((a) => a.id === openArtifactId);
        setSelectedArtifact(target ?? null);
      } else {
        setSelectedArtifact(null);
      }
    },
    [utils, loadConversation, clearPendingFiles]
  );

  const chatUrlSyncKeyRef = useRef<string>("");
  const urlSearchSignature =
    typeof window !== "undefined" ? window.location.search : "";
  useEffect(() => {
    if (loading || !user) return;
    const pathOnly = location.split("?")[0] ?? "";
    const m = pathOnly.match(/^\/chat\/([^/]+)$/);
    if (!m) {
      chatUrlSyncKeyRef.current = "";
      return;
    }
    const routeId = decodeURIComponent(m[1]);
    const sp = new URLSearchParams(urlSearchSignature);
    const aidStr = sp.get("artifact");
    const aid = aidStr ? parseInt(aidStr, 10) : NaN;
    const openAid = Number.isFinite(aid) ? aid : undefined;
    const key = `${routeId}:${openAid ?? ""}`;
    if (chatUrlSyncKeyRef.current === key) return;
    chatUrlSyncKeyRef.current = key;
    void handleSelectConversation(routeId, openAid);
  }, [location, urlSearchSignature, loading, user, handleSelectConversation]);

  const handleExport = useCallback(async () => {
    if (!conversationId) {
      toast.error("No conversation to export");
      return;
    }
    try {
      const res = await fetch(`/api/agent/export/${conversationId}`);
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `conversation-${conversationId}.md`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Conversation exported as Markdown");
    } catch {
      toast.error("Failed to export conversation");
    }
  }, [conversationId]);

  // Loading
  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center agent-page">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="size-10 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  // Not authenticated
  if (!user) {
    return (
      <div className="h-screen flex items-center justify-center agent-page">
        <div className="flex flex-col items-center gap-8 max-w-md text-center px-6">
          <div className="size-20 rounded-2xl bg-primary/10 flex items-center justify-center border border-primary/10">
            <img src="/LOGO.png" alt={brandName} className="size-10 shrink-0 object-contain" />
          </div>
          <div>
            <h1 className="agent-heading text-2xl font-semibold tracking-tight mb-2">Welcome to <BrandName /></h1>
            <p className="text-muted-foreground text-sm leading-relaxed">
              An intelligent AI agent that can plan, code, search, and create for you.
            </p>
          </div>
          <Button onClick={() => (window.location.href = getLoginUrl())} size="lg" className="w-full rounded-xl shadow-md">
            {t.signInToGetStarted}
          </Button>
        </div>
      </div>
    );
  }

  const hasArtifacts = localArtifacts.length > 0;
  const isEmpty = streamMessages.length === 0;
  const hasConversation = !!conversationId;


  return (
    <div className="h-screen flex agent-page overflow-hidden">
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        multiple
        accept=".csv,.txt,.json,.md,.py,.pdf,.png,.jpg,.jpeg,.gif,.webp,.xlsx,.xls"
        onChange={handleFileSelect}
      />

      {/* Share Dialog */}
      {showShareDialog && conversationId && (
        <ShareDialog conversationId={conversationId} onClose={() => setShowShareDialog(false)} texts={t} />
      )}

      {/* Left Navigation Sidebar */}
      {showLeftSidebar ? (
        <LeftNavSidebar
          onNewChat={handleNewChat}
          onSelectConversation={handleSelectConversation}
          onOpenSearch={() => setShowSearchModal(true)}
          onCloseSidebar={() => setShowLeftSidebar(false)}
          activeConversationId={conversationId}
          streamingConversationId={streamingConversationId ?? null}
          regeneratingConversationId={regeneratingConversationId ?? null}
          projectFilterId={projectFilterId}
          onProjectFilterChange={setProjectFilterId}
        />
      ) : (
        <div className="hidden md:flex flex-col shrink-0 w-12 agent-left-sidebar border-r border-border/50">
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() => setShowLeftSidebar(true)}
                className="p-3 text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-all duration-200"
                aria-label="Open sidebar"
              >
                <PanelLeftOpen className="size-5" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">{t.openSidebar}</TooltipContent>
          </Tooltip>
        </div>
      )}

      <SearchTasksModal
        open={showSearchModal}
        onClose={() => setShowSearchModal(false)}
        onSelectConversation={handleSelectConversation}
        onNewTask={handleNewChat}
        texts={t}
      />

      {/* Center: Goal / Requirement + Chat + Input */}
      <div className="flex-1 flex flex-col min-w-0 pl-6 pr-6 py-5">
        {/* Goal / Requirement Card */}
        <div className="flex-1 flex flex-col min-h-0">
          <div className="flex flex-col h-full w-full bg-card rounded-2xl agent-center-card overflow-hidden">
            <div className="px-5 py-3.5 border-b border-border/60 shrink-0 flex items-center justify-between bg-card/95">
              <h2 className="font-panel-title text-base text-foreground flex items-center gap-2.5">
                <span className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Lightbulb className="size-4" />
                </span>
                {t.goalRequirement}
              </h2>
              <div className="flex items-center gap-1">
                <ModelSelector selectedModel={selectedModel} onSelect={setSelectedModel} compact />
                {hasConversation && (
                  <>
                    <Button variant="ghost" size="icon" className="size-8" onClick={handleExport} title={t.export}>
                      <Download className="size-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="size-8" onClick={() => setShowShareDialog(true)} title={t.share}>
                      <Share2 className="size-4" />
                    </Button>
                  </>
                )}
              </div>
            </div>

            {/* Chat Messages Area */}
            <div ref={scrollRef} className="flex-1 overflow-auto min-h-0 min-w-0 chat-messages-scroll">
              {isEmpty ? (
                <div className="flex h-full flex-col items-center justify-center px-8">
                  <h2 className="agent-heading text-2xl md:text-3xl font-semibold text-foreground text-center mb-3">
                    {t.whatCanIDoForYou}
                  </h2>
                  <p className="text-sm text-muted-foreground text-center mb-6">
                    {t.enterQuestionHint}
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-2xl">
                    {t.suggestedPrompts.map((prompt, i) => (
                      <button
                        key={i}
                        onClick={() => {
                          setInput("");
                          sendMessage(prompt, conversationId, selectedModel, undefined, {
                            projectId: projectFilterId,
                          });
                          setTimeout(() => utils.conversations.list.invalidate(), 2000);
                        }}
                        className="text-left text-sm border border-border/60 rounded-xl px-4 py-3.5 hover:bg-accent/80 hover:border-primary/20 transition-all duration-200 text-muted-foreground hover:text-foreground bg-muted/20"
                      >
                        {prompt}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="px-6 py-8 space-y-6 min-w-0 w-full">
                  {streamMessages.map((msg) => (
                      <MessageBubble
                        key={msg.id}
                        msg={msg}
                        onArtifactClick={(art) => {
                          setSelectedArtifact((prev) => {
                            previousViewRef.current = prev;
                            return art;
                          });
                        }}
                      />
                    ))}
                    {isRunning && !streamMessages.some((m) => m.isStreaming) && (
                      <div className="flex items-start gap-3.5">
                        <div className="size-8 rounded-xl bg-primary/10 flex items-center justify-center shrink-0 border border-primary/10">
                          <img src="/LOGO.png" alt={brandName} className="size-4 shrink-0 object-contain" />
                        </div>
                        <div className="flex items-center gap-2.5 text-sm text-muted-foreground py-1">
                          <Loader2 className="size-4 animate-spin text-primary" />
                          <span>{status || t.thinking}</span>
                        </div>
                      </div>
                    )}
                </div>
              )}
            </div>

          </div>
        </div>

        {/* Lower Input Area */}
        <div className="py-5 shrink-0">
          <div className="w-full agent-input-wrapper rounded-2xl border border-border/70 bg-card/80 backdrop-blur-sm p-4">
            <PendingFilesBar files={pendingFiles} onRemove={removePendingFile} />
            <div className="flex gap-3 items-end">
              <Button
                variant="ghost"
                size="icon"
                className="size-11 shrink-0 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading || isRunning}
                title={t.attachFile}
              >
                {isUploading ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Paperclip className="size-4" />
                )}
              </Button>
              <Textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={t.placeholder}
                className="flex-1 min-h-[46px] max-h-32 resize-none bg-background/50 border border-border/50 rounded-xl px-4 py-3 text-sm focus-visible:ring-2 focus-visible:ring-primary/20"
                rows={1}
                disabled={isRunning}
              />
              {isRunning ? (
                <Button onClick={stopAgent} size="icon" variant="destructive" className="size-11 shrink-0 rounded-xl">
                  <Square className="size-4" />
                </Button>
              ) : (
                <Button
                  onClick={handleSend}
                  disabled={!input.trim() && pendingFiles.length === 0}
                  className="size-11 shrink-0 gap-2 rounded-xl shadow-sm"
                  title={t.send}
                >
                  <Send className="size-4" />
                  {t.send}
                </Button>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground/80 mt-3 text-center">
              {t.poweredBy} <BrandName /> {t.verifyInfo}
            </p>
          </div>
        </div>
      </div>

      {/* Right Sidebar: Analysis Results */}
      <div className="flex-[0_0_50%] min-w-[340px] shrink-0 flex flex-col agent-right-sidebar hidden lg:flex">
        <div className="px-5 py-4 border-b border-border/60 shrink-0">
          <h2 className="font-panel-title text-base text-foreground flex items-center gap-2.5">
            <span className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <FileText className="size-4" />
            </span>
            {t.analysisResults}
          </h2>
        </div>
        <div className="flex-1 overflow-hidden flex flex-col min-h-0">
          {localArtifacts.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
              <div className="size-20 rounded-2xl bg-muted/60 flex items-center justify-center mb-5 border border-border/40">
                <FolderOpen className="size-10 text-muted-foreground" />
              </div>
              <p className="text-base font-medium mb-1.5">{t.noAnalysisResults}</p>
              <p className="text-sm text-muted-foreground leading-relaxed max-w-[220px]">
                {t.fillExperimentHint}
              </p>
            </div>
          ) : selectedArtifact ? (
            <ArtifactViewerWithControls
              artifact={selectedArtifact}
              allArtifacts={localArtifacts}
              onClose={() => setSelectedArtifact(null)}
              onArtifactUpdate={handleArtifactUpdate}
              onAnalysisComplete={(art, fromPage) => {
                setLocalArtifacts((prev) => [...prev, art]);
                if (fromPage != null) setLastViewResultFromPage(fromPage);
                setSelectedArtifact((prev) => {
                  previousViewRef.current = prev;
                  return art;
                });
              }}
              onViewResult={(title, fromPage) => {
                setLastViewResultFromPage(fromPage ?? 0);
                const matchImageJ = (a: ArtifactInfo) =>
                  title.startsWith("ImageJ 线虫图像分析结果") &&
                  a.title?.startsWith("ImageJ 线虫图像分析结果") &&
                  (title.includes("(") ? a.title?.includes(title.slice(title.indexOf("("))) : a.title === title);
                const art = localArtifacts.find((a) => a.title === title || matchImageJ(a));
                if (art) {
                  setSelectedArtifact((prev) => {
                    previousViewRef.current = prev;
                    return art;
                  });
                }
              }}
              hasResult={(title) => {
                const matchImageJ = (a: ArtifactInfo) =>
                  title.startsWith("ImageJ 线虫图像分析结果") &&
                  a.title?.startsWith("ImageJ 线虫图像分析结果") &&
                  (title.includes("(") ? a.title?.includes(title.slice(title.indexOf("("))) : a.title === title);
                return localArtifacts.some((a) => a.title === title || matchImageJ(a));
              }}
              onBack={() => {
                const prev = previousViewRef.current;
                setSelectedArtifact(prev ?? null);
              }}
              onRegenerateStart={() => {
                addAssistantMessage(t.onRegenerateStart);
                if (conversationId) setRegeneratingConversationId(conversationId);
              }}
              onRegenerateEnd={() => setRegeneratingConversationId(null)}
              onAddStatusMessage={addAssistantMessage}
              onRegenerateComplete={(artifact) => {
                const updated: ArtifactInfo = {
                  id: artifact.id,
                  type: "project_plan",
                  title: artifact.title,
                  content: artifact.content,
                };
                setLocalArtifacts((prev) => {
                  const idx = prev.findIndex((a) => a.type === "project_plan");
                  if (idx >= 0) return prev.map((a, i) => (i === idx ? updated : a));
                  return [...prev, updated];
                });
                setSelectedArtifact(updated);
                addAssistantMessage("实验方案已生成完毕，请查看右侧「样品检测实验方案」附件。");
                if (conversationId) utils.conversations.get.invalidate({ uniqueId: conversationId });
                // 在对话框中添加可点击的实验方案卡片，点击即可在右侧栏打开
                addArtifactMessage(updated);
                // 添加 to-do 完成可视化
                addPlanMessage({
                  goal: "根据问卷填写内容生成定制化实验方案",
                  steps: [
                    { id: 1, title: "生成定制化实验方案", status: "completed" as const },
                    { id: 2, title: "交付方案给用户", status: "completed" as const },
                  ],
                  currentStepIndex: 1,
                });
              }}
              returnToPage={lastViewResultFromPage}
              onReturnToPageComplete={() => setLastViewResultFromPage(null)}
              conversationId={conversationId}
              uploadFile={uploadFile}
              onDelete={(art) => handleDeleteArtifact(art)}
              onAssessmentReportCreated={(art) => {
                setLocalArtifacts((prev) => [...prev, art]);
                setSelectedArtifact((prev) => {
                  previousViewRef.current = prev;
                  return art;
                });
                if (conversationId) utils.conversations.get.invalidate({ uniqueId: conversationId });
              }}
            />
          ) : (
            <ScrollArea className="flex-1 min-h-0">
              <div className="p-4 space-y-3">
                {(() => {
                  const getGroupKey = (art: ArtifactInfo) => {
                    if (art.type === "assessment_report") return "神经毒性评估报告";
                    if (art.type === "project_plan") return "实验方案";
                    if (art.type === "experiment_questionnaire") return "问卷";
                    if (art.type === "analysis_result" && art.title?.includes(" (")) {
                      return art.title.split(" (")[0].trim();
                    }
                    return art.title || art.type || "其他";
                  };
                  const groups = new Map<string, ArtifactInfo[]>();
                  for (const art of localArtifacts) {
                    const key = getGroupKey(art);
                    if (!groups.has(key)) groups.set(key, []);
                    groups.get(key)!.push(art);
                  }
                  const groupOrder = ["神经毒性评估报告", "实验方案", "问卷"];
                  const sortedKeys = [
                    ...groupOrder.filter((k) => groups.has(k)),
                    ...Array.from(groups.keys()).filter((k) => !groupOrder.includes(k)).sort(),
                  ];
                  const sortByConcentration = (a: ArtifactInfo, b: ArtifactInfo) => {
                    const ma = (a.title || "").match(/\((\d+)\)\s*$/);
                    const mb = (b.title || "").match(/\((\d+)\)\s*$/);
                    const na = ma ? parseInt(ma[1], 10) : 0;
                    const nb = mb ? parseInt(mb[1], 10) : 0;
                    return na - nb;
                  };
                  return sortedKeys.map((groupKey) => {
                    const arts = groups.get(groupKey)!;
                    arts.sort(sortByConcentration);
                    const Icon =
                      arts[0]?.type === "assessment_report"
                        ? BarChart3
                        : arts[0]?.type === "project_plan"
                          ? BookOpen
                          : arts[0]?.type === "experiment_questionnaire"
                            ? FileEdit
                            : arts[0]?.type === "analysis_result"
                              ? Sparkles
                              : FileText;
                    return (
                      <Collapsible key={groupKey} defaultOpen={arts.length <= 3} className="group">
                        <div className="rounded-lg border border-border/70 overflow-hidden bg-card/50">
                          <CollapsibleTrigger asChild>
                            <button
                              type="button"
                              className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-muted/50 transition-colors"
                            >
                              <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-90" />
                              <div className="size-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 border border-primary/10">
                                <Icon className="size-4 text-primary" />
                              </div>
                              <span className="text-sm font-medium flex-1">{groupKey}</span>
                              <span className="text-xs text-muted-foreground">{arts.length} 项</span>
                            </button>
                          </CollapsibleTrigger>
                          <CollapsibleContent>
                            <div className="border-t border-border/50 p-2 space-y-1.5">
                              {arts.map((art) => (
                                <div
                                  key={art.id}
                                  className="group relative flex items-center gap-3 rounded-lg border border-border/50 p-2.5 agent-artifact-card text-left bg-background/60 hover:bg-accent/60 hover:border-primary/20 cursor-pointer"
                                  onClick={() => {
                                    setSelectedArtifact((prev) => {
                                      previousViewRef.current = prev;
                                      return art;
                                    });
                                  }}
                                >
                                  <div className="size-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 border border-primary/10">
                                    {art.type === "analysis_result" && <Sparkles className="size-3.5 text-primary" />}
                                    {art.type === "assessment_report" && <BarChart3 className="size-3.5 text-primary" />}
                                    {art.type === "project_plan" && <BookOpen className="size-3.5 text-primary" />}
                                    {art.type === "experiment_questionnaire" && <FileEdit className="size-3.5 text-primary" />}
                                    {(art.type === "markdown" || art.type === "document") && (
                                      <FileText className="size-3.5 text-primary" />
                                    )}
                                    {!["analysis_result", "assessment_report", "project_plan", "experiment_questionnaire", "markdown", "document"].includes(art.type) && (
                                      <FileText className="size-3.5 text-primary" />
                                    )}
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <p className="text-sm font-medium truncate">{art.title}</p>
                                  </div>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="size-7 shrink-0 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
                                    onClick={(e) => handleDeleteArtifact(art, e)}
                                    disabled={deleteArtifactMut.isPending}
                                    title="删除"
                                  >
                                    <Trash2 className="size-3.5" />
                                  </Button>
                                </div>
                              ))}
                            </div>
                          </CollapsibleContent>
                        </div>
                      </Collapsible>
                    );
                  });
                })()}
              </div>
            </ScrollArea>
          )}
        </div>
      </div>
    </div>
  );
}
