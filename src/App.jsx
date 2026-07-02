import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { api } from "./api.js";

const QUICK_PROMPTS = [
  ["物流查询", "我的订单 OD20260620001 到哪里了？"],
  ["我要退货", "OD20260620001 我要退货"],
  ["退货规则", "商品签收后几天可以申请无理由退货？"],
  ["退款进度", "订单 OD20260618008 的退款什么时候到账？"],
  ["转人工", "退款金额不对，我要投诉并转人工处理"]
];

const DEMO_USERS = [
  { id: "customer", name: "李明", role: "customer", roleName: "售后用户", account: "customer@demo.com", password: "123456", department: "消费者端", defaultPage: "customer" },
  { id: "agent", name: "周妍", role: "staff", roleName: "客服专员", account: "agent@demo.com", password: "123456", department: "客户服务部", defaultPage: "agent" },
  { id: "ops", name: "陈晨", role: "staff", roleName: "运营主管", account: "ops@demo.com", password: "123456", department: "服务运营部", defaultPage: "analytics" }
];

const USER_STORAGE_KEY = "yanxi_demo_user";
const PAGE_STORAGE_KEY = "yanxi_demo_page";

export default function App() {
  const [currentUser, setCurrentUser] = useState(() => {
    const saved = localStorage.getItem(USER_STORAGE_KEY);
    return DEMO_USERS.find((user) => user.id === saved) || null;
  });
  const allowedPages = useMemo(() => currentUser?.role === "staff" ? ["agent", "analytics"] : ["customer"], [currentUser]);
  const [page, setPage] = useState(() => {
    const savedUser = DEMO_USERS.find((user) => user.id === localStorage.getItem(USER_STORAGE_KEY));
    if (!savedUser) return "customer";
    const savedPage = localStorage.getItem(PAGE_STORAGE_KEY);
    const pages = savedUser.role === "staff" ? ["agent", "analytics"] : ["customer"];
    return pages.includes(savedPage) ? savedPage : savedUser.defaultPage;
  });

  useEffect(() => {
    if (!currentUser) return;
    if (!allowedPages.includes(page)) setPage(currentUser.defaultPage);
  }, [allowedPages, currentUser, page]);

  function login(user) {
    setCurrentUser(user);
    setPage(user.defaultPage);
    localStorage.setItem(USER_STORAGE_KEY, user.id);
    localStorage.setItem(PAGE_STORAGE_KEY, user.defaultPage);
  }

  function changePage(nextPage) {
    if (!allowedPages.includes(nextPage)) return;
    setPage(nextPage);
    localStorage.setItem(PAGE_STORAGE_KEY, nextPage);
  }

  function logout() {
    setCurrentUser(null);
    setPage("customer");
    localStorage.removeItem(USER_STORAGE_KEY);
    localStorage.removeItem(PAGE_STORAGE_KEY);
  }

  if (!currentUser) return <LoginPage onLogin={login} />;

  return <div className="app-shell">
    <Header page={page} setPage={changePage} currentUser={currentUser} allowedPages={allowedPages} onSwitchUser={login} onLogout={logout} />
    <div style={{ display: page === "customer" ? "contents" : "none" }}><CustomerPage /></div>
    <div style={{ display: page === "agent" ? "contents" : "none" }}><AgentPage /></div>
    <div style={{ display: page === "analytics" ? "contents" : "none" }}><AnalyticsPage /></div>
  </div>;
}

function LoginPage({ onLogin }) {
  const [account, setAccount] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  function submit(event) {
    event.preventDefault();
    const user = DEMO_USERS.find((item) => item.account === account.trim() && item.password === password);
    if (!user) {
      setError("账号或密码不正确，请使用右侧演示账号登录。");
      return;
    }
    onLogin(user);
  }

  function fillUser(user) {
    setAccount(user.account);
    setPassword(user.password);
    setError("");
  }

  const featureItems = [
    ["问", "客户服务入口", "用户只处理咨询、追问、转人工和结束评价，入口更纯粹。"],
    ["单", "人工工作台", "客服集中查看待接入、处理中和已关闭工单，回复路径清晰。"],
    ["析", "运营洞察复盘", "运营查看意图分布、知识缺口、闭环状态和报表导出。"]
  ];

  return <main className="login-screen">
    <section className="login-hero">
      <button className="brand login-brand" type="button">
        <span className="brand-mark">言</span>
        <span><strong>言析智能客服</strong><small>AFTER-SALES COPILOT</small></span>
      </button>
      <div>
        <p className="eyebrow">AI AFTER-SALES SERVICE</p>
        <h1>智能售后服务演示系统</h1>
        <p className="login-summary">围绕订单、物流、退换货和投诉咨询，把用户自助服务、人工接待处理、运营复盘分析拆成不同角色入口，方便完整演示一条售后服务闭环。</p>
      </div>
      <div className="login-features">
        {featureItems.map(([icon, title, text]) => <article key={title}>
          <i>{icon}</i>
          <span><b>{title}</b><small>{text}</small></span>
        </article>)}
      </div>
    </section>
    <form className="login-card" onSubmit={submit}>
      <div>
        <h2>欢迎登录</h2>
        <p>请选择演示账号，查看不同角色对应的系统入口。</p>
      </div>
      <label>账号<input value={account} onChange={(event) => setAccount(event.target.value)} placeholder="请输入邮箱账号" /></label>
      <label>密码<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="请输入密码" /></label>
      {error && <div className="login-error">{error}</div>}
      <button className="primary login-submit" type="submit">登录</button>
      <div className="demo-title"><span />演示账号（点击填充）<span /></div>
      <div className="demo-users">
        {DEMO_USERS.map((user) => <button className={`demo-user ${user.id}`} type="button" key={user.id} onClick={() => fillUser(user)}>
          <i>{user.name.slice(0, 1)}</i>
          <span><b>{user.roleName}</b><small>{user.account} / {user.department}</small></span>
          <em>密码 123456</em>
        </button>)}
      </div>
      <p className="login-note">本系统为智能客服演示环境，账号仅用于区分可见页面，不代表真实鉴权。</p>
    </form>
  </main>;
}

