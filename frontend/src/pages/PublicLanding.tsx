import { useCallback, useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import {
  Activity,
  ArrowRight,
  CheckCircle2,
  Database,
  GitBranch,
  KeyRound,
  Languages,
  Link2,
  LogIn,
  Mail,
  Network,
  PhoneCall,
  Route,
  ShieldCheck,
  Terminal,
  Users,
  X,
} from "lucide-react";
import { API } from "@/lib/utils";
import { useI18n } from "@/lib/i18n-context";

gsap.registerPlugin(useGSAP);

const GITHUB_URL = "https://github.com/pxygit/SunnyRegister";

const COPY = {
  "vi-VN": {
    sub: "Quản lý đăng ký và tài khoản GPT",
    github: "Xem kho mã nguồn mở trên GitHub",
    language: "Chuyển sang English",
    login: "Đăng nhập",
    eyebrow: "Quy trình đăng ký tài khoản hợp nhất",
    lead: "Đưa xác minh email, đăng ký tài khoản, liên kết số điện thoại, định tuyến proxy, nhập reverse proxy và quản lý Session vào một không gian làm việc yên tĩnh, có kiểm soát.",
    openConsole: "Mở bảng điều khiển",
    source: "Xem mã nguồn",
    live: "Quy trình đang chạy",
    ready: "Tài nguyên đã sẵn sàng",
    running: "Đang tự động đăng ký",
    complete: "Session đã được lưu an toàn",
    accounts: "Tài khoản",
    mailboxes: "Tài nguyên email",
    successRate: "Tiến độ tác vụ",
    sectionEyebrow: "Năng lực cốt lõi",
    sectionTitle: "Quan sát được từ cấu hình tài nguyên đến bàn giao tài khoản",
    sectionDesc: "Bật từng giai đoạn độc lập khi nhật ký tác vụ và trạng thái tài khoản được cập nhật theo thời gian thực.",
    features: [
      ["Quản lý nhóm email", "Nhập hàng loạt email Outlook với chức năng nhóm, trạng thái, truy vấn thư và bật/tắt tài nguyên."],
      ["Không gian đăng ký", "Tạo tác vụ theo lô email, nhận diện luồng đăng ký hoặc đăng nhập và theo dõi nhật ký từng tài khoản."],
      ["Điều phối SMS", "Quản lý tập số điện thoại tự xây dựng và nhà cung cấp SMS bên ngoài theo khả năng sẵn sàng."],
      ["Định tuyến proxy", "Quản lý sức khỏe proxy và nhãn quốc gia để cung cấp lối ra riêng cho lưu lượng đăng ký."],
      ["Tích hợp reverse proxy", "Nhập tài khoản đã hoàn tất vào sub2api và lưu kết quả của từng bước thực thi."],
      ["Quản lý Session", "Tập trung lưu và xuất Auth Session, Access Token cùng thông tin tài khoản hợp lệ."],
    ],
    flowEyebrow: "Kiểm soát từng giai đoạn",
    flowTitle: "Một quy trình đăng ký rõ ràng",
    flowDesc: "Chọn giai đoạn kết thúc cho từng tác vụ. Kết quả hoàn tất được lưu ngay và tài nguyên chưa bật sẽ không bị sử dụng.",
    flow: ["Xác minh email", "Đăng ký / đăng nhập", "Liên kết số điện thoại", "Nhập reverse proxy"],
    secureTitle: "Cổng quản trị được bảo vệ bằng phiên đăng nhập",
    secureDesc: "Khách chưa đăng nhập chỉ xem được phần giới thiệu dự án. Giao diện quản trị và dữ liệu nghiệp vụ chỉ tải sau khi xác thực.",
    drawerTitle: "Đăng nhập SunnyRegister",
    drawerDesc: "Dùng thông tin quản trị viên để mở bảng điều khiển đăng ký.",
    username: "Tên người dùng",
    password: "Mật khẩu",
    submit: "Đăng nhập an toàn",
    checking: "Đang xác minh...",
    failed: "Đăng nhập thất bại, hãy kiểm tra tên người dùng và mật khẩu",
    tooMany: "Bạn thử đăng nhập quá nhiều lần, hãy thử lại sau",
    close: "Đóng bảng đăng nhập",
    protected: "Phiên quản trị được bảo vệ",
    logoutSuccess: "Đã đăng xuất an toàn",
    footer: "Không gian đăng ký mã nguồn mở",
  },
  "en-US": {
    sub: "GPT account registration and management",
    github: "View the GitHub repository",
    language: "Switch to Vietnamese",
    login: "Sign in",
    eyebrow: "Unified account registration workflow",
    lead: "Bring mailbox verification, account registration, phone binding, proxy routing, reverse-platform import, and Session management into one calm, controlled workspace.",
    openConsole: "Open console",
    source: "View source",
    live: "Live workflow",
    ready: "Resources ready",
    running: "Registration in progress",
    complete: "Session securely stored",
    accounts: "Accounts",
    mailboxes: "Mailboxes",
    successRate: "Task progress",
    sectionEyebrow: "Core capabilities",
    sectionTitle: "Observable from resource setup to account delivery",
    sectionDesc: "Enable each stage independently while task logs and account states update in real time.",
    features: [
      ["Mailbox pools", "Import Outlook mailboxes in bulk with grouping, status, mail query, and enable controls."],
      ["Registration workspace", "Create mailbox batches, detect register or login paths, and follow per-account logs."],
      ["SMS orchestration", "Coordinate self-managed phone pools and external SMS providers by availability."],
      ["Proxy routing", "Manage proxy health and country labels to provide dedicated registration egress."],
      ["Reverse integration", "Import completed accounts into sub2api and retain each execution result."],
      ["Session management", "Store and export Auth Sessions, Access Tokens, and valid account data centrally."],
    ],
    flowEyebrow: "Stage control",
    flowTitle: "One clear registration pipeline",
    flowDesc: "Choose the final stage per task. Completed results persist immediately, and disabled resources stay untouched.",
    flow: ["Mail verification", "Register / login", "Phone binding", "Reverse import"],
    secureTitle: "Protected administration entry",
    secureDesc: "Signed-out visitors only see the product overview. Management UI and business data load after authentication.",
    drawerTitle: "Sign in to SunnyRegister",
    drawerDesc: "Use administrator credentials to open the registration console.",
    username: "Username",
    password: "Password",
    submit: "Secure sign in",
    checking: "Verifying...",
    failed: "Sign-in failed. Check your username and password.",
    tooMany: "Too many sign-in attempts. Please try again later.",
    close: "Close sign-in panel",
    protected: "Protected admin session",
    logoutSuccess: "Signed out securely",
    footer: "Open source registration workspace",
  },
} as const;

const FEATURE_ICONS = [Mail, Users, PhoneCall, Route, Network, Database];

type PublicLandingProps = {
  onLogin: () => void;
  logoutNotice?: boolean;
  onNoticeDone?: () => void;
};

export default function PublicLanding({ onLogin, logoutNotice = false, onNoticeDone }: PublicLandingProps) {
  const { language, toggleLanguage } = useI18n();
  const c = COPY[language];
  const rootRef = useRef<HTMLDivElement | null>(null);
  const usernameRef = useRef<HTMLInputElement | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const closeDrawer = useCallback(() => {
    if (loading) return;
    setDrawerOpen(false);
    setError("");
    setUsername("");
    setPassword("");
  }, [loading]);

  useGSAP(
    () => {
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      const timeline = gsap.timeline({ defaults: { ease: "power3.out" } });
      timeline
        .from(".public-nav", { autoAlpha: 0, y: -14, duration: 0.42 })
        .from(".public-hero-copy > *", { autoAlpha: 0, y: 22, duration: 0.48, stagger: 0.07 }, "-=0.18")
        .from(".public-console", { autoAlpha: 0, y: 28, scale: 0.985, duration: 0.58 }, "-=0.28")
        .from(".public-console-row", { autoAlpha: 0, x: -12, duration: 0.3, stagger: 0.055 }, "-=0.24")
        .from(".public-feature", { autoAlpha: 0, y: 18, duration: 0.4, stagger: 0.045 }, "-=0.08");
    },
    { scope: rootRef },
  );

  useGSAP(
    () => {
      if (!drawerOpen || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      gsap.fromTo(".public-drawer-mask", { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.18 });
      gsap.fromTo(".public-login-drawer", { x: "100%" }, { x: 0, duration: 0.42, ease: "power3.out" });
    },
    { scope: rootRef, dependencies: [drawerOpen], revertOnUpdate: true },
  );

  useEffect(() => {
    if (!drawerOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const timer = window.setTimeout(() => usernameRef.current?.focus(), 120);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeDrawer();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [drawerOpen, closeDrawer]);

  useEffect(() => {
    if (!logoutNotice) return;
    const timer = window.setTimeout(() => onNoticeDone?.(), 3200);
    return () => window.clearTimeout(timer);
  }, [logoutNotice, onNoticeDone]);

  function openDrawer() {
    setError("");
    setDrawerOpen(true);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!username.trim() || !password || loading) return;
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`${API}/auth/login`, {
        method: "POST",
        credentials: "include",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim(), password }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.ok) throw new Error(response.status === 429 ? c.tooMany : c.failed);
      setPassword("");
      onLogin();
    } catch (reason) {
      setPassword("");
      setError(reason instanceof Error && reason.message ? reason.message : c.failed);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div ref={rootRef} className="public-landing">
      {logoutNotice && (
        <div className="public-toast" role="status">
          <CheckCircle2 aria-hidden="true" />
          <span>{c.logoutSuccess}</span>
        </div>
      )}

      <header className="public-nav">
        <a className="public-brand" href="#top" aria-label="SunnyRegister">
          <span className="brand-mark"><Link2 aria-hidden="true" /></span>
          <span><strong>SunnyRegister</strong><small>{c.sub}</small></span>
        </a>
        <div className="public-nav-actions">
          <a className="round-tool" href={GITHUB_URL} target="_blank" rel="noreferrer" title={c.github} aria-label={c.github}>
            <GitBranch aria-hidden="true" />
          </a>
          <button type="button" className="round-tool public-language" onClick={toggleLanguage} title={c.language} aria-label={c.language}>
            <Languages aria-hidden="true" /><span>{language === "vi-VN" ? "VI" : "EN"}</span>
          </button>
          <button type="button" className="public-login-button" onClick={openDrawer}>
            <LogIn aria-hidden="true" /><span>{c.login}</span>
          </button>
        </div>
      </header>

      <main id="top">
        <section className="public-hero" aria-labelledby="public-title">
          <div className="public-hero-copy">
            <div className="public-eyebrow"><Activity aria-hidden="true" />{c.eyebrow}</div>
            <h1 id="public-title">SunnyRegister</h1>
            <p>{c.lead}</p>
            <div className="public-hero-actions">
              <button type="button" className="public-primary-button" onClick={openDrawer}>{c.openConsole}<ArrowRight aria-hidden="true" /></button>
              <a className="public-secondary-button" href={GITHUB_URL} target="_blank" rel="noreferrer"><GitBranch aria-hidden="true" />{c.source}</a>
            </div>
          </div>

          <div className="public-console" aria-label={c.live}>
            <div className="public-console-head">
              <div><Terminal aria-hidden="true" /><strong>{c.live}</strong></div>
              <span><i />{c.ready}</span>
            </div>
            <div className="public-console-stats">
              <div><small>{c.accounts}</small><strong>128</strong><span>+12</span></div>
              <div><small>{c.mailboxes}</small><strong>240</strong><span>92%</span></div>
              <div><small>{c.successRate}</small><strong>84%</strong><span>21 / 25</span></div>
            </div>
            <div className="public-console-body">
              <div className="public-console-row done"><CheckCircle2 /><span><strong>Outlook-024</strong><small>{c.complete}</small></span><b>Free</b></div>
              <div className="public-console-row running"><Activity /><span><strong>Outlook-025</strong><small>{c.running}</small></span><b>72%</b></div>
              <div className="public-console-row"><Mail /><span><strong>Outlook-026</strong><small>{c.ready}</small></span><b>Ready</b></div>
            </div>
          </div>
        </section>

        <section className="public-section" aria-labelledby="features-title">
          <div className="public-section-heading">
            <span>{c.sectionEyebrow}</span>
            <h2 id="features-title">{c.sectionTitle}</h2>
            <p>{c.sectionDesc}</p>
          </div>
          <div className="public-feature-grid">
            {c.features.map(([title, description], index) => {
              const Icon = FEATURE_ICONS[index];
              return <article className="public-feature" key={title}><div><Icon aria-hidden="true" /></div><h3>{title}</h3><p>{description}</p></article>;
            })}
          </div>
        </section>

        <section className="public-flow-section" aria-labelledby="flow-title">
          <div className="public-flow-copy">
            <span>{c.flowEyebrow}</span>
            <h2 id="flow-title">{c.flowTitle}</h2>
            <p>{c.flowDesc}</p>
          </div>
          <div className="public-flow">
            {c.flow.map((label, index) => <div key={label}><b>{String(index + 1).padStart(2, "0")}</b><span>{label}</span>{index < c.flow.length - 1 && <ArrowRight aria-hidden="true" />}</div>)}
          </div>
          <div className="public-security-note"><ShieldCheck aria-hidden="true" /><div><strong>{c.secureTitle}</strong><p>{c.secureDesc}</p></div></div>
        </section>
      </main>

      <footer className="public-footer"><span>SunnyRegister</span><span>{c.footer}</span></footer>

      {drawerOpen && (
        <div className="public-drawer-mask" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closeDrawer(); }}>
          <aside className="public-login-drawer" role="dialog" aria-modal="true" aria-labelledby="login-title">
            <div className="public-drawer-head">
              <div className="brand-mark"><KeyRound aria-hidden="true" /></div>
              <button type="button" className="round-tool" onClick={closeDrawer} disabled={loading} title={c.close} aria-label={c.close}><X aria-hidden="true" /></button>
            </div>
            <div className="public-login-heading">
              <span><ShieldCheck aria-hidden="true" />{c.protected}</span>
              <h2 id="login-title">{c.drawerTitle}</h2>
              <p>{c.drawerDesc}</p>
            </div>
            <form onSubmit={submit} className="public-login-form">
              <label><span>{c.username}</span><input ref={usernameRef} value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" spellCheck={false} /></label>
              <label><span>{c.password}</span><input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" /></label>
              {error && <p className="public-login-error" role="alert">{error}</p>}
              <button type="submit" className="public-primary-button public-submit" disabled={loading || !username.trim() || !password}>
                {loading ? c.checking : c.submit}<ArrowRight aria-hidden="true" />
              </button>
            </form>
          </aside>
        </div>
      )}
    </div>
  );
}
