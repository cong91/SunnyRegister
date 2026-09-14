import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import {
  CheckCircle2, CreditCard, Download, FileUp, Link2, Loader2, LogIn, Play,
  RefreshCw, ShieldCheck, Square, Trash2, UserRound, XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiFetch, cn, triggerBrowserDownload } from "@/lib/utils";

type Row = Record<string, any>;
type FlowMode = "full" | "bind_only" | "link_pay" | "link_only";
type ImportMode = "token" | "credential";
type PoolCard = {
  card_id: string;
  last4: string;
  exp_month: string;
  exp_year: string;
  status: "available" | "reserved" | "used" | "failed";
  account: string;
  error: string;
};
type CardElement = { mount: (target: HTMLElement) => void; unmount: () => void; on: (event: string, callback: (value: Row) => void) => void };
type StripeClient = {
  elements: () => { create: (type: string, options?: Row) => CardElement };
  createPaymentMethod: (options: Row) => Promise<Row>;
};

declare global {
  interface Window { Stripe?: (key: string) => StripeClient }
}

type DirectAccount = {
  id: string;
  token: string;
  email: string;
  accountId: string;
  selected: boolean;
  status: "idle" | "running" | "success" | "error";
  stage: string;
  error: string;
  link: string;
  taskId: string;
  billing?: Row;
  fingerprint?: string;
  fingerprintId?: string;
  steps?: Row[];
};

const MARKET_CURRENCIES: Record<string, string> = {
  VN: "VND",
  US: "USD",
  PH: "PHP",
  GB: "GBP",
  JP: "JPY",
  KR: "KRW",
  AU: "AUD",
  CA: "CAD",
  SG: "SGD",
  TH: "THB",
  ID: "IDR",
  BR: "BRL",
  IN: "INR",
  DE: "EUR",
};

const ACCOUNT_KEY = "sunny:direct-card:accounts:v1";
const SETTINGS_KEY = "sunny:direct-card:settings:v1";
const ACTIVE_TASKS = new Set(["queued", "running"]);
const api = (path: string, body?: Row) => apiFetch(`/payments/gopay/direct-card${path}`, body === undefined ? undefined : { method: "POST", body: JSON.stringify(body) });

function decodeAccount(token: string) {
  try {
    const part = token.split(".")[1];
    const raw = part.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(part.length / 4) * 4, "=");
    const claims = JSON.parse(decodeURIComponent(Array.from(atob(raw), (char) => `%${char.charCodeAt(0).toString(16).padStart(2, "0")}`).join("")));
    const profile = claims["https://api.openai.com/profile"] || {};
    const auth = claims["https://api.openai.com/auth"] || {};
    return { email: String(profile.email || claims.email || ""), accountId: String(auth.chatgpt_account_id || auth.account_id || claims.chatgpt_account_id || claims.account_id || "") };
  } catch { return { email: "", accountId: "" }; }
}