function Header({ page, setPage, currentUser, allowedPages, onSwitchUser, onLogout }) {
  const links = [["customer", "客户服务"], ["agent", "人工工作台"], ["analytics", "运营洞察"]].filter(([key]) => allowedPages.includes(key));
  const [menuOpen, setMenuOpen] = useState(false);
  return <header className="topbar">
    <button className="brand" onClick={() => setPage(currentUser.defaultPage)}>
      <span className="brand-mark">言</span>
      <span><strong>言析智能客服</strong><small>AFTER-SALES COPILOT</small></span>
    </button>
    <nav>{links.map(([key, label]) => <button key={key} className={page === key ? "active" : ""} onClick={() => setPage(key)}>{label}</button>)}</nav>
    <div className="header-right">
      <div className="online"><i /> 服务运行中</div>
      <div className="user-menu">
        <button className="user-trigger" type="button" onClick={() => setMenuOpen((open) => !open)}>
          <span><b>{currentUser.name}</b><small>{currentUser.roleName}</small></span>
        </button>
        {menuOpen && <div className="user-dropdown">
          <small>切换演示角色</small>
          {DEMO_USERS.map((user) => <button type="button" key={user.id} onClick={() => { onSwitchUser(user); setMenuOpen(false); }}>
            <span>{user.roleName}</span>{currentUser.id === user.id && <i>当前</i>}
          </button>)}
          <hr />
          <button type="button" onClick={onLogout}>退出登录</button>
        </div>}
      </div>
    </div>
  </header>;
}

