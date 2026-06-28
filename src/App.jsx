import React, { useEffect, useMemo, useRef, useState } from "react";
import { api } from "./api.js";

const QUICK_PROMPTS = [
  ["物流查询", "我的订单 OD20260620001 到哪里了？"],
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
  const [loading, setLoading] = useState(false);
  const [ratingOpen, setRatingOpen] = useState(false);
  const [decision, setDecision] = useState(null);
  const listRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    async function initializeSession() {
      const savedId = localStorage.getItem("yanxi_session_id");
      if (savedId) {
        try {
          const data = await api.getSession(savedId);
          if (data.session.status !== "closed") {
            if (!cancelled) { setSession(data.session); setMessages(data.messages); setDecision(decisionFromMessages(data.messages)); }
            return;
          }
        } catch {
          localStorage.removeItem("yanxi_session_id");
        }
      }
      const data = await api.createSession();
      localStorage.setItem("yanxi_session_id", data.session.id);
      if (!cancelled) { setSession(data.session); setMessages(data.messages); setDecision(decisionFromMessages(data.messages)); }
    }
    initializeSession();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!session?.id || session.status === "closed") return;
    const timer = setInterval(async () => {
      const data = await api.getSession(session.id).catch(() => null);
      if (data) { setSession(data.session); setMessages(data.messages); }
    }, 3000);
    return () => clearInterval(timer);
  }, [session?.id, session?.status]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  async function send(text = input) {
    const value = text.trim();
    if (!value || !session || loading) return;
    setInput(""); setLoading(true);
    setDecision({ phase: "submitting", intent: "正在接收问题", confidence: null, source: "消息通道", action: "保存用户消息", riskLevel: "" });
    setMessages((old) => [...old, { id: crypto.randomUUID(), role: "user", content: value, createdAt: beijingNow() }]);
    try {
      const data = await api.sendMessage({ sessionId: session.id, message: value }, setDecision);
      setSession(data.session); setMessages(data.messages);
      setDecision(decisionFromMessages(data.messages) || decisionFromResult(data.decision));
    } catch (error) {
      setMessages((old) => [...old, { id: crypto.randomUUID(), role: "system", content: error.message }]);
    } finally { setLoading(false); }
  }

  const lastAi = useMemo(() => [...messages].reverse().find((m) => m.role === "assistant"), [messages]);
  return <main className="customer-layout">
    <section className="intro-panel">
      <p className="eyebrow">AI AFTER-SALES SERVICE</p>
      <h1>售后问题，<br /><em>一句话说清。</em></h1>
      <p className="intro-copy">订单、物流、退换货或投诉，AI 先快速处理；复杂问题会连同当前对话一起交给人工客服。</p>
      <div className="trust-list"><span>✓ 业务数据可追溯</span><span>✓ 高风险问题转人工</span><span>✓ 全程服务评价</span></div>
      <div className="session-card"><small>当前会话</small><strong>{session?.id?.slice(-10) || "正在创建"}</strong><span className={`status ${session?.status || "active"}`}>{statusLabel(session?.status)}</span></div>
    </section>

    <section className="chat-card">
      <div className="chat-heading">
        <div><b>售后服务助手</b><span>AI 优先响应 · 人工随时接管</span></div>
        <button onClick={() => setRatingOpen(true)}>结束并评价</button>
      </div>
      <div className="message-list" ref={listRef}>
        {messages.map((m) => <Message key={m.id} message={m} />)}
        {loading && <div className="message assistant"><div className="avatar">AI</div><div className="bubble typing">正在理解你的问题<span>•••</span></div></div>}
      </div>
      {lastAi?.action === "show_refund_form" && <RefundCard session={session} orderNo={lastAi.orderNo} onDone={() => api.getSession(session.id).then((d) => setMessages(d.messages))} />}
      <div className="quick-row">{QUICK_PROMPTS.map(([label, text]) => <button key={label} onClick={() => send(text)}>{label}</button>)}</div>
      <form className="composer" onSubmit={(e) => { e.preventDefault(); send(); }}>
        <textarea value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }} placeholder="请描述你的售后问题，可附上订单号…" rows="2" />
        <small className="keyboard-hint">Enter 发送 · Shift+Enter 换行</small>
        <button disabled={!input.trim() || loading}>发送</button>
      </form>
    </section>

    <aside className="decision-panel">
      <p className="eyebrow">DECISION TRACE</p><h2>AI 决策轨迹</h2>
      {loading && <div className="decision-progress"><i /><span>{progressLabel(decision?.phase)}</span></div>}
      <Decision label="识别意图" value={(decision || lastAi)?.intent || "等待提问"} />
      <Decision label="置信度" value={(decision || lastAi)?.confidence != null ? `${Math.round((decision || lastAi).confidence * 100)}%` : "--"} />
      <Decision label="信息来源" value={(decision || lastAi)?.source || "--"} />
      <Decision label="下一动作" value={loading ? ((decision || {}).action || "处理中") : actionLabel((decision || lastAi)?.action)} />
      <Decision label="风险等级" value={loading ? "评估中" : riskLabel((decision || lastAi)?.riskLevel)} tone={(decision || lastAi)?.riskLevel} />
      <div className="explain">这里展示 AI 为什么这样回答，以及何时把问题交给人工处理。</div>
    </aside>
    {ratingOpen && <RatingModal session={session} onClose={() => setRatingOpen(false)} />}
  </main>;
}