function extractTokens(value: string) {
  const named = [...value.matchAll(/["']access_token["']\s*:\s*["'](eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*)["']/gi)].map((match) => match[1]);
  const candidates = named.length ? named : value.match(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*/g) || value.split(/[\r\n,;]+/);
  return [...new Set(candidates.map((item) => item.trim().replace(/^["']|["']$/g, "")).filter((token) => decodeAccount(token).accountId))];
}

function parseCredentialLines(value: string) {
  return value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((line) => {
    const parts = line.split(/[｜|\t]/).map((part) => part.trim()).filter(Boolean);
    return { email: parts[0] || "", password: parts[1] || "", totpSecret: parts[2] || "" };
  });
}

function parseProxyPool(value: string) {
  const source = value.trim();
  if (!source) return [];
  let items: unknown[] = [];
  if (source.startsWith("[")) try { const parsed = JSON.parse(source); if (Array.isArray(parsed)) items = parsed; } catch { /* use text parsing */ }
  if (!items.length) items = source.split(/[\s,;，；]+/);
  return [...new Set(items.map((item) => String(item || "").trim().replace(/^["']|["']$/g, "")).filter(Boolean))].slice(0, 500);
}

function loadAccounts(): DirectAccount[] {
  try {
    const items = JSON.parse(localStorage.getItem(ACCOUNT_KEY) || "[]");
    return Array.isArray(items) ? items : [];
  } catch { return []; }
}

function loadSettings() {
  try { return JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}"); } catch { return {}; }
}

function hasBilling(value?: Row, marketCountry?: string) {
  return Boolean(value?.name && value?.line1 && value?.city && value?.postal_code && value?.country && (!marketCountry || String(value.country).toUpperCase() === marketCountry));
}

async function fetchBillingBatch(items: DirectAccount[], marketCountry: string) {
  const results = new Map<string, Row>();
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const account = items[cursor++];
      const response = await api("/address", { market_country: marketCountry, market_currency: MARKET_CURRENCIES[marketCountry] });
      results.set(account.id, response.billing || {});
    }
  }
  await Promise.all(Array.from({ length: Math.min(8, items.length) }, worker));
  return results;
}

let stripePromise: Promise<(key: string) => StripeClient> | null = null;
function ensureStripe() {
  const existingStripe = window.Stripe;
  if (typeof existingStripe === "function") return Promise.resolve(existingStripe);
  if (stripePromise) return stripePromise;
  stripePromise = new Promise<(key: string) => StripeClient>((resolve, reject) => {
    document.querySelectorAll("script[data-direct-stripe-loader], script[data-direct-card-stripe]").forEach((node) => node.remove());
    const script = document.createElement("script");
    script.src = "https://js.stripe.com/v3/";
    script.async = true;
    script.dataset.directStripeLoader = "1";
    const timer = window.setTimeout(() => { script.remove(); reject(new Error("Stripe 安全组件加载超时，请检查浏览器网络或拦截扩展后重试")); }, 20000);
    script.addEventListener("load", () => {
      window.clearTimeout(timer);
      const loadedStripe = window.Stripe;
      if (typeof loadedStripe === "function") resolve(loadedStripe);
      else reject(new Error("Stripe 安全组件脚本已返回，但组件没有初始化"));
    }, { once: true });
    script.addEventListener("error", () => {
      window.clearTimeout(timer);
      reject(new Error("Stripe 安全组件加载失败，请检查浏览器网络或拦截扩展后重试"));
    }, { once: true });
    document.head.appendChild(script);
  }).catch((error) => { stripePromise = null; throw error; });
  return stripePromise;
}

function csvCell(value: unknown) { return `"${String(value ?? "").replace(/"/g, "\"\"")}"`; }

export default function DirectCardPayment() {
  const settings = useMemo(loadSettings, []);
  const [accounts, setAccounts] = useState<DirectAccount[]>(loadAccounts);
  const [importText, setImportText] = useState("");
  const [importMode, setImportMode] = useState<ImportMode>(settings.importMode === "credential" ? "credential" : "token");
  const [cards, setCards] = useState<PoolCard[]>([]);
  const [cardPoolText, setCardPoolText] = useState("");
  const [usePool, setUsePool] = useState(Boolean(settings.useCardPool));
  const [bindProxies, setBindProxies] = useState(String(settings.bindProxies || ""));
  const [promoProxies, setPromoProxies] = useState(String(settings.promoProxies || ""));
  const [marketCountry, setMarketCountry] = useState(String(settings.marketCountry || "VN").toUpperCase());
  const [concurrency, setConcurrency] = useState(Math.max(1, Math.min(50, Math.trunc(Number(settings.concurrency) || 1))));
  const [busy, setBusy] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [cardReady, setCardReady] = useState(false);
  const [cardComplete, setCardComplete] = useState({ number: false, expiry: false, cvc: false });
  const [message, setMessage] = useState("等待导入账号");
  const [jobs, setJobs] = useState<Row[]>([]);
  const stripeRef = useRef<StripeClient | null>(null);
  const cardElements = useRef<Record<string, CardElement>>({});
  const numberHost = useRef<HTMLDivElement>(null);
  const expiryHost = useRef<HTMLDivElement>(null);
  const cvcHost = useRef<HTMLDivElement>(null);
  const stopRef = useRef(false);
  const accountsRef = useRef(accounts);

  const selected = accounts.filter((item) => item.selected);
  const bindPool = parseProxyPool(bindProxies);
  const promoPool = parseProxyPool(promoProxies);
  const effectivePromoPool = promoPool.length ? promoPool : bindPool;
  const effectiveBindPool = bindPool.length ? bindPool : promoPool;
  const activeCount = jobs.filter((item) => ACTIVE_TASKS.has(String(item.status))).length;
  const poolAvailable = cards.filter((item) => item.status === "available").length;
  const poolMode = usePool && poolAvailable > 0;

  useEffect(() => { localStorage.setItem(ACCOUNT_KEY, JSON.stringify(accounts)); }, [accounts]);
  useEffect(() => { accountsRef.current = accounts; }, [accounts]);
  useEffect(() => { localStorage.setItem(SETTINGS_KEY, JSON.stringify({ bindProxies, promoProxies, marketCountry, concurrency, importMode, useCardPool: usePool })); }, [bindProxies, promoProxies, marketCountry, concurrency, importMode, usePool]);
  useEffect(() => {
    void refreshJobs();
    void refreshCards();
    const timer = window.setInterval(() => { void refreshJobs(); void refreshCards(); }, 3000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => () => Object.values(cardElements.current).forEach((element) => element.unmount()), []);

  function patchAccount(id: string, patch: Partial<DirectAccount>) {
    setAccounts((current) => current.map((item) => item.id === id ? { ...item, ...patch } : item));
  }

  async function refreshJobs() {
    try { const result = await api("/jobs"); setJobs(result.jobs || []); } catch { /* worker may be offline during page load */ }
  }

  async function refreshCards() {
    try { const result = await api("/cards/list"); setCards(result.cards || []); } catch { /* worker may be offline during page load */ }
  }

  async function importCards() {
    const lines = cardPoolText.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    if (!lines.length) return setMessage("请输入卡片行，格式：卡号 | MM/YY | CVC");
    setBusy(true);
    try {
      const result = await api("/cards/add", { lines });
      const invalidNote = (result.invalid || []).map((item: Row) => `${item.line}：${item.error}`).join("；");
      setCardPoolText("");
      const duplicateNote = (result.duplicates || []).length ? ` · 重复 ${(result.duplicates || []).length}` : "";
      setMessage(`已导入 ${(result.added || []).length} 张卡片到卡池${duplicateNote}${invalidNote ? ` · ${invalidNote}` : ""}`);
      await refreshCards();
    } catch (error) { setMessage(error instanceof Error ? error.message : "导入卡池失败"); }
    finally { setBusy(false); }
  }

  async function removeCard(cardId: string) {
    setBusy(true);
    try { await api("/cards/delete", { card_ids: [cardId] }); await refreshCards(); }
    catch (error) { setMessage(error instanceof Error ? error.message : "删除卡片失败"); }
    finally { setBusy(false); }
  }

  async function prepareAccounts(additions: DirectAccount[]) {
    setAccounts((current) => [...current, ...additions]);
    setMessage(`正在为 ${additions.length} 个账号分配环境指纹`);
    try {
      const result = await api("/fingerprints", { market_country: marketCountry, market_currency: MARKET_CURRENCIES[marketCountry], accounts: additions.map((item) => ({ client_id: item.id, access_token: item.token })) });
      const profiles = new Map<string, Row>((result.items || []).map((item: Row) => [String(item.client_id), item]));
      setAccounts((current) => current.map((item) => {
        const profile = profiles.get(item.id);
        return profile ? { ...item, email: profile.email || item.email, fingerprint: profile.fingerprint || "", fingerprintId: profile.fingerprint_id || "", stage: profile.ok ? "环境已就绪" : "指纹分配失败", error: profile.ok ? "" : String(profile.error || "指纹分配失败") } : item;
      }));
      const billing = await fetchBillingBatch(additions, marketCountry);
      setAccounts((current) => current.map((item) => billing.has(item.id) ? { ...item, billing: billing.get(item.id), stage: "环境与账单地址已就绪" } : item));
      return true;
    } catch (error) { setMessage(error instanceof Error ? error.message : "指纹分配失败"); return false; }
  }

  async function importAccounts(value: string) {
    const tokens = extractTokens(value);
    if (!tokens.length) return setMessage("没有识别到包含账号 ID 的 Access Token");
    const known = new Set(accounts.map((item) => item.accountId));
    const additions = tokens.map((token, index) => {
      const decoded = decodeAccount(token);
      return { id: `${Date.now()}-${index}`, token, ...decoded, selected: true, status: "idle" as const, stage: "正在分配环境指纹", error: "", link: "", taskId: "" };
    }).filter((item) => !known.has(item.accountId));
    if (!additions.length) return setMessage("导入账号已存在于列表中");
    setImportText("");
    if (await prepareAccounts(additions)) setMessage(`已导入 ${additions.length} 个账号`);
  }

  async function importCredentialAccounts(value: string) {
    const lines = parseCredentialLines(value);
    if (!lines.length) return setMessage("没有识别到账号行，格式：邮箱 | 密码 | 2FA密钥");
    const invalid = lines.find((line) => !line.email.includes("@") || !line.password);
    if (invalid) return setMessage(`账号行格式错误：${invalid.email || "(空)"}，需要 邮箱 | 密码 | 2FA密钥`);
    const loginProxy = effectiveBindPool[0] || effectivePromoPool[0];
    if (!loginProxy) return setMessage("请先填写任意一个代理池，账号登录需要代理");
    setBusy(true);
    const known = new Set(accounts.map((item) => item.accountId));
    const additions: DirectAccount[] = [];
    const failures: string[] = [];
    let autoPreflightToken = "";
    try {
      let done = 0;
      const cursor = { value: 0 };
      async function loginWorker() {
        while (cursor.value < lines.length) {
          const line = lines[cursor.value++];
          try {
            const result = await api("/login", { email: line.email, password: line.password, totp_secret: line.totpSecret, proxy: loginProxy });
            const token = String(result.access_token || "");
            const decoded = decodeAccount(token);
            if (!decoded.accountId) throw new Error("登录返回的 Access Token 无效");
            additions.push({ id: `${Date.now()}-${cursor.value}`, token, ...decoded, selected: true, status: "idle" as const, stage: "正在分配环境指纹", error: "", link: "", taskId: "" });
          } catch (error) { failures.push(`${line.email}: ${error instanceof Error ? error.message : String(error)}`); }
          done += 1;
          setMessage(`正在登录 ${done}/${lines.length} 个账号`);
        }
      }
      await Promise.all([loginWorker(), loginWorker()]);
      if (!additions.length) return setMessage(`登录全部失败 · ${failures[0] || "未知错误"}`);
      setImportText("");
      const batchSeen = new Set<string>();
      const fresh = additions.filter((item) => {
        if (known.has(item.accountId) || batchSeen.has(item.accountId)) return false;
        batchSeen.add(item.accountId);
        return true;
      });
      const prepared = fresh.length ? fresh : additions;
      if (!await prepareAccounts(prepared)) return;
      const failedNote = failures.length ? ` · ${failures.length} 个失败` : "";
      setMessage(`已登录并导入 ${prepared.length} 个账号${failedNote}，正在执行 Checkout 预检`);
      autoPreflightToken = prepared[0].token;
    } finally { setBusy(false); }
    if (!cardReady && autoPreflightToken) void loadCard(autoPreflightToken);
  }

  function changeImportMode(mode: ImportMode) {
    if (mode === importMode) return;
    setImportMode(mode);
    setImportText("");
    setMessage(mode === "credential" ? "已切换到账号登录导入，每行：邮箱 | 密码 | 2FA密钥" : "已切换到 Access Token 导入");
  }

  function changeMarket(nextCountry: string) {
    const country = nextCountry.toUpperCase();
    setMarketCountry(country);
    setAccounts((current) => current.map((item) => ({ ...item, billing: undefined, stage: item.fingerprintId ? "需要重新加载账单地址" : item.stage })));
    Object.values(cardElements.current).forEach((element) => element.unmount());
    cardElements.current = {};
    stripeRef.current = null;
    setCardReady(false);
    setCardComplete({ number: false, expiry: false, cvc: false });
    setMessage(`已切换到 ${country}/${MARKET_CURRENCIES[country] || ""}，请重新加载安全卡片`);
  }

  async function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) {
      const text = await file.text();
      if (importMode === "credential") await importCredentialAccounts(text);
      else await importAccounts(text);
    }
    event.target.value = "";
  }

  async function loadCard(tokenOverride?: string) {
    const currentAccounts = accountsRef.current;
    const token = tokenOverride || currentAccounts.find((item) => item.selected)?.token;
    if (!token || !effectiveBindPool.length || !effectivePromoPool.length || cardReady) return;
    setBusy(true);
    setMessage("正在加载 Checkout、账单地址与 Stripe 安全组件");
    try {
      const missingBilling = currentAccounts.filter((item) => !hasBilling(item.billing, marketCountry));
      const [StripeFactory, preflight, billing] = await Promise.all([
        ensureStripe(),
        api("/preflight", { access_token: token, market_country: marketCountry, market_currency: MARKET_CURRENCIES[marketCountry], bind_proxy_pool: [effectiveBindPool[0]], promo_proxy_pool: [effectivePromoPool[0]] }),
        fetchBillingBatch(missingBilling, marketCountry),
      ]);
      setAccounts((current) => current.map((item) => billing.has(item.id) ? { ...item, billing: billing.get(item.id), stage: "环境与账单地址已就绪" } : item));
      stripeRef.current = StripeFactory(String(preflight.publishable_key));
      const elements = stripeRef.current.elements();
      const style = { base: { fontSize: "14px", color: "#dbe8f5", "::placeholder": { color: "#73869a" } }, invalid: { color: "#ef6474" } };
      const hosts = { number: numberHost.current, expiry: expiryHost.current, cvc: cvcHost.current };
      for (const [name, type] of [["number", "cardNumber"], ["expiry", "cardExpiry"], ["cvc", "cardCvc"]] as const) {
        const element = elements.create(type, { showIcon: name === "number", style });
        if (!hosts[name]) throw new Error("卡片输入容器未就绪");
        element.mount(hosts[name]!);
        element.on("change", (event) => { setCardComplete((current) => ({ ...current, [name]: Boolean(event.complete) })); if (event.error?.message) setMessage(String(event.error.message)); });
        cardElements.current[name] = element;
      }
      setCardReady(true);
      setMessage(`安全卡片组件已加载 · ${preflight.country || "PH"}/${preflight.currency || "PHP"}`);
    } catch (error) {
      Object.values(cardElements.current).forEach((element) => element.unmount());
      cardElements.current = {};
      stripeRef.current = null;
      setCardReady(false);
      setCardComplete({ number: false, expiry: false, cvc: false });
      setMessage(error instanceof Error ? error.message : "卡片组件加载失败");
    }
    finally { setBusy(false); }
  }

  async function createPaymentMethod(account: DirectAccount) {
    if (!stripeRef.current || !cardElements.current.number) throw new Error("Stripe 安全卡片组件尚未加载");
    const billing = account.billing || {};
    const result = await stripeRef.current.createPaymentMethod({ type: "card", card: cardElements.current.number, billing_details: { name: billing.name, email: account.email || undefined, address: { line1: billing.line1, line2: billing.line2 || undefined, city: billing.city, state: billing.state, postal_code: billing.postal_code, country: billing.country } } });
    if (result.error) throw new Error(result.error.message || "PaymentMethod 创建失败");
    if (!result.paymentMethod?.id) throw new Error("PaymentMethod 创建失败");
    return { id: result.paymentMethod.id, last4: result.paymentMethod.card?.last4 || "", billing };
  }

  async function pollTask(account: DirectAccount, taskId: string) {
    for (let attempt = 0; attempt < 4500; attempt += 1) {
      if (stopRef.current) throw new Error("任务已停止");
      await new Promise((resolve) => window.setTimeout(resolve, 400));
      const response = await api(`/jobs/${encodeURIComponent(taskId)}`);
      const task = response.task || {};
      patchAccount(account.id, { taskId, stage: task.stage || "任务处理中", steps: task.steps || [] });
      if (task.status === "done") { patchAccount(account.id, { status: "success", taskId: "", stage: task.stage || "任务完成", link: task.result?.checkout_link || "", error: "", steps: task.steps || [] }); return; }
      if (task.status === "error") throw new Error(task.error || "直卡协议任务失败");
    }
    throw new Error("任务轮询超时");
  }

  async function run(mode: FlowMode) {
    const chosen = accounts.filter((item) => item.selected);
    if (!chosen.length || !effectivePromoPool.length) return setMessage("请选择账号并填写任意一个代理池");
    if (mode !== "link_only") {
      if (!effectiveBindPool.length) return setMessage("请填写绑卡代理池");
      if (!poolMode && (!cardReady || !Object.values(cardComplete).every(Boolean))) return setMessage("请完成安全卡片输入，或在卡池导入卡片并启用卡池");
      if (poolMode && poolAvailable < chosen.length) setMessage(`注意：卡池可用卡片 ${poolAvailable} 张，少于选中账号 ${chosen.length} 个，超出部分将失败`);
    }
    setBusy(true); setStopping(false); stopRef.current = false;
    let completed = 0; let succeeded = 0;
    try {
      if (mode !== "link_only" && poolMode) {
        const missingBilling = chosen.filter((item) => !hasBilling(item.billing, marketCountry));
        if (missingBilling.length) {
          setMessage(`正在为 ${missingBilling.length} 个账号补充账单地址`);
          const billing = await fetchBillingBatch(missingBilling, marketCountry);
          chosen.forEach((item) => {
            const found = billing.get(item.id);
            if (found) { item.billing = found; patchAccount(item.id, { billing: found }); }
          });
        }
      }
      for (let offset = 0; offset < chosen.length && !stopRef.current; offset += concurrency) {
        const wave = chosen.slice(offset, offset + concurrency);
        const prepared: Array<{ account: DirectAccount; card: Row | null }> = [];
        for (let index = 0; index < wave.length && !stopRef.current; index += 1) {
          const account = wave[index];
          patchAccount(account.id, { status: "running", stage: mode === "link_only" ? "提链代理已就绪" : poolMode ? "等待卡池分配卡片" : "正在生成安全支付方式", error: "" });
          try { prepared.push({ account, card: mode === "link_only" || poolMode ? null : await createPaymentMethod(account) }); }
          catch (error) { completed += 1; patchAccount(account.id, { status: "error", stage: "生成支付方式失败", error: error instanceof Error ? error.message : String(error) }); }
        }
        if (!prepared.length || stopRef.current) continue;
        const batch = await api("/jobs/batch", { start_delay_ms: 250, tasks: prepared.map(({ account, card }, index) => ({ client_id: account.id, payload: { access_token: account.token, market_country: marketCountry, market_currency: MARKET_CURRENCIES[marketCountry], flow_mode: mode, promo_proxy_pool: [effectivePromoPool[(offset + index) % effectivePromoPool.length]], ...(mode === "link_only" ? {} : { billing: poolMode ? account.billing : card?.billing, bind_proxy_pool: [effectiveBindPool[(offset + index) % effectiveBindPool.length]], ...(poolMode ? {} : { payment_method_id: card?.id, card_last4: card?.last4 }) }) } })) });
        const ids = new Map<string, string>((batch.items || []).map((item: Row) => [String(item.client_id), String(item.task_id)]));
        const results = await Promise.allSettled(prepared.map(({ account }) => pollTask(account, ids.get(account.id) || "")));
        results.forEach((result, index) => { completed += 1; if (result.status === "fulfilled") succeeded += 1; else patchAccount(prepared[index].account.id, { status: "error", taskId: "", stage: "任务执行失败", error: result.reason instanceof Error ? result.reason.message : String(result.reason) }); });
        setMessage(`已完成 ${completed}/${chosen.length}，成功 ${succeeded}`);
      }
      setMessage(stopRef.current ? `已停止后续任务 · 完成 ${completed}/${chosen.length}` : `批次完成 · 成功 ${succeeded}/${chosen.length}`);
    } catch (error) { setMessage(error instanceof Error ? error.message : "批次执行失败"); }
    finally { setBusy(false); setStopping(false); void refreshJobs(); }
  }

  function stop() { stopRef.current = true; setStopping(true); setMessage("正在停止后续账号任务"); }
  function exportCsv() {
    const rows = [["账号", "账号ID", "状态", "当前步骤", "Checkout链接", "错误"], ...accounts.map((item) => [item.email, item.accountId, item.status, item.stage, item.link, item.error])];
    const csv = `\uFEFF${rows.map((row) => row.map(csvCell).join(",")).join("\r\n")}`;
    triggerBrowserDownload(new Blob([csv], { type: "text/csv;charset=utf-8" }), `直卡协议任务-${new Date().toISOString().replace(/[:.]/g, "-")}.csv`);
  }

  return <div className="gopay-view direct-card-view">
    <div className="gopay-section-title"><div><h2>直卡协议支付</h2><p>直卡绑卡、提链与协议支付任务</p></div><span className="paypal-active-count">{activeCount} 个运行中</span></div>
    <div className="direct-card-setup">
      <section className="gopay-panel"><header><h3>安全卡片</h3><span className={cn("direct-card-health", cardReady && "is-ready")}><ShieldCheck />{cardReady ? "Stripe 已连接" : "尚未加载"}</span></header><div className="direct-card-fields"><label className="wide"><span>卡号</span><div ref={numberHost} className="direct-card-element" /></label><label><span>有效期</span><div ref={expiryHost} className="direct-card-element" /></label><label><span>CVC</span><div ref={cvcHost} className="direct-card-element" /></label></div><div className="gopay-field-foot"><small>每个账号自动获取独立账单地址</small><Button size="sm" onClick={() => void loadCard()} disabled={busy || cardReady || !selected.length || !effectiveBindPool.length || !effectivePromoPool.length}><CreditCard className="mr-1 h-3.5 w-3.5" />加载安全卡片</Button></div></section>
      <section className="gopay-panel"><header><h3>导入账号</h3><span className="direct-card-count">{accounts.length} 个账号</span></header><div className="gopay-segmented direct-card-modes" role="tablist" aria-label="导入模式"><button type="button" className={importMode === "token" ? "active" : ""} onClick={() => changeImportMode("token")}>Access Token</button><button type="button" className={importMode === "credential" ? "active" : ""} onClick={() => changeImportMode("credential")}>账号 | 密码 | 2FA</button></div><textarea className="direct-card-import" value={importText} onChange={(event) => setImportText(event.target.value)} rows={5} spellCheck={false} placeholder={importMode === "credential" ? "每行一个：邮箱 | 密码 | 2FA密钥（无 2FA 可省略）" : "每行一个 Access Token"} /><div className="gopay-row-actions">{importMode === "credential" ? <Button size="sm" onClick={() => void importCredentialAccounts(importText)} disabled={!importText.trim() || busy}><LogIn className="mr-1 h-3.5 w-3.5" />登录并导入</Button> : <Button size="sm" onClick={() => void importAccounts(importText)} disabled={!importText.trim() || busy}><UserRound className="mr-1 h-3.5 w-3.5" />导入列表</Button>}<label className="direct-card-file"><FileUp />从文件导入<input type="file" accept=".txt,.json" onChange={(event) => void handleFile(event)} /></label></div></section>
      <section className="gopay-panel"><header><h3>卡池 · 1卡1账号</h3><span className="direct-card-count">可用 {poolAvailable}/{cards.length} {poolMode ? "· 已启用" : ""}</span></header><textarea className="direct-card-import" value={cardPoolText} onChange={(event) => setCardPoolText(event.target.value)} rows={4} spellCheck={false} placeholder="每行一张卡：卡号 | MM/YY | CVC" /><div className="gopay-row-actions"><Button size="sm" onClick={() => void importCards()} disabled={!cardPoolText.trim() || busy}><CreditCard className="mr-1 h-3.5 w-3.5" />导入卡池</Button><Button size="sm" variant={usePool ? "default" : "outline"} onClick={() => setUsePool((value) => !value)} disabled={busy}>{usePool ? "使用卡池：开" : "使用卡池：关"}</Button><Button size="sm" variant="outline" onClick={() => void refreshCards()} disabled={busy}><RefreshCw className="mr-1 h-3.5 w-3.5" />刷新</Button></div>{cards.length ? <div className="gopay-table-wrap"><table><thead><tr><th>卡片</th><th>状态</th><th>分配账号</th><th>备注</th><th></th></tr></thead><tbody>{cards.map((card) => <tr key={card.card_id}><td><strong>**** {card.last4}</strong><small className="direct-card-subtext">{card.exp_month}/{card.exp_year}</small></td><td><span className={cn("gopay-status", card.status === "available" ? "is-success" : card.status === "reserved" ? "is-running" : card.status === "used" ? "is-idle" : "is-error")}>{card.status === "available" ? "可用" : card.status === "reserved" ? "已预留" : card.status === "used" ? "已使用" : "已失败"}</span></td><td className="gopay-message">{card.account || "-"}</td><td className="gopay-message">{card.error || "-"}</td><td>{card.status !== "reserved" ? <button className="direct-card-link" type="button" onClick={() => void removeCard(card.card_id)} title="从卡池删除"><Trash2 /></button> : null}</td></tr>)}</tbody></table></div> : null}</section>
    </div>
      <section className="gopay-panel"><header><h3>支付市场与双代理池</h3><span className="direct-card-count">{marketCountry}/{MARKET_CURRENCIES[marketCountry]} · 绑卡 {effectiveBindPool.length} · 提链 {effectivePromoPool.length}</span></header><div className="direct-card-proxies"><label><span>支付市场</span><select value={marketCountry} onChange={(event) => changeMarket(event.target.value)} disabled={busy}><option value="VN">VN · Việt Nam · VND</option><option value="US">US · United States · USD</option><option value="PH">PH · Philippines · PHP</option><option value="TH">TH · Thailand · THB</option><option value="ID">ID · Indonesia · IDR</option><option value="GB">GB · United Kingdom · GBP</option><option value="DE">DE · Germany · EUR</option></select></label><label><span>绑卡与支付 · {marketCountry} 节点</span><textarea value={bindProxies} onChange={(event) => setBindProxies(event.target.value)} rows={4} placeholder="每行一个 HTTP、HTTPS 或 SOCKS 代理；只填一个池也可以" /></label><label><span>提链 · {marketCountry} 节点</span><textarea value={promoProxies} onChange={(event) => setPromoProxies(event.target.value)} rows={4} placeholder="每行一个 HTTP、HTTPS 或 SOCKS 代理；只填一个池也可以" /></label></div></section>
    <div className="direct-card-toolbar"><label><span>并发</span><input type="number" min={1} max={50} value={concurrency} onChange={(event) => setConcurrency(Math.max(1, Math.min(50, Math.trunc(Number(event.target.value) || 1))))} /></label><Button onClick={() => void run("full")} disabled={busy}><Play className="mr-1 h-4 w-4" />提链 + 绑卡 + 提链 + 支付</Button><Button variant="outline" onClick={() => void run("bind_only")} disabled={busy}>提链 + 绑卡</Button><Button variant="outline" onClick={() => void run("link_pay")} disabled={busy}>提链 + 支付</Button><Button variant="outline" onClick={() => void run("link_only")} disabled={busy}>仅提链</Button><Button variant="outline" onClick={stop} disabled={!busy || stopping}><Square className="mr-1 h-3.5 w-3.5" />停止</Button></div>
    <div className={cn("direct-card-message", busy && "is-running")}>{busy && <Loader2 className="animate-spin" />}<span>{message}</span></div>
    <section className="gopay-panel"><header><h3>账号任务 · {accounts.length}</h3><div className="gopay-row-actions"><Button size="sm" variant="outline" onClick={exportCsv} disabled={!accounts.length}><Download className="mr-1 h-3.5 w-3.5" />导出 CSV</Button><Button size="sm" variant="outline" onClick={() => setAccounts((current) => current.filter((item) => !item.selected))} disabled={busy || !selected.length}><Trash2 className="mr-1 h-3.5 w-3.5" />删除选中</Button><Button size="sm" variant="outline" onClick={() => { if (window.confirm("确定清空直卡协议账号列表吗？")) setAccounts([]); }} disabled={busy || !accounts.length}>清空列表</Button><Button size="sm" variant="outline" onClick={() => void refreshJobs()}><RefreshCw className="mr-1 h-3.5 w-3.5" />刷新</Button></div></header><div className="gopay-table-wrap"><table><thead><tr><th><input type="checkbox" checked={accounts.length > 0 && selected.length === accounts.length} onChange={(event) => setAccounts((current) => current.map((item) => ({ ...item, selected: event.target.checked })))} /></th><th>账号</th><th>环境</th><th>当前步骤</th><th>状态</th><th>Checkout</th><th>错误</th></tr></thead><tbody>{accounts.length ? accounts.map((account) => <tr key={account.id}><td><input type="checkbox" checked={account.selected} onChange={(event) => patchAccount(account.id, { selected: event.target.checked })} disabled={busy} /></td><td><strong>{account.email || "未命名账号"}</strong><small className="direct-card-subtext">{account.accountId}</small></td><td>{account.fingerprintId ? <span className="direct-card-fingerprint"><ShieldCheck />{account.fingerprintId}</span> : "分配中"}</td><td className="gopay-message">{account.stage || "等待执行"}</td><td><span className={cn("gopay-status", `is-${account.status}`)}>{account.status === "success" ? "成功" : account.status === "error" ? "失败" : account.status === "running" ? "进行中" : "待执行"}</span></td><td>{account.link ? <button className="direct-card-link" type="button" onClick={() => void navigator.clipboard.writeText(account.link)} title="复制 Checkout 链接"><Link2 />复制链接</button> : "-"}</td><td className="gopay-message">{account.error || "-"}</td></tr>) : <tr><td colSpan={7}><div className="gopay-empty"><CreditCard /><strong>暂无直卡协议账号</strong><span>导入账号后即可分配环境并创建任务</span></div></td></tr>}</tbody></table></div></section>
    <section className="direct-card-runtime"><div><CheckCircle2 /><span><strong>协议核心已隔离</strong><small>直卡任务使用独立运行时与数据文件</small></span></div><div><XCircle /><span><strong>手动卡片不落库</strong><small>卡片字段由 Stripe Elements 托管</small></span></div><div><CreditCard /><span><strong>卡池存储于服务端数据卷</strong><small>1卡1账号，绑卡成功后不再复用</small></span></div></section>
  </div>;
}
