import cors from "cors";
import express from "express";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";

const app = express();
const port = Number(process.env.PORT || process.env.API_PORT || 8787);
const host = process.env.HOST || "0.0.0.0";
const COZE_TOKEN = process.env.COZE_API_TOKEN || "";
const COZE_BOT_ID = process.env.COZE_BOT_ID || "7653375037604380691";
const COZE_BASE = "https://api.coze.cn";
const DATABASE_URL = process.env.DATABASE_URL || "";
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || "";
const PGSSLMODE = process.env.PGSSLMODE || "";

app.use(express.json({ limit: "300kb" }));
app.use(cors({
  origin: FRONTEND_ORIGIN ? FRONTEND_ORIGIN.split(",").map((item) => item.trim()) : true
}));

const seedOrders = [
  { id: "OD20260620001", product: "Aurora 降噪耳机", amount: 699, status: "运输中", logistics: "已到达上海浦东分拨中心，预计明日送达", refund: "", refundable: true },
  { id: "OD20260618008", product: "Luma 阅读灯", amount: 239, status: "退款处理中", logistics: "", refund: "退款审核已通过，预计 1-3 个工作日原路到账", refundable: false },
  { id: "OD20260612021", product: "Mori 随行杯", amount: 129, status: "已签收", logistics: "6 月 15 日由本人签收", refund: "", refundable: true }
];

const knowledge = [
  { intent: "商品与政策咨询", keywords: ["退货", "七天", "7天", "无理由", "签收后几天", "拆封", "贴身用品", "能退吗"], answer: "符合条件的商品，在签收后 7 天内可以申请无理由退货。商品、配件、赠品和包装需保持完整，且不能影响二次销售。定制商品、已拆封的贴身用品、虚拟商品及页面明确标注不支持退货的商品不适用。", source: "言析电商售后知识库" },
  { intent: "换货政策", keywords: ["换货", "换一个", "换新", "破损", "损坏"], answer: "商品存在破损、功能故障、缺件或与页面描述明显不符时，可以申请售后处理。建议提交订单号、问题描述和相关照片，审核后会提供退货或换货方案。", source: "言析电商售后知识库" },
  { intent: "发票咨询", keywords: ["发票", "开票", "抬头"], answer: "你可以在订单详情页申请电子发票。通常会在申请后 24 小时内发送到订单绑定邮箱。", source: "订单服务指南" }
];

function normalizeDatabaseUrl(databaseUrl) {
  if (!databaseUrl) return "";
  try {
    const parsed = new URL(databaseUrl);
    parsed.searchParams.delete("sslmode");
    parsed.searchParams.delete("sslcert");
    parsed.searchParams.delete("sslkey");
    parsed.searchParams.delete("sslrootcert");
    return parsed.toString();
  } catch {
    return databaseUrl;
  }
}

const pool = DATABASE_URL ? new Pool({
  connectionString: normalizeDatabaseUrl(DATABASE_URL),
  ssl: PGSSLMODE === "disable" ? false : { rejectUnauthorized: false }
}) : null;

const memory = {
  sessions: new Map(),
  messages: [],
  tickets: new Map(),
  ticketReplies: [],
  ratings: [],
  knowledgeGaps: new Map(),
  refunds: [],
  orders: new Map(seedOrders.map((order) => [order.id, { ...order }]))
};

const now = () => new Date().toISOString();
const id = (prefix) => `${prefix}${Date.now()}${randomUUID().replaceAll("-", "").slice(0, 8).toUpperCase()}`;
const findOrderNo = (text) => text.match(/OD\d{11}/i)?.[0]?.toUpperCase() || "";

function toSnake(value) {
  return value.replace(/[A-Z]/g, (char) => `_${char.toLowerCase()}`);
}

