import { writeFile } from "node:fs/promises";

const endpoint = process.env.FUNCTION_URL || "https://zyy-d1g23eauv3b1b3549-1324088997.ap-shanghai.app.tcloudbase.com/api/customer-service";
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const cases = [
  ["P01", "商品签收后几天可以申请无理由退货？", "商品与政策咨询", "search_knowledge"],
  ["P02", "七天无理由退货需要满足什么条件？", "商品与政策咨询", "search_knowledge"],
  ["P03", "定制商品支持七天无理由退货吗？", "商品与政策咨询", "search_knowledge"],
  ["P04", "商品有质量问题怎么换货？", "商品与政策咨询", "search_knowledge"],
  ["P05", "换货时需要提供哪些照片？", "商品与政策咨询", "search_knowledge"],
  ["P06", "退货运费由谁承担？", "商品与政策咨询", "search_knowledge"],
  ["P07", "发票丢了还能申请售后吗？", "商品与政策咨询", "search_knowledge"],
  ["P08", "虚拟商品可以无理由退货吗？", "商品与政策咨询", "search_knowledge"],
  ["P09", "已经拆封的贴身用品能退吗？", "商品与政策咨询", "search_knowledge"],
  ["P10", "收到破损商品应该怎么处理？", "商品与政策咨询", "search_knowledge"],

  ["L01", "我的订单 OD20260620001 到哪里了？", "物流查询", "query_order"],
  ["L02", "查一下 OD20260620001 的物流", "物流查询", "query_order"],
  ["L03", "订单 OD20260620001 什么时候送到？", "物流查询", "query_order"],
  ["L04", "OD20260620001 怎么还没到", "物流查询", "query_order"],
  ["L05", "我的快递发货了吗？", "物流查询", "query_order"],
  ["L06", "订单 OD20260699999 到哪了？", "物流查询", "query_order"],
  ["L07", "帮我查物流，但是我没有订单号", "物流查询", "query_order"],
  ["L08", "物流一直没有更新怎么办？", "物流查询", "query_order"],

  ["R01", "我的订单 OD20260618008 退款到哪了？", "退款进度", "query_refund"],
  ["R02", "OD20260618008 退款什么时候到账？", "退款进度", "query_refund"],
  ["R03", "查一下订单 OD20260618008 的退款进度", "退款进度", "query_refund"],
  ["R04", "退款审核通过了吗？", "退款进度", "query_refund"],
  ["R05", "退的钱多久到账？", "退款进度", "query_refund"],
  ["R06", "订单 OD20260612021 的退款状态", "退款进度", "query_refund"],
  ["R07", "退款处理到哪一步了", "退款进度", "query_refund"],
  ["R08", "为什么退款还没有退回？", "退款进度", "query_refund"],

  ["A01", "我要给订单 OD20260612021 申请退款", "退款申请", "show_refund_form"],
  ["A02", "订单 OD20260612021 商品不合适，我要退款", "退款申请", "show_refund_form"],
  ["A03", "我想退货退款", "退款申请", "show_refund_form"],
  ["A04", "可以帮我申请退款吗？", "退款申请", "show_refund_form"],
  ["A05", "我要退款，但是还没找到订单号", "退款申请", "show_refund_form"],
  ["A06", "商品质量不好，申请退款", "退款申请", "show_refund_form"],

  ["H01", "退款金额不对，我要投诉并转人工", "投诉与人工服务", "create_ticket"],
  ["H02", "我要找人工客服", "投诉与人工服务", "create_ticket"],
  ["H03", "你们太离谱了，我要投诉", "投诉与人工服务", "create_ticket"],
  ["H04", "这个处理结果我很生气", "投诉与人工服务", "create_ticket"],
  ["H05", "我要申请赔偿", "投诉与人工服务", "create_ticket"],
  ["H06", "再不给我解决我就给差评", "投诉与人工服务", "create_ticket"],

  ["U01", "会员生日礼物怎么领取？", "未知问题", "create_ticket"],
  ["U02", "你们线下门店在哪里？", "未知问题", "create_ticket"],
  ["U03", "能帮我修改收货地址吗？", "未知问题", "create_ticket"],
  ["U04", "会员积分什么时候过期？", "未知问题", "create_ticket"],
  ["U05", "商品可以刻字吗？", "未知问题", "create_ticket"],
  ["U06", "怎么买礼品卡？", "未知问题", "create_ticket"],

  ["E01", "OD20260620001", "未知问题", "create_ticket"],
  ["E02", "退款", "未知问题", "create_ticket"],
  ["E03", "快递？？？", "物流查询", "query_order"],
  ["E04", "请问商品签收7天后还能无理由退货吗", "商品与政策咨询", "search_knowledge"],
  ["E05", "订单od20260620001到哪了", "物流查询", "query_order"],
  ["E06", "退款金额不对，但我暂时不想找人工", "投诉与人工服务", "create_ticket"]
].map(([id, question, intent, action]) => ({ id, question, intent, action }));

