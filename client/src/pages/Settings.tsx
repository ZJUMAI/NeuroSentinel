import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/_core/hooks/useAuth";
import { useFontScale, type FontScale } from "@/contexts/FontScaleContext";
import { useLanguage, SUPPORTED_LANGUAGES } from "@/contexts/LanguageContext";
import { useTheme, type Theme } from "@/contexts/ThemeContext";
import { getLoginUrl } from "@/const";
import { trpc } from "@/lib/trpc";
import { Globe, LogIn, LogOut, SunMoon, Type, User } from "lucide-react";
import { useState } from "react";
import { Link } from "wouter";

const TEXTS: Record<string, {
  backToChat: string;
  title: string;
  subtitle: string;
  language: string;
  languageDesc: string;
  account: string;
  accountDesc: string;
  name: string;
  email: string;
  loginMethod: string;
  loginMethodEmail: string;
  loginMethodGoogle: string;
  loginMethodGithub: string;
  loginMethodManus: string;
  loginMethodUnknown: string;
  saveName: string;
  cancel: string;
  edit: string;
  logout: string;
  loginToManage: string;
  login: string;
  appearance: string;
  appearanceDesc: string;
  themeLight: string;
  themeDark: string;
  themeSystem: string;
  fontSize: string;
  fontSizeDesc: string;
  fontSm: string;
  fontMd: string;
  fontLg: string;
}> = {
  en: {
    backToChat: "← Back",
    title: "Settings",
    subtitle: "Manage your application preferences",
    language: "Language",
    languageDesc: "Choose your preferred language",
    account: "Account",
    accountDesc: "View and manage your account",
    name: "Display name",
    email: "Email",
    loginMethod: "Login method",
    loginMethodEmail: "Email",
    loginMethodGoogle: "Google",
    loginMethodGithub: "GitHub",
    loginMethodManus: "Manus",
    loginMethodUnknown: "Other",
    saveName: "Save",
    cancel: "Cancel",
    edit: "Edit",
    logout: "Log out",
    loginToManage: "Sign in to manage your account",
    login: "Sign in",
    appearance: "Appearance",
    appearanceDesc: "Light, dark, or match your system",
    themeLight: "Light",
    themeDark: "Dark",
    themeSystem: "System",
    fontSize: "Font size",
    fontSizeDesc: "Adjust base text size across the app",
    fontSm: "Small",
    fontMd: "Standard",
    fontLg: "Large",
  },
  zh: {
    backToChat: "← 返回上一页",
    title: "设置",
    subtitle: "管理您的应用偏好",
    language: "语言",
    languageDesc: "选择您偏好的语言",
    account: "账号",
    accountDesc: "查看并管理您的账号信息",
    name: "昵称",
    email: "邮箱",
    loginMethod: "登录方式",
    loginMethodEmail: "邮箱密码",
    loginMethodGoogle: "Google",
    loginMethodGithub: "GitHub",
    loginMethodManus: "Manus",
    loginMethodUnknown: "其他",
    saveName: "保存",
    cancel: "取消",
    edit: "编辑",
    logout: "退出登录",
    loginToManage: "登录以管理您的账号",
    login: "登录",
    appearance: "外观",
    appearanceDesc: "浅色、深色或跟随系统设置",
    themeLight: "浅色",
    themeDark: "深色",
    themeSystem: "跟随系统",
    fontSize: "字体大小",
    fontSizeDesc: "调整全应用的基础文字大小",
    fontSm: "小",
    fontMd: "标准",
    fontLg: "大",
  },
  es: {
    backToChat: "← Volver",
    title: "Configuración",
    subtitle: "Administra tus preferencias",
    language: "Idioma",
    languageDesc: "Elige tu idioma preferido",
    account: "Cuenta",
    accountDesc: "Ver y gestionar tu cuenta",
    name: "Nombre",
    email: "Correo",
    loginMethod: "Método de inicio",
    loginMethodEmail: "Correo",
    loginMethodGoogle: "Google",
    loginMethodGithub: "GitHub",
    loginMethodManus: "Manus",
    loginMethodUnknown: "Otro",
    saveName: "Guardar",
    cancel: "Cancelar",
    edit: "Editar",
    logout: "Cerrar sesión",
    loginToManage: "Inicia sesión para gestionar tu cuenta",
    login: "Iniciar sesión",
    appearance: "Apariencia",
    appearanceDesc: "Claro, oscuro o según el sistema",
    themeLight: "Claro",
    themeDark: "Oscuro",
    themeSystem: "Sistema",
    fontSize: "Tamaño de fuente",
    fontSizeDesc: "Ajusta el tamaño base del texto",
    fontSm: "Pequeño",
    fontMd: "Estándar",
    fontLg: "Grande",
  },
  fr: {
    backToChat: "← Retour",
    title: "Paramètres",
    subtitle: "Gérez vos préférences",
    language: "Langue",
    languageDesc: "Choisissez votre langue préférée",
    account: "Compte",
    accountDesc: "Voir et gérer votre compte",
    name: "Nom",
    email: "E-mail",
    loginMethod: "Méthode de connexion",
    loginMethodEmail: "E-mail",
    loginMethodGoogle: "Google",
    loginMethodGithub: "GitHub",
    loginMethodManus: "Manus",
    loginMethodUnknown: "Autre",
    saveName: "Enregistrer",
    cancel: "Annuler",
    edit: "Modifier",
    logout: "Déconnexion",
    loginToManage: "Connectez-vous pour gérer votre compte",
    login: "Connexion",
    appearance: "Apparence",
    appearanceDesc: "Clair, sombre ou selon le système",
    themeLight: "Clair",
    themeDark: "Sombre",
    themeSystem: "Système",
    fontSize: "Taille du texte",
    fontSizeDesc: "Taille de base dans l'application",
    fontSm: "Petit",
    fontMd: "Standard",
    fontLg: "Grand",
  },
  de: {
    backToChat: "← Zurück",
    title: "Einstellungen",
    subtitle: "Verwalten Sie Ihre Einstellungen",
    language: "Sprache",
    languageDesc: "Wählen Sie Ihre bevorzugte Sprache",
    account: "Konto",
    accountDesc: "Konto anzeigen und verwalten",
    name: "Anzeigename",
    email: "E-Mail",
    loginMethod: "Anmeldemethode",
    loginMethodEmail: "E-Mail",
    loginMethodGoogle: "Google",
    loginMethodGithub: "GitHub",
    loginMethodManus: "Manus",
    loginMethodUnknown: "Sonstige",
    saveName: "Speichern",
    cancel: "Abbrechen",
    edit: "Bearbeiten",
    logout: "Abmelden",
    loginToManage: "Melden Sie sich an, um Ihr Konto zu verwalten",
    login: "Anmelden",
    appearance: "Erscheinungsbild",
    appearanceDesc: "Hell, dunkel oder Systemeinstellung",
    themeLight: "Hell",
    themeDark: "Dunkel",
    themeSystem: "System",
    fontSize: "Schriftgröße",
    fontSizeDesc: "Basisschriftgröße in der App",
    fontSm: "Klein",
    fontMd: "Standard",
    fontLg: "Groß",
  },
  ja: {
    backToChat: "← 戻る",
    title: "設定",
    subtitle: "アプリの設定を管理",
    language: "言語",
    languageDesc: "お好みの言語を選択",
    account: "アカウント",
    accountDesc: "アカウント情報の表示と管理",
    name: "表示名",
    email: "メール",
    loginMethod: "ログイン方法",
    loginMethodEmail: "メール",
    loginMethodGoogle: "Google",
    loginMethodGithub: "GitHub",
    loginMethodManus: "Manus",
    loginMethodUnknown: "その他",
    saveName: "保存",
    cancel: "キャンセル",
    edit: "編集",
    logout: "ログアウト",
    loginToManage: "アカウントを管理するにはログインしてください",
    login: "ログイン",
    appearance: "外観",
    appearanceDesc: "ライト、ダーク、またはシステムに合わせる",
    themeLight: "ライト",
    themeDark: "ダーク",
    themeSystem: "システム連動",
    fontSize: "フォントサイズ",
    fontSizeDesc: "アプリ全体の基準となる文字サイズ",
    fontSm: "小",
    fontMd: "標準",
    fontLg: "大",
  },
  ko: {
    backToChat: "← 뒤로",
    title: "설정",
    subtitle: "앱 환경설정 관리",
    language: "언어",
    languageDesc: "선호하는 언어를 선택하세요",
    account: "계정",
    accountDesc: "계정 정보 보기 및 관리",
    name: "표시 이름",
    email: "이메일",
    loginMethod: "로그인 방식",
    loginMethodEmail: "이메일",
    loginMethodGoogle: "Google",
    loginMethodGithub: "GitHub",
    loginMethodManus: "Manus",
    loginMethodUnknown: "기타",
    saveName: "저장",
    cancel: "취소",
    edit: "편집",
    logout: "로그아웃",
    loginToManage: "계정을 관리하려면 로그인하세요",
    login: "로그인",
    appearance: "모양",
    appearanceDesc: "밝게, 어둡게 또는 시스템 설정 따르기",
    themeLight: "라이트",
    themeDark: "다크",
    themeSystem: "시스템",
    fontSize: "글자 크기",
    fontSizeDesc: "앱 전체 기본 텍스트 크기",
    fontSm: "작게",
    fontMd: "표준",
    fontLg: "크게",
  },
};

