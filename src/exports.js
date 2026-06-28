import ExcelJS from "exceljs";
import { jsPDF } from "jspdf";

const COLORS = { ink: "14212B", green: "0B7258", pale: "E7EEE9", lime: "CBED70", white: "FFFFFF", line: "DCE4DF" };

function saveBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function dateTime(value) {
  return value ? new Date(value).toLocaleString("zh-CN", { hour12: false, timeZone: "Asia/Shanghai" }) : "";
}

function styleSheet(sheet, widths = []) {
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: Math.max(sheet.columnCount, 1) } };
  const header = sheet.getRow(1);
  header.height = 28;
  header.font = { bold: true, color: { argb: COLORS.white } };
  header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.green } };
  header.alignment = { vertical: "middle", horizontal: "left" };
  sheet.columns.forEach((column, index) => {
    column.width = widths[index] || Math.min(Math.max(12, ...column.values.slice(1).map((value) => String(value ?? "").length + 2)), 42);
    column.alignment = { vertical: "top", wrapText: true };
  });
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber > 1) {
      row.height = 24;
      row.eachCell((cell) => { cell.border = { bottom: { style: "hair", color: { argb: COLORS.line } } }; });
    }
  });
}

function addSheet(workbook, name, columns, rows, widths) {
  const sheet = workbook.addWorksheet(name, { properties: { tabColor: { argb: COLORS.green } }, views: [{ showGridLines: false }] });
  sheet.columns = columns.map(([header, key]) => ({ header, key }));
  rows.forEach((row) => sheet.addRow(row));
  styleSheet(sheet, widths);
  return sheet;
}

