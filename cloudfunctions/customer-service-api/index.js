const cloudbase = require("@cloudbase/node-sdk");
const { randomUUID } = require("crypto");

const app = cloudbase.init({ env: cloudbase.SYMBOL_CURRENT_ENV });
const db = app.database();
const COZE_TOKEN = process.env.COZE_API_TOKEN || "";
const COZE_BOT_ID = process.env.COZE_BOT_ID || "";
const COZE_BASE = "https://api.coze.cn";

const C = {
  sessions: db.collection("sessions"),
  messages: db.collection("messages"),
  orders: db.collection("orders"),
  refunds: db.collection("refunds"),
  tickets: db.collection("tickets"),
  replies: db.collection("ticket_replies"),
  ratings: db.collection("ratings"),
  gaps: db.collection("knowledge_gaps")
};

const beijingIso = (value = new Date()) => new Date(value.getTime() + 8 * 3600000).toISOString().replace("Z", "+08:00");
const now = () => beijingIso();
const id = (prefix) => `${prefix}${Date.now()}${Math.floor(Math.random() * 90 + 10)}`;
const findOrderNo = (text) => text.match(/OD\d{11}/i)?.[0]?.toUpperCase() || "";

function parseBody(event) {
  if (!event) return {};
  if (typeof event.body === "string") {
    try { return JSON.parse(event.body); } catch { return {}; }
  }
  return event.body || event;
}

function output(statusCode, value) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json; charset=utf-8", "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Content-Type", "Access-Control-Allow-Methods": "POST,OPTIONS" },
    body: JSON.stringify(value)
  };
}

async function getDoc(collection, docId) {
  try {
    const result = await collection.doc(docId).get();
    return result.data?.[0] || result.data || null;
  } catch { return null; }
}

async function setDoc(collection, docId, data) {
  const { _id, ...safeData } = data;
  await collection.doc(docId).set(safeData);
  return { _id: docId, ...safeData };
}

async function updateDoc(collection, docId, data) {
  await collection.doc(docId).update(data);
  return getDoc(collection, docId);
}

async function listMessages(sessionId) {
  const result = await C.messages.where({ sessionId }).orderBy("createdAt", "asc").limit(100).get();
  return result.data || [];
}

async function addMessage(sessionId, role, content, extra = {}) {
  const message = { _id: randomUUID(), id: randomUUID(), sessionId, role, content, createdAt: now(), ...extra };
  message.id = message._id;
  await C.messages.add(message);
  return message;
}

async function coze(path, options = {}) {
  if (!COZE_TOKEN || !COZE_BOT_ID) throw new Error("Coze 环境变量未配置");
  const response = await fetch(`${COZE_BASE}${path}`, {
    ...options,
    headers: { Authorization: `Bearer ${COZE_TOKEN}`, "Content-Type": "application/json", ...options.headers }
  });
  const body = await response.json();
  if (!response.ok || body.code) throw new Error(body.msg || `Coze API 请求失败（${response.status}）`);
  return body.data;
}

function understand(text) {
  const orderNo = findOrderNo(text);
  if (/投诉|太离谱|骗人|生气|差评|人工|金额不对|赔偿/.test(text)) return { intent: "投诉与人工服务", confidence: .96, action: "create_ticket", orderNo, source: "风险策略", needHandoff: true, handoffReason: "用户投诉、要求人工或涉及金额争议", riskLevel: "high" };
  if (/(退款|退钱|退的钱|钱退).*(进度|到账|到哪|多久|什么时候|状态|审核|处理到|退回)/.test(text) || /(进度|到账|到哪|多久|什么时候|状态|审核).*(退款|退钱|退的钱|钱退)/.test(text)) return { intent: "退款进度", confidence: .93, action: "query_refund", orderNo, source: "退款系统", needHandoff: false, handoffReason: "", riskLevel: "medium" };
  if (/申请退款|我要退款|退货退款/.test(text)) return { intent: "退款申请", confidence: .91, action: "show_refund_form", orderNo, source: "售后规则", needHandoff: false, handoffReason: "", riskLevel: "medium" };
  if (/物流|快递|到哪里|到哪了|没到|发货|送到|送达|预计到达/.test(text)) return { intent: "物流查询", confidence: .94, action: "query_order", orderNo, source: "订单系统", needHandoff: false, handoffReason: "", riskLevel: "low" };
  if (/退货|七天|7天|无理由|签收后几天|换货|发票|破损|损坏|缺件|贴身用品|能退吗/.test(text)) return { intent: "商品与政策咨询", confidence: .91, action: "search_knowledge", orderNo, source: "言析电商售后知识库", needHandoff: false, handoffReason: "", riskLevel: "low" };
  return { intent: "未知问题", confidence: .38, action: "create_ticket", orderNo, source: "知识库未命中", needHandoff: true, handoffReason: "知识库暂无可靠答案", riskLevel: "medium" };
}