function CustomerPage() {
  const [session, setSession] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [busyMode, setBusyMode] = useState("booting");
  const [ratingOpen, setRatingOpen] = useState(false);
  const [decision, setDecision] = useState(null);
  const [dismissedRefundPromptId, setDismissedRefundPromptId] = useState("");
  const listRef = useRef(null);
  const shouldStickToBottomRef = useRef(true);
  const lastMessageCountRef = useRef(0);
  const forceScrollRef = useRef(false);
  const scrollToBottom = (behavior = "smooth") => {
    const list = listRef.current;
    if (!list) return;
    const scroll = () => {
      list.scrollTo({ top: list.scrollHeight, behavior });
    };
    if (behavior === "auto") scroll();
    else requestAnimationFrame(scroll);
  };
  const rememberScrollIntent = () => {
    const list = listRef.current;
    if (!list) return;
    shouldStickToBottomRef.current = list.scrollHeight - list.scrollTop - list.clientHeight < 80;
  };

  const isClosed = session?.status === "closed";
  const humanMode = isHumanSession(session);
  const isBusy = Boolean(busyMode);
  const lastAi = useMemo(() => [...messages].reverse().find((m) => m.role === "assistant"), [messages]);
  const panelDecision = isClosed ? closedDecision() : humanMode ? humanDecision(session) : (decision || lastAi);

  useEffect(() => {
    let cancelled = false;
    async function initializeSession() {
      setBusyMode("booting");
      try {
        const savedId = localStorage.getItem("yanxi_session_id");
        if (savedId) {
          try {
            const data = await api.getSession(savedId);
            if (data.session.status !== "closed") {
              if (!cancelled) {
                setSession(data.session);
                setMessages(data.messages);
                setDecision(decisionFromMessages(data.messages));
              }
              return;
            }
            localStorage.removeItem("yanxi_session_id");
          } catch {
            localStorage.removeItem("yanxi_session_id");
          }
        }
        const data = await api.createSession();
        localStorage.setItem("yanxi_session_id", data.session.id);
        if (!cancelled) {
          setSession(data.session);
          setMessages(data.messages);
          setDecision(decisionFromMessages(data.messages));
        }
      } catch (error) {
        if (!cancelled) setMessages([{ id: "boot-error", role: "system", content: `连接售后服务失败：${error.message}` }]);
      } finally {
        if (!cancelled) setBusyMode("");
      }
    }
    initializeSession();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!session?.id || session.status === "closed" || busyMode) return;
    const timer = setInterval(async () => {
      const data = await api.getSession(session.id).catch(() => null);
      if (data) {
        setSession(data.session);
        setMessages(data.messages);
        if (isHumanSession(data.session)) setDecision(humanDecision(data.session));
      }
    }, 3000);
    return () => clearInterval(timer);
  }, [session?.id, session?.status, busyMode]);

  useLayoutEffect(() => {
    const count = messages.length;
    const hasNewMessage = count > lastMessageCountRef.current;
    const forceScroll = forceScrollRef.current;
    lastMessageCountRef.current = count;
    forceScrollRef.current = false;
    if (!hasNewMessage && busyMode && !forceScroll) return;
    if (forceScroll || shouldStickToBottomRef.current || count <= 1) scrollToBottom(forceScroll ? "auto" : "smooth");
  }, [messages, busyMode]);

  async function startNewSession() {
    setRatingOpen(false);
    setBusyMode("new_session");
    setSession(null);
    setMessages([]);
    setInput("");
    setDismissedRefundPromptId("");
    setDecision({ phase: "new_session", intent: "正在开启新会话", confidence: null, source: "会话系统", action: "创建服务会话", riskLevel: "" });
    try {
      const data = await api.createSession();
      localStorage.setItem("yanxi_session_id", data.session.id);
      setSession(data.session);
      forceScrollRef.current = true;
      setMessages(data.messages);
      setDecision(decisionFromMessages(data.messages));
    } catch (error) {
      setMessages([{ id: crypto.randomUUID(), role: "system", content: `新建会话失败：${error.message}` }]);
    } finally {
      setBusyMode("");
    }
  }

  async function send(text = input) {
    const value = text.trim();
    if (!value || !session || isBusy) return;
    if (session.status === "closed") {
      setMessages((old) => [...old, { id: crypto.randomUUID(), role: "system", content: "本次服务已结束，请新建会话后继续咨询。" }]);
      return;
    }

    const sendToAgent = isHumanSession(session);
    const clientMessageId = crypto.randomUUID();
    setInput("");
    shouldStickToBottomRef.current = true;
    forceScrollRef.current = true;
    setMessages((old) => [...old, { id: clientMessageId, role: "user", content: value, createdAt: beijingNow(), localStatus: "sending" }]);
    setBusyMode(sendToAgent ? "agent" : "ai");
    setDecision(sendToAgent ? humanDecision(session) : { phase: "submitting", intent: "正在接收问题", confidence: null, source: "消息通道", action: "保存用户消息", riskLevel: "" });

    try {
      const data = await api.sendMessage(
        { sessionId: session.id, message: value },
        (next) => { if (!sendToAgent) setDecision(next); },
        { mode: sendToAgent ? "agent" : "ai" }
      );
      setSession(data.session);
      forceScrollRef.current = true;
      setMessages(data.messages);
      setDecision(sendToAgent ? humanDecision(data.session) : (decisionFromMessages(data.messages) || decisionFromResult(data.decision)));
    } catch (error) {
      setMessages((old) => old.map((message) => message.id === clientMessageId ? { ...message, localStatus: "failed" } : message).concat({ id: crypto.randomUUID(), role: "system", content: `发送失败：${error.message}` }));
    } finally {
      setBusyMode("");
    }
  }

  const canType = Boolean(session) && !isClosed && !isBusy;
  const canUseQuick = canType && !humanMode;
  const chatSubtitle = humanMode ? "人工正在跟进 · 新消息会进入同一工单" : "AI 优先响应 · 复杂问题转人工接管";
  const chatProgress = busyMode === "ai" ? progressLabel(decision?.phase) : busyMode === "agent" ? "正在同步给人工客服" : "";
  const servicePulseMode = busyMode || (isClosed ? "closed" : session?.status === "waiting_agent" ? "waiting_agent" : session?.status === "processing" ? "processing" : "active");
  const showRefundCard = lastAi?.action === "show_refund_form" && !isClosed && !humanMode && !isBusy && dismissedRefundPromptId !== lastAi.id;

  return <main className="customer-layout">
    <section className="intro-panel">
      <p className="eyebrow">AI AFTER-SALES SERVICE</p>
      <h1>售后问题，<br /><em>一句话说清。</em></h1>
      <p className="intro-copy">订单、物流、退换货或投诉，AI 先快速处理；复杂问题会连同当前对话一起交给人工客服。</p>
      <div className="trust-list"><span>✓ 有订单先查订单</span><span>✓ 高风险问题转人工</span><span>✓ 人工接入后 AI 停止自动回复</span></div>
      <div className="session-card"><small>当前会话</small><strong>{session?.id?.slice(-10) || statusTitle(busyMode)}</strong><span className={`status ${session?.status || "active"}`}>{statusLabel(session?.status)}</span></div>
    </section>

    <section className="chat-card">
      <div className="chat-heading">
        <div className="chat-title-block">
          <div className="chat-title-row"><b>售后服务助手</b><span className={`status ${session?.status || "active"}`}>{statusLabel(session?.status)}</span></div>
          <span>{chatSubtitle}</span>
        </div>
        <button disabled={!session || isBusy} onClick={isClosed ? startNewSession : () => setRatingOpen(true)}>{isClosed ? "新建会话" : "结束并评价"}</button>
      </div>
      {chatProgress && <div className={`chat-progress ${busyMode}`}><i /><span>{chatProgress}</span></div>}
      <div className="message-list" ref={listRef} onScroll={rememberScrollIntent}>
        {busyMode === "booting" && <ServiceState title="正在连接售后服务" text="系统会自动恢复未完成会话，或为你打开新的服务窗口。" />}
        {busyMode === "new_session" && <ServiceState title="正在打开新会话" text="新会话会直接加载，不会把旧会话内容带进来。" />}
        {!busyMode && !messages.length && <ServiceState title="可以开始咨询了" text="输入订单号和问题，系统会判断是直接回复、售后申请还是转人工。" />}
        {messages.map((m) => <Message key={m.id} message={m} />)}
      </div>
      {showRefundCard && <RefundCard session={session} orderNo={lastAi.orderNo} onCancel={() => setDismissedRefundPromptId(lastAi.id)} onDone={(data) => {
        const next = data?.session ? data : null;
        if (next) { setSession(next.session); setMessages(next.messages || []); setDecision(decisionFromMessages(next.messages || [])); return; }
        return api.getSession(session.id).then((d) => { setSession(d.session); setMessages(d.messages); setDecision(decisionFromMessages(d.messages)); });
      }} />}
      {humanMode && <HandoffBanner session={session} />}
      {isClosed && <div className="closed-session"><strong>本次服务已结束</strong><span>{closedByAgent(messages) ? "客服已结束会话，继续咨询请开启一个新的会话。" : "继续咨询请开启一个新的会话。"}</span><button onClick={startNewSession} disabled={isBusy}>新建会话</button></div>}
      {!humanMode && <div className="quick-row">{QUICK_PROMPTS.map(([label, text]) => <button key={label} disabled={!canUseQuick} onClick={() => send(text)}>{label}</button>)}</div>}
      <form className={`composer ${isClosed ? "closed" : ""}`} onSubmit={(e) => { e.preventDefault(); send(); }}>
        <textarea disabled={!canType} value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }} placeholder={composerPlaceholder({ isClosed, humanMode, busyMode })} rows="2" />
        <small className="keyboard-hint">{composerHint()}</small>
        <button disabled={!canType || !input.trim()}>发送</button>
      </form>
    </section>

    <aside className={`decision-panel state-${servicePulseMode}`}>
      <p className="eyebrow">DECISION TRACE</p><h2>服务状态</h2>
      <StatusFlow mode={servicePulseMode} phase={decision?.phase} busy={Boolean(busyMode)} />
      <Decision label="置信度" value={panelDecision?.confidence != null ? `${Math.round(panelDecision.confidence * 100)}%` : "--"} />
      <Decision label="信息来源" value={panelDecision?.source || "--"} />
      <Decision label="下一动作" value={busyMode === "ai" ? ((decision || {}).action || "处理中") : actionLabel(panelDecision?.action)} />
      <Decision label="风险等级" value={busyMode === "ai" ? "评估中" : riskLabel(panelDecision?.riskLevel)} tone={panelDecision?.riskLevel} />
      <div className="explain">人工接入后，用户补充内容只进入同一个工单时间线，不再触发 AI 自动回复。</div>
    </aside>
    {ratingOpen && <RatingModal session={session} onClose={() => setRatingOpen(false)} onSubmitted={() => api.getSession(session.id).then((d) => { setSession(d.session); setMessages(d.messages); })} />}
  </main>;
}