export async function exportExcel(data, dashboard) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "言析智能客服";
  workbook.created = new Date();
  const overview = workbook.addWorksheet("运营概览", { views: [{ showGridLines: false }] });
  overview.columns = [{ width: 24 }, { width: 22 }, { width: 42 }];
  overview.mergeCells("A1:C1");
  overview.getCell("A1").value = "言析智能客服运营数据报告";
  overview.getCell("A1").font = { size: 20, bold: true, color: { argb: COLORS.white } };
  overview.getCell("A1").fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.ink } };
  overview.getCell("A1").alignment = { vertical: "middle" };
  overview.getRow(1).height = 42;
  const metrics = dashboard.metrics || {};
  const summaryRows = [
    ["统计周期", `${data.range.from || "全部"} 至 ${data.range.to || "全部"}`, "导出数据已移除用户身份标识"],
    ["生成时间", dateTime(data.range.generatedAt), ""],
    ["会话量", metrics.sessions || 0, "次"],
    ["AI 自助解决率", (metrics.solveRate || 0) / 100, "已解决评价数 / 会话量"],
    ["转人工率", (metrics.handoffRate || 0) / 100, "人工工单数 / 会话量"],
    ["平均满意度", metrics.satisfaction || 0, "满分 5 分"],
    ["消息量", metrics.messages || 0, "条"],
    ["完成评价", metrics.ratings || 0, "次"]
  ];
  overview.addRows([["指标", "结果", "说明"], ...summaryRows]);
  const overviewHeader = overview.getRow(2);
  overviewHeader.font = { bold: true, color: { argb: COLORS.white } };
  overviewHeader.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.green } };
  overview.getCell("B6").numFmt = "0%";
  overview.getCell("B7").numFmt = "0%";
  overview.eachRow((row, number) => { if (number > 1) { row.height = 26; row.alignment = { vertical: "middle", wrapText: true }; } });

  addSheet(workbook, "会话记录", [["会话ID", "id"], ["状态", "status"], ["是否解决", "resolved"], ["关联工单", "ticketId"], ["开始时间", "createdAt"], ["更新时间", "updatedAt"]], data.sessions.map((x) => ({ ...x, resolved: x.resolved === "" || x.resolved == null ? "待评价" : x.resolved ? "是" : "否", createdAt: dateTime(x.createdAt), updatedAt: dateTime(x.updatedAt) })), [24, 14, 14, 24, 22, 22]);
  addSheet(workbook, "消息明细", [["消息ID", "id"], ["会话ID", "sessionId"], ["角色", "role"], ["消息内容", "content"], ["意图", "intent"], ["置信度", "confidence"], ["动作", "action"], ["来源", "source"], ["风险", "riskLevel"], ["时间", "createdAt"]], data.messages.map((x) => ({ ...x, confidence: typeof x.confidence === "number" ? x.confidence : "", createdAt: dateTime(x.createdAt) })), [38, 24, 12, 52, 20, 12, 20, 22, 12, 22]);
  const messageSheet = workbook.getWorksheet("消息明细");
  messageSheet.getColumn("confidence").numFmt = "0%";
  addSheet(workbook, "人工工单", [["工单ID", "id"], ["会话ID", "sessionId"], ["意图", "intent"], ["转人工原因", "handoffReason"], ["优先级", "priority"], ["状态", "status"], ["摘要", "summary"], ["创建时间", "createdAt"], ["更新时间", "updatedAt"]], data.tickets.map((x) => ({ ...x, createdAt: dateTime(x.createdAt), updatedAt: dateTime(x.updatedAt) })), [24, 24, 20, 32, 12, 14, 52, 22, 22]);
  addSheet(workbook, "人工回复", [["回复ID", "id"], ["工单ID", "ticketId"], ["会话ID", "sessionId"], ["回复内容", "content"], ["回复时间", "createdAt"]], data.replies.map((x) => ({ ...x, createdAt: dateTime(x.createdAt) })), [38, 24, 24, 52, 22]);
  addSheet(workbook, "服务评价", [["评价ID", "id"], ["会话ID", "sessionId"], ["是否解决", "resolved"], ["评分", "score"], ["评价内容", "comment"], ["评价时间", "createdAt"]], data.ratings.map((x) => ({ ...x, resolved: x.resolved ? "是" : "否", createdAt: dateTime(x.createdAt) })), [24, 24, 14, 10, 52, 22]);
  addSheet(workbook, "退款申请", [["退款单号", "id"], ["会话ID", "sessionId"], ["订单号", "orderNo"], ["退款原因", "reason"], ["状态", "status"], ["申请时间", "createdAt"], ["更新时间", "updatedAt"]], data.refunds.map((x) => ({ ...x, createdAt: dateTime(x.createdAt), updatedAt: dateTime(x.updatedAt) })), [24, 24, 20, 28, 14, 22, 22]);
  addSheet(workbook, "知识缺口", [["记录ID", "id"], ["用户问题", "question"], ["出现次数", "count"], ["状态", "status"], ["首次记录", "createdAt"], ["最近更新", "updatedAt"]], data.knowledgeGaps.map((x) => ({ ...x, createdAt: dateTime(x.createdAt), updatedAt: dateTime(x.updatedAt) })), [28, 52, 12, 14, 22, 22]);

  const buffer = await workbook.xlsx.writeBuffer();
  saveBlob(new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), `言析智能客服_运营数据_${data.range.from || "全部"}_${data.range.to || "全部"}.xlsx`);
}

function clipText(value, length = 54) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return text.length > length ? text.slice(0, length) + "…" : text;
}

function recommendations(data, raw = {}) {
  const metrics = data.metrics || {};
  const items = [];
  const gaps = [...(data.knowledgeGaps || [])].sort((a, b) => b.count - a.count);
  if (gaps.length) {
    const top = gaps[0];
    items.push(`知识缺口“${clipText(top.question, 30)}”出现 ${top.count} 次。建议新增一条包含适用条件、操作入口、有效期和异常处理方式的 FAQ，上线后用原问题及两种同义问法回归测试。`);
  }
  const lowRating = (raw.ratings || []).find((item) => Number(item.score) <= 2);
  if (lowRating) {
    const userMessage = [...(raw.messages || [])].reverse().find((item) => item.sessionId === lowRating.sessionId && item.role === "user");
    items.push(`低评分会话（${lowRating.score} 分）涉及“${clipText(userMessage?.content || lowRating.comment, 34)}”。建议在人工工作台明确首次响应时限，并要求关闭前记录处理结论；下周抽查同类会话是否真正闭环。`);
  }
  const ticket = (raw.tickets || []).find((item) => item.priority === "high") || (raw.tickets || [])[0];
  if (ticket) items.push(`人工工单示例“${clipText(ticket.summary || ticket.handoffReason, 42)}”。建议把“金额争议、投诉、主动要求人工”固化为高优先级规则，并监控接入耗时和关闭原因，避免只转单不解决。`);
  if ((metrics.handoffRate || 0) > 30) items.push(`本周期转人工率为 ${metrics.handoffRate}%。建议优先复盘高频转人工意图，将可标准化的查询步骤写入知识库或订单查询规则，并以转人工率下降 5 个百分点作为下一周期目标。`);
  if (!items.length) items.push("本周期核心指标稳定。建议每周抽样 10 条会话检查回答准确性、时效性和解决闭环，并记录知识库更新日期。 ");
  return items.slice(0, 4);
}

