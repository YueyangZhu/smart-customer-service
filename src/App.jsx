import React, { useEffect, useMemo, useRef, useState } from "react";
import { api } from "./api.js";

const QUICK_PROMPTS = [
  ["物流查询", "我的订单 OD20260620001 到哪里了？"],
  ["我要退货", "OD20260620001 我要退货"],
  ["退货规则", "商品签收后几天可以申请无理由退货？"],
  ["退款进度", "订单 OD20260618008 的退款什么时候到账？"],
  ["转人工", "退款金额不对，我要投诉并转人工处理"]
];

export default function App() {
  const [page, setPage] = useState("customer");
  return <div className="app-shell">
    <Header page={page} setPage={setPage} />
    <div style={{ display: page === "customer" ? "contents" : "none" }}><CustomerPage /></div>
    <div style={{ display: page === "agent" ? "contents" : "none" }}><AgentPage /></div>
    <div style={{ display: page === "analytics" ? "contents" : "none" }}><AnalyticsPage /></div>
  </div>;
}

function Header({ page, setPage }) {
  const links = [["customer", "客户服务"], ["agent", "人工工作台"], ["analytics", "运营洞察"]];
  return <header className="topbar">
    <button className="brand" onClick={() => setPage("customer")}>
      <span className="brand-mark">言</span>
      <span><strong>言析智能客服</strong><small>AFTER-SALES COPILOT</small></span>
    </button>
    <nav>{links.map(([key, label]) => <button key={key} className={page === key ? "active" : ""} onClick={() => setPage(key)}>{label}</button>)}</nav>
    <div className="online"><i /> 服务运行中</div>
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

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
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
        <div><b>售后服务助手</b><span>{chatSubtitle}</span></div>
        <button disabled={!session || isBusy} onClick={isClosed ? startNewSession : () => setRatingOpen(true)}>{isClosed ? "新建会话" : "结束并评价"}</button>
      </div>
      {chatProgress && <div className={`chat-progress ${busyMode}`}><i /><span>{chatProgress}</span></div>}
      <div className="message-list" ref={listRef}>
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
      {isClosed && <div className="closed-session"><strong>本次服务已结束</strong><span>继续咨询请开启一个新的会话。</span><button onClick={startNewSession} disabled={isBusy}>新建会话</button></div>}
      {!humanMode && <div className="quick-row">{QUICK_PROMPTS.map(([label, text]) => <button key={label} disabled={!canUseQuick} onClick={() => send(text)}>{label}</button>)}</div>}
      <form className={`composer ${isClosed ? "closed" : ""}`} onSubmit={(e) => { e.preventDefault(); send(); }}>
        <textarea disabled={!canType} value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }} placeholder={composerPlaceholder({ isClosed, humanMode, busyMode })} rows="2" />
        <small className="keyboard-hint">{composerHint({ isClosed, humanMode, busyMode })}</small>
        <button disabled={!canType || !input.trim()}>{humanMode ? "补充给客服" : "发送"}</button>
      </form>
    </section>

    <aside className="decision-panel">
      <p className="eyebrow">DECISION TRACE</p><h2>服务状态</h2>
      {busyMode === "ai" && <div className="decision-progress"><i /><span>{progressLabel(decision?.phase)}</span></div>}
      {busyMode === "agent" && <div className="decision-progress agent"><i /><span>正在写入人工工单</span></div>}
      <Decision label="当前阶段" value={panelDecision?.intent || statusTitle(busyMode)} />
      <Decision label="置信度" value={panelDecision?.confidence != null ? `${Math.round(panelDecision.confidence * 100)}%` : "--"} />
      <Decision label="信息来源" value={panelDecision?.source || "--"} />
      <Decision label="下一动作" value={busyMode === "ai" ? ((decision || {}).action || "处理中") : actionLabel(panelDecision?.action)} />
      <Decision label="风险等级" value={busyMode === "ai" ? "评估中" : riskLabel(panelDecision?.riskLevel)} tone={panelDecision?.riskLevel} />
      <div className="explain">人工接入后，用户补充内容只进入同一个工单时间线，不再触发 AI 自动回复。</div>
    </aside>
    {ratingOpen && <RatingModal session={session} onClose={() => setRatingOpen(false)} onSubmitted={() => api.getSession(session.id).then((d) => { setSession(d.session); setMessages(d.messages); })} />}
  </main>;
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
  const selected = filteredTickets.find((t) => t.id === selectedId) || filteredTickets[0];

  async function act(fn) { await fn(); await refresh(); }
  async function sendReply() {
    if (!selected || selected.status !== "processing" || !reply.trim()) return;
    await act(async () => { await api.replyTicket(selected.id, reply); setReply(""); });
  }
  async function closeSelectedTicket() {
    if (!selected || selected.status !== "processing") return;
    await api.closeTicket(selected.id);
    setStatusFilter("closed");
    setSelectedId(selected.id);
    setReply("");
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
      <header><div className="ticket-title-block"><p className="eyebrow">TICKET {selected.id}</p><div className="ticket-title-row"><h2>{selected.intent}</h2></div><p className="ticket-subtitle">最近更新 {formatTime(selected.updatedAt || selected.createdAt)}</p></div><div className="ticket-header-actions">{selected.status === "open" && <button className="claim-action" onClick={() => act(() => api.claimTicket(selected.id))}>接入会话</button>}{selected.status === "processing" && <button className="close-action" onClick={closeSelectedTicket}>关闭工单</button>}</div></header>
      <div className="ticket-context compact"><div><small>转人工原因</small><strong>{selected.handoffReason || "需要人工核实"}</strong></div><div><small>优先级</small><strong>{priorityLabel(selected.priority)}</strong></div><div><small>当前状态</small><strong>{statusLabel(selected.status)}</strong></div><div><small>AI 置信度</small><strong>{Math.round((selected.confidence || 0) * 100)}%</strong></div></div>
      <section className="summary compact-summary"><small>AI 摘要</small><p>{selected.summary}</p></section>
      <div className="timeline-heading"><b>对话时间线</b><span>{selected.messages?.length || 0} 条消息</span></div>
      <div className="timeline">{selected.messages?.map((m) => <Message key={m.id} message={m} />)}</div>
      <div className={`agent-composer inline ${selected.status !== "processing" ? "locked" : ""}`}><textarea disabled={selected.status !== "processing"} value={reply} onChange={(e) => setReply(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendReply(); } }} placeholder={selected.status === "open" ? "先接入会话后回复" : selected.status === "closed" ? "工单已关闭" : "输入人工回复，Enter 发送…"} /><button className="primary" disabled={selected.status !== "processing" || !reply.trim()} onClick={sendReply}>发送</button></div>
    </> : <div className="empty">当前筛选下没有需要处理的工单</div>}</section>
  </main>;
}

