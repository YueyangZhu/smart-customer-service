import { spawn } from "node:child_process";

const child = spawn(process.execPath, ["server/index.mjs"], { stdio: "ignore", env: { ...process.env, DATABASE_URL: "", PORT: "8787" } });
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
