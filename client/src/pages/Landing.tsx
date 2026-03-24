/**
 * NeuroSentinel Landing Page
 * Design: Enterprise Research Platform Aesthetic (DrugRisk-inspired)
 * - Dual-tone: Dark navy hero + white content sections
 * - Double navigation: Info bar + main nav
 * - Statistics bar with counter animation
 * - Services section with alternating left-right layout
 * - Feature cards with dashed borders
 * - Font: Playfair Display (headings) + Lato (body)
 * - Brand color: Blue #4f6ef7
 *
 * NOTE: This page uses its own light-theme styling via inline styles,
 * independent of the app's dark theme.
 */

import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  Brain,
  Microscope,
  Activity,
  Database,
  FlaskConical,
  Search,
  Terminal,
  FileText,
  Zap,
  Mail,
  Phone,
  ExternalLink,
  BookOpen,
  MessageSquarePlus,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { Link } from "wouter";
import { BrandName } from "@/components/BrandName";
import { useLanguage } from "@/contexts/LanguageContext";

// ---- Image URLs ----
// Hero 背景图已下载到本地，避免依赖 CDN 签名过期
const HERO_BG = "/hero-bg.jpg";
// 服务卡片图片已下载到本地，避免依赖 CDN 签名过期
const SERVICE_AI = "/service-ai.jpg";
const SERVICE_ANALYSIS = "/service-analysis.jpg";
const SERVICE_TRACKING = "/service-tracking.jpg";
const SERVICE_KNOWLEDGE = "/service-knowledge.jpg";
// Neuron analysis 专用：3D 神经元渲染图（蓝绿荧光、树突轴突、科技感）
const SERVICE_NEORUAL = "/neorual-neuron.png";

// ---- Counter Hook ----
function useCountUp(target: number, duration = 2000, startOnView = true) {
  const [count, setCount] = useState(0);
  const [started, setStarted] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!startOnView) {
      setStarted(true);
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !started) {
          setStarted(true);
        }
      },
      { threshold: 0.3 }
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, [started, startOnView]);

  useEffect(() => {
    if (!started) return;
    let startTime: number;
    const step = (timestamp: number) => {
      if (!startTime) startTime = timestamp;
      const progress = Math.min((timestamp - startTime) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setCount(Math.floor(eased * target));
      if (progress < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }, [started, target, duration]);

  return { count, ref };
}

// ---- Intersection Observer Hook ----
function useInView(threshold = 0.15) {
  const ref = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setInView(true); },
      { threshold }
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, [threshold]);
  return { ref, inView };
}

const TOPBAR_TEXTS: Record<string, { emailUs: string; talkAbout: string; scheduleCall: string }> = {
  en: { emailUs: "Email us:", talkAbout: "Let's talk about your AI strategy.", scheduleCall: "Schedule a call" },
  zh: { emailUs: "联系我们：", talkAbout: "聊聊您的 AI 策略。", scheduleCall: "预约通话" },
};