async function invoke(action, payload = {}) {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action, payload })
  });
  const body = await response.json();
  if (!response.ok || body.ok === false) throw new Error(body.message || `HTTP ${response.status}`);
  return body.data;
}

async function ask(sessionId, message) {
  const started = await invoke("chatStart", { sessionId, message });
  for (let attempt = 0; attempt < 35; attempt += 1) {
    await wait(700);
    const state = await invoke("chatStatus", { sessionId, chatId: started.chatId });
    if (state.status === "failed") throw new Error(state.message || "Coze failed");
    if (state.status === "completed") return invoke("chatComplete", { sessionId, chatId: started.chatId });
  }
  throw new Error("30 秒内未完成");
}

async function runGroup(group) {
  const created = await invoke("createSession");
  const results = [];
  for (const item of group) {
    const startedAt = Date.now();
    try {
      const result = await ask(created.session.id, item.question);
      const actual = result.decision || {};
      results.push({
        ...item,
        actualIntent: actual.intent || "",
        actualAction: actual.action || "",
        confidence: actual.confidence ?? "",
        durationMs: Date.now() - startedAt,
        passed: actual.intent === item.intent && actual.action === item.action,
        error: ""
      });
    } catch (error) {
      results.push({ ...item, actualIntent: "", actualAction: "", confidence: "", durationMs: Date.now() - startedAt, passed: false, error: error.message });
    }
  }
  return results;
}

const groups = Array.from({ length: 5 }, (_, index) => cases.slice(index * 10, index * 10 + 10));
const results = (await Promise.all(groups.map(runGroup))).flat().sort((a, b) => a.id.localeCompare(b.id));
const passed = results.filter((item) => item.passed).length;
const failed = results.length - passed;
const csvCell = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;
const csv = [
  ["编号", "测试问题", "预期意图", "预期动作", "实际意图", "实际动作", "置信度", "耗时ms", "结果", "错误"],
  ...results.map((item) => [item.id, item.question, item.intent, item.action, item.actualIntent, item.actualAction, item.confidence, item.durationMs, item.passed ? "通过" : "失败", item.error])
].map((row) => row.map(csvCell).join(",")).join("\r\n");
await writeFile(new URL("../docs/50条问题评测结果.csv", import.meta.url), `\uFEFF${csv}`, "utf8");
await writeFile(new URL("../docs/50条问题评测摘要.json", import.meta.url), JSON.stringify({ generatedAt: new Date().toISOString(), total: results.length, passed, failed, passRate: `${Math.round(passed / results.length * 100)}%`, failures: results.filter((item) => !item.passed) }, null, 2), "utf8");

console.log(JSON.stringify({ total: results.length, passed, failed, passRate: `${Math.round(passed / results.length * 100)}%`, failures: results.filter((item) => !item.passed).map(({ id, question, intent, action, actualIntent, actualAction, error }) => ({ id, question, expected: `${intent}/${action}`, actual: `${actualIntent}/${actualAction}`, error })) }, null, 2));