const tableColumns = {
  sessions: new Set(["id", "userId", "cozeConversationId", "status", "resolved", "ticketId", "createdAt", "updatedAt"]),
  messages: new Set(["id", "sessionId", "role", "content", "intent", "confidence", "action", "source", "riskLevel", "orderNo", "needHandoff", "handoffReason", "createdAt"]),
  orders: new Set(["id", "product", "amount", "status", "logistics", "refund", "refundable", "createdAt", "updatedAt"]),
  refunds: new Set(["id", "sessionId", "orderNo", "reason", "status", "createdAt", "updatedAt"]),
  tickets: new Set(["id", "sessionId", "intent", "confidence", "summary", "handoffReason", "priority", "status", "agent", "claimedAt", "closedAt", "createdAt", "updatedAt"]),
  ticket_replies: new Set(["id", "ticketId", "sessionId", "content", "createdAt"]),
  ratings: new Set(["id", "sessionId", "score", "resolved", "comment", "createdAt"]),
  knowledge_gaps: new Set(["id", "question", "count", "status", "createdAt", "updatedAt"])
};

function allowedEntries(table, data) {
  const allowed = tableColumns[table];
  return Object.entries(data).filter(([key, value]) => value !== undefined && (!allowed || allowed.has(key)));
}

function camelize(row = {}) {
  return Object.fromEntries(Object.entries(row).map(([key, value]) => [
    key.replace(/_([a-z])/g, (_, char) => char.toUpperCase()),
    value instanceof Date ? value.toISOString() : value
  ]));
}

function withinBeijingRange(items, range = {}, field = "createdAt") {
  const from = range.from ? new Date(`${range.from}T00:00:00+08:00`).getTime() : 0;
  const to = range.to ? new Date(`${range.to}T23:59:59.999+08:00`).getTime() : Number.MAX_SAFE_INTEGER;
  return items.filter((item) => {
    const timestamp = new Date(item[field] || item.createdAt || 0).getTime();
    return timestamp >= from && timestamp <= to;
  });
}

function pick(items, fields, range = {}) {
  return withinBeijingRange(items, range).map((item) => Object.fromEntries(fields.map((field) => [field, item[field] ?? ""])));
}

async function query(sql, params = []) {
  const result = await pool.query(sql, params);
  return result.rows.map(camelize);
}

async function insert(table, data) {
  const entries = allowedEntries(table, data);
  const columns = entries.map(([key]) => toSnake(key));
  const placeholders = entries.map((_, index) => `$${index + 1}`);
  const values = entries.map(([, value]) => value);
  const rows = await query(`insert into ${table} (${columns.join(", ")}) values (${placeholders.join(", ")}) returning *`, values);
  return rows[0];
}

async function updateById(table, itemId, data) {
  const entries = allowedEntries(table, data);
  const assignments = entries.map(([key], index) => `${toSnake(key)} = $${index + 1}`);
  const values = entries.map(([, value]) => value);
  const rows = await query(`update ${table} set ${assignments.join(", ")} where id = $${values.length + 1} returning *`, [...values, itemId]);
  return rows[0] || null;
}

async function ensureSeedOrders() {
  if (!pool) return;
  for (const order of seedOrders) {
    await query(
      `insert into orders (id, product, amount, status, logistics, refund, refundable)
       values ($1, $2, $3, $4, $5, $6, $7)
       on conflict (id) do nothing`,
      [order.id, order.product, order.amount, order.status, order.logistics, order.refund, order.refundable]
    );
  }
}