async function createSession() {
  const sessionId = id("CS");
  const userId = `web_${randomUUID().slice(0, 8)}`;
  const conversation = await coze("/v1/conversation/create", { method: "POST", body: JSON.stringify({ bot_id: COZE_BOT_ID, name: `网页会话_${sessionId.slice(-8)}` }) });
  const session = { _id: sessionId, id: sessionId, userId, cozeConversationId: String(conversation.id), status: "active", resolved: null, createdAt: now(), updatedAt: now() };
  await setDoc(C.sessions, sessionId, session);
  await addMessage(sessionId, "assistant", "你好，我是言析售后助手。你可以直接描述商品、物流、退换货或退款问题；复杂问题我会连同上下文一起交给人工客服。", { intent: "欢迎语", confidence: 1, action: "answer", source: "系统预设", riskLevel: "low" });
  return { session, messages: await listMessages(sessionId) };
}

async function chatStart(payload) {
  const session = await getDoc(C.sessions, payload.sessionId);
  const text = String(payload.message || "").trim();
  if (!session || !text) throw new Error("会话或消息无效");
  await addMessage(session.id, "user", text);
  const created = await coze(`/v3/chat?conversation_id=${session.cozeConversationId}`, {
    method: "POST",
    body: JSON.stringify({ bot_id: COZE_BOT_ID, user_id: session.userId, stream: false, auto_save_history: true, additional_messages: [{ role: "user", type: "question", content_type: "text", content: text }] })
  });
  await updateDoc(C.sessions, session.id, { pendingChatId: String(created.id), pendingMessage: text, updatedAt: now() });
  return { pending: true, chatId: String(created.id), sessionId: session.id };
}

async function chatStatus({ sessionId, chatId }) {
  const session = await getDoc(C.sessions, sessionId);
  if (!session) throw new Error("会话不存在");
  const detail = await coze(`/v3/chat/retrieve?conversation_id=${session.cozeConversationId}&chat_id=${chatId}`);
  return { status: detail.status, message: detail.last_error?.msg || "" };
}