async function installChineseFont(pdf) {
  const response = await fetch(`${import.meta.env.BASE_URL}fonts/simhei.ttf`);
  if (!response.ok) throw new Error("中文报告字体加载失败");
  const bytes = new Uint8Array(await response.arrayBuffer());
  let binary = "";
  const size = 0x8000;
  for (let index = 0; index < bytes.length; index += size) binary += String.fromCharCode(...bytes.subarray(index, index + size));
  pdf.addFileToVFS("simhei.ttf", btoa(binary));
  pdf.addFont("simhei.ttf", "SimHei", "normal");
  pdf.setFont("SimHei", "normal");
}

function drawWrapped(pdf, text, x, y, width, lineHeight = 5) {
  const lines = pdf.splitTextToSize(String(text || ""), width);
  pdf.text(lines, x, y);
  return y + lines.length * lineHeight;
}

function drawDonut(pdf, items, cx, cy, radius, colors) {
  const total = Math.max(items.reduce((sum, item) => sum + item.count, 0), 1);
  let start = -90;
  items.forEach((item, index) => {
    const end = start + item.count / total * 360;
    const color = colors[index % colors.length];
    pdf.setFillColor(...color);
    for (let degree = start; degree < end; degree += 2) {
      const next = Math.min(degree + 2.2, end);
      const p1 = [cx + radius * Math.cos(degree * Math.PI / 180), cy + radius * Math.sin(degree * Math.PI / 180)];
      const p2 = [cx + radius * Math.cos(next * Math.PI / 180), cy + radius * Math.sin(next * Math.PI / 180)];
      pdf.triangle(cx, cy, p1[0], p1[1], p2[0], p2[1], "F");
    }
    start = end;
  });
  pdf.setFillColor(255, 255, 255); pdf.circle(cx, cy, radius * .58, "F");
  pdf.setTextColor(20, 33, 43); pdf.setFontSize(15); pdf.text(String(total), cx, cy + 1, { align: "center" });
  pdf.setFontSize(7); pdf.setTextColor(105, 119, 112); pdf.text("会话", cx, cy + 6, { align: "center" });
}

