import { writeFile } from "node:fs/promises";

const endpoint = "https://zyy-d1g23eauv3b1b3549-1324088997.ap-shanghai.app.tcloudbase.com/api/customer-service";
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const cases = [
  ["E05", "订单od20260620001到哪了", "物流查询", "query_order"],
  ["L03", "订单 OD20260620001 什么时候送到？", "物流查询", "query_order"],
  ["L06", "订单 OD20260699999 到哪了？", "物流查询", "query_order"],
  ["P09", "已经拆封的贴身用品能退吗？", "商品与政策咨询", "search_knowledge"],
  ["P10", "收到破损商品应该怎么处理？", "商品与政策咨询", "search_knowledge"],
  ["R05", "退的钱多久到账？", "退款进度", "query_refund"],
  ["H04", "这个处理结果我很生气", "投诉与人工服务", "create_ticket"],
  ["H05", "我要申请赔偿", "投诉与人工服务", "create_ticket"],
  ["H06", "再不给我解决我就给差评", "投诉与人工服务", "create_ticket"],
  ["U01", "会员生日礼物怎么领取？", "未知问题", "create_ticket"],
  ["U02", "你们线下门店在哪里？", "未知问题", "create_ticket"]
].map(([id, question, intent, action]) => ({ id, question, intent, action }));

async function invoke(action, payload = {}) {
  const response = await fetch(endpoint, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, payload }), signal: AbortSignal.timeout(12000) });
  const body = await response.json();
  if (!response.ok || body.ok === false) throw new Error(body.message || `HTTP ${response.status}`);
  return body.data;
}

async function run(item) {
  const startedAt = Date.now();
  try {
    const created = await invoke("createSession");
    const started = await invoke("chatStart", { sessionId: created.session.id, message: item.question });
    for (let attempt = 0; attempt < 35; attempt += 1) {
      await wait(700);
      const state = await invoke("chatStatus", { sessionId: created.session.id, chatId: started.chatId });
      if (state.status === "failed") throw new Error(state.message || "Coze failed");
      if (state.status === "completed") {
        const result = await invoke("chatComplete", { sessionId: created.session.id, chatId: started.chatId });
        const actual = result.decision || {};
        return { ...item, actualIntent: actual.intent || "", actualAction: actual.action || "", confidence: actual.confidence ?? "", durationMs: Date.now() - startedAt, passed: actual.intent === item.intent && actual.action === item.action, error: "" };
      }
    }
    throw new Error("30 秒内未完成");
  } catch (error) {
    return { ...item, actualIntent: "", actualAction: "", confidence: "", durationMs: Date.now() - startedAt, passed: false, error: error.message };
  }
}

const results = await Promise.all(cases.map(run));
const passed = results.filter((item) => item.passed).length;
const report = { generatedAt: new Date().toISOString(), total: results.length, passed, failed: results.length - passed, passRate: `${Math.round(passed / results.length * 100)}%`, results };
await writeFile(new URL("../docs/11条失败用例回归结果.json", import.meta.url), JSON.stringify(report, null, 2), "utf8");
console.log(JSON.stringify(report, null, 2));