// ---- Top Info Bar ----
function TopInfoBar() {
  const { language } = useLanguage();
  const t = TOPBAR_TEXTS[language] ?? TOPBAR_TEXTS.en;
  return (
    <div style={{ backgroundColor: "#1e293b", color: "white", fontSize: "0.75rem", padding: "0.625rem 0" }}>
      <div style={{ maxWidth: "90rem", margin: "0 auto", padding: "0 1rem", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <Mail style={{ width: "0.875rem", height: "0.875rem" }} />
          <span style={{ letterSpacing: "0.05em", textTransform: "uppercase", fontWeight: 500 }}>
            {t.emailUs} <a href="mailto:hello@neorualsentinel.ai" style={{ color: "inherit", textDecoration: "none" }} onMouseEnter={e => (e.currentTarget.style.color = "#93c5fd")} onMouseLeave={e => (e.currentTarget.style.color = "inherit")}>hello@neorualsentinel.ai</a>
          </span>
        </div>
        <div className="hidden sm:flex" style={{ alignItems: "center", gap: "1.5rem" }}>
          <span style={{ color: "#d1d5db" }}>
            {t.talkAbout}{" "}
            <button
              onClick={() => toast("Feature coming soon")}
              style={{ color: "#60a5fa", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", background: "none", border: "none", cursor: "pointer" }}
            >
              {t.scheduleCall}
            </button>
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          <button onClick={() => toast("Feature coming soon")} style={{ background: "none", border: "none", color: "white", cursor: "pointer" }} aria-label="GitHub">
            <svg style={{ width: "1rem", height: "1rem" }} viewBox="0 0 24 24" fill="currentColor"><path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/></svg>
          </button>
          <button onClick={() => toast("Feature coming soon")} style={{ background: "none", border: "none", color: "white", cursor: "pointer" }} aria-label="Twitter">
            <svg style={{ width: "1rem", height: "1rem" }} viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
          </button>
          <button onClick={() => toast("Feature coming soon")} style={{ background: "none", border: "none", color: "white", cursor: "pointer" }} aria-label="LinkedIn">
            <svg style={{ width: "1rem", height: "1rem" }} viewBox="0 0 24 24" fill="currentColor"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>
          </button>
        </div>
      </div>
    </div>
  );
}

const NAV_LABELS: Record<string, { home: string; aboutUs: string; services: string; features: string; contact: string; settings: string; brandName: string }> = {
  en: { home: "Home", aboutUs: "About Us", services: "Services", features: "Features", contact: "Contact", settings: "Settings", brandName: "NeuroSentinel" },
  zh: { home: "首页", aboutUs: "关于我们", services: "服务", features: "功能", contact: "联系我们", settings: "设置", brandName: "神安哨兵" },
  es: { home: "Inicio", aboutUs: "Nosotros", services: "Servicios", features: "Características", contact: "Contacto", settings: "Configuración", brandName: "NeuroSentinel" },
  fr: { home: "Accueil", aboutUs: "À propos", services: "Services", features: "Fonctionnalités", contact: "Contact", settings: "Paramètres", brandName: "NeuroSentinel" },
  de: { home: "Startseite", aboutUs: "Über uns", services: "Dienstleistungen", features: "Funktionen", contact: "Kontakt", settings: "Einstellungen", brandName: "NeuroSentinel" },
  ja: { home: "ホーム", aboutUs: "会社概要", services: "サービス", features: "機能", contact: "お問い合わせ", settings: "設定", brandName: "NeuroSentinel" },
  ko: { home: "홈", aboutUs: "회사 소개", services: "서비스", features: "기능", contact: "연락처", settings: "설정", brandName: "NeuroSentinel" },
};

// ---- Main Navigation ----
function MainNav() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const { language } = useLanguage();

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 50);
    window.addEventListener("scroll", handler);
    return () => window.removeEventListener("scroll", handler);
  }, []);

  const labels = NAV_LABELS[language] ?? NAV_LABELS.en;
  const navItems = [
    { label: labels.home, href: "#hero" },
    { label: labels.aboutUs, href: "#about" },
    { label: labels.services, href: "#services" },
    { label: labels.features, href: "#features" },
    { label: labels.contact, href: "#contact" },
    { label: labels.settings, href: "/settings" },
  ];

  return (
    <nav
      style={{
        position: "sticky",
        top: 0,
        zIndex: 50,
        backgroundColor: scrolled ? "rgba(255,255,255,0.95)" : "#ffffff",
        backdropFilter: scrolled ? "blur(12px)" : "none",
        boxShadow: scrolled ? "0 4px 6px -1px rgba(0,0,0,0.1)" : "none",
        transition: "all 0.3s",
      }}
    >
      <div style={{ maxWidth: "90rem", margin: "0 auto", padding: "0 1rem", display: "flex", alignItems: "center", justifyContent: "space-between", height: "4rem" }}>
        {/* Logo */}
        <a href="#hero" style={{ display: "flex", alignItems: "center", gap: "0.625rem", textDecoration: "none" }}>
          <img src="/LOGO.png" alt={labels.brandName} style={{ width: "2.25rem", height: "2.25rem", objectFit: "contain" }} />
          <BrandName style={{ fontFamily: "'Playfair Display', serif", fontSize: "1.25rem", fontWeight: 700, color: "#1e293b", letterSpacing: "-0.025em" }} />
        </a>

        {/* Desktop Nav */}
        <div className="hidden lg:flex" style={{ alignItems: "center", gap: "2rem" }}>
          {navItems.map((item) => {
            const navStyle: React.CSSProperties = { fontSize: "0.875rem", fontWeight: 600, color: "#334155", textDecoration: "none", letterSpacing: "0.05em", textTransform: "uppercase", fontFamily: "'Lato', sans-serif" };
            if (item.href.startsWith("/")) {
              return (
                <Link
                  key={item.label}
                  href={item.href}
                  style={navStyle}
                  onMouseEnter={e => (e.currentTarget.style.color = "#2563eb")}
                  onMouseLeave={e => (e.currentTarget.style.color = "#334155")}
                >
                  {item.label}
                </Link>
              );
            }
            return (
              <a
                key={item.label}
                href={item.href}
                style={navStyle}
                onMouseEnter={e => (e.currentTarget.style.color = "#2563eb")}
                onMouseLeave={e => (e.currentTarget.style.color = "#334155")}
              >
                {item.label}
              </a>
            );
          })}
        </div>

        {/* Mobile Toggle */}
        <button
          className="lg:hidden"
          style={{ padding: "0.5rem", color: "#334155", background: "none", border: "none", cursor: "pointer" }}
          onClick={() => setMobileOpen(!mobileOpen)}
          aria-label="Toggle menu"
        >
          <svg style={{ width: "1.5rem", height: "1.5rem" }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            {mobileOpen ? (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            )}
          </svg>
        </button>
      </div>

      {/* Mobile Menu */}
      {mobileOpen && (
        <div className="lg:hidden" style={{ backgroundColor: "white", borderTop: "1px solid #f1f5f9", boxShadow: "0 10px 15px -3px rgba(0,0,0,0.1)" }}>
          <div style={{ padding: "0.75rem 1rem" }}>
            {navItems.map((item) => {
              const mobileStyle: React.CSSProperties = { display: "block", padding: "0.625rem 0.75rem", fontSize: "0.875rem", fontWeight: 600, color: "#334155", textDecoration: "none", textTransform: "uppercase", letterSpacing: "0.05em", borderRadius: "0.375rem" };
              if (item.href.startsWith("/")) {
                return (
                  <Link
                    key={item.label}
                    href={item.href}
                    onClick={() => setMobileOpen(false)}
                    style={mobileStyle}
                  >
                    {item.label}
                  </Link>
                );
              }
              return (
                <a
                  key={item.label}
                  href={item.href}
                  onClick={() => setMobileOpen(false)}
                  style={mobileStyle}
                >
                  {item.label}
                </a>
              );
            })}
          </div>
        </div>
      )}
    </nav>
  );
}

const HERO_TEXTS: Record<string, { title1: string; title2: string; title3: string; subtitle: string; cta: string; stat1: string; stat2: string; stat3: string }> = {
  en: {
    title1: "Building the Digital Frontier",
    title2: "for National Neuro Health",
    title3: "",
    subtitle: "C. elegans + AI platform for high-quality, high-throughput, low-cost neurotoxic compound screening.",
    cta: "Learn about our services",
    stat1: "Neurons Mapped",
    stat2: "AI Tools",
    stat3: "Analyses Completed",
  },
  zh: {
    title1: "为亿万国民",
    title2: "构筑神经健康的",
    title3: "数字化最前哨",
    subtitle: "线虫生物模型 + AI，为您提供「高质量、高通量、低成本」的化合物神经安全筛查方案。",
    cta: "了解我们的服务",
    stat1: "神经元已映射",
    stat2: "AI 工具",
    stat3: "分析已完成",
  },
};

// ---- Hero Section (Vertex-style: split layout, integrated stats bar) ----
function HeroSection() {
  const { ref, inView } = useInView(0.1);
  const { language } = useLanguage();
  const stat1 = useCountUp(302, 2000);
  const stat2 = useCountUp(10, 1500);
  const stat3 = useCountUp(1000, 2500);
  const h = HERO_TEXTS[language] ?? HERO_TEXTS.en;

  return (
    <section id="hero" style={{ position: "relative", minHeight: "100vh", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      {/* Background Image - zoom-in load animation + left-to-right gradient overlay */}
      <div style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
        <img
          src={HERO_BG}
          alt="Research laboratory"
          className="hero-bg-zoom-in"
          style={{ width: "100%", height: "100%", objectFit: "cover", transformOrigin: "center center" }}
        />
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to right, rgba(15,23,42,0.92) 0%, rgba(15,23,42,0.65) 30%, rgba(15,23,42,0.35) 60%, rgba(15,23,42,0.06) 100%)" }} />
      </div>

      {/* Main Content - left-aligned */}
      <div ref={ref} style={{ position: "relative", zIndex: 10, flex: 1, display: "flex", alignItems: "center", padding: "5rem 1rem 0" }}>
        <div style={{ maxWidth: "80rem", margin: "0 auto", width: "100%" }}>
          <div style={{ maxWidth: "36rem" }}>
            <h1
              style={{
                fontFamily: "'Playfair Display', serif",
                fontSize: "clamp(2.5rem, 5vw, 3.5rem)",
                fontWeight: 700,
                color: "white",
                lineHeight: 1.5,
                letterSpacing: "0.02em",
                opacity: inView ? 1 : 0,
                transform: inView ? "translateY(0)" : "translateY(2rem)",
                transition: "all 0.7s",
                textShadow: "0 2px 20px rgba(0,0,0,0.3)",
              }}
            >
              {h.title1}
              <br />
              {h.title2}
              {h.title3 ? (
                <>
                  <br />
                  <span style={{ letterSpacing: "0.04em", fontWeight: 800 }}>{h.title3}</span>
                </>
              ) : null}
            </h1>
            <p
              style={{
                marginTop: "1.5rem",
                fontSize: "clamp(1rem, 1.8vw, 1.125rem)",
                color: "#e2e8f0",
                fontWeight: 400,
                lineHeight: 1.6,
                fontFamily: "'Lato', sans-serif",
                opacity: inView ? 1 : 0,
                transform: inView ? "translateY(0)" : "translateY(2rem)",
                transition: "all 0.7s 0.2s",
              }}
            >
              {h.subtitle}
            </p>
            <div
              style={{
                marginTop: "2rem",
                display: "flex",
                alignItems: "center",
                gap: "0.75rem",
                opacity: inView ? 1 : 0,
                transform: inView ? "translateY(0)" : "translateY(2rem)",
                transition: "all 0.7s 0.4s",
              }}
            >
              <a
                href="#services"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.5rem",
                  backgroundColor: "#2563eb",
                  color: "white",
                  padding: "0.875rem 1.75rem",
                  borderRadius: "0.375rem",
                  fontSize: "0.875rem",
                  fontWeight: 600,
                  letterSpacing: "0.05em",
                  textTransform: "uppercase",
                  textDecoration: "none",
                  boxShadow: "0 10px 15px -3px rgba(37,99,235,0.25)",
                  transition: "all 0.2s",
                }}
                onMouseEnter={e => (e.currentTarget.style.backgroundColor = "#1d4ed8")}
                onMouseLeave={e => (e.currentTarget.style.backgroundColor = "#2563eb")}
              >
                {h.cta}
              </a>
              <a
                href="#services"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: "3rem",
                  height: "3rem",
                  backgroundColor: "rgba(255,255,255,0.15)",
                  border: "1px solid rgba(255,255,255,0.4)",
                  borderRadius: "0.375rem",
                  color: "white",
                  textDecoration: "none",
                  transition: "all 0.2s",
                }}
                onMouseEnter={e => { e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.25)"; e.currentTarget.style.borderColor = "rgba(255,255,255,0.6)"; }}
                onMouseLeave={e => { e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.15)"; e.currentTarget.style.borderColor = "rgba(255,255,255,0.4)"; }}
              >
                <ArrowRight style={{ width: "1.25rem", height: "1.25rem" }} />
              </a>
            </div>
          </div>
        </div>
      </div>

      {/* Statistics Bar - glassmorphism frosted glass effect */}
      <div style={{ position: "relative", zIndex: 10, padding: "0 1rem 2rem", display: "flex", justifyContent: "center" }}>
        <div
          style={{
            maxWidth: "80rem",
            width: "100%",
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            backgroundColor: "rgba(30,41,59,0.85)",
            borderRadius: "0.75rem",
            border: "1px solid rgba(255,255,255,0.12)",
            boxShadow: "0 4px 24px rgba(0,0,0,0.15)",
            overflow: "hidden",
          }}
        >
          <div ref={stat1.ref} style={{ padding: "2rem 1rem", textAlign: "center", borderRight: "1px solid rgba(255,255,255,0.1)" }}>
            <div style={{ fontSize: "clamp(1.5rem, 2.5vw, 2rem)", fontWeight: 700, color: "white", fontFamily: "'Playfair Display', serif" }}>{stat1.count}+</div>
            <div style={{ marginTop: "0.375rem", fontSize: "0.7rem", textTransform: "uppercase", letterSpacing: "0.15em", color: "#94a3b8", fontWeight: 600 }}>{h.stat1}</div>
          </div>
          <div ref={stat2.ref} style={{ padding: "2rem 1rem", textAlign: "center", borderRight: "1px solid rgba(255,255,255,0.1)" }}>
            <div style={{ fontSize: "clamp(1.5rem, 2.5vw, 2rem)", fontWeight: 700, color: "white", fontFamily: "'Playfair Display', serif" }}>{stat2.count}+</div>
            <div style={{ marginTop: "0.375rem", fontSize: "0.7rem", textTransform: "uppercase", letterSpacing: "0.15em", color: "#94a3b8", fontWeight: 600 }}>{h.stat2}</div>
          </div>
          <div ref={stat3.ref} style={{ padding: "2rem 1rem", textAlign: "center", borderRight: "1px solid rgba(255,255,255,0.1)" }}>
            <div style={{ fontSize: "clamp(1.5rem, 2.5vw, 2rem)", fontWeight: 700, color: "white", fontFamily: "'Playfair Display', serif" }}>{stat3.count}+</div>
            <div style={{ marginTop: "0.375rem", fontSize: "0.7rem", textTransform: "uppercase", letterSpacing: "0.15em", color: "#94a3b8", fontWeight: 600 }}>{h.stat3}</div>
          </div>
          <div className="hidden sm:flex" style={{ alignItems: "center", justifyContent: "center", padding: "2rem 1rem", backgroundColor: "#2563eb" }}>
            <a href="#services" style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "0.5rem", textDecoration: "none", transition: "all 0.2s" }} onMouseEnter={e => { e.currentTarget.style.opacity = "0.9"; }} onMouseLeave={e => { e.currentTarget.style.opacity = "1"; }}>
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                <path d="M12 5v10M8 13l4 6 4-6" />
              </svg>
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}