export async function exportPdf(data, range, raw = {}) {
  const metrics = data.metrics || {};
  const pdf = new jsPDF("p", "mm", "a4");
  await installChineseFont(pdf);
  const green = [11, 114, 88], ink = [20, 33, 43], pale = [241, 245, 243], orange = [232, 151, 78], gray = [207, 217, 212];
  const colors = [green, [111, 171, 151], orange, gray];
  pdf.setFillColor(...ink); pdf.roundedRect(12, 12, 186, 36, 5, 5, "F");
  pdf.setTextColor(203, 237, 112); pdf.setFontSize(8); pdf.text("YANXI SERVICE INTELLIGENCE", 20, 23);
  pdf.setTextColor(255,255,255); pdf.setFontSize(22); pdf.text("智能客服运营分析报告", 20, 36);
  pdf.setFontSize(8); pdf.setTextColor(213, 222, 218); pdf.text(`统计周期：${range.from} 至 ${range.to}　生成时间：${new Date().toLocaleString("zh-CN", { hour12: false, timeZone: "Asia/Shanghai" })}`, 20, 43);
  pdf.setTextColor(...ink); pdf.setFontSize(14); pdf.text("一、核心指标", 12, 60);
  const metricItems = [["会话量", metrics.sessions || 0, "次"], ["AI 自助解决率", (metrics.solveRate || 0) + "%", ""], ["转人工率", (metrics.handoffRate || 0) + "%", ""], ["满意度", metrics.satisfaction || 0, "/5"]];
  metricItems.forEach((item, index) => { const x = 12 + index * 47; pdf.setFillColor(255,255,255); pdf.setDrawColor(220,228,223); pdf.roundedRect(x, 65, 43, 28, 3, 3, "FD"); pdf.setFontSize(8); pdf.setTextColor(102,117,111); pdf.text(item[0], x+4, 73); pdf.setFontSize(18); pdf.setTextColor(...ink); pdf.text(String(item[1]), x+4, 86); pdf.setFontSize(7); pdf.setTextColor(102,117,111); pdf.text(item[2], x+31, 86); });
  pdf.setFontSize(14); pdf.setTextColor(...ink); pdf.text("二、意图分布", 12, 107); pdf.text("三、知识缺口", 108, 107);
  const intents = (data.intents || []).slice(0, 7);
  intents.forEach((item, index) => { const y = 116 + index * 8; pdf.setFontSize(7.5); pdf.setTextColor(...ink); pdf.text(clipText(item.name, 12), 14, y); pdf.setFillColor(235,241,238); pdf.roundedRect(45,y-3,45,3,1.5,1.5,"F"); pdf.setFillColor(...green); pdf.roundedRect(45,y-3,45*item.percent/100,3,1.5,1.5,"F"); pdf.text(String(item.count),94,y); });
  (data.knowledgeGaps || []).slice(0, 6).forEach((item,index)=>{ const y=113+index*12; pdf.setFillColor(...pale); pdf.roundedRect(108,y,88,9,2,2,"F"); pdf.setFontSize(7.5); pdf.setTextColor(...ink); pdf.text(clipText(item.question,24),112,y+5.8); pdf.text(item.count+" 次",192,y+5.8,{align:"right"}); });
  pdf.setFontSize(14); pdf.text("四、服务闭环",12,177);
  const closure = data.closure || [{name:"AI 自助解决",count:metrics.aiResolved||0},{name:"人工已解决",count:metrics.humanResolved||0},{name:"处理中",count:metrics.inProgress||0}];
  const maxClosure=Math.max(...closure.map(x=>x.count),1); closure.forEach((item,index)=>{ const y=187+index*11; pdf.setFontSize(8); pdf.text(item.name,14,y); pdf.setFillColor(235,241,238); pdf.roundedRect(43,y-3,57,4,2,2,"F"); pdf.setFillColor(...colors[index]); pdf.roundedRect(43,y-3,57*item.count/maxClosure,4,2,2,"F"); pdf.text(String(item.count),104,y); }); drawDonut(pdf,closure,150,199,19,colors);
  closure.forEach((item,index)=>{ const y=184+index*8; pdf.setFillColor(...colors[index]); pdf.rect(176,y-2.5,3,3,"F"); pdf.setFontSize(7); pdf.text(item.name,181,y); });
  pdf.addPage(); pdf.setFont("SimHei"); pdf.setFillColor(...ink); pdf.rect(0,0,210,26,"F"); pdf.setFontSize(17); pdf.setTextColor(255,255,255); pdf.text("五、运营结论与改进建议",14,17);
  let y=39; recommendations(data,raw).forEach((item,index)=>{ pdf.setFillColor(...pale); pdf.roundedRect(12,y-7,186,30,3,3,"F"); pdf.setFillColor(...ink); pdf.roundedRect(17,y-2,9,9,2,2,"F"); pdf.setTextColor(255,255,255); pdf.setFontSize(9); pdf.text(String(index+1),21.5,y+4,{align:"center"}); pdf.setTextColor(...ink); pdf.setFontSize(9); const next=drawWrapped(pdf,item,31,y,160,5.2); y=Math.max(y+37,next+9); });
  pdf.setDrawColor(220,228,223); pdf.line(12,274,198,274); pdf.setTextColor(103,118,111); pdf.setFontSize(7); pdf.text("本报告按北京时间统计，数据已脱敏；正文为矢量文字，可搜索和复制。",12,281);
  const pages=pdf.getNumberOfPages(); for(let page=1;page<=pages;page++){ pdf.setPage(page); pdf.setFont("SimHei"); pdf.setFontSize(7); pdf.setTextColor(125,135,130); pdf.text(`${page} / ${pages}`,198,290,{align:"right"}); }
  pdf.save(`言析智能客服_运营分析_${range.from}_${range.to}.pdf`);
}
