import { BrowserRouter, NavLink, useLocation } from "react-router-dom";
import { useCallback, useEffect, useRef, useState } from "react";
import { Languages, Link2, LogOut, Moon, Sun } from "lucide-react";
import { API, cn } from "@/lib/utils";
import { I18nProvider, useI18n } from "@/lib/i18n-context";
import { useTopBarGsap } from "@/lib/useSunnyGsap";
import { CachedPage } from "@/lib/page-cache";
import { usePageScrollCache, useVisitedPageKeys } from "@/lib/page-cache-hooks";
import SunnyRegister, { clearSunnyRegisterTaskHistory } from "@/pages/SunnyRegister";
import PublicLanding from "@/pages/PublicLanding";
import AuditLogPage from "@/pages/AuditLogPage";
import CheckoutManager from "@/pages/CheckoutManager";
import PaymentManagement from "@/pages/PaymentManagement";

function words(language: string) {
  return language === "en-US"
    ? { app: "SunnyRegister", sub: "GPT account registration manager", home: "Studio", settings: "Settings", loginTitle: "Welcome back", loginDesc: "Enter your administrator credentials.", user: "Username", pass: "Password", submit: "Sign in", checking: "Checking...", failed: "Login failed", loading: "Loading...", logout: "Sign out" }
    : { app: "SunnyRegister", sub: "Quản lý đăng ký và tài khoản GPT", home: "Bàn làm việc", settings: "Cài đặt", loginTitle: "Chào mừng trở lại", loginDesc: "Nhập tài khoản và mật khẩu quản trị viên.", user: "Tên người dùng", pass: "Mật khẩu", submit: "Đăng nhập", checking: "Đang xác minh...", failed: "Đăng nhập thất bại", loading: "Đang tải...", logout: "Đăng xuất" };
}

function TopBar({ theme, setTheme, onLogout }: { theme: string; setTheme: (v: string) => void; onLogout: () => Promise<void> }) {
  const { language, toggleLanguage } = useI18n();
  const c = words(language);
  const location = useLocation();
  const headerRef = useRef<HTMLElement | null>(null);
  useTopBarGsap(headerRef, `${location.pathname}:${language}`);
  const menus = language === "en-US"
    ? [["/", "Workbench"], ["/mailbox", "Mailbox"], ["/phone", "SMS"], ["/sub2api", "Reverse"], ["/proxy", "Proxy"], ["/session", "Account Management"], ["/checkout", "Checkout Links"], ["/payments", "Payments"], ["/audit", "Audit Logs"]]
    : [["/", "Bàn làm việc"], ["/mailbox", "Cấu hình email"], ["/phone", "Cấu hình SMS"], ["/sub2api", "Cấu hình reverse proxy"], ["/proxy", "Cấu hình proxy"], ["/session", "Quản lý tài khoản"], ["/checkout", "Quản lý liên kết"], ["/payments", "Quản lý thanh toán"], ["/audit", "Quản lý nhật ký"]];
  const navClass = (active: boolean) => cn("inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition-all", active ? "bg-[var(--accent)] text-white shadow-[var(--shadow-glow)]" : "text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]");
  return (
    <header ref={headerRef} className="sticky top-0 z-[300] border-b border-[var(--border)] bg-[var(--bg-shell)]/80 backdrop-blur-2xl">
      <div className="app-shell mx-auto grid grid-cols-[1fr_auto] items-center gap-4 py-3 lg:grid-cols-[280px_minmax(0,1fr)_160px]">
        <div className="flex min-w-0 shrink-0 items-center gap-3 justify-self-start">
          <div className="brand-mark"><Link2 className="h-5 w-5" /></div>
          <div className="hidden sm:block"><div className="text-sm font-black tracking-tight text-[var(--text-primary)]">{c.app}</div><div className="text-xs text-[var(--text-muted)]">{c.sub}</div></div>
        </div>
        <nav className="hidden w-fit max-w-full justify-center overflow-x-auto rounded-full border border-[var(--border)] bg-[var(--chip-bg)] p-1 justify-self-center lg:flex">
          {menus.map(([to, label]) => {
            const active = to === "/" ? location.pathname === "/" : location.pathname.startsWith(to);
            return <NavLink key={to} to={to} data-sunny-nav-active={active ? "true" : undefined} className={() => navClass(active)}>{label}</NavLink>;
          })}
        </nav>
        <div className="flex shrink-0 items-center justify-end gap-2 justify-self-end">
          <button className="round-tool" onClick={() => setTheme(theme === "light" ? "dark" : "light")} title={language === "vi-VN" ? (theme === "light" ? "Bật giao diện tối" : "Bật giao diện sáng") : (theme === "light" ? "Use dark theme" : "Use light theme")} aria-label={language === "vi-VN" ? (theme === "light" ? "Bật giao diện tối" : "Bật giao diện sáng") : (theme === "light" ? "Use dark theme" : "Use light theme")}>{theme === "light" ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}</button>
          <button className="round-tool min-w-12 px-3 text-xs font-bold" onClick={toggleLanguage} title={language === "vi-VN" ? "Chuyển sang English" : "Chuyển sang tiếng Việt"}><Languages className="h-4 w-4" />{language === "vi-VN" ? "VI" : "EN"}</button>
          <button className="round-tool" title={c.logout} aria-label={c.logout} onClick={onLogout}><LogOut className="h-4 w-4" /></button>
        </div>
      </div>
    </header>
  );
}