function Message({ message }) {
  const isUser = message.role === "user";
  const roleName = message.role === "agent" ? "人工" : message.role === "system" ? "!" : "AI";
  return <div className={`message ${message.role}`}>
    {!isUser && <div className="avatar">{roleName}</div>}
    <div><div className="bubble">{message.content}</div>{message.role === "assistant" && message.intent && <div className="meta"><span>{message.intent}</span><span>{message.source}</span></div>}</div>
  </div>;
}

function Decision({ label, value, tone }) {
  return <div className="decision-row"><span>{label}</span><strong className={tone || ""}>{value}</strong></div>;
}

function RefundCard({ session, orderNo = "", onDone }) {
  const [order, setOrder] = useState(orderNo);
  const [reason, setReason] = useState("商品不合适");
  const [state, setState] = useState("");
  async function submit() {
    try { await api.submitRefund({ sessionId: session.id, orderNo: order, reason }); setState("退款申请已提交"); onDone(); }
    catch (error) { setState(error.message); }
  }
  return <div className="refund-card"><b>退款申请</b><input value={order} onChange={(e) => setOrder(e.target.value)} placeholder="订单号" /><select value={reason} onChange={(e) => setReason(e.target.value)}><option>商品不合适</option><option>商品质量问题</option><option>错发或漏发</option><option>其他原因</option></select><button onClick={submit}>提交申请</button>{state && <small>{state}</small>}</div>;
}

function RatingModal({ session, onClose }) {
  const [score, setScore] = useState(5), [resolved, setResolved] = useState(true), [comment, setComment] = useState(""), [done, setDone] = useState(false);
  async function submit() { await api.submitRating({ sessionId: session.id, score, resolved, comment }); setDone(true); }
  return <div className="modal-backdrop"><div className="modal">
    {done ? <><div className="success-mark">✓</div><h2>谢谢你的评价</h2><p>反馈会帮助我们改进知识库和服务流程。</p><button className="primary" onClick={onClose}>完成</button></> : <>
      <p className="eyebrow">SERVICE REVIEW</p><h2>这次问题解决了吗？</h2>
      <div className="toggle-row"><button className={resolved ? "selected" : ""} onClick={() => setResolved(true)}>已经解决</button><button className={!resolved ? "selected" : ""} onClick={() => setResolved(false)}>仍未解决</button></div>
      <div className="stars">{[1, 2, 3, 4, 5].map((n) => <button key={n} onClick={() => setScore(n)} className={n <= score ? "on" : ""}>★</button>)}</div>
      <textarea value={comment} onChange={(e) => setComment(e.target.value)} placeholder="还有什么想告诉我们？" />
      <div className="modal-actions"><button onClick={onClose}>稍后评价</button><button className="primary" onClick={submit}>提交评价</button></div>
    </>}
  </div></div>;
}