const ABOUT_TEXTS: Record<string, { title: string; p1: string; p2: string; archTitle: string; highlights: { title: string; sub: string }[] }> = {
  en: {
    title: "About NeuroSentinel",
    p1: "NeuroSentinel is an AI Agent platform specifically designed for C. elegans (nematode) research. At its core, we use C. elegans as a model organism and leverage AI agents for high-efficiency primary screening of neurotoxic compounds. By combining large language models with specialized biological analysis tools, we provide researchers with an intelligent assistant that understands the unique requirements of nematode studies.",
    p2: "Our platform integrates conversational AI, automated image analysis, video-based behavior tracking, and a comprehensive knowledge base built from authoritative sources including WormBase, WormAtlas, and OpenWorm datasets.",
    archTitle: "System Architecture",
    highlights: [
      { title: "AI-Powered", sub: "GLM-4 Large Language Model" },
      { title: "Research-Grade", sub: "Scientific Accuracy First" },
      { title: "Real-time", sub: "Streaming & Live Analysis" },
      { title: "Integrated", sub: "End-to-end Workflow" },
    ],
  },
  zh: {
    title: "关于 神安哨兵",
    p1: "神安哨兵（NeuroSentinel）项目致力于打造全球首个基于秀丽隐杆线虫生物模型与视觉人工智能大模型相结合的化合物神经安全性评价系统。团队独创“线虫生物模型+人工智能（AI）”智能体平台，通过自动化线虫神经荧光成像、AI驱动的神经形态学分析以及行为学效应综合评价指数，为环境化合物的神经安全监测提供“高质量、高通量、低成本”的大规模评价与筛选方案。",
    p2: "我们的平台整合了对话式 AI、自动化图像分析、基于视频的行为追踪，以及基于 WormBase、WormAtlas 和 OpenWorm 等权威数据源构建的综合知识库。",
    archTitle: "系统架构",
    highlights: [
      { title: "AI 驱动", sub: "GLM-4 大语言模型" },
      { title: "科研级", sub: "科学准确性优先" },
      { title: "实时", sub: "流式与实时分析" },
      { title: "一体化", sub: "端到端工作流" },
    ],
  },
};

