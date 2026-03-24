import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import Settings from "@/pages/Settings";
import { motion, AnimatePresence } from "framer-motion";
import { Route, Switch, useLocation } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { FontScaleProvider } from "./contexts/FontScaleContext";
import { LanguageProvider } from "./contexts/LanguageContext";
import { ThemeProvider } from "./contexts/ThemeContext";
import ChatPage from "./pages/Chat";
import Landing from "./pages/Landing";
import Login from "./pages/Login";
import SharedConversation from "./pages/SharedConversation";
import KnowledgeLibrary from "./pages/KnowledgeLibrary";

const pageTransition = {
  initial: { opacity: 0, y: 24 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -24 },
  transition: { duration: 0.35, ease: [0.25, 0.46, 0.45, 0.94] },
};

function Router() {
  const [location] = useLocation();

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={location}
        initial={pageTransition.initial}
        animate={pageTransition.animate}
        exit={pageTransition.exit}
        transition={pageTransition.transition}
        style={{ minHeight: "100vh" }}
      >
        <Switch>
          <Route path={"/"} component={Landing} />
          <Route path={"/login"} component={Login} />
          <Route path={"/chat"} component={ChatPage} />
          <Route path={"/chat/:id"} component={ChatPage} />
          <Route path={"/library"} component={KnowledgeLibrary} />
          <Route path={"/shared/:token"} component={SharedConversation} />
          <Route path={"/settings"} component={Settings} />
          <Route path={"/404"} component={NotFound} />
          <Route component={NotFound} />
        </Switch>
      </motion.div>
    </AnimatePresence>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="dark" switchable>
        <FontScaleProvider>
          <LanguageProvider>
            <TooltipProvider>
              <Toaster />
              <Router />
            </TooltipProvider>
          </LanguageProvider>
        </FontScaleProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