function AgentPage() {
  const [tickets, setTickets] = useState([]), [selectedId, setSelectedId] = useState(null), [reply, setReply] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const refresh = () => api.listTickets().then((d) => { setTickets(d.tickets); setSelectedId((id) => id && d.tickets.some((t) => t.id === id) ? id : d.tickets[0]?.id || null); });
  useEffect(() => { refresh(); const timer = setInterval(refresh, 3000); return () => clearInterval(timer); }, []);
  const filteredTickets = tickets.filter((ticket) => priorityFilter === "all" || ticket.priority === priorityFilter);
  const selected = tickets.find((t) => t.id === selectedId);
  async function act(fn) { await fn(); await refresh(); }
  async function sendReply() { if (!selected || selected.status !== "processing" || !reply.trim()) return; await act(async () => { await api.replyTicket(selected.id, reply); setReply(""); }); }
  return <main className="workspace">
    <aside className="ticket-sidebar"><p className="eyebrow">HUMAN DESK</p><h1>人工工作台</h1>
      <div className="queue-toolbar"><div className="queue-tabs"><button className="active">全部 {tickets.length}</button></div><label>优先级<select value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value)}><option value="all">全部</option><option value="high">紧急</option><option value="normal">普通</option></select></label></div>
      <div className="ticket-list">{filteredTickets.map((t) => <button key={t.id} className={selectedId === t.id ? "selected" : ""} onClick={() => setSelectedId(t.id)}><span><b>{t.intent}</b><small>{t.id}</small></span><i className={t.priority}>{t.priority === "high" ? "紧急" : "普通"}</i><p>{t.summary}</p></button>)}</div>
    </aside>
    <section className="ticket-detail">{selected ? <>
      <header><div><p className="eyebrow">TICKET {selected.id}</p><h2>{selected.intent}</h2></div><div className="ticket-header-actions"><span className={`ticket-status ${selected.status}`}>{statusLabel(selected.status)}</span>{selected.status === "open" && <button className="claim-action" onClick={() => act(() => api.claimTicket(selected.id))}>接入会话</button>}{selected.status === "processing" && <button className="close-action" onClick={() => act(() => api.closeTicket(selected.id))}>关闭工单</button>}</div></header>
      <div className="ticket-context"><div><small>转人工原因</small><strong>{selected.handoffReason}</strong></div><div><small>AI 置信度</small><strong>{Math.round((selected.confidence || 0) * 100)}%</strong></div><div><small>创建时间</small><strong>{formatTime(selected.createdAt)}</strong></div></div>
      <section className="summary"><small>AI 会话摘要</small><p>{selected.summary}</p></section>
      <div className="timeline">{selected.messages?.map((m) => <Message key={m.id} message={m} />)}</div>
      <div className={`agent-composer ${selected.status !== "processing" ? "locked" : ""}`}><textarea disabled={selected.status !== "processing"} value={reply} onChange={(e) => setReply(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendReply(); } }} placeholder={selected.status === "open" ? "请先在右上角接入会话" : selected.status === "closed" ? "工单已关闭" : "输入人工回复…"} /><div className="composer-footer"><small>{selected.status === "processing" ? "Enter 发送 · Shift+Enter 换行" : "接入会话后才能回复和关闭工单"}</small><button className="primary" disabled={selected.status !== "processing" || !reply.trim()} onClick={sendReply}>发送回复</button></div></div>
    </> : <div className="empty">暂时没有需要人工处理的工单</div>}</section>
  </main>;
}
function AnalyticsPage() {
  const [data, setData] = useState(null);
  const [from, setFrom] = useState(() => beijingDate(-29));
  const [to, setTo] = useState(() => beijingDate());
  const [exporting, setExporting] = useState("");
  const [notice, setNotice] = useState("");
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
  return <main className="analytics"><div className="analytics-heading"><div className="page-title"><p className="eyebrow">SERVICE INTELLIGENCE</p><h1>运营洞察</h1><p>从每一次服务中，找到下一次优化的方向。</p></div>
    <div className="report-tools"><div className="date-range"><label>开始日期<input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} /></label><span>至</span><label>结束日期<input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} /></label></div><div className="export-actions"><button disabled={Boolean(exporting) || !data} onClick={downloadExcel}>{exporting === "excel" ? "正在生成…" : "导出 Excel"}</button><button className="primary" disabled={Boolean(exporting) || !data} onClick={downloadPdf}>{exporting === "pdf" ? "正在生成…" : "生成 PDF 报告"}</button></div><small>{notice || "按北京时间统计，导出数据自动隐藏用户身份标识"}</small></div></div>
    <section className="metric-grid">{cards.map(([label, value, unit]) => <article key={label}><span>{label}</span><strong>{value ?? "--"}<small>{unit}</small></strong></article>)}</section>
    <section className="analytics-grid"><article><InfoTitle title="意图分布" tip="按 AI 最终识别的售后意图统计。数量反映各类问题出现频次，横条越长代表占比越高。" /><div className="bars">{(data?.intents || []).map((x) => <div key={x.name}><span>{x.name}</span><div><i style={{ width: `${x.percent}%` }} /></div><b>{x.count}</b></div>)}</div></article>
      <article><InfoTitle title="知识缺口" tip="AI 无法从现有知识库获得可靠答案、需要人工补充的问题。次数越高，越应优先补充知识。" /><div className="gap-list">{(data?.knowledgeGaps || []).map((x) => <div key={x.question}><span>{x.question}</span><b>{x.count} 次</b></div>)}</div></article>
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
function decisionFromMessages(messages = []) {
  const message = [...messages].reverse().find((item) => item.role === "assistant" && item.intent);
  return message ? { intent: message.intent, confidence: message.confidence, source: message.source, action: message.action, riskLevel: message.riskLevel } : null;
}
function decisionFromResult(result) {
  return result ? { intent: result.intent, confidence: result.confidence, source: result.source, action: result.action, riskLevel: result.riskLevel } : null;
}
function progressLabel(phase) { return ({ submitting: "正在接收并保存问题", understanding: "正在识别意图与风险", routing: "正在匹配知识和业务路径", generating: "正在生成回答", saving: "正在保存处理结果" })[phase] || "正在处理"; }

function statusLabel(status) { return ({ active: "服务中", waiting_agent: "等待人工", open: "待接入", processing: "处理中", closed: "已完成" })[status] || "服务中"; }
function actionLabel(action) { return ({ answer: "直接回答", search_knowledge: "检索知识", query_order: "查询订单", query_refund: "查询退款", show_refund_form: "展示退款表单", create_ticket: "创建人工工单" })[action] || "--"; }
function riskLabel(risk) { return ({ low: "低", medium: "中", high: "高" })[risk] || "--"; }
function formatTime(value) { return value ? new Date(value).toLocaleString("zh-CN", { hour12: false, timeZone: "Asia/Shanghai" }) : "--"; }