// ---- About Section ----
function AboutSection() {
  const { ref, inView } = useInView();
  const { language } = useLanguage();
  const a = ABOUT_TEXTS[language] ?? ABOUT_TEXTS.en;

  const highlights = [
    { icon: <Brain style={{ width: "1.25rem", height: "1.25rem", color: "#2563eb" }} />, bg: "#eff6ff", ...a.highlights[0] },
    { icon: <FlaskConical style={{ width: "1.25rem", height: "1.25rem", color: "#059669" }} />, bg: "#ecfdf5", ...a.highlights[1] },
    { icon: <Zap style={{ width: "1.25rem", height: "1.25rem", color: "#d97706" }} />, bg: "#fffbeb", ...a.highlights[2] },
    { icon: <Sparkles style={{ width: "1.25rem", height: "1.25rem", color: "#7c3aed" }} />, bg: "#f5f3ff", ...a.highlights[3] },
  ];

  const archLayers = [
    { label: "Client Layer", color: "#2563eb", bg: "#eff6ff", border: "#bfdbfe", items: ["React UI", "Chat Interface", "Artifact Viewer", "Project Planner"] },
    { label: "API Layer (tRPC)", color: "#059669", bg: "#ecfdf5", border: "#a7f3d0", items: ["Agent Router", "Conversation API", "File Upload", "Auth (JWT)"] },
    { label: "Service Layer", color: "#d97706", bg: "#fffbeb", border: "#fde68a", items: ["ZhipuAI LLM", "ImageJ", "Deep-Worm-Tracker", "RAG Engine", "Python Sandbox"] },
    { label: "Data Layer", color: "#7c3aed", bg: "#f5f3ff", border: "#c4b5fd", items: ["MySQL (Drizzle)", "MinIO / S3", "Vector Store", "WormBase Data"] },
  ];

  return (
    <section id="about" style={{ backgroundColor: "white", padding: "5rem 0" }}>
      <div style={{ maxWidth: "80rem", margin: "0 auto", padding: "0 1rem" }}>
        <div
          ref={ref}
          style={{
            display: "grid",
            gridTemplateColumns: "1fr",
            gap: "4rem",
            alignItems: "center",
            opacity: inView ? 1 : 0,
            transform: inView ? "translateY(0)" : "translateY(3rem)",
            transition: "all 0.7s",
          }}
          className="lg:!grid-cols-2"
        >
          <div>
            <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: "clamp(1.875rem, 3vw, 2.25rem)", fontWeight: 700, color: "#1e293b" }}>
              {a.title}
            </h2>
            <div style={{ marginTop: "0.5rem", width: "4rem", height: "0.25rem", backgroundColor: "#2563eb", borderRadius: "9999px" }} />
            <p style={{ marginTop: "2rem", color: "#475569", lineHeight: 1.7, fontFamily: "'Lato', sans-serif" }}>
              {a.p1}
            </p>
            <p style={{ marginTop: "1rem", color: "#475569", lineHeight: 1.7, fontFamily: "'Lato', sans-serif" }}>
              {a.p2}
            </p>
            <div style={{ marginTop: "2rem", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.5rem" }}>
              {highlights.map((h, i) => (
                <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: "0.75rem" }}>
                  <div style={{ width: "2.5rem", height: "2.5rem", borderRadius: "0.5rem", backgroundColor: h.bg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    {h.icon}
                  </div>
                  <div>
                    <div style={{ fontWeight: 600, color: "#1e293b", fontSize: "0.875rem" }}>{h.title}</div>
                    <div style={{ fontSize: "0.75rem", color: "#64748b", marginTop: "0.125rem" }}>{h.sub}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Architecture Diagram */}
          <div style={{ backgroundColor: "#f8fafc", borderRadius: "1rem", padding: "2rem", border: "1px solid #f1f5f9" }}>
            <h3 style={{ fontWeight: 600, color: "#1e293b", marginBottom: "1.5rem", textAlign: "center", fontFamily: "'Lato', sans-serif" }}>{a.archTitle}</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              {archLayers.map((layer, i) => (
                <div key={i}>
                  <div style={{ backgroundColor: layer.bg, border: `1px solid ${layer.border}`, borderRadius: "0.5rem", padding: "1rem" }}>
                    <div style={{ fontSize: "0.75rem", fontWeight: 600, color: layer.color, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "0.5rem" }}>{layer.label}</div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
                      {layer.items.map((item) => (
                        <span key={item} style={{ backgroundColor: "white", color: layer.color, fontSize: "0.75rem", padding: "0.25rem 0.625rem", borderRadius: "0.25rem", border: `1px solid ${layer.border}` }}>{item}</span>
                      ))}
                    </div>
                  </div>
                  {i < archLayers.length - 1 && (
                    <div style={{ display: "flex", justifyContent: "center" }}><div style={{ width: "1px", height: "1rem", backgroundColor: "#d1d5db" }} /></div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

const SERVICES_TEXTS: Record<string, {
  title: string;
  getStarted: string;
  services: { title: string; description: string; badge: string }[];
}> = {
  en: {
    title: "Services",
    getStarted: "Get Started",
    services: [
      { title: "AI Agent Conversational Interface: Intelligent Research Assistant", description: "Our AI Agent provides a multi-turn conversational interface powered by ZhipuAI GLM-4 large language models. Researchers can interact naturally with the system to ask questions, analyze data, execute Python code, and generate comprehensive research reports. The agent supports streaming responses, tool calling, and artifact generation including code, charts, HTML visualizations, and detailed project plans for C. elegans experiments.", badge: "Core Feature" },
      { title: "ImageJ Nematode Image Analysis: Automated Quantification", description: "Leveraging the power of ImageJ/Fiji, our platform provides automated image analysis capabilities specifically designed for C. elegans research. Upload microscopy images directly through the interface and receive quantitative measurements including worm counting, fluorescence intensity analysis, morphological measurements, and body length/width calculations.", badge: "Since 2024" },
      { title: "Deep-Worm-Tracker: Real-time Video Behavior Analysis", description: "Our Deep-Worm-Tracker service utilizes YOLOv5 object detection combined with StrongSORT multi-object tracking to analyze nematode movement patterns in video recordings. The system generates detailed trajectory data, velocity statistics, movement heat maps, and behavioral phenotype classifications.", badge: "Behavior Analysis" },
      { title: "RAG Knowledge Retrieval: C. elegans Research Database", description: "Built on a comprehensive knowledge base integrating data from WormBase, WormAtlas, and OpenWorm, our RAG system provides semantic search across neuron systems, neurotransmitter pathways, gene expression data, and experimental protocols.", badge: "Knowledge" },
      { title: "Neuron analysis: Neuron Morphology Analysis", description: "Our Neuron analysis service provides deep learning-based neuronal image analysis for C. elegans. Using Vision Transformer (ViT) for morphology classification (arborization, bend, break) and MMDetection/MMSegmentation for bead segmentation, cell body instance segmentation, and dendrite detection, it delivers automated quantitative analysis of fluorescent microscopic images.", badge: "Deep Learning" },
    ],
  },
  zh: {
    title: "服务",
    getStarted: "立即开始",
    services: [
      { title: "AI Agent 对话式界面：智能研究助手", description: "我们的 AI Agent 提供基于智谱 GLM-4 大语言模型的多轮对话界面。研究人员可以自然地与系统交互，提问、分析数据、执行 Python 代码并生成全面的研究报告。Agent 支持流式响应、工具调用和产物生成，包括代码、图表、HTML 可视化以及 C. elegans 实验的详细项目计划。", badge: "核心功能" },
      { title: "ImageJ 线虫图像分析：自动化定量", description: "依托 ImageJ/Fiji 的强大功能，我们的平台提供专为 C. elegans 研究设计的自动化图像分析能力。通过界面直接上传显微图像，即可获得包括蠕虫计数、荧光强度分析、形态学测量和体长/体宽计算在内的定量测量结果。", badge: "2024 至今" },
      { title: "Deep-Worm-Tracker：实时视频行为分析", description: "我们的 Deep-Worm-Tracker 服务使用 YOLOv5 目标检测结合 StrongSORT 多目标追踪，分析视频中的线虫运动模式。系统生成详细的轨迹数据、速度统计、运动热力图和行为表型分类。", badge: "行为分析" },
      { title: "RAG 知识检索：C. elegans 研究数据库", description: "基于整合 WormBase、WormAtlas 和 OpenWorm 数据的综合知识库，我们的 RAG 系统提供神经元系统、神经递质通路、基因表达数据和实验方案的语义检索。", badge: "知识库" },
      { title: "Neuron analysis：神经元形态分析", description: "Neuron analysis 服务基于深度学习实现 C. elegans 神经元显微图像分析。采用 Vision Transformer (ViT) 进行形态分类（树突增生、弯曲、断裂），结合 MMDetection/MMSegmentation 实现串珠分割、细胞体实例分割和树突检测，为荧光显微图像提供自动化定量分析。", badge: "显微分析" },
    ],
  },
};

// ---- Services Section ----
function ServicesSection() {
  const { ref: titleRef, inView: titleInView } = useInView();
  const { language } = useLanguage();
  const s = SERVICES_TEXTS[language] ?? SERVICES_TEXTS.en;

  const services = [
    { image: SERVICE_AI, ...s.services[0], badgeColor: "#2563eb" },
    { image: SERVICE_ANALYSIS, ...s.services[1], badgeColor: "#059669" },
    { image: SERVICE_TRACKING, ...s.services[2], badgeColor: "#d97706" },
    { image: SERVICE_KNOWLEDGE, ...s.services[3], badgeColor: "#7c3aed" },
    { image: SERVICE_NEORUAL, ...s.services[4], badgeColor: "#0891b2" },
  ];

  return (
    <section id="services">
      {/* Section Title Banner */}
      <div style={{ backgroundColor: "#1e293b", padding: "4rem 0 5rem" }}>
        <div
          ref={titleRef}
          style={{
            maxWidth: "80rem",
            margin: "0 auto",
            padding: "0 1rem",
            textAlign: "center",
            opacity: titleInView ? 1 : 0,
            transform: titleInView ? "translateY(0)" : "translateY(2rem)",
            transition: "all 0.7s",
          }}
        >
          <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: "clamp(1.875rem, 4vw, 3rem)", fontWeight: 700, color: "white" }}>
            {s.title}
          </h2>
        </div>
      </div>

      {/* Service Items */}
      <div style={{ backgroundColor: "white" }}>
        {services.map((service, idx) => (
          <ServiceItem key={idx} service={service} reversed={idx % 2 === 1} index={idx} getStartedText={s.getStarted} />
        ))}
      </div>
    </section>
  );
}

function ServiceItem({ service, reversed, index, getStartedText }: { service: { image: string; title: string; description: string; badge: string; badgeColor: string }; reversed: boolean; index: number; getStartedText: string }) {
  const { ref, inView } = useInView(0.15);

  return (
    <div ref={ref} style={{ maxWidth: "80rem", margin: "0 auto", padding: "4rem 1rem", borderTop: index > 0 ? "1px solid #f1f5f9" : "none" }}>
      <div
        style={{
          display: "flex",
          flexDirection: reversed ? "row-reverse" : "row",
          alignItems: "center",
          gap: "4rem",
          opacity: inView ? 1 : 0,
          transform: inView ? "translateY(0)" : "translateY(3rem)",
          transition: "all 0.7s",
        }}
        className="flex-col! lg:!flex-row"
      >
        {/* Image Card */}
        <div style={{ width: "100%", maxWidth: "28rem", flexShrink: 0 }}>
          <div style={{ position: "relative", border: "2px dashed rgba(30,41,59,0.2)", borderRadius: "0.75rem", padding: "0.75rem", backgroundColor: "rgba(248,250,252,0.5)" }}>
            <div style={{ overflow: "hidden", borderRadius: "0.5rem" }}>
              <img src={service.image} alt={service.title} style={{ width: "100%", aspectRatio: "4/3", objectFit: "cover" }} />
            </div>
            <div style={{ position: "absolute", top: "-0.75rem", left: "1.5rem" }}>
              <span style={{ backgroundColor: service.badgeColor, color: "white", fontSize: "0.75rem", fontWeight: 600, padding: "0.375rem 1rem", borderRadius: "9999px", boxShadow: "0 1px 2px rgba(0,0,0,0.1)" }}>
                {service.badge}
              </span>
            </div>
          </div>
        </div>

        {/* Text Content */}
        <div style={{ width: "100%" }}>
          <h3 style={{ fontFamily: "'Playfair Display', serif", fontSize: "clamp(1.5rem, 2.5vw, 1.875rem)", fontWeight: 700, color: "#1e293b", lineHeight: 1.3 }}>
            {service.title}
          </h3>
          <p style={{ marginTop: "1.5rem", color: "#475569", lineHeight: 1.7, textAlign: "justify", fontFamily: "'Lato', sans-serif" }}>
            {service.description}
          </p>
          <div style={{ marginTop: "2rem" }}>
            <Link
              href="/chat"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.5rem",
                backgroundColor: "#2563eb",
                color: "white",
                padding: "0.75rem 1.5rem",
                borderRadius: "0.375rem",
                fontSize: "0.875rem",
                fontWeight: 600,
                letterSpacing: "0.05em",
                border: "none",
                cursor: "pointer",
                boxShadow: "0 4px 6px -1px rgba(37,99,235,0.2)",
                transition: "all 0.2s",
                textDecoration: "none",
              }}
              onMouseEnter={e => (e.currentTarget.style.backgroundColor = "#1d4ed8")}
              onMouseLeave={e => (e.currentTarget.style.backgroundColor = "#2563eb")}
            >
              {getStartedText}
              <ArrowRight style={{ width: "1rem", height: "1rem" }} />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

const FEATURES_TEXTS: Record<string, {
  title: string;
  subtitle: string;
  features: { title: string; description: string }[];
}> = {
  en: {
    title: "Platform Features",
    subtitle: "A comprehensive suite of AI-powered tools designed specifically for C. elegans research, from image analysis to knowledge retrieval.",
    features: [
      { title: "Multi-turn Dialogue", description: "Natural language interaction with streaming responses, context-aware conversation, and intelligent follow-up suggestions." },
      { title: "Python Sandbox", description: "Execute Python code in a secure sandbox with matplotlib, pandas, numpy support for data analysis and visualization." },
      { title: "Web Search & Extraction", description: "Search across WormAtlas, OpenWorm, WormBase and the broader web, with intelligent content extraction and summarization." },
      { title: "Image Analysis", description: "Automated ImageJ-powered analysis for worm counting, fluorescence measurement, morphological quantification." },
      { title: "Video Tracking", description: "YOLOv5 + StrongSORT powered real-time tracking of nematode movement with trajectory and velocity analysis." },
      { title: "Knowledge Base", description: "Semantic search across curated C. elegans datasets including neurons, genes, connectome, and experimental protocols." },
      { title: "Neuron Morphology Analysis", description: "Deep learning-based C. elegans neuronal image analysis. ViT morphology classification + MMDet/MMSeg for bead segmentation, cell body and dendrite detection." },
      { title: "Project Planning", description: "Create detailed 7-day experiment timelines with step-by-step protocols, material lists, and automated data collection." },
    ],
  },
  zh: {
    title: "平台功能",
    subtitle: "专为 C. elegans 研究设计的 AI 工具套件，涵盖图像分析到知识检索。",
    features: [
      { title: "多轮对话", description: "自然语言交互，支持流式响应、上下文感知对话和智能后续建议。" },
      { title: "Python 沙箱", description: "在安全沙箱中执行 Python 代码，支持 matplotlib、pandas、numpy 进行数据分析和可视化。" },
      { title: "网络搜索与提取", description: "在 WormAtlas、OpenWorm、WormBase 及更广泛的网络中搜索，支持智能内容提取与摘要。" },
      { title: "图像分析", description: "基于 ImageJ 的自动化分析，支持蠕虫计数、荧光测量、形态学定量。" },
      { title: "视频追踪", description: "YOLOv5 + StrongSORT 驱动的线虫运动实时追踪，含轨迹与速度分析。" },
      { title: "知识库", description: "在精选的 C. elegans 数据集上进行语义检索，包括神经元、基因、连接组和实验方案。" },
      { title: "神经元形态分析", description: "基于深度学习的线虫神经元显微图像分析。ViT 形态分类 + MMDet/MMSeg 串珠分割、细胞体分割、树突检测。" },
      { title: "项目规划", description: "创建详细的 7 天实验时间线，含分步协议、材料清单和自动化数据收集。" },
    ],
  },
};

// ---- Features Section ----
function FeaturesSection() {
  const { ref: titleRef, inView: titleInView } = useInView();
  const { language } = useLanguage();
  const f = FEATURES_TEXTS[language] ?? FEATURES_TEXTS.en;

  const featureIcons = [
    <MessageSquarePlus style={{ width: "1.5rem", height: "1.5rem" }} />,
    <Terminal style={{ width: "1.5rem", height: "1.5rem" }} />,
    <Search style={{ width: "1.5rem", height: "1.5rem" }} />,
    <Microscope style={{ width: "1.5rem", height: "1.5rem" }} />,
    <Activity style={{ width: "1.5rem", height: "1.5rem" }} />,
    <Database style={{ width: "1.5rem", height: "1.5rem" }} />,
    <Brain style={{ width: "1.5rem", height: "1.5rem" }} />,
    <BookOpen style={{ width: "1.5rem", height: "1.5rem" }} />,
  ];
  const features = f.features.map((feat, i) => ({ icon: featureIcons[i], ...feat }));

  return (
    <section id="features" style={{ backgroundColor: "#f8fafc", padding: "5rem 0" }}>
      <div style={{ maxWidth: "80rem", margin: "0 auto", padding: "0 1rem" }}>
        <div
          ref={titleRef}
          style={{
            textAlign: "center",
            marginBottom: "4rem",
            opacity: titleInView ? 1 : 0,
            transform: titleInView ? "translateY(0)" : "translateY(2rem)",
            transition: "all 0.7s",
          }}
        >
          <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: "clamp(1.875rem, 3vw, 2.25rem)", fontWeight: 700, color: "#1e293b" }}>
            {f.title}
          </h2>
          <p style={{ marginTop: "1rem", color: "#64748b", maxWidth: "42rem", margin: "1rem auto 0", lineHeight: 1.6, fontFamily: "'Lato', sans-serif" }}>
            {f.subtitle}
          </p>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "1.5rem" }}>
          {features.map((feature, idx) => (
            <FeatureCard key={idx} feature={feature} index={idx} />
          ))}
        </div>
      </div>
    </section>
  );
}

function FeatureCard({ feature, index }: { feature: { icon: React.ReactNode; title: string; description: string }; index: number }) {
  const { ref, inView } = useInView(0.1);
  const [hovered, setHovered] = useState(false);

  return (
    <div
      ref={ref}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        backgroundColor: "white",
        borderRadius: "0.75rem",
        border: `1px solid ${hovered ? "#93c5fd" : "#e2e8f0"}`,
        padding: "1.5rem",
        boxShadow: hovered ? "0 10px 15px -3px rgba(59,130,246,0.1)" : "none",
        transition: "all 0.3s",
        opacity: inView ? 1 : 0,
        transform: inView ? "translateY(0)" : "translateY(2rem)",
        transitionDelay: inView ? `${index * 80}ms` : "0ms",
      }}
    >
      <div style={{
        width: "3rem",
        height: "3rem",
        borderRadius: "0.5rem",
        backgroundColor: hovered ? "#2563eb" : "#eff6ff",
        color: hovered ? "white" : "#2563eb",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        transition: "all 0.3s",
      }}>
        {feature.icon}
      </div>
      <h3 style={{ marginTop: "1.25rem", fontWeight: 600, color: "#1e293b", fontSize: "1.125rem" }}>{feature.title}</h3>
      <p style={{ marginTop: "0.75rem", fontSize: "0.875rem", color: "#64748b", lineHeight: 1.6, fontFamily: "'Lato', sans-serif" }}>{feature.description}</p>
    </div>
  );
}

const CONTACT_TEXTS: Record<string, { title: string; subtitle: string; cta1: string; cta2: string }> = {
  en: {
    title: "Ready to Accelerate Compound Neurosafety Evaluation?",
    subtitle: "Get started with NeuroSentinel and experience our C. elegans + AI platform for high-quality, high-throughput, low-cost neurotoxic compound screening.",
    cta1: "Start Free Trial",
    cta2: "Schedule a Demo",
  },
  zh: {
    title: "准备好加速化合物神经安全评价了吗？",
    subtitle: "立即使用 神安哨兵，体验线虫生物模型 + AI 驱动的「高质量、高通量、低成本」神经安全筛查方案。",
    cta1: "免费试用",
    cta2: "预约演示",
  },
};

// ---- Contact / CTA Section ----
function ContactSection() {
  const { ref, inView } = useInView();
  const { language } = useLanguage();
  const c = CONTACT_TEXTS[language] ?? CONTACT_TEXTS.en;

  return (
    <section id="contact" style={{ backgroundColor: "white", padding: "5rem 0", borderTop: "1px solid #f1f5f9" }}>
      <div style={{ maxWidth: "80rem", margin: "0 auto", padding: "0 1rem" }}>
        <div
          ref={ref}
          style={{
            textAlign: "center",
            opacity: inView ? 1 : 0,
            transform: inView ? "translateY(0)" : "translateY(2rem)",
            transition: "all 0.7s",
          }}
        >
          <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: "clamp(1.875rem, 3vw, 2.25rem)", fontWeight: 700, color: "#1e293b" }}>
            {c.title}
          </h2>
          <p style={{ marginTop: "1rem", color: "#64748b", maxWidth: "42rem", margin: "1rem auto 0", lineHeight: 1.6, fontFamily: "'Lato', sans-serif" }}>
            {c.subtitle}
          </p>
          <div style={{ marginTop: "2.5rem", display: "flex", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: "1rem", flexWrap: "wrap" }}>
            <Link
              href="/chat"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.5rem",
                backgroundColor: "#2563eb",
                color: "white",
                padding: "0.875rem 2rem",
                borderRadius: "0.375rem",
                fontSize: "0.875rem",
                fontWeight: 600,
                letterSpacing: "0.05em",
                border: "none",
                cursor: "pointer",
                boxShadow: "0 10px 15px -3px rgba(37,99,235,0.25)",
                transition: "all 0.2s",
                textDecoration: "none",
              }}
              onMouseEnter={e => (e.currentTarget.style.backgroundColor = "#1d4ed8")}
              onMouseLeave={e => (e.currentTarget.style.backgroundColor = "#2563eb")}
            >
              {c.cta1}
              <ArrowRight style={{ width: "1rem", height: "1rem" }} />
            </Link>
            <button
              onClick={() => toast("Feature coming soon")}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.5rem",
                backgroundColor: "white",
                color: "#334155",
                padding: "0.875rem 2rem",
                borderRadius: "0.375rem",
                fontSize: "0.875rem",
                fontWeight: 600,
                letterSpacing: "0.05em",
                border: "1px solid #d1d5db",
                cursor: "pointer",
                transition: "all 0.2s",
              }}
            >
              <Phone style={{ width: "1rem", height: "1rem" }} />
              {c.cta2}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

