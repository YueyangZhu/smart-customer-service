import { spawn } from "node:child_process";

const child = spawn(process.execPath, ["server/index.mjs"], { stdio: "ignore" });
const base = "http://127.0.0.1:8787";
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
  if (!logistics.body.messages?.some((message) => message.intent === "物流查询")) throw new Error("物流意图测试失败");

  const refund = await json("/api/chat", {
    method: "POST",
    body: JSON.stringify({ sessionId: created.body.session.id, message: "订单 OD20260618008 退款什么时候到账？" })
  });
  if (!refund.body.messages?.some((message) => message.intent === "退款进度")) throw new Error("退款进度测试失败");

  const handoff = await json("/api/chat", {
    method: "POST",
    body: JSON.stringify({ sessionId: created.body.session.id, message: "退款金额不对，我要投诉并转人工" })
  });
  if (handoff.body.session.status !== "waiting_agent") throw new Error("转人工测试失败");

  const tickets = await json("/api/agent/tickets");
  const ticketId = tickets.body.tickets?.[0]?.id;
  if (!ticketId) throw new Error("工单创建测试失败");

  const earlyReply = await json(`/api/agent/tickets/${ticketId}/reply`, { method: "POST", body: JSON.stringify({ content: "提前回复" }) });
  if (earlyReply.response.status !== 409) throw new Error("未接入禁用回复测试失败");

  const claim = await json(`/api/agent/tickets/${ticketId}/claim`, { method: "POST" });
  if (claim.body.ticket?.status !== "processing") throw new Error("接入会话测试失败");

  const reply = await json(`/api/agent/tickets/${ticketId}/reply`, { method: "POST", body: JSON.stringify({ content: "已接入处理" }) });
  if (reply.body.ticket?.status !== "processing") throw new Error("人工回复测试失败");

  const dashboard = await json("/api/dashboard");
  if (!Array.isArray(dashboard.body.closure)) throw new Error("看板闭环数据测试失败");

  const exported = await json("/api/export");
  if (!Array.isArray(exported.body.messages) || !Array.isArray(exported.body.tickets)) throw new Error("导出数据测试失败");

  console.log("API smoke test passed");
} finally {
  child.kill();
}