const store = {
  async createSession(session) {
    if (pool) return insert("sessions", session);
    memory.sessions.set(session.id, { ...session });
    return session;
  },
  async getSession(sessionId) {
    if (pool) return (await query("select * from sessions where id = $1", [sessionId]))[0] || null;
    return memory.sessions.get(sessionId) || null;
  },
  async updateSession(sessionId, data) {
    if (pool) return updateById("sessions", sessionId, { ...data, updatedAt: now() });
    const session = memory.sessions.get(sessionId);
    if (!session) return null;
    Object.assign(session, data, { updatedAt: now() });
    return session;
  },
  async addMessage(message) {
    if (pool) return insert("messages", message);
    memory.messages.push({ ...message });
    return message;
  },
  async listMessages(sessionId) {
    if (pool) return query("select * from messages where session_id = $1 order by created_at asc limit 100", [sessionId]);
    return memory.messages.filter((message) => message.sessionId === sessionId).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  },
  async getOrder(orderNo) {
    if (pool) return (await query("select * from orders where id = $1", [orderNo]))[0] || null;
    return memory.orders.get(orderNo) || null;
  },
  async updateOrder(orderNo, data) {
    if (pool) return updateById("orders", orderNo, { ...data, updatedAt: now() });
    const order = memory.orders.get(orderNo);
    if (!order) return null;
    Object.assign(order, data, { updatedAt: now() });
    return order;
  },
  async addRefund(refund) {
    if (pool) return insert("refunds", refund);
    memory.refunds.push({ ...refund });
    return refund;
  },
  async getRefundByOrder(orderNo) {
    if (pool) return (await query("select * from refunds where order_no = $1 order by created_at desc limit 1", [orderNo]))[0] || null;
    return memory.refunds.filter((refund) => refund.orderNo === orderNo).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] || null;
  },
  async addRating(rating) {
    if (pool) return insert("ratings", rating);
    memory.ratings.push({ ...rating });
    return rating;
  },
  async createTicket(ticket) {
    if (pool) return insert("tickets", ticket);
    memory.tickets.set(ticket.id, { ...ticket });
    return ticket;
  },
  async getTicket(ticketId) {
    if (pool) return (await query("select * from tickets where id = $1", [ticketId]))[0] || null;
    return memory.tickets.get(ticketId) || null;
  },
  async updateTicket(ticketId, data) {
    if (pool) return updateById("tickets", ticketId, { ...data, updatedAt: now() });
    const ticket = memory.tickets.get(ticketId);
    if (!ticket) return null;
    Object.assign(ticket, data, { updatedAt: now() });
    return ticket;
  },
  async listTickets() {
    if (pool) return query("select * from tickets order by created_at desc limit 100");
    return [...memory.tickets.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },
  async addReply(reply) {
    if (pool) return insert("ticket_replies", reply);
    memory.ticketReplies.push({ ...reply });
    return reply;
  },
  async upsertKnowledgeGap(question) {
    if (pool) {
      const rows = await query(
        `insert into knowledge_gaps (id, question, count, status)
         values ($1, $2, 1, 'open')
         on conflict (id) do update set count = knowledge_gaps.count + 1, updated_at = now()
         returning *`,
        [`GAP_${Buffer.from(question).toString("hex").slice(0, 24)}`, question]
      );
      return rows[0];
    }
    memory.knowledgeGaps.set(question, (memory.knowledgeGaps.get(question) || 0) + 1);
    return { question, count: memory.knowledgeGaps.get(question), status: "open" };
  },
  async allForDashboard() {
    if (pool) {
      const [sessions, messages, tickets, ratings, gaps] = await Promise.all([
        query("select * from sessions"),
        query("select * from messages"),
        query("select * from tickets"),
        query("select * from ratings"),
        query("select * from knowledge_gaps")
      ]);
      return { sessions, messages, tickets, ratings, gaps };
    }
    return {
      sessions: [...memory.sessions.values()],
      messages: memory.messages,
      tickets: [...memory.tickets.values()],
      ratings: memory.ratings,
      gaps: [...memory.knowledgeGaps.entries()].map(([question, count]) => ({ id: question, question, count, status: "open", createdAt: "", updatedAt: "" }))
    };
  },
  async allForExport() {
    if (pool) {
      const [sessions, messages, tickets, replies, ratings, refunds, gaps] = await Promise.all([
        query("select * from sessions"),
        query("select * from messages"),
        query("select * from tickets"),
        query("select * from ticket_replies"),
        query("select * from ratings"),
        query("select * from refunds"),
        query("select * from knowledge_gaps")
      ]);
      return { sessions, messages, tickets, replies, ratings, refunds, gaps };
    }
    return {
      sessions: [...memory.sessions.values()],
      messages: memory.messages,
      tickets: [...memory.tickets.values()],
      replies: memory.ticketReplies,
      ratings: memory.ratings,
      refunds: memory.refunds,
      gaps: [...memory.knowledgeGaps.entries()].map(([question, count]) => ({ id: question, question, count, status: "open", createdAt: "", updatedAt: "" }))
    };
  }
};