const FOOTER_TEXTS: Record<string, {
  tagline: string;
  platform: string;
  resources: string;
  contact: string;
  copyright: string;
  platformLinks: string[];
  resourceLinks: string[];
  githubRepo: string;
  privacyPolicy: string;
  termsOfService: string;
}> = {
  en: {
    tagline: "AI-Powered C. elegans Research Platform. Combining large language models with specialized biological analysis tools.",
    platform: "Platform",
    resources: "Resources",
    contact: "Contact",
    copyright: "All rights reserved. Built for C. elegans research.",
    platformLinks: ["AI Agent", "Image Analysis", "Video Tracking", "Knowledge Base"],
    resourceLinks: ["Documentation", "API Reference", "WormBase", "OpenWorm"],
    githubRepo: "GitHub Repository",
    privacyPolicy: "Privacy Policy",
    termsOfService: "Terms of Service",
  },
  zh: {
    tagline: "AI 驱动的 C. elegans 研究平台。结合大语言模型与专业生物分析工具。",
    platform: "平台",
    resources: "资源",
    contact: "联系我们",
    copyright: "保留所有权利。为 C. elegans 研究而构建。",
    platformLinks: ["AI Agent", "图像分析", "视频追踪", "知识库"],
    resourceLinks: ["文档", "API 参考", "WormBase", "OpenWorm"],
    githubRepo: "GitHub 仓库",
    privacyPolicy: "隐私政策",
    termsOfService: "服务条款",
  },
};