function StatusFlow({ mode, phase, busy }) {
  const currentMode = mode || "active";
  const phaseIndex = { submitting: 0, understanding: 1, routing: 2, generating: 3, saving: 4 };
  const aiActive = currentMode === "ai" && busy;
  const aiSteps = [
    ["接收问题", "保存用户输入"],
    ["识别意图", "判断售后类型和风险"],
    ["匹配路径", "查询订单、规则或转人工"],
    ["生成回复", "组织可执行处理结果"],
    ["同步记录", "更新会话和业务状态"]
  ];
  const agentSteps = currentMode === "waiting_agent"
    ? [["工单已创建", "当前会话已进入人工队列"], ["等待接入", "客服接入前可继续补充信息"], ["AI 已停止", "补充内容只进入同一工单"]]
    : [["客服已接入", "工单处于处理中"], ["等待回复", "用户补充会同步到工单"], ["关闭后结束", "完成后会话进入闭环"]];
  const stableSteps = currentMode === "closed"
    ? [["服务已结束", "会话和关联工单已关闭"], ["不可继续追问", "继续咨询需要新建会话"], ["评价已记录", "反馈进入运营洞察"]]
    : [["服务在线", "可以输入售后问题"], ["AI 优先处理", "先查订单、规则和退款进度"], ["必要时转人工", "投诉或高风险问题交给客服"]];
  const steps = aiActive ? aiSteps : ["waiting_agent", "processing", "agent"].includes(currentMode) ? agentSteps : stableSteps;
  const activeIndex = aiActive ? (phaseIndex[phase] ?? 0) : currentMode === "closed" ? steps.length - 1 : ["waiting_agent", "agent"].includes(currentMode) ? 1 : currentMode === "processing" ? 1 : 0;
  const title = aiActive ? steps[activeIndex][0] : statusLabel(currentMode === "agent" ? "waiting_agent" : currentMode);
  const caption = aiActive ? steps[activeIndex][1] : steps[Math.min(activeIndex, steps.length - 1)][1];

  return <div className={`status-process ${currentMode} ${aiActive ? "is-loading" : ""}`} aria-label="服务状态处理过程">
    <div className="status-process-head">
      <div><span>{aiActive ? "AI 处理中" : "当前状态"}</span><strong>{title}</strong><small>{caption}</small></div>
      <b>{aiActive ? "处理中" : "已同步"}</b>
    </div>
    <ol>{steps.map(([name, detail], index) => <li key={name} className={index < activeIndex ? "done" : index === activeIndex ? "current" : "todo"}>
      <i />
      <span><strong>{name}</strong><small>{detail}</small></span>
    </li>)}</ol>
  </div>;
}