function cleanMessageExtra(extra = {}) {
  return Object.fromEntries(
    allowedEntries("messages", extra).filter(([key]) => !["id", "sessionId", "role", "content", "createdAt"].includes(key))
  );
}

async function addMessage(sessionId, role, content, extra = {}) {
  const message = { id: randomUUID(), sessionId, role, content, createdAt: now(), ...cleanMessageExtra(extra) };
  return store.addMessage(message);
}

function understand(text) {
  const orderNo = findOrderNo(text);
  if (/投诉|太离谱|骗人|生气|差评|人工|金额不对|赔偿/.test(text)) return { intent: "投诉与人工服务", confidence: .96, action: "create_ticket", orderNo, source: "风险策略", needHandoff: true, handoffReason: "用户投诉、要求人工或涉及金额争议", riskLevel: "high" };
  if (/(退款|退钱|退的钱|退的钱怎么).*(进度|状态|到账|退回|到哪|多久|什么时候|审核|处理)|((进度|状态|到账|退回|到哪|多久|什么时候|审核|处理).*(退款|退钱|退的钱))/.test(text)) return { intent: "退款进度", confidence: .93, action: "query_refund", orderNo, source: "退款系统", needHandoff: false, handoffReason: "", riskLevel: "medium" };
  if (/申请退款|我要退款|退款申请|退货退款|申请退货|我要退货|退货申请|退一下|退回去/.test(text)) return { intent: "退货退款申请", confidence: .92, action: "show_refund_form", orderNo, source: "售后规则", needHandoff: false, handoffReason: "", riskLevel: "medium" };
  if (/物流|快递|到哪里|到哪了|没到|发货|送到|送达|预计到达/.test(text)) return { intent: "物流查询", confidence: .94, action: "query_order", orderNo, source: "订单系统", needHandoff: false, handoffReason: "", riskLevel: "low" };
  const hit = knowledge.map((item) => ({ item, score: item.keywords.filter((key) => text.includes(key)).length })).sort((a, b) => b.score - a.score)[0];
  if (hit?.score) return { intent: hit.item.intent, confidence: Math.min(.95, .78 + hit.score * .07), action: "search_knowledge", orderNo, source: hit.item.source, needHandoff: false, handoffReason: "", riskLevel: "low", answer: hit.item.answer };
  return { intent: "未知问题", confidence: .38, action: "create_ticket", orderNo, source: "知识库未命中", needHandoff: true, handoffReason: "知识库暂无可靠答案", riskLevel: "medium" };
}

async function prepareDecision(result) {
  if (result.action !== "show_refund_form" || !result.orderNo) return result;
  const order = await store.getOrder(result.orderNo);
  if (!order) return { ...result, action: "order_not_found", source: "订单系统", confidence: Math.max(result.confidence || 0, .9), riskLevel: "medium", needHandoff: false };
  const existingRefund = await store.getRefundByOrder(order.id);
  if (!order.refundable || existingRefund) {
    return { ...result, action: "refund_unavailable", source: "退款系统", confidence: Math.max(result.confidence || 0, .95), riskLevel: "medium", refundId: existingRefund?.id || "", refundStatus: existingRefund?.status || "", needHandoff: false };
  }
  return result;
}