type ShellPage = "sunny" | "checkout" | "payments" | "audit";

function shellPage(pathname: string): ShellPage {
  if (pathname.startsWith("/audit")) return "audit";
  if (pathname.startsWith("/checkout")) return "checkout";
  if (pathname.startsWith("/payments")) return "payments";
  return "sunny";
}

function menuPage(pathname: string) {
  const segment = pathname.split("/").filter(Boolean)[0];
  return segment || "workbench";
}

function CachedShellPages() {
  const location = useLocation();
  const activePage = shellPage(location.pathname);
  const visitedPages = useVisitedPageKeys(activePage);
  usePageScrollCache(menuPage(location.pathname));

  return (
    <main className="app-shell mx-auto py-6 md:py-8">
      <CachedPage active={activePage === "sunny"}>{visitedPages.has("sunny") && <SunnyRegister />}</CachedPage>
      <CachedPage active={activePage === "checkout"}>{visitedPages.has("checkout") && <CheckoutManager />}</CachedPage>
      <CachedPage active={activePage === "payments"}>{visitedPages.has("payments") && <PaymentManagement />}</CachedPage>
      <CachedPage active={activePage === "audit"}>{visitedPages.has("audit") && <AuditLogPage />}</CachedPage>
    </main>
  );
}

function Shell({ theme, setTheme, onLogout }: { theme: string; setTheme: (v: string) => void; onLogout: () => Promise<void> }) {
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-[var(--bg-base)]">
        <TopBar theme={theme} setTheme={setTheme} onLogout={onLogout} />
        <CachedShellPages />
      </div>
    </BrowserRouter>
  );
}

function AppContent() {
  const { language } = useI18n();
  const c = words(language);
  const [theme, setTheme] = useState(() => localStorage.getItem("theme") === "dark" ? "dark" : "light");
  const [authState, setAuthState] = useState<"loading" | "open" | "locked" | "authed">("loading");
  const [logoutNotice, setLogoutNotice] = useState(false);
  useEffect(() => { document.documentElement.classList.toggle("light", theme === "light"); localStorage.setItem("theme", theme); }, [theme]);
  useEffect(() => { fetch(API + "/auth/check", { credentials: "include", cache: "no-store" }).then((r) => r.json()).then((data) => { if (!data.required) setAuthState("open"); else if (data.authenticated) setAuthState("authed"); else setAuthState("locked"); }).catch(() => setAuthState("locked")); }, []);
  const logout = useCallback(async () => {
    let completed = false;
    try {
      const response = await fetch(API + "/auth/logout", { method: "POST", credentials: "include", cache: "no-store" });
      completed = response.ok;
    } finally {
      window.history.replaceState(null, "", "/");
      setAuthState("locked");
      setLogoutNotice(completed);
    }
  }, []);
  if (authState === "loading") return <div className="flex h-screen items-center justify-center bg-[var(--bg-base)] text-sm text-[var(--text-muted)]">{c.loading}</div>;
  if (authState === "locked") return <PublicLanding onLogin={() => { clearSunnyRegisterTaskHistory(); setLogoutNotice(false); setAuthState("authed"); }} logoutNotice={logoutNotice} onNoticeDone={() => setLogoutNotice(false)} />;
  return <Shell theme={theme} setTheme={setTheme} onLogout={logout} />;
}

export default function App() { return <I18nProvider><AppContent /></I18nProvider>; }