function AnalyticsPage() {
  const [data, setData] = useState(null);
  const [from, setFrom] = useState(() => beijingDate(-29));
  const [to, setTo] = useState(() => beijingDate());
  const [exporting, setExporting] = useState("");
  const [notice, setNotice] = useState("");
  const fromInputRef = useRef(null), toInputRef = useRef(null);
  useEffect(() => {
    const refresh = () => api.dashboard({ from, to }).then(setData).catch(() => null);
    refresh();
    const timer = setInterval(refresh, 3000);
    return () => clearInterval(timer);
  }, [from, to]);
  async function downloadExcel() {
    try { setExporting("excel"); setNotice(""); const [{ exportExcel }, raw] = await Promise.all([import("./exports.js"), api.exportData({ from, to })]); await exportExcel(raw, data || {}); setNotice("Excel 明细已生成"); }
    catch (error) { setNotice(error.message || "Excel 导出失败"); } finally { setExporting(""); }
  }
  async function downloadPdf() {
    try { setExporting("pdf"); setNotice(""); const [{ exportPdf }, raw] = await Promise.all([import("./exports.js"), api.exportData({ from, to })]); await exportPdf(data || {}, { from, to }, raw); setNotice("PDF 报告已生成"); }
    catch (error) { setNotice(error.message || "PDF 生成失败"); } finally { setExporting(""); }
  }
  const metrics = data?.metrics || {};
  const cards = [["区间会话", metrics.sessions, "次"], ["AI 自助解决率", metrics.solveRate, "%"], ["转人工率", metrics.handoffRate, "%"], ["满意度", metrics.satisfaction, "/5"]];
  const closure = data?.closure || [{ name: "AI 自助解决", count: metrics.aiResolved || 0 }, { name: "人工已解决", count: metrics.humanResolved || 0 }, { name: "处理中", count: metrics.inProgress || 0 }];
  const closureTotal = Math.max(closure.reduce((sum, item) => sum + item.count, 0), 1);
  const closureMax = Math.max(...closure.map((item) => item.count), 1);
  let angle = 0;
  const colors = ["#0b7a61", "#86b8a7", "#f0a45d", "#d8dedb"];
  const donut = `conic-gradient(${closure.map((item, index) => { const start = angle; angle += item.count / closureTotal * 360; return `${colors[index % colors.length]} ${start}deg ${angle}deg`; }).join(",")})`;
  const topIntents = (data?.intents || []).slice(0, 5);
  const topKnowledgeGaps = (data?.knowledgeGaps || []).slice(0, 5);
  return <main className="analytics"><div className="analytics-heading"><div className="page-title"><p className="eyebrow">SERVICE INTELLIGENCE</p><h1>运营洞察</h1><p>从每一次服务中，找到下一次优化的方向。</p></div>
    <div className="report-tools"><div className="date-range"><label onClick={() => fromInputRef.current?.showPicker?.()}>开始日期<input ref={fromInputRef} type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} /></label><span>至</span><label onClick={() => toInputRef.current?.showPicker?.()}>结束日期<input ref={toInputRef} type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} /></label></div><div className="export-actions"><button disabled={Boolean(exporting) || !data} onClick={downloadExcel}>{exporting === "excel" ? "正在生成…" : "导出 Excel"}</button><button className="primary" disabled={Boolean(exporting) || !data} onClick={downloadPdf}>{exporting === "pdf" ? "正在生成…" : "生成 PDF 报告"}</button></div><small>{notice || "按北京时间统计，导出数据自动隐藏用户身份标识"}</small></div></div>
    <section className="metric-grid">{cards.map(([label, value, unit]) => <article key={label}><span>{label}</span><strong>{value ?? "--"}<small>{unit}</small></strong></article>)}</section>
    <section className="analytics-grid"><article><InfoTitle title="意图分布 Top 5" tip="按 AI 最终识别的售后意图统计。页面展示前 5 项，完整明细保留在导出数据中。" /><div className="bars compact-list">{topIntents.map((x) => <div key={x.name}><span>{x.name}</span><div><i style={{ width: `${x.percent}%` }} /></div><b>{x.count}</b></div>)}</div></article>
      <article><InfoTitle title="知识缺口 Top 5" tip="AI 无法从现有知识库获得可靠答案、需要人工补充的问题。页面展示前 5 项，完整明细保留在导出数据中。" /><div className="gap-list compact-list">{topKnowledgeGaps.map((x) => <div key={x.question}><span>{x.question}</span><b>{x.count} 次</b></div>)}</div></article>
      <article className="wide"><InfoTitle title="闭环状态" tip="展示会话最终流向：AI 自助解决、人工已解决或仍在处理中；用于判断服务链路是否真正完成。" /><div className="closure-layout"><div className="closure-bars">{closure.map((item, index) => <div key={item.name}><span><i style={{ background: colors[index % colors.length] }} />{item.name}</span><div><b style={{ width: `${Math.round(item.count / closureMax * 100)}%`, background: colors[index % colors.length] }} /></div><strong>{item.count}</strong></div>)}</div><div className="closure-donut-wrap"><div className="closure-donut" style={{ background: donut }}><span><b>{closureTotal}</b>会话</span></div><div className="closure-legend">{closure.map((item, index) => <span key={item.name}><i style={{ background: colors[index % colors.length] }} />{item.name} {Math.round(item.count / closureTotal * 100)}%</span>)}</div></div></div></article>
    </section>
  </main>;
}