async function businessAnswer(result, aiAnswer = "") {
  if (result.action === "order_not_found") return `没有查到订单 ${result.orderNo}，请检查订单号是否完整。`;
  if (result.action === "refund_unavailable") {
    const order = await store.getOrder(result.orderNo);
    const detail = order?.refund || (result.refundId ? `已有退款申请 ${result.refundId} 正在处理。` : "如需继续处理，请转人工补充说明。");
    return order ? `订单 ${order.id} 当前不能重复提交退款申请。当前状态为“${order.status}”。${detail}` : `订单 ${result.orderNo} 当前不能提交退款申请。`;
  }
  if (result.action === "query_order" || result.action === "query_refund") {
    if (!result.orderNo) return "请提供需要查询的订单号，格式类似 OD20260620001。";
    const order = await store.getOrder(result.orderNo);
    if (!order) return `没有查到订单 ${result.orderNo}，请检查订单号是否完整。`;
    if (result.action === "query_refund") return `订单 ${order.id} 当前状态为“${order.status}”。${order.refund || "暂时没有退款记录。"}`;
    return `查到订单 ${order.id}（${order.product}），当前状态为“${order.status}”，${order.logistics || order.refund}。`;
  }
  if (result.action === "show_refund_form") return result.orderNo ? `已识别订单 ${result.orderNo}，请在退款申请卡中确认原因并提交。` : "可以为你申请退款，请先提供订单号。";
  if (result.needHandoff) return result.riskLevel === "high" ? "我理解这个问题需要更谨慎地处理。已为你创建人工工单，客服会连同当前对话一起接手。" : "这个问题目前没有匹配到可靠答案。为了不误导你，我已转交人工客服处理。";
  return aiAnswer || result.answer || "我正在为你核实这个问题。";
}

async function cozeRequest(path, options = {}) {
  const response = await fetch(`${COZE_BASE}${path}`, { ...options, headers: { Authorization: `Bearer ${COZE_TOKEN}`, "Content-Type": "application/json", ...options.headers } });
  const body = await response.json();
  if (!response.ok || body.code) throw new Error(body.msg || `Coze API 请求失败（${response.status}）`);
  return body.data;
}

async function createCozeConversation(name) {
  if (!COZE_TOKEN) return "";
  const data = await cozeRequest("/v1/conversation/create", { method: "POST", body: JSON.stringify({ bot_id: COZE_BOT_ID, name }) });
  return String(data.id);
}

async function askCoze(session, text) {
  if (!COZE_TOKEN) return "";
  let conversationId = session.cozeConversationId;
  if (!conversationId) {
    conversationId = await createCozeConversation(`网页会话_${session.id.slice(-8)}`);
    await store.updateSession(session.id, { cozeConversationId: conversationId });
  }
  const created = await cozeRequest(`/v3/chat?conversation_id=${conversationId}`, {
    method: "POST",
    body: JSON.stringify({ bot_id: COZE_BOT_ID, user_id: session.userId, stream: false, auto_save_history: true, additional_messages: [{ role: "user", type: "question", content_type: "text", content: text }] })
  });
  const chatId = String(created.id);
  for (let index = 0; index < 20; index += 1) {
    await new Promise((resolve) => setTimeout(resolve, 800));
    const detail = await cozeRequest(`/v3/chat/retrieve?conversation_id=${conversationId}&chat_id=${chatId}`);
    if (detail.status === "failed") throw new Error(detail.last_error?.msg || "Coze 生成失败");
    if (detail.status === "completed") break;
  }
  const list = await cozeRequest(`/v3/chat/message/list?conversation_id=${conversationId}&chat_id=${chatId}`);
  return list.find((item) => item.role === "assistant" && item.type === "answer")?.content || "";
}

async function createTicket(session, result, text) {
  const ticketId = id("TK");
  const ticket = { id: ticketId, sessionId: session.id, intent: result.intent, confidence: result.confidence, summary: `用户问题：${text}。AI 判断为“${result.intent}”，建议人工核实并给出明确方案。`, handoffReason: result.handoffReason, priority: result.riskLevel === "high" ? "high" : "normal", status: "open", createdAt: now(), updatedAt: now() };
  await store.createTicket(ticket);
  await store.updateSession(session.id, { status: "waiting_agent", ticketId });
  return ticket;
}

