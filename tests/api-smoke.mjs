import { spawn } from "node:child_process";

const port = String(8700 + Math.floor(Math.random() * 1000));
const child = spawn(process.execPath, ["server/index.mjs"], { stdio: "ignore", env: { ...process.env, DATABASE_URL: "", PORT: port } });
const base = `http://127.0.0.1:${port}`;
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function json(path, options = {}) {
  const response = await fetch(`${base}${path}`, { headers: { "content-type": "application/json" }, ...options });
  const body = await response.json().catch(() => ({}));
  return { response, body };
}

try {
  for (let index = 0; index < 40; index += 1) {
    try { if ((await fetch(`${base}/api/health`)).ok) break; } catch {}
    await wait(150);
  }

  const created = await json("/api/sessions", { method: "POST" });
  if (!created.body.session?.id) throw new Error("创建会话失败");

  const logistics = await json("/api/chat", {
    method: "POST",
    body: JSON.stringify({ sessionId: created.body.session.id, message: "订单 OD20260620001 到哪里了？" })
  });
  if (!logistics.body.messages?.some((message) => message.role === "user" && message.content === "订单 OD20260620001 到哪里了？")) throw new Error("物流快捷指令用户消息未保存");
  if (!logistics.body.messages?.some((message) => message.intent === "物流查询")) throw new Error("物流意图测试失败");
  if (logistics.body.messages?.some((message) => message.content?.includes("正在识别售后意图"))) throw new Error("处理中状态不应写入聊天消息");

  const policy = await json("/api/chat", {
    method: "POST",
    body: JSON.stringify({ sessionId: created.body.session.id, message: "商品签收后几天可以申请无理由退货？" })
  });
  if (!policy.body.messages?.some((message) => message.role === "user" && message.content.includes("无理由退货"))) throw new Error("退货规则快捷指令用户消息未保存");
  if (policy.body.decision?.action !== "search_knowledge") throw new Error("退货规则知识问答测试失败");
  if (policy.body.messages?.some((message) => Object.prototype.hasOwnProperty.call(message, "answer"))) throw new Error("消息入库不应包含数据库不存在的 answer 字段");

  const refund = await json("/api/chat", {
    method: "POST",
    body: JSON.stringify({ sessionId: created.body.session.id, message: "订单 OD20260618008 退款什么时候到账？" })
  });
  if (!refund.body.messages?.some((message) => message.intent === "退款进度")) throw new Error("退款进度测试失败");

  const returnApply = await json("/api/chat", {
    method: "POST",
    body: JSON.stringify({ sessionId: created.body.session.id, message: "OD20260620001 我要退货" })
  });
  if (returnApply.response.status !== 200 || returnApply.body.decision?.action !== "show_refund_form") throw new Error("退货申请入口测试失败");

  const refundSubmit = await json("/api/refunds", {
    method: "POST",
    body: JSON.stringify({ sessionId: created.body.session.id, orderNo: "OD20260620001", reason: "商品不合适" })
  });
  if (refundSubmit.response.status !== 201 || !refundSubmit.body.refund?.id) throw new Error("退款申请提交失败");
  if (!refundSubmit.body.messages?.some((message) => message.role === "user" && message.action === "submit_refund" && message.content.includes("商品不合适"))) throw new Error("退款申请用户动作未进入会话");
  if (!refundSubmit.body.messages?.some((message) => message.role === "assistant" && message.action === "refund_submitted" && message.content.includes(refundSubmit.body.refund.id))) throw new Error("退款申请回执未进入会话");

  const duplicateRefund = await json("/api/refunds", {
    method: "POST",
    body: JSON.stringify({ sessionId: created.body.session.id, orderNo: "OD20260620001", reason: "商品质量问题" })
  });
  if (duplicateRefund.response.status !== 409) throw new Error("重复退款申请应被拦截");

  const unavailableRefund = await json("/api/chat", {
    method: "POST",
    body: JSON.stringify({ sessionId: created.body.session.id, message: "OD20260620001 我要退货" })
  });
  const latestRefundAssistant = [...(unavailableRefund.body.messages || [])].reverse().find((message) => message.role === "assistant");
  if (unavailableRefund.body.decision?.action !== "refund_unavailable" || latestRefundAssistant?.action !== "refund_unavailable") throw new Error("已提交退款的订单不应再次展示申请卡");

  const handoff = await json("/api/chat", {
    method: "POST",
    body: JSON.stringify({ sessionId: created.body.session.id, message: "退款金额不对，我要投诉并转人工" })
  });
  if (handoff.body.session.status !== "waiting_agent") throw new Error("转人工测试失败");

  const ratingSession = await json("/api/sessions", { method: "POST" });
  const ratingHandoff = await json("/api/chat", {
    method: "POST",
    body: JSON.stringify({ sessionId: ratingSession.body.session.id, message: "我要找人工客服" })
  });
  if (ratingHandoff.body.session.status !== "waiting_agent") throw new Error("rating handoff setup failed");
  const ratingTicketId = ratingHandoff.body.session.ticketId;
  const rating = await json("/api/ratings", {
    method: "POST",
    body: JSON.stringify({ sessionId: ratingSession.body.session.id, score: 4, resolved: true, comment: "closed by user review" })
  });
  if (rating.response.status !== 201) throw new Error("rating submit failed");
  const ticketsAfterRating = await json("/api/agent/tickets");
  const closedByRating = ticketsAfterRating.body.tickets?.find((ticket) => ticket.id === ratingTicketId);
  if (closedByRating?.status !== "closed") throw new Error("rating should auto-close unclaimed ticket");

  const tickets = await json("/api/agent/tickets");
  const ticketId = handoff.body.session.ticketId;
  if (!tickets.body.tickets?.some((ticket) => ticket.id === ticketId)) throw new Error("ticket creation failed");

  const earlyReply = await json(`/api/agent/tickets/${ticketId}/reply`, { method: "POST", body: JSON.stringify({ content: "提前回复" }) });
  if (earlyReply.response.status !== 409) throw new Error("未接入禁用回复测试失败");

  const claim = await json(`/api/agent/tickets/${ticketId}/claim`, { method: "POST" });
  if (claim.body.ticket?.status !== "processing") throw new Error("接入会话测试失败");

  const reply = await json(`/api/agent/tickets/${ticketId}/reply`, { method: "POST", body: JSON.stringify({ content: "已接入处理" }) });
  if (reply.body.ticket?.status !== "processing") throw new Error("人工回复测试失败");

  const beforeFollowUp = await json(`/api/sessions/${created.body.session.id}`);
  const beforeFollowUpAssistantCount = beforeFollowUp.body.messages?.filter((message) => message.role === "assistant").length ?? 0;
  const followUp = await json("/api/chat", {
    method: "POST",
    body: JSON.stringify({ sessionId: created.body.session.id, message: "我刚才补充一下，商品外包装也破损了" })
  });
  const afterFollowUpAssistantCount = followUp.body.messages?.filter((message) => message.role === "assistant").length ?? 0;
  if (followUp.body.decision?.action !== "wait_agent" || afterFollowUpAssistantCount !== beforeFollowUpAssistantCount) throw new Error("人工接入后追问不应触发 AI 回复");
  if (!followUp.body.messages?.some((message) => message.role === "user" && message.content.includes("外包装"))) throw new Error("人工接入后追问未进入工单时间线");

  const close = await json(`/api/agent/tickets/${ticketId}/close`, { method: "POST" });
  if (close.body.ticket?.status !== "closed") throw new Error("关闭工单测试失败");
  const closedFollowUp = await json("/api/chat", {
    method: "POST",
    body: JSON.stringify({ sessionId: created.body.session.id, message: "关闭后我还能继续问吗" })
  });
  if (closedFollowUp.response.status !== 409 || !closedFollowUp.body.message?.includes("新建会话")) throw new Error("关闭后旧会话应提示新建会话");

  const dashboard = await json("/api/dashboard");
  if (!Array.isArray(dashboard.body.closure)) throw new Error("看板闭环数据测试失败");

  const exported = await json("/api/export");
  if (!Array.isArray(exported.body.messages) || !Array.isArray(exported.body.tickets)) throw new Error("导出数据测试失败");

  console.log("API smoke test passed");
} finally {
  child.kill();
}