function HandoffBanner({ session }) {
  const processing = session?.status === "processing";
  return <div className={`handoff-banner ${processing ? "processing" : "waiting"}`}>
    <strong>{processing ? "客服已接入" : "已转人工，等待接入"}</strong>
    <span>{processing ? "你继续发送的内容会同步到当前工单，等待客服继续处理。" : "你可以先补充订单、照片描述或诉求，AI 不会再自动回复。"}</span>
    {session?.ticketId && <em>工单 {session.ticketId}</em>}
  </div>;
}

function ServiceState({ title, text }) {
  return <div className="service-state"><i /><strong>{title}</strong><span>{text}</span></div>;
}

function Message({ message }) {
  const isUser = message.role === "user";
  const failed = message.localStatus === "failed";
  const roleName = message.role === "agent" ? "人工" : message.role === "system" ? "!" : "AI";
  return <div className={`message ${message.role}`}>
    {!isUser && <div className="avatar">{roleName}</div>}
    <div><div className={`bubble ${failed ? "failed" : ""}`}>{message.content}</div>{failed && <div className="meta error"><span>发送失败，内容已保留</span></div>}{message.role === "assistant" && message.intent && <div className="meta"><span>{message.intent}</span><span>{message.source}</span></div>}</div>
  </div>;
}

function Decision({ label, value, tone }) {
  return <div className="decision-row"><span>{label}</span><strong className={tone || ""}>{value}</strong></div>;
}

function RefundCard({ session, orderNo = "", onDone, onCancel }) {
  const [order, setOrder] = useState(orderNo);
  const [reason, setReason] = useState("商品不合适");
  const [state, setState] = useState("");
  const [submitting, setSubmitting] = useState(false);
  async function submit() {
    if (!order.trim()) { setState("请先填写订单号"); return; }
    setSubmitting(true);
    try {
      const data = await api.submitRefund({ sessionId: session.id, orderNo: order.trim().toUpperCase(), reason });
      setState("退款申请已提交，处理进度会在当前会话更新。");
      await onDone?.(data);
    } catch (error) {
      setState(`提交失败：${error.message}`);
    } finally {
      setSubmitting(false);
    }
  }
  return <div className="refund-card">
    <div className="refund-card-title"><b>售后申请</b><span>确认订单和原因后提交；不处理可直接关闭。</span></div>
    <input disabled={submitting} value={order} onChange={(e) => setOrder(e.target.value)} placeholder="订单号" />
    <select disabled={submitting} value={reason} onChange={(e) => setReason(e.target.value)}><option>商品不合适</option><option>商品质量问题</option><option>错发或漏发</option><option>其他原因</option></select>
    <button type="button" disabled={submitting || !order.trim()} onClick={submit}>{submitting ? "提交中" : "提交申请"}</button>
    <button type="button" className="ghost" disabled={submitting} onClick={onCancel}>关闭</button>
    {state && <small className={state.startsWith("提交失败") ? "error" : ""}>{state}</small>}
  </div>;
}
function RatingModal({ session, onClose, onSubmitted }) {
  const [score, setScore] = useState(5), [resolved, setResolved] = useState(true), [comment, setComment] = useState(""), [done, setDone] = useState(false), [submitting, setSubmitting] = useState(false);
  async function submit() {
    if (!session || submitting) return;
    setSubmitting(true);
    try { await api.submitRating({ sessionId: session.id, score, resolved, comment }); await onSubmitted?.(); setDone(true); }
    finally { setSubmitting(false); }
  }
  return <div className="modal-backdrop"><div className="modal">
    {done ? <><div className="success-mark">✓</div><h2>谢谢你的评价</h2><p>反馈会帮助我们改进知识库和服务流程。</p><button className="primary" onClick={onClose}>完成</button></> : <>
      <p className="eyebrow">SERVICE REVIEW</p><h2>这次问题解决了吗？</h2>
      <div className="toggle-row"><button className={resolved ? "selected" : ""} onClick={() => setResolved(true)}>已经解决</button><button className={!resolved ? "selected" : ""} onClick={() => setResolved(false)}>仍未解决</button></div>
      <div className="stars">{[1, 2, 3, 4, 5].map((n) => <button key={n} onClick={() => setScore(n)} className={n <= score ? "on" : ""}>★</button>)}</div>
      <textarea value={comment} onChange={(e) => setComment(e.target.value)} placeholder="还有什么想告诉我们？" />
      <div className="modal-actions"><button onClick={onClose}>稍后评价</button><button className="primary" disabled={submitting} onClick={submit}>{submitting ? "提交中" : "提交评价"}</button></div>
    </>}
  </div></div>;
}