function buildDashboard({ sessions, messages, tickets, ratings, gaps }, range = {}) {
  const s = withinBeijingRange(sessions, range);
  const m = withinBeijingRange(messages, range);
  const t = withinBeijingRange(tickets, range);
  const r = withinBeijingRange(ratings, range);
  const total = Math.max(s.length, 1);
  const solved = r.filter((item) => item.resolved).length;
  const avg = r.length ? r.reduce((sum, item) => sum + Number(item.score || 0), 0) / r.length : 0;
  const counts = {};
  m.filter((item) => item.role === "assistant" && item.intent && !["欢迎语", "人工回复"].includes(item.intent)).forEach((item) => { counts[item.intent] = (counts[item.intent] || 0) + 1; });
  const max = Math.max(...Object.values(counts), 1);
  const ticketSessions = new Set(t.map((item) => item.sessionId));
  const resolvedSessions = new Set(r.filter((item) => item.resolved).map((item) => item.sessionId));
  const aiResolved = s.filter((item) => resolvedSessions.has(item.id) && !ticketSessions.has(item.id)).length;
  const humanResolved = s.filter((item) => resolvedSessions.has(item.id) && ticketSessions.has(item.id)).length;
  const inProgress = Math.max(0, s.length - aiResolved - humanResolved);
  return {
    range: { from: range.from || "", to: range.to || "", timeZone: "Asia/Shanghai" },
    metrics: { sessions: s.length, solveRate: Math.round(solved / total * 100), handoffRate: Math.round(t.length / total * 100), satisfaction: Number(avg.toFixed(1)), messages: m.length, aiHandled: m.filter((item) => item.role === "assistant").length, handoffs: t.length, ratings: r.length, aiResolved, humanResolved, inProgress },
    intents: Object.entries(counts).map(([name, count]) => ({ name, count, percent: Math.round(count / max * 100) })),
    knowledgeGaps: withinBeijingRange(gaps, range).sort((a, b) => b.count - a.count),
    closure: [{ name: "AI 自助解决", count: aiResolved }, { name: "人工已解决", count: humanResolved }, { name: "处理中", count: inProgress }]
  };
}

app.post("/api/sessions", async (req, res, next) => {
  try {
    const session = { id: id("CS"), userId: `web_${randomUUID().slice(0, 8)}`, status: "active", resolved: null, cozeConversationId: "", createdAt: now(), updatedAt: now() };
    await store.createSession(session);
    await addMessage(session.id, "assistant", "你好，我是言析售后助手。你可以直接描述商品、物流、退换货或退款问题；复杂问题我会连同上下文一起交给人工客服。", { intent: "欢迎语", confidence: 1, action: "answer", source: "系统预设", riskLevel: "low" });
    res.status(201).json({ session: await store.getSession(session.id), messages: await store.listMessages(session.id) });
  } catch (error) { next(error); }
});

app.get("/api/sessions/:id", async (req, res, next) => {
  try {
    const session = await store.getSession(req.params.id);
    if (!session) return res.status(404).json({ message: "会话不存在" });
    res.json({ session, messages: await store.listMessages(session.id) });
  } catch (error) { next(error); }
});