// ---- Footer ----
function Footer() {
  const { language, brandName } = useLanguage();
  const ft = FOOTER_TEXTS[language] ?? FOOTER_TEXTS.en;

  return (
    <footer style={{ backgroundColor: "#0f172a", color: "#9ca3af", padding: "3rem 0" }}>
      <div style={{ maxWidth: "80rem", margin: "0 auto", padding: "0 1rem" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: "2rem" }}>
          {/* Brand */}
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.625rem" }}>
              <img src="/LOGO.png" alt={brandName} style={{ width: "2rem", height: "2rem", objectFit: "contain" }} />
              <BrandName style={{ fontFamily: "'Playfair Display', serif", fontSize: "1.125rem", fontWeight: 700, color: "white" }} />
            </div>
            <p style={{ marginTop: "1rem", fontSize: "0.875rem", lineHeight: 1.6 }}>
              {ft.tagline}
            </p>
          </div>

          {/* Quick Links */}
          <div>
            <h4 style={{ color: "white", fontWeight: 600, fontSize: "0.875rem", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "1rem" }}>{ft.platform}</h4>
            <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "0.625rem" }}>
              {ft.platformLinks.map((item) => (
                <li key={item}>
                  <button onClick={() => toast("Feature coming soon")} style={{ fontSize: "0.875rem", color: "#9ca3af", textDecoration: "none", background: "none", border: "none", cursor: "pointer", padding: 0 }}>{item}</button>
                </li>
              ))}
            </ul>
          </div>

          {/* Resources */}
          <div>
            <h4 style={{ color: "white", fontWeight: 600, fontSize: "0.875rem", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "1rem" }}>{ft.resources}</h4>
            <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "0.625rem" }}>
              {ft.resourceLinks.map((item) => (
                <li key={item}>
                  <button onClick={() => toast("Feature coming soon")} style={{ fontSize: "0.875rem", color: "#9ca3af", background: "none", border: "none", cursor: "pointer", padding: 0 }}>{item}</button>
                </li>
              ))}
            </ul>
          </div>

          {/* Contact */}
          <div>
            <h4 style={{ color: "white", fontWeight: 600, fontSize: "0.875rem", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "1rem" }}>{ft.contact}</h4>
            <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "0.625rem" }}>
              <li style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.875rem" }}>
                <Mail style={{ width: "1rem", height: "1rem" }} />
                hello@neorualsentinel.ai
              </li>
              <li style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.875rem" }}>
                <ExternalLink style={{ width: "1rem", height: "1rem" }} />
                <button onClick={() => toast("Feature coming soon")} style={{ color: "#9ca3af", background: "none", border: "none", cursor: "pointer", padding: 0, fontSize: "0.875rem" }}>
                  {ft.githubRepo}
                </button>
              </li>
            </ul>
          </div>
        </div>

        <div style={{ marginTop: "3rem", paddingTop: "2rem", borderTop: "1px solid rgba(255,255,255,0.1)", display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: "1rem" }}>
          <p style={{ fontSize: "0.75rem", color: "#6b7280" }}>
            &copy; 2024-2026 <BrandName />. {ft.copyright}
          </p>
          <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
            <button onClick={() => toast("Feature coming soon")} style={{ fontSize: "0.75rem", color: "#9ca3af", background: "none", border: "none", cursor: "pointer" }}>{ft.privacyPolicy}</button>
            <button onClick={() => toast("Feature coming soon")} style={{ fontSize: "0.75rem", color: "#9ca3af", background: "none", border: "none", cursor: "pointer" }}>{ft.termsOfService}</button>
          </div>
        </div>
      </div>
    </footer>
  );
}

// ---- Main Landing Page ----
export default function Landing() {
  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", backgroundColor: "white", color: "#1e293b", fontFamily: "'Lato', sans-serif" }}>
      <TopInfoBar />
      <MainNav />
      <main>
        <HeroSection />
        <AboutSection />
        <ServicesSection />
        <FeaturesSection />
        <ContactSection />
      </main>
      <Footer />
    </div>
  );
}