function InfoTitle({ title, tip }) { return <h2 className="info-title">{title}<button type="button" className="info-tip" aria-label={`${title}说明`} data-tip={tip}>?</button></h2>; }
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
function composerHint({ isClosed, humanMode, busyMode }) {
  if (isClosed) return "旧会话已锁定";
  if (busyMode) return "请稍等，正在处理当前操作";
  return humanMode ? "Enter 补充给客服 · AI 不再自动回复" : "Enter 发送 · Shift+Enter 换行";
}
function statusLabel(status) { return ({ active: "服务中", waiting_agent: "等待人工", open: "待接入", processing: "处理中", closed: "已关闭" })[status] || "服务中"; }
function priorityLabel(priority) { return priority === "high" ? "紧急" : "普通"; }
function actionLabel(action) { return ({ answer: "直接回答", search_knowledge: "检索知识", query_order: "查询订单", query_refund: "查询退款", show_refund_form: "展示售后申请", refund_unavailable: "提示不可重复申请", order_not_found: "提示订单不存在", submit_refund: "提交售后申请", refund_submitted: "生成申请回执", create_ticket: "创建人工工单", wait_agent: "等待人工处理", new_session: "新建会话" })[action] || action || "--"; }
function riskLabel(risk) { return ({ low: "低", medium: "中", high: "高" })[risk] || "--"; }
function formatTime(value) { return value ? new Date(value).toLocaleString("zh-CN", { hour12: false, timeZone: "Asia/Shanghai" }) : "--"; }