app.post("/api/chat", async (req, res, next) => {
  try {
    const { sessionId, message } = req.body || {};
    const session = await store.getSession(sessionId);
    if (!session || typeof message !== "string" || !message.trim()) return res.status(400).json({ message: "会话或消息无效" });
    const text = message.trim();

    if (session.status === "closed") {
      return res.status(409).json({
        message: "本次服务已结束，请新建会话后继续咨询。",
        session,
        messages: await store.listMessages(sessionId)
      });
    }

    if (["waiting_agent", "processing", "open"].includes(session.status) || session.ticketId) {
      await addMessage(sessionId, "user", text, { intent: "等待人工", confidence: 1, action: "wait_agent", source: "人工客服", riskLevel: "medium" });
      if (session.ticketId) await store.updateTicket(session.ticketId, { status: session.status === "processing" ? "processing" : "open" });
      return res.json({
        session: await store.getSession(sessionId),
        messages: await store.listMessages(sessionId),
        decision: { intent: "等待人工", confidence: 1, action: "wait_agent", source: "人工客服", riskLevel: "medium", needHandoff: false }
      });
    }

    await addMessage(sessionId, "user", text);
    const result = await prepareDecision(understand(text));
    let aiAnswer = "";
    const shouldAskCoze = result.action === "search_knowledge" && !result.answer;
    if (shouldAskCoze) {
      try { aiAnswer = await askCoze(session, text); } catch (error) { console.warn("Coze fallback:", error.message); }
    }
    const answer = await businessAnswer(result, aiAnswer);
    if (result.needHandoff && !session.ticketId) {
      await createTicket(session, result, text);
    } else {
      await addMessage(sessionId, "assistant", answer, result);
    }
    if (result.intent === "未知问题") await store.upsertKnowledgeGap(text);
    res.json({ session: await store.getSession(sessionId), messages: await store.listMessages(sessionId), decision: result });
  } catch (error) { next(error); }
});

app.post("/api/refunds", async (req, res, next) => {
  try {
    const { sessionId, orderNo, reason } = req.body || {};
    const [session, order] = await Promise.all([store.getSession(sessionId), store.getOrder(orderNo)]);
    if (!session || !reason) return res.status(400).json({ message: "请完整填写退款信息" });
    if (!order) return res.status(400).json({ message: "没有查到这个订单，请检查订单号是否完整" });
    if (session.status === "closed") return res.status(409).json({ message: "本次服务已结束，请新建会话后再提交售后申请" });
    if (["waiting_agent", "processing", "open"].includes(session.status) || session.ticketId) return res.status(409).json({ message: "当前会话已转人工，请把退款诉求补充给客服处理" });
    const existingRefund = await store.getRefundByOrder(order.id);
    if (!order.refundable || existingRefund) return res.status(409).json({ message: "该订单当前不可重复申请退款" });
    const refund = await store.addRefund({ id: id("RF"), sessionId, orderNo: order.id, reason, status: "待审核", createdAt: now(), updatedAt: now() });
    await store.updateOrder(order.id, { status: "退款审核中", refund: `退款申请 ${refund.id} 已提交，当前待审核。`, refundable: false });
    await addMessage(sessionId, "user", `我提交了退款申请：订单 ${order.id}，原因：${reason}。`, { intent: "退款申请", confidence: 1, action: "submit_refund", source: "用户提交", riskLevel: "medium", orderNo: order.id });
    await addMessage(sessionId, "assistant", `退款申请已提交\n申请单号：${refund.id}\n订单号：${order.id}\n退款原因：${reason}\n当前状态：待审核\n下一步：审核结果会在当前会话更新，请留意后续通知。`, { intent: "退款申请", confidence: 1, action: "refund_submitted", source: "退款系统", riskLevel: "medium", orderNo: order.id });
    res.status(201).json({ refund, session: await store.getSession(sessionId), messages: await store.listMessages(sessionId) });
  } catch (error) { next(error); }
});

app.post("/api/ratings", async (req, res, next) => {
  try {
    const { sessionId, score, resolved, comment = "" } = req.body || {};
    const session = await store.getSession(sessionId);
    if (!session || !Number.isInteger(score) || score < 1 || score > 5) return res.status(400).json({ message: "评价信息无效" });
    const rating = await store.addRating({ id: id("RT"), sessionId, score, resolved: Boolean(resolved), comment, createdAt: now() });
    await store.updateSession(session.id, { resolved: rating.resolved, status: "closed" });
    res.status(201).json({ rating });
  } catch (error) { next(error); }
});

app.get("/api/agent/tickets", async (req, res, next) => {
  try {
    const tickets = await store.listTickets();
    const withMessages = await Promise.all(tickets.map(async (ticket) => ({ ...ticket, messages: await store.listMessages(ticket.sessionId) })));
    res.json({ tickets: withMessages });
  } catch (error) { next(error); }
});