function AgentPage() {
  const [tickets, setTickets] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [reply, setReply] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("active");
  const [loadError, setLoadError] = useState("");
  const [confirmClose, setConfirmClose] = useState(null);
  const timelineRef = useRef(null);

  const refresh = async () => {
    try {
      const data = await api.listTickets();
      setTickets(data.tickets || []);
      setLoadError("");
      setSelectedId((id) => id && data.tickets?.some((t) => t.id === id) ? id : data.tickets?.[0]?.id || null);
    } catch (error) {
      setLoadError(error.message);
    }
  };
  useEffect(() => { refresh(); const timer = setInterval(refresh, 3000); return () => clearInterval(timer); }, []);


  const filteredTickets = tickets
    .filter((ticket) => priorityFilter === "all" || (priorityFilter === "normal" ? ticket.priority !== "high" : ticket.priority === priorityFilter))
    .filter((ticket) => statusFilter === "all" || (statusFilter === "active" ? ["open", "processing"].includes(ticket.status) : ticket.status === statusFilter));
  const selected = tickets.find((t) => t.id === selectedId) || filteredTickets[0];
  useEffect(() => {
    const list = timelineRef.current;
    if (!list) return;
    requestAnimationFrame(() => list.scrollTo({ top: list.scrollHeight, behavior: "smooth" }));
  }, [selected?.id, selected?.messages?.length]);

  async function act(fn) { await fn(); await refresh(); }
  async function sendReply() {
    if (!selected || selected.status !== "processing" || !reply.trim()) return;
    await act(async () => { await api.replyTicket(selected.id, reply); setReply(""); });
  }
  async function closeSelectedTicket() {
    const ticketToClose = confirmClose || selected;
    if (!ticketToClose || ticketToClose.status !== "processing") return;
    await api.closeTicket(ticketToClose.id);
    setSelectedId(ticketToClose.id);
    setReply("");
    setConfirmClose(null);
    await refresh();
  }

  return <main className="workspace">
    <aside className="ticket-sidebar">
      <div className="desk-heading"><div><p className="eyebrow">HUMAN DESK</p><h1>人工工作台</h1><span>当前筛选 {filteredTickets.length} 条</span></div></div>
      {loadError && <div className="sidebar-error">{loadError}</div>}
      <div className="queue-toolbar compact">
        <label>状态<select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}><option value="active">未完成</option><option value="open">待接入</option><option value="processing">处理中</option><option value="closed">已关闭</option><option value="all">全部</option></select></label>
        <label>优先级<select value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value)}><option value="all">全部</option><option value="high">紧急</option><option value="normal">普通</option></select></label>
      </div>
      <div className="ticket-list">{filteredTickets.length ? filteredTickets.map((t) => <button key={t.id} className={selected?.id === t.id ? "selected" : ""} onClick={() => setSelectedId(t.id)}>
        <span className="ticket-card-title"><b>{t.intent}</b><small>{t.id}</small></span>
        <span className="ticket-card-badges"><i className={t.priority}>{priorityLabel(t.priority)}</i><i className={`status-badge ${t.status}`}>{statusLabel(t.status)}</i></span>
        <p>{t.summary}</p>
        <em>{formatTime(t.updatedAt || t.createdAt)}</em>
      </button>) : <div className="empty-list">当前筛选下没有工单</div>}</div>
    </aside>
    <section className="ticket-detail">{selected ? <>
      <header><div className="ticket-title-block"><p className="eyebrow">TICKET {selected.id}</p><div className="ticket-title-row"><h2>{selected.intent}</h2><span className="detail-badges prominent"><i className={selected.priority}>{priorityLabel(selected.priority)}</i><i className={`ticket-status ${selected.status}`}>{statusLabel(selected.status)}</i></span></div><p className="ticket-subtitle">最近更新 {formatTime(selected.updatedAt || selected.createdAt)}</p></div><div className="ticket-header-actions">{selected.status === "open" && <button className="claim-action" onClick={() => act(() => api.claimTicket(selected.id))}>接入会话</button>}{selected.status === "processing" && <button className="close-action" onClick={() => setConfirmClose(selected)}>关闭工单</button>}</div></header>
      <div className="ticket-context compact"><div><small>转人工原因</small><strong>{selected.handoffReason || "需要人工核实"}</strong></div><div><small>优先级</small><strong>{priorityLabel(selected.priority)}</strong></div><div><small>当前状态</small><strong>{statusLabel(selected.status)}</strong></div><div><small>AI 置信度</small><strong>{Math.round((selected.confidence || 0) * 100)}%</strong></div></div>
      <section className="summary compact-summary"><small>AI 摘要</small><p>{selected.summary}</p></section>
      <div className="timeline-heading"><b>对话时间线</b><span>{selected.messages?.length || 0} 条消息</span></div>
      <div className="timeline" ref={timelineRef}>{selected.messages?.map((m) => <Message key={m.id} message={m} />)}</div>
      <form className={"composer agent-composer inline " + (selected.status !== "processing" ? "locked" : "")} onSubmit={(e) => { e.preventDefault(); sendReply(); }}><textarea rows="2" disabled={selected.status !== "processing"} value={reply} onChange={(e) => setReply(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendReply(); } }} placeholder={selected.status === "open" ? "\u5148\u63a5\u5165\u4f1a\u8bdd\u540e\u56de\u590d" : selected.status === "closed" ? "\u5de5\u5355\u5df2\u5173\u95ed" : "\u8f93\u5165\u4eba\u5de5\u56de\u590d"} /><small className="keyboard-hint">Enter {"\u53d1\u9001"} / Shift+Enter {"\u6362\u884c"}</small><button className="primary" disabled={selected.status !== "processing" || !reply.trim()} type="submit">{"\u53d1\u9001"}</button></form>
    </> : <div className="empty">当前筛选下没有需要处理的工单</div>}</section>
    {confirmClose && <div className="modal-backdrop"><div className="modal confirm-modal">
      <p className="eyebrow">CLOSE TICKET</p>
      <h2>确认关闭工单？</h2>
      <p>关闭后当前会话会结束，用户需要新建会话才能继续咨询。</p>
      <div className="modal-actions"><button onClick={() => setConfirmClose(null)}>取消</button><button className="danger" onClick={closeSelectedTicket}>确认关闭</button></div>
    </div></div>}
  </main>;
}