function getLoginMethodLabel(method: string | null | undefined, t: typeof TEXTS.en): string {
  if (!method) return t.loginMethodUnknown;
  const m = method.toLowerCase();
  if (m === "email") return t.loginMethodEmail;
  if (m === "google") return t.loginMethodGoogle;
  if (m === "github") return t.loginMethodGithub;
  if (m === "manus") return t.loginMethodManus;
  return t.loginMethodUnknown;
}

export default function Settings() {
  const { language, setLanguage } = useLanguage();
  const { theme, setTheme } = useTheme();
  const { fontScale, setFontScale } = useFontScale();
  const { user, logout } = useAuth();
  const utils = trpc.useUtils();
  const [editingName, setEditingName] = useState<string | null>(null);
  const t = TEXTS[language] ?? TEXTS.en;

  const updateProfileMutation = trpc.auth.updateProfile.useMutation({
    onSuccess: () => {
      utils.auth.me.invalidate();
      setEditingName(null);
    },
  });

  const handleSaveName = () => {
    if (editingName === null || !user) return;
    const trimmed = editingName.trim();
    if (trimmed === (user.name ?? "")) {
      setEditingName(null);
      return;
    }
    updateProfileMutation.mutate({ name: trimmed });
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-2xl mx-auto px-4 py-8">
        <Button
          variant="ghost"
          size="sm"
          className="mb-6"
          onClick={() => window.history.back()}
        >
          {t.backToChat}
        </Button>

        <Card>
          <CardHeader>
            <h1 className="text-2xl font-semibold">{t.title}</h1>
            <p className="text-sm text-muted-foreground">
              {t.subtitle}
            </p>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Account section */}
            <div className="flex flex-col gap-4 rounded-lg border border-border p-4">
              <div className="flex items-center gap-3">
                <User className="size-5 text-muted-foreground shrink-0" />
                <div>
                  <p className="font-medium">{t.account}</p>
                  <p className="text-sm text-muted-foreground">
                    {t.accountDesc}
                  </p>
                </div>
              </div>
              {user ? (
                <div className="space-y-4 pl-8">
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-muted-foreground">{t.name}</p>
                    {editingName !== null ? (
                      <div className="flex gap-2">
                        <Input
                          value={editingName}
                          onChange={(e) => setEditingName(e.target.value)}
                          placeholder={t.name}
                          className="max-w-xs"
                        />
                        <Button
                          size="sm"
                          onClick={handleSaveName}
                          disabled={updateProfileMutation.isPending}
                        >
                          {t.saveName}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setEditingName(null)}
                          disabled={updateProfileMutation.isPending}
                        >
                          {t.cancel}
                        </Button>
                      </div>
                    ) : (
                      <p className="text-sm">
                        {user.name || "-"}
                        <Button
                          variant="link"
                          size="sm"
                          className="ml-2 h-auto p-0 text-primary"
                          onClick={() => setEditingName(user.name ?? "")}
                        >
                          {t.edit}
                        </Button>
                      </p>
                    )}
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-muted-foreground">{t.email}</p>
                    <p className="text-sm">{user.email || "-"}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-muted-foreground">{t.loginMethod}</p>
                    <p className="text-sm">{getLoginMethodLabel(user.loginMethod, t)}</p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-2"
                    onClick={() => logout()}
                  >
                    <LogOut className="size-4 mr-2" />
                    {t.logout}
                  </Button>
                </div>
              ) : (
                <div className="pl-8">
                  <p className="text-sm text-muted-foreground mb-4">{t.loginToManage}</p>
                  {(() => {
                    const loginUrl = getLoginUrl();
                    const btn = (
                      <Button variant="default" size="sm">
                        <LogIn className="size-4 mr-2" />
                        {t.login}
                      </Button>
                    );
                    return loginUrl.startsWith("/") ? (
                      <Link href={loginUrl}>{btn}</Link>
                    ) : (
                      <a href={loginUrl}>{btn}</a>
                    );
                  })()}
                </div>
              )}
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 rounded-lg border border-border p-4">
              <div className="flex items-center gap-3">
                <SunMoon className="size-5 text-muted-foreground shrink-0" />
                <div>
                  <p className="font-medium">{t.appearance}</p>
                  <p className="text-sm text-muted-foreground">
                    {t.appearanceDesc}
                  </p>
                </div>
              </div>
              <Select
                value={theme}
                onValueChange={(v) => setTheme(v as Theme)}
              >
                <SelectTrigger className="w-[180px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="light">{t.themeLight}</SelectItem>
                  <SelectItem value="dark">{t.themeDark}</SelectItem>
                  <SelectItem value="system">{t.themeSystem}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 rounded-lg border border-border p-4">
              <div className="flex items-center gap-3">
                <Type className="size-5 text-muted-foreground shrink-0" />
                <div>
                  <p className="font-medium">{t.fontSize}</p>
                  <p className="text-sm text-muted-foreground">
                    {t.fontSizeDesc}
                  </p>
                </div>
              </div>
              <Select
                value={fontScale}
                onValueChange={(v) => setFontScale(v as FontScale)}
              >
                <SelectTrigger className="w-[180px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="sm">{t.fontSm}</SelectItem>
                  <SelectItem value="md">{t.fontMd}</SelectItem>
                  <SelectItem value="lg">{t.fontLg}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 rounded-lg border border-border p-4">
              <div className="flex items-center gap-3">
                <Globe className="size-5 text-muted-foreground shrink-0" />
                <div>
                  <p className="font-medium">{t.language}</p>
                  <p className="text-sm text-muted-foreground">
                    {t.languageDesc}
                  </p>
                </div>
              </div>
              <Select value={language} onValueChange={setLanguage}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SUPPORTED_LANGUAGES.map((lang) => (
                    <SelectItem key={lang.code} value={lang.code}>
                      {lang.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