app.post("/api/agent/tickets/:id/claim", async (req, res, next) => {
  try {
    const ticket = await store.getTicket(req.params.id);
    if (!ticket) return res.status(404).json({ message: "工单不存在" });
    if (ticket.status === "closed") return res.status(409).json({ message: "已关闭工单不能重新接入" });
    const updated = await store.updateTicket(ticket.id, { status: "processing", agent: "演示客服", claimedAt: now() });
    await store.updateSession(ticket.sessionId, { status: "processing" });
    res.json({ ticket: updated });
  } catch (error) { next(error); }
});

app.post("/api/agent/tickets/:id/reply", async (req, res, next) => {
  try {
    const ticket = await store.getTicket(req.params.id);
    if (!ticket) return res.status(404).json({ message: "工单不存在" });
    if (ticket.status !== "processing") return res.status(409).json({ message: "请先接入会话，再发送人工回复" });
    if (!req.body?.content?.trim()) return res.status(400).json({ message: "回复内容不能为空" });
    const message = await addMessage(ticket.sessionId, "agent", req.body.content.trim(), { intent: "人工回复", source: "人工客服" });
    await store.addReply({ id: message.id, ticketId: ticket.id, sessionId: ticket.sessionId, content: message.content, createdAt: message.createdAt });
    const updated = await store.updateTicket(ticket.id, { status: "processing" });
    res.json({ ticket: updated });
  } catch (error) { next(error); }
});

app.post("/api/agent/tickets/:id/close", async (req, res, next) => {
  try {
    const ticket = await store.getTicket(req.params.id);
    if (!ticket) return res.status(404).json({ message: "工单不存在" });
    if (ticket.status !== "processing") return res.status(409).json({ message: "请先接入会话，再关闭工单" });
    const updated = await store.updateTicket(ticket.id, { status: "closed", closedAt: now() });
    await store.updateSession(ticket.sessionId, { status: "closed" });
    res.json({ ticket: updated });
  } catch (error) { next(error); }
});

app.get("/api/dashboard", async (req, res, next) => {
  try {
    res.json(buildDashboard(await store.allForDashboard(), req.query));
  } catch (error) { next(error); }
});

app.get("/api/export", async (req, res, next) => {
  try {
    const data = await store.allForExport();
    res.json({
      range: { from: req.query.from || "", to: req.query.to || "", generatedAt: now() },
      sessions: pick(data.sessions, ["id", "status", "resolved", "ticketId", "createdAt", "updatedAt"], req.query),
      messages: pick(data.messages, ["id", "sessionId", "role", "content", "intent", "confidence", "action", "source", "riskLevel", "createdAt"], req.query),
      tickets: pick(data.tickets, ["id", "sessionId", "intent", "handoffReason", "priority", "status", "summary", "createdAt", "updatedAt"], req.query),
      replies: pick(data.replies, ["id", "ticketId", "sessionId", "content", "createdAt"], req.query),
      ratings: pick(data.ratings, ["id", "sessionId", "resolved", "score", "comment", "createdAt"], req.query),
      refunds: pick(data.refunds, ["id", "sessionId", "orderNo", "reason", "status", "createdAt", "updatedAt"], req.query),
      knowledgeGaps: pick(data.gaps, ["id", "question", "count", "status", "createdAt", "updatedAt"], req.query)
    });
  } catch (error) { next(error); }
});

app.get("/api/health", async (req, res) => {
  res.json({ ok: true, mode: pool ? "supabase-postgres" : "memory", envReady: Boolean(COZE_TOKEN && COZE_BOT_ID), databaseReady: Boolean(pool) });
});

app.use((error, req, res, next) => {
  console.error(error);
  res.status(500).json({ message: error.message || "服务暂时不可用，请稍后重试" });
});

await ensureSeedOrders();

app.listen(port, host, () => console.log(`API ready at http://${host}:${port}`));