function AnalyticsPage() {
  const [data, setData] = useState(null);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [exporting, setExporting] = useState("");
  const fromInputRef = useRef(null), toInputRef = useRef(null);
  useEffect(() => {
    const refresh = () => api.dashboard({ from, to }).then(setData).catch(() => null);
    refresh();
    const timer = setInterval(refresh, 3000);
    return () => clearInterval(timer);
  }, [from, to]);
  async function downloadExcel() {
    if (exporting) return;
    try { setExporting("excel"); const [{ exportExcel }, raw] = await Promise.all([import("./exports.js"), api.exportData({ from, to })]); await exportExcel(raw, data || {}); }
    catch (error) { window.alert(error.message || "Excel \u5bfc\u51fa\u5931\u8d25"); } finally { setExporting(""); }
  }
  async function downloadPdf() {
    if (exporting) return;
    try { setExporting("pdf"); const [{ exportPdf }, raw] = await Promise.all([import("./exports.js"), api.exportData({ from, to })]); await exportPdf(data || {}, { from, to }, raw); }
    catch (error) { window.alert(error.message || "PDF \u751f\u6210\u5931\u8d25"); } finally { setExporting(""); }
  }
  const metrics = data?.metrics || {};
  const metricTips = {
    "区间会话": "当前日期范围内进入统计的服务会话数量。",
    "AI 自助解决率": "由 AI 回复后用户评价为已解决、且没有进入人工工单的会话占比。",
    "转人工率": "创建过人工工单的会话占比。",
    "满意度": "用户结束评价的平均分，满分 5 分。"
  };
  const cards = [["区间会话", metrics.sessions, "次"], ["AI 自助解决率", metrics.solveRate, "%"], ["转人工率", metrics.handoffRate, "%"], ["满意度", metrics.satisfaction, "/5"]];
  const closureInfo = "AI 自助解决：未进入人工、由 AI 完成闭环；人工已解决：进入人工工单后由客服关闭；处理中：会话或工单尚未闭环。";
  const closure = data?.closure || [{ name: "AI 自助解决", count: metrics.aiResolved || 0 }, { name: "人工已解决", count: metrics.humanResolved || 0 }, { name: "处理中", count: metrics.inProgress || 0 }];
  const closureTotal = Math.max(closure.reduce((sum, item) => sum + item.count, 0), 1);
  const closureMax = Math.max(...closure.map((item) => item.count), 1);
  let angle = 0;
  const colors = ["#0b7a61", "#86b8a7", "#f0a45d", "#d8dedb"];
  const donut = "conic-gradient(" + closure.map((item, index) => { const start = angle; angle += item.count / closureTotal * 360; return colors[index % colors.length] + " " + start + "deg " + angle + "deg"; }).join(",") + ")";
  const topIntents = (data?.intents || []).slice(0, 5);
  const knowledgeGaps = data?.knowledgeGaps || [];
  const intentTotal = Math.max(topIntents.reduce((sum, item) => sum + Number(item.count || 0), 0), 1);
  const intentColors = ["#0b7a61", "#1f8f72", "#86b8a7", "#f0a45d", "#d8dedb"];
  let intentAngle = 0;
  const intentDonut = topIntents.length ? "conic-gradient(" + topIntents.map((item, index) => { const start = intentAngle; intentAngle += Number(item.count || 0) / intentTotal * 360; return intentColors[index % intentColors.length] + " " + start + "deg " + intentAngle + "deg"; }).join(",") + ")" : "conic-gradient(#d8dedb 0deg 360deg)";
  const leadingIntent = topIntents[0];
  return <main className="analytics"><div className="analytics-heading compact"><div className="page-title"><p className="eyebrow">SERVICE INTELLIGENCE</p><h1>{"运营洞察"}</h1></div>
    <div className="report-tools"><div className="date-range compact"><label onClick={() => fromInputRef.current?.showPicker?.()}><input ref={fromInputRef} type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} /></label><span>{"至"}</span><label onClick={() => toInputRef.current?.showPicker?.()}><input ref={toInputRef} type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} /></label></div><div className="export-actions"><button className={exporting === "excel" ? "is-loading" : ""} aria-busy={exporting === "excel"} disabled={!data || exporting === "excel"} onClick={downloadExcel}><span>{"导出 Excel"}</span>{exporting === "excel" && <i />}</button><button className={"primary " + (exporting === "pdf" ? "is-loading" : "")} aria-busy={exporting === "pdf"} disabled={!data || exporting === "pdf"} onClick={downloadPdf}><span>{"生成 PDF 报告"}</span>{exporting === "pdf" && <i />}</button></div></div></div>
    <section className="metric-grid">{cards.map(([label, value, unit]) => <article className="metric-card" key={label}><span>{label}<InfoTip label={label} tip={metricTips[label]} /></span><strong>{value ?? "--"}<small>{unit}</small></strong></article>)}</section>
    <section className="analytics-grid"><article className="intent-card"><InfoTitle title="意图分布 Top 5" tip="按 AI 最终识别的售后意图统计，展示出现次数最高的 5 类。" /><div className="intent-layout"><div className="intent-ring-wrap"><div className="intent-ring" style={{ background: intentDonut }}><span><b>{leadingIntent ? Math.round(Number(leadingIntent.count || 0) / intentTotal * 100) : 0}%</b><small>{leadingIntent?.name || "暂无意图"}</small></span></div><em>{"主意图占比"}</em></div><div className="intent-list">{topIntents.map((x, index) => { const pct = Math.round(Number(x.count || 0) / intentTotal * 100); return <div className="intent-item" key={x.name}><i style={{ background: intentColors[index % intentColors.length] }}>{index + 1}</i><span>{x.name}<small>{pct}%</small></span><div><b style={{ width: pct + "%", background: intentColors[index % intentColors.length] }} /></div><strong>{x.count}</strong></div>; })}</div></div></article>
      <article className="knowledge-card"><InfoTitle title="知识缺口" tip="AI 无法从现有知识库获得可靠答案，需要人工补充的问题。" /><div className="gap-list compact-list scroll-list">{knowledgeGaps.map((x) => <div key={x.question}><span>{x.question}</span><b>{x.count} {"次"}</b></div>)}</div></article>
      <article className="wide"><InfoTitle title="闭环状态" tip={closureInfo} /><div className="closure-layout"><div className="closure-bars">{closure.map((item, index) => <div key={item.name}><span><i style={{ background: colors[index % colors.length] }} />{item.name}</span><div><b style={{ width: Math.round(item.count / closureMax * 100) + "%", background: colors[index % colors.length] }} /></div><strong>{item.count}</strong></div>)}</div><div className="closure-donut-wrap"><div className="closure-donut" style={{ background: donut }}><span><b>{closureTotal}</b>{"会话"}</span></div><div className="closure-legend">{closure.map((item, index) => <span key={item.name}><i style={{ background: colors[index % colors.length] }} />{item.name} {Math.round(item.count / closureTotal * 100)}%</span>)}</div></div></div></article>
    </section>
  </main>;
}