async function businessAnswer(result, aiAnswer) {
  const unsafeAnswer = /(understand_message|after_sales_chat|ts-|调用.+(?:函数|工作流)|函数识别|工作流识别|\{\s*["']?name["']?\s*:)/i.test(aiAnswer || "");
  const deterministicAction = ["query_order", "query_refund", "show_refund_form"].includes(result.action);
  if (result.needHandoff || result.action === "create_ticket" || (unsafeAnswer && !deterministicAction)) {
    if (result.intent === "未知问题") {
      return "当前知识库暂未覆盖这个问题。我已将它记录为知识缺口并创建人工工单，人工客服会结合当前对话继续处理，请稍候。";
    }
    return `我理解你的问题需要进一步核实，已为你创建人工工单。${result.handoffReason ? `转人工原因：${result.handoffReason}。` : ""}人工客服会结合当前对话继续处理，请稍候。`;
  }
  if (result.action === "query_order" || result.action === "query_refund") {
    if (!result.orderNo) return "请提供需要查询的订单号，格式类似 OD20260620001。";
    const order = await getDoc(C.orders, result.orderNo);
    if (!order) return `没有查到订单 ${result.orderNo}，请检查订单号是否完整。`;
    if (result.action === "query_refund") return `订单 ${order.id} 当前状态为“${order.status}”。${order.refund || "暂时没有退款记录。"}`;
    return `查到订单 ${order.id}（${order.product}），当前状态为“${order.status}”，${order.logistics || order.refund}。`;
  }
  if (result.action === "show_refund_form") return result.orderNo ? `已识别订单 ${result.orderNo}，请在退款申请卡中确认原因并提交。` : "可以为你申请退款，请先提供订单号。";
  return aiAnswer || "这个问题暂时没有可靠答案，已为你转交人工客服。";
}

async function createTicket(session, result, text) {
  const ticketId = id("TK");
  const ticket = { _id: ticketId, id: ticketId, sessionId: session.id, intent: result.intent, confidence: result.confidence, summary: `用户问题：${text}。AI 判断为“${result.intent}”，建议人工核实并给出明确方案。`, handoffReason: result.handoffReason, priority: result.riskLevel === "high" ? "high" : "normal", status: "open", createdAt: now(), updatedAt: now() };
  await setDoc(C.tickets, ticketId, ticket);
  await updateDoc(C.sessions, session.id, { status: "waiting_agent", ticketId, updatedAt: now() });
}

async function chatComplete({ sessionId, chatId }) {
  const session = await getDoc(C.sessions, sessionId);
  if (!session) throw new Error("会话不存在");
  const list = await coze(`/v3/chat/message/list?conversation_id=${session.cozeConversationId}&chat_id=${chatId}`);
  const aiAnswer = list.find((item) => item.role === "assistant" && item.type === "answer")?.content || "";
  const result = understand(session.pendingMessage || "");
  const answer = await businessAnswer(result, aiAnswer);
  await addMessage(session.id, "assistant", answer, result);
  if (result.needHandoff && !session.ticketId) await createTicket(session, result, session.pendingMessage || "");
  if (result.intent === "未知问题") {
    const gapId = `GAP_${Buffer.from(session.pendingMessage || "").toString("hex").slice(0, 24)}`;
    const old = await getDoc(C.gaps, gapId);
    await setDoc(C.gaps, gapId, { _id: gapId, id: gapId, question: session.pendingMessage, count: (old?.count || 0) + 1, status: "open", updatedAt: now(), createdAt: old?.createdAt || now() });
  }
  const updated = await updateDoc(C.sessions, session.id, { pendingChatId: "", pendingMessage: "", updatedAt: now() });
  return { session: updated, messages: await listMessages(session.id), decision: result };
}

async function getSession({ id: sessionId }) {
  const session = await getDoc(C.sessions, sessionId);
  if (!session) throw new Error("会话不存在");
  return { session, messages: await listMessages(sessionId) };
}

async function submitRefund(payload) {
  const session = await getDoc(C.sessions, payload.sessionId);
  const order = await getDoc(C.orders, payload.orderNo);
  if (!session || !order || !payload.reason) throw new Error("请完整填写退款信息");
  if (!order.refundable) throw new Error("该订单当前不可重复申请退款");
  const refundId = id("RF");
  const refund = { _id: refundId, id: refundId, sessionId: session.id, orderNo: order.id, reason: payload.reason, status: "待审核", createdAt: now(), updatedAt: now() };
  await setDoc(C.refunds, refundId, refund);
  await updateDoc(C.orders, order.id, { status: "退款审核中", updatedAt: now() });
  await addMessage(session.id, "assistant", `退款申请 ${refundId} 已提交，审核结果会在当前会话更新。`, { intent: "退款申请", confidence: 1, action: "answer", source: "退款系统", riskLevel: "medium" });
  return { refund };
}

async function submitRating(payload) {
  const session = await getDoc(C.sessions, payload.sessionId);
  if (!session || !Number.isInteger(payload.score) || payload.score < 1 || payload.score > 5) throw new Error("评价信息无效");
  const ratingId = id("RT");
  const rating = { _id: ratingId, id: ratingId, sessionId: session.id, score: payload.score, resolved: Boolean(payload.resolved), comment: payload.comment || "", createdAt: now() };
  await setDoc(C.ratings, ratingId, rating);
  await updateDoc(C.sessions, session.id, { resolved: rating.resolved, status: "closed", updatedAt: now() });
  return { rating };
}

async function listTickets() {
  const result = await C.tickets.orderBy("createdAt", "desc").limit(100).get();
  const tickets = await Promise.all((result.data || []).map(async (ticket) => ({ ...ticket, messages: await listMessages(ticket.sessionId) })));
  return { tickets };
}

async function ticketAction(action, payload) {
  const ticket = await getDoc(C.tickets, payload.id);
  if (!ticket) throw new Error("工单不存在");
  if (action === "claimTicket") {
    if (ticket.status === "closed") throw new Error("已关闭工单不能重新接入");
    const updated = await updateDoc(C.tickets, ticket.id, { status: "processing", agent: "演示客服", claimedAt: now(), updatedAt: now() });
    await updateDoc(C.sessions, ticket.sessionId, { status: "processing", updatedAt: now() });
    return { ticket: updated };
  }
  if (action === "replyTicket") {
    if (ticket.status !== "processing") throw new Error("请先接入会话，再发送人工回复");
    if (!String(payload.content || "").trim()) throw new Error("回复内容不能为空");
    const message = await addMessage(ticket.sessionId, "agent", payload.content.trim(), { intent: "人工回复", source: "人工客服" });
    await C.replies.add({ _id: message.id, id: message.id, ticketId: ticket.id, sessionId: ticket.sessionId, content: message.content, createdAt: message.createdAt });
    const updated = await updateDoc(C.tickets, ticket.id, { status: "processing", updatedAt: now() });
    return { ticket: updated };
  }
  if (ticket.status !== "processing") throw new Error("请先接入会话，再关闭工单");
  const updated = await updateDoc(C.tickets, ticket.id, { status: "closed", closedAt: now(), updatedAt: now() });
  await updateDoc(C.sessions, ticket.sessionId, { status: "closed", updatedAt: now() });
  return { ticket: updated };
}

async function seed() {
  const orders = [
    { id: "OD20260620001", product: "Aurora 降噪耳机", amount: 699, status: "运输中", logistics: "已到达上海浦东分拨中心，预计明日送达", refundable: true },
    { id: "OD20260618008", product: "Luma 阅读灯", amount: 239, status: "退款处理中", refund: "退款审核已通过，预计 1–3 个工作日原路到账", refundable: false },
    { id: "OD20260612021", product: "Mori 随行杯", amount: 129, status: "已签收", logistics: "6 月 15 日由本人签收", refundable: true }
  ];
  for (const order of orders) await setDoc(C.orders, order.id, { _id: order.id, ...order, createdAt: now(), updatedAt: now() });
  return { orders };
}

function withinRange(items, payload = {}, field = "createdAt") {
  const from = payload.from ? new Date(`${payload.from}T00:00:00+08:00`).getTime() : 0;
  const to = payload.to ? new Date(`${payload.to}T23:59:59.999+08:00`).getTime() : Number.MAX_SAFE_INTEGER;
  return items.filter((item) => {
    const timestamp = new Date(item[field] || item.createdAt || 0).getTime();
    return timestamp >= from && timestamp <= to;
  });
}

async function dashboard(payload = {}) {
  const [sessions, messages, tickets, ratings, gaps] = await Promise.all([C.sessions.limit(100).get(), C.messages.limit(100).get(), C.tickets.limit(100).get(), C.ratings.limit(100).get(), C.gaps.limit(100).get()]);
  const s = withinRange(sessions.data || [], payload), m = withinRange(messages.data || [], payload), t = withinRange(tickets.data || [], payload), r = withinRange(ratings.data || [], payload);
  const total = Math.max(s.length, 1), solved = r.filter((item) => item.resolved).length, avg = r.length ? r.reduce((sum, item) => sum + item.score, 0) / r.length : 0;
  const counts = {}; m.filter((item) => item.role === "assistant" && item.intent && !["欢迎语", "人工回复"].includes(item.intent)).forEach((item) => { counts[item.intent] = (counts[item.intent] || 0) + 1; });
  const max = Math.max(...Object.values(counts), 1);
  const ticketSessions = new Set(t.map((item) => item.sessionId));
  const resolvedSessions = new Set(r.filter((item) => item.resolved).map((item) => item.sessionId));
  const aiResolved = s.filter((item) => resolvedSessions.has(item.id) && !ticketSessions.has(item.id)).length;
  const humanResolved = s.filter((item) => resolvedSessions.has(item.id) && ticketSessions.has(item.id)).length;
  const inProgress = Math.max(0, s.length - aiResolved - humanResolved);
  const closure = [{ name: "AI 自助解决", count: aiResolved }, { name: "人工已解决", count: humanResolved }, { name: "处理中", count: inProgress }];
  return { range: { from: payload.from || "", to: payload.to || "", timeZone: "Asia/Shanghai" }, metrics: { sessions: s.length, solveRate: Math.round(solved / total * 100), handoffRate: Math.round(t.length / total * 100), satisfaction: Number(avg.toFixed(1)), messages: m.length, aiHandled: m.filter((item) => item.role === "assistant").length, handoffs: t.length, ratings: r.length, aiResolved, humanResolved, inProgress }, intents: Object.entries(counts).map(([name, count]) => ({ name, count, percent: Math.round(count / max * 100) })), knowledgeGaps: withinRange(gaps.data || [], payload).sort((a, b) => b.count - a.count), closure };
}
async function exportData(payload = {}) {
  const [sessions, messages, tickets, replies, ratings, refunds, gaps] = await Promise.all([
    C.sessions.limit(100).get(), C.messages.limit(100).get(), C.tickets.limit(100).get(), C.replies.limit(100).get(),
    C.ratings.limit(100).get(), C.refunds.limit(100).get(), C.gaps.limit(100).get()
  ]);
  const pick = (items, fields) => withinRange(items || [], payload).map((item) => Object.fromEntries(fields.map((field) => [field, item[field] ?? ""])));
  return {
    range: { from: payload.from || "", to: payload.to || "", generatedAt: now() },
    sessions: pick(sessions.data, ["id", "status", "resolved", "ticketId", "createdAt", "updatedAt"]),
    messages: pick(messages.data, ["id", "sessionId", "role", "content", "intent", "confidence", "action", "source", "riskLevel", "createdAt"]),
    tickets: pick(tickets.data, ["id", "sessionId", "intent", "handoffReason", "priority", "status", "summary", "createdAt", "updatedAt"]),
    replies: pick(replies.data, ["id", "ticketId", "sessionId", "content", "createdAt"]),
    ratings: pick(ratings.data, ["id", "sessionId", "resolved", "score", "comment", "createdAt"]),
    refunds: pick(refunds.data, ["id", "sessionId", "orderNo", "reason", "status", "createdAt", "updatedAt"]),
    knowledgeGaps: pick(gaps.data, ["id", "question", "count", "status", "createdAt", "updatedAt"])
  };
}

async function cleanupTestData(payload = {}) {
  if (payload.confirm !== "DELETE_TEST_DATA_20260621") throw new Error("清理确认口令错误");
  const targets = ["sessions", "messages", "refunds", "tickets", "replies", "ratings", "gaps"];
  const removed = {};
  for (const name of targets) {
    let count = 0;
    for (let batch = 0; batch < 10; batch += 1) {
      const result = await C[name].limit(100).get();
      const documents = result.data || [];
      if (!documents.length) break;
      await Promise.all(documents.map((document) => C[name].doc(document._id).remove()));
      count += documents.length;
      if (documents.length < 100) break;
    }
    removed[name] = count;
  }
  return { cleaned: true, ordersPreserved: true, removed };
}

async function seedDemoData(payload = {}) {
  if (payload.confirm !== "SEED_PORTFOLIO_DEMO_20260621") throw new Error("演示数据确认口令错误");
  const existing = await C.sessions.limit(1).get();
  if ((existing.data || []).length) throw new Error("sessions 不为空，请勿重复植入演示数据");
  const ago = (days, minutes = 0) => beijingIso(new Date(Date.now() - days * 86400000 - minutes * 60000));
  const samples = [
    ["01", "商品签收后几天可以申请无理由退货？", "商品与政策咨询", "符合条件的商品在签收后 7 天内可以申请无理由退货。", "search_knowledge", 5, true],
    ["02", "订单 OD20260620001 到哪里了？", "物流查询", "订单已到达上海浦东分拨中心，预计明日送达。", "query_order", 5, true],
    ["03", "订单 OD20260618008 退款什么时候到账？", "退款进度", "退款审核已通过，预计 1–3 个工作日原路到账。", "query_refund", 4, true],
    ["04", "我要给订单 OD20260612021 申请退款", "退款申请", "已为你展示退款申请表，请确认原因后提交。", "show_refund_form", 5, true],
    ["05", "收到的商品破损怎么处理？", "商品与政策咨询", "请提交订单号、商品整体及破损位置照片，我们会协助申请售后。", "search_knowledge", 4, true],
    ["06", "发票丢了还能申请售后吗？", "商品与政策咨询", "可以先提供订单记录，具体材料要求以售后审核结果为准。", "search_knowledge", 5, true],
    ["07", "帮我查物流，但我暂时找不到订单号", "物流查询", "请提供完整订单号，格式类似 OD20260620001。", "query_order", null, null],
    ["08", "退款金额不对，我要投诉并转人工", "投诉与人工服务", "已创建高优先级人工工单，客服会核对支付与退款流水。", "create_ticket", 4, true],
    ["09", "会员生日礼物怎么领取？", "未知问题", "该问题已记录为知识缺口并转交人工客服。", "create_ticket", 3, true],
    ["10", "下单后怎么修改收货地址？", "未知问题", "该问题需要人工核实订单状态，已为你创建工单。", "create_ticket", 2, false],
    ["11", "订单 OD20260699999 到哪了？", "物流查询", "没有查到该订单，请检查订单号是否完整。", "query_order", 4, true],
    ["12", "虚拟商品支持七天无理由退货吗？", "商品与政策咨询", "虚拟商品不适用七天无理由退货。", "search_knowledge", 5, true]
  ];
  for (let index = 0; index < samples.length; index += 1) {
    const [suffix, question, intent, answer, action, score, resolved] = samples[index];
    const sessionId = `DEMO_SESSION_${suffix}`;
    const createdAt = ago(12 - index, 30);
    const ticketId = ["08", "09", "10"].includes(suffix) ? `DEMO_TICKET_${suffix}` : "";
    const status = suffix === "10" ? "processing" : "closed";
    await setDoc(C.sessions, sessionId, { _id: sessionId, id: sessionId, userId: `demo_user_${suffix}`, status, resolved, ticketId, createdAt, updatedAt: ago(12 - index) });
    const messages = [
      ["assistant", "你好，我是言析售后助手，请描述你的售后问题。", "欢迎语", "answer", "系统预设", 1, "low"],
      ["user", question, "", "", "", "", ""],
      ["assistant", answer, intent, action, action === "search_knowledge" ? "言析电商售后知识库" : action.includes("refund") ? "退款系统" : action === "query_order" ? "订单系统" : action === "create_ticket" ? "风险策略" : "售后规则", intent === "未知问题" ? .38 : action === "create_ticket" ? .96 : .92, action === "create_ticket" ? (intent === "投诉与人工服务" ? "high" : "medium") : "low"]
    ];
    for (let m = 0; m < messages.length; m += 1) {
      const [role, content, messageIntent, messageAction, source, confidence, riskLevel] = messages[m];
      const messageId = `DEMO_MSG_${suffix}_${m + 1}`;
      await setDoc(C.messages, messageId, { _id: messageId, id: messageId, sessionId, role, content, intent: messageIntent, action: messageAction, source, confidence, riskLevel, createdAt: beijingIso(new Date(new Date(createdAt).getTime() + m * 60000)) });
    }
    if (score !== null) {
      const ratingId = `DEMO_RATING_${suffix}`;
      await setDoc(C.ratings, ratingId, { _id: ratingId, id: ratingId, sessionId, score, resolved, comment: score >= 4 ? "回复清楚，处理及时" : score === 3 ? "已转人工，希望补充知识库" : "等待人工进一步处理", createdAt: ago(12 - index) });
    }
    if (ticketId) {
      const closed = suffix !== "10";
      await setDoc(C.tickets, ticketId, { _id: ticketId, id: ticketId, sessionId, intent, confidence: intent === "未知问题" ? .38 : .96, summary: `用户问题：${question}。AI 判断为“${intent}”，建议人工核实并给出明确方案。`, handoffReason: intent === "投诉与人工服务" ? "用户投诉并涉及退款金额争议" : "知识库暂无可靠答案", priority: suffix === "08" ? "high" : "normal", status: closed ? "closed" : "processing", agent: "演示客服", createdAt, updatedAt: ago(12 - index) });
      if (closed) {
        const replyId = `DEMO_REPLY_${suffix}`;
        await setDoc(C.replies, replyId, { _id: replyId, id: replyId, ticketId, sessionId, content: suffix === "08" ? "已核对退款流水并向用户说明差额原因。" : "已告知生日礼遇规则，并建议补充知识库。", createdAt: ago(12 - index) });
      }
    }
  }
  await setDoc(C.refunds, "DEMO_REFUND_01", { _id: "DEMO_REFUND_01", id: "DEMO_REFUND_01", sessionId: "DEMO_SESSION_04", orderNo: "OD20260612021", reason: "商品不合适", status: "审核通过", createdAt: ago(9), updatedAt: ago(8) });
  await setDoc(C.gaps, "DEMO_GAP_01", { _id: "DEMO_GAP_01", id: "DEMO_GAP_01", question: "会员生日礼物怎么领取？", count: 3, status: "open", createdAt: ago(4), updatedAt: ago(1) });
  await setDoc(C.gaps, "DEMO_GAP_02", { _id: "DEMO_GAP_02", id: "DEMO_GAP_02", question: "下单后怎么修改收货地址？", count: 2, status: "open", createdAt: ago(3), updatedAt: ago(1) });
  return { seeded: true, sessions: 12, messages: 36, tickets: 3, replies: 2, ratings: 10, refunds: 1, knowledgeGaps: 2, ordersPreserved: true };
}

const handlers = {
  createSession,
  getSession,
  chatStart,
  chatStatus,
  chatComplete,
  submitRefund,
  submitRating,
  listTickets,
  claimTicket: (payload) => ticketAction("claimTicket", payload),
  replyTicket: (payload) => ticketAction("replyTicket", payload),
  closeTicket: (payload) => ticketAction("closeTicket", payload),
  dashboard,
  exportData,
  cleanupTestData,
  seedDemoData,
  seed,
  health: async () => ({ ok: true, mode: "cloudbase-async", envReady: Boolean(COZE_TOKEN && COZE_BOT_ID) })
};

exports.main = async (event) => {
  if (event?.httpMethod === "OPTIONS") return output(204, {});
  try {
    const body = parseBody(event);
    const action = body.action;
    if (!handlers[action]) return output(404, { ok: false, message: "未知操作" });
    const data = await handlers[action](body.payload || {});
    return output(200, { ok: true, data });
  } catch (error) {
    console.error(error);
    return output(500, { ok: false, message: error.message || "云函数执行失败" });
  }
};