function InfoTitle({ title, tip }) { return <h2 className="info-title">{title}{tip && <InfoTip label={title} tip={tip} />}</h2>; }
function InfoTip({ label, tip }) { return <button type="button" className="info-tip" aria-label={label + "\u8bf4\u660e"} data-tip={tip}>?</button>; }
function beijingDate(offsetDays = 0) {
  const date = new Date(Date.now() + offsetDays * 86400000);
  const parts = new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}
function beijingNow() {
  const date = new Date(Date.now() + 8 * 3600000);
  return date.toISOString().replace("Z", "+08:00");
}
function isHumanSession(session) {
  return Boolean(session && session.status !== "closed" && (session.ticketId || ["waiting_agent", "processing", "open"].includes(session.status)));
}
function humanDecision(session) {
  const processing = session?.status === "processing";
  return { intent: processing ? "人工处理中" : "等待人工接入", confidence: 1, source: "人工客服", action: processing ? "等待客服回复" : "等待客服接入", riskLevel: "medium" };
}
function closedDecision() {
  return { intent: "服务已结束", confidence: 1, source: "服务闭环", action: "new_session", riskLevel: "low" };
}
function closedByAgent(messages = []) {
  return messages.some((item) => item.role === "agent" && /\u5ba2\u670d\u5df2\u7ed3\u675f/.test(item.content || ""));
}
function decisionFromMessages(messages = []) {
  const message = [...messages].reverse().find((item) => item.role === "assistant" && item.intent);
  return message ? { intent: message.intent, confidence: message.confidence, source: message.source, action: message.action, riskLevel: message.riskLevel } : null;
}
function decisionFromResult(result) {
  return result ? { intent: result.intent, confidence: result.confidence, source: result.source, action: result.action, riskLevel: result.riskLevel } : null;
}
function progressLabel(phase) { return ({ submitting: "正在接收并保存问题", understanding: "正在识别意图与风险", routing: "正在匹配知识和业务路径", generating: "正在生成回答", saving: "正在保存处理结果" })[phase] || "正在处理"; }
function statusTitle(mode) { return ({ booting: "正在连接", new_session: "新会话中", ai: "AI处理中", agent: "同步人工" })[mode] || "正在创建"; }
function composerPlaceholder({ isClosed, humanMode, busyMode }) {
  if (isClosed) return "本次服务已结束，请新建会话后继续咨询";
  if (busyMode === "booting" || busyMode === "new_session") return "正在准备会话…";
  if (humanMode) return "补充给客服的内容会进入同一个工单…";
  return "请描述你的售后问题，可附上订单号…";
}
function composerHint() {
  return "Enter 发送 / Shift+Enter 换行";
}
function statusLabel(status) { return ({ active: "服务中", waiting_agent: "等待人工", open: "待接入", processing: "处理中", closed: "已关闭" })[status] || "服务中"; }
function priorityLabel(priority) { return priority === "high" ? "紧急" : "普通"; }
function actionLabel(action) { return ({ answer: "直接回答", search_knowledge: "检索知识", query_order: "查询订单", query_refund: "查询退款", show_refund_form: "展示售后申请", refund_unavailable: "提示不可重复申请", order_not_found: "提示订单不存在", submit_refund: "提交售后申请", refund_submitted: "生成申请回执", create_ticket: "创建人工工单", wait_agent: "等待人工处理", new_session: "新建会话" })[action] || action || "--"; }
function riskLabel(risk) { return ({ low: "低", medium: "中", high: "高" })[risk] || "--"; }
function formatTime(value) { return value ? new Date(value).toLocaleString("zh-CN", { hour12: false, timeZone: "Asia/Shanghai" }) : "--"; }
