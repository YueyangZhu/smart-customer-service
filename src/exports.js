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
    ["AI 自助解决率", (metrics.solveRate || 0) / 100, "AI 自助解决会话 / 区间会话"],
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
  return text.length > length ? text.slice(0, length) + "..." : text;
}

function safeNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function percent(part, total) {
  const base = Math.max(safeNumber(total), 1);
  return Math.round(safeNumber(part) / base * 100);
}

function statusText(value) {
  return ({ active: "服务中", waiting_agent: "等待人工", open: "待接入", processing: "处理中", closed: "已关闭" })[value] || value || "--";
}

function priorityText(value) {
  return value === "high" ? "紧急" : "普通";
}

function reportRange(range = {}) {
  if (!range.from && !range.to) return "\u5168\u90e8\u6570\u636e";
  return (range.from || "\u6700\u65e9") + " \u81f3 " + (range.to || "\u5168\u90e8");
}
function recommendations(data, raw = {}) {
  const metrics = data.metrics || {};
  const items = [];
  const gaps = [...(data.knowledgeGaps || [])].sort((a, b) => safeNumber(b.count) - safeNumber(a.count));
  const intents = [...(data.intents || [])].sort((a, b) => safeNumber(b.count) - safeNumber(a.count));
  const lowRating = (raw.ratings || []).find((item) => Number(item.score) <= 2);
  const highTicket = (raw.tickets || []).find((item) => item.priority === "high");

  if (gaps.length) {
    const top = gaps[0];
    items.push({
      title: "优先补齐知识缺口",
      text: `「${clipText(top.question, 44)}」出现 ${top.count} 次。建议补一条可直接执行的 FAQ，至少包含适用条件、处理入口、时效承诺和异常升级规则，上线后用原问题和同义问法回归测试。`
    });
  }
  if (intents.length) {
    const top = intents[0];
    const total = Math.max(intents.reduce((sum, item) => sum + safeNumber(item.count), 0), 1);
    items.push({
      title: "复盘最高频售后意图",
      text: `最高频意图是「${top.name}」，占 Top5 意图的 ${percent(top.count, total)}%。建议检查这类问题是否已有清晰入口、状态查询和标准回复，能标准化的步骤优先沉淀到知识库。`
    });
  }
  if (safeNumber(metrics.handoffRate) > 30 || highTicket) {
    items.push({
      title: "降低非必要转人工",
      text: `当前转人工率 ${metrics.handoffRate || 0}%，人工工单 ${metrics.handoffs || (raw.tickets || []).length || 0} 个。建议把金额争议、投诉、主动要求人工继续保持高优先级，同时复盘普通工单中可由 AI 直接解决的场景。`
    });
  }
  if (lowRating) {
    const userMessage = [...(raw.messages || [])].reverse().find((item) => item.sessionId === lowRating.sessionId && item.role === "user");
    items.push({
      title: "跟进低分会话",
      text: `发现 ${lowRating.score} 分低评价，相关问题为「${clipText(userMessage?.content || lowRating.comment, 50)}」。建议人工关闭前补充处理结论，并在下个周期抽查同类问题是否真正闭环。`
    });
  }
  if (!items.length) {
    items.push({ title: "保持周度质检", text: "本周期核心指标稳定。建议每周抽样 10 条会话检查回答准确性、时效和闭环结果，并记录知识库更新日期。" });
  }
  return items.slice(0, 4);
}

async function installChineseFont(pdf, fontBytes) {
  let bytes = fontBytes ? new Uint8Array(fontBytes) : null;
  if (!bytes) {
    const response = await fetch(`${import.meta.env.BASE_URL}fonts/simhei.ttf`);
    if (!response.ok) throw new Error("中文报告字体加载失败");
    bytes = new Uint8Array(await response.arrayBuffer());
  }
  let binary = "";
  const size = 0x8000;
  for (let index = 0; index < bytes.length; index += size) binary += String.fromCharCode(...bytes.subarray(index, index + size));
  pdf.addFileToVFS("simhei.ttf", btoa(binary));
  pdf.addFont("simhei.ttf", "SimHei", "normal");
  pdf.setFont("SimHei", "normal");
}

const PDF = {
  ink: [20, 33, 43],
  green: [11, 114, 88],
  deepGreen: [0, 103, 79],
  lightGreen: [230, 241, 235],
  pale: [245, 248, 246],
  line: [218, 229, 223],
  muted: [98, 113, 107],
  orange: [241, 164, 93],
  blue: [94, 141, 176],
  gray: [207, 217, 212],
  white: [255, 255, 255]
};

const INTENT_COLORS = [PDF.green, [31, 143, 114], [134, 184, 167], PDF.orange, PDF.gray];
const CLOSURE_COLORS = [PDF.green, [134, 184, 167], PDF.orange, PDF.gray];

function setFill(pdf, color) { pdf.setFillColor(...color); }
function setDraw(pdf, color) { pdf.setDrawColor(...color); }
function setText(pdf, color) { pdf.setTextColor(...color); }

function pageSize(pdf) {
  return { width: pdf.internal.pageSize.getWidth(), height: pdf.internal.pageSize.getHeight() };
}

function drawPageBackground(pdf) {
  const { width, height } = pageSize(pdf);
  setFill(pdf, PDF.pale);
  pdf.rect(0, 0, width, height, "F");
}

function drawTextBlock(pdf, text, x, y, width, options = {}) {
  const fontSize = options.fontSize || 9;
  const lineHeight = options.lineHeight || fontSize * 0.48;
  pdf.setFontSize(fontSize);
  const lines = wrapTextToWidth(pdf, text, width, options.maxLines);
  pdf.text(lines, x, y, { lineHeightFactor: 1.25 });
  return y + Math.max(lines.length, 1) * lineHeight;
}

function wrapTextToWidth(pdf, text, width, maxLines) {
  const source = String(text || "").replace(/\s+/g, " ").trim();
  if (!source) return [""];
  const lines = [];
  let line = "";
  for (const char of source) {
    const candidate = line + char;
    if (line && pdf.getTextWidth(candidate) > width) {
      lines.push(line.trimEnd());
      line = char.trimStart();
      if (maxLines && lines.length >= maxLines) break;
    } else {
      line = candidate;
    }
  }
  if (!maxLines || lines.length < maxLines) lines.push(line.trimEnd());
  if (maxLines && lines.length > maxLines) lines.length = maxLines;
  if (maxLines && lines.length === maxLines && pdf.getTextWidth(lines[lines.length - 1]) > width) {
    let last = lines[lines.length - 1];
    while (last.length > 1 && pdf.getTextWidth(`${last}...`) > width) last = last.slice(0, -1);
    lines[lines.length - 1] = `${last}...`;
  }
  return lines;
}

function drawCard(pdf, x, y, width, height, options = {}) {
  setFill(pdf, options.fill || PDF.white);
  setDraw(pdf, options.stroke || PDF.line);
  pdf.setLineWidth(options.lineWidth || 0.25);
  pdf.roundedRect(x, y, width, height, options.radius || 5, options.radius || 5, "FD");
}

function drawSectionTitle(pdf, title, subtitle, x, y, width) {
  setText(pdf, PDF.ink);
  pdf.setFontSize(13);
  pdf.text(title, x, y);
  if (subtitle) {
    setText(pdf, PDF.muted);
    drawTextBlock(pdf, subtitle, x, y + 6, width, { fontSize: 7.6, lineHeight: 3.8, maxLines: 2 });
  }
}

function drawMetricCard(pdf, item, x, y, width, height) {
  drawCard(pdf, x, y, width, height);
  pdf.setFont("SimHei", "normal");
  setText(pdf, PDF.muted);
  pdf.setFontSize(8.5);
  pdf.text(item.label, x + 6, y + 8.5);
  const valueText = String(item.value ?? "--");
  const valueX = x + 6;
  pdf.setFont("helvetica", "normal");
  setText(pdf, item.tone || PDF.ink);
  pdf.setFontSize(20);
  pdf.text(valueText, valueX, y + 21);
  const unitX = Math.min(valueX + pdf.getTextWidth(valueText) + 2.4, x + width - 18);
  pdf.setFont("SimHei", "normal");
  setText(pdf, PDF.muted);
  pdf.setFontSize(8);
  if (item.unit) pdf.text(item.unit, unitX, y + 20.6);
  if (item.note) drawTextBlock(pdf, item.note, x + 6, y + 28, width - 12, { fontSize: 7.2, lineHeight: 3.5 });
}

function drawMetricNotes(pdf, x, y, width) {
  setText(pdf, PDF.muted);
  pdf.setFontSize(7.4);
  const text = "指标口径：区间会话为当前日期范围内进入统计的会话数；AI 自助解决率为未进入人工且用户评价已解决的会话占比；转人工率为人工工单占比；满意度为用户评分均值，满分 5 分。";
  drawTextBlock(pdf, text, x, y, width, { fontSize: 7.4, lineHeight: 3.6, maxLines: 2 });
}
function drawBar(pdf, x, y, width, value, max, color, height = 3.8) {
  setFill(pdf, [234, 240, 237]);
  pdf.roundedRect(x, y, width, height, height / 2, height / 2, "F");
  if (safeNumber(value) > 0) {
    setFill(pdf, color);
    pdf.roundedRect(x, y, width * safeNumber(value) / Math.max(safeNumber(max), 1), height, height / 2, height / 2, "F");
  }
}

function drawDonut(pdf, items, cx, cy, radius, colors, center = {}) {
  const total = Math.max(items.reduce((sum, item) => sum + safeNumber(item.count), 0), 1);
  const hasValue = items.some((item) => safeNumber(item.count) > 0);
  if (!hasValue) {
    setFill(pdf, PDF.gray);
    pdf.circle(cx, cy, radius, "F");
  }
  let start = -90;
  items.forEach((item, index) => {
    const count = safeNumber(item.count);
    const end = start + count / total * 360;
    if (count > 0) {
      setFill(pdf, colors[index % colors.length]);
      for (let degree = start; degree < end; degree += 1.8) {
        const next = Math.min(degree + 2, end);
        const p1 = [cx + radius * Math.cos(degree * Math.PI / 180), cy + radius * Math.sin(degree * Math.PI / 180)];
        const p2 = [cx + radius * Math.cos(next * Math.PI / 180), cy + radius * Math.sin(next * Math.PI / 180)];
        pdf.triangle(cx, cy, p1[0], p1[1], p2[0], p2[1], "F");
      }
    }
    start = end;
  });
  setFill(pdf, PDF.white);
  pdf.circle(cx, cy, radius * 0.6, "F");
  setText(pdf, PDF.ink);
  pdf.setFontSize(center.size || 15);
  pdf.text(String(center.value ?? total), cx, cy - 1, { align: "center" });
  setText(pdf, PDF.muted);
  pdf.setFontSize(7.2);
  pdf.text(center.label || "会话", cx, cy + 6, { align: "center" });
}

function drawIntentCard(pdf, data, x, y, width, height) {
  drawCard(pdf, x, y, width, height);
  const intents = (data.intents || []).slice(0, 5);
  const total = Math.max(intents.reduce((sum, item) => sum + safeNumber(item.count), 0), 1);
  drawSectionTitle(pdf, "2. 意图分布 Top 5", "与网页口径一致：按 AI 最终识别的售后意图统计。", x + 7, y + 11, width - 14);
  drawDonut(pdf, intents, x + 34, y + 45, 17, INTENT_COLORS, {
    value: intents[0] ? `${percent(intents[0].count, total)}%` : "0%",
    label: intents[0]?.name || "暂无意图",
    size: 12
  });
  const max = Math.max(...intents.map((item) => safeNumber(item.count)), 1);
  intents.forEach((item, index) => {
    const rowY = y + 31 + index * 8.1;
    setFill(pdf, INTENT_COLORS[index % INTENT_COLORS.length]);
    pdf.roundedRect(x + 65, rowY - 4, 5, 5, 1.3, 1.3, "F");
    setText(pdf, PDF.white);
    pdf.setFontSize(6.5);
    pdf.text(String(index + 1), x + 67.5, rowY - 0.6, { align: "center" });
    setText(pdf, PDF.ink);
    pdf.setFontSize(8.2);
    pdf.text(clipText(item.name, 15), x + 73, rowY);
    drawBar(pdf, x + 108, rowY - 3.2, width - 140, safeNumber(item.count), max, INTENT_COLORS[index % INTENT_COLORS.length], 3.4);
    setText(pdf, PDF.ink);
    pdf.setFontSize(7.8);
    pdf.text(`${item.count} 次`, x + width - 8, rowY, { align: "right" });
  });
  if (!intents.length) {
    setText(pdf, PDF.muted);
    pdf.setFontSize(9);
    pdf.text("当前周期暂无意图数据", x + 66, y + 45);
  }
}

function drawKnowledgeCard(pdf, data, x, y, width, height) {
  drawCard(pdf, x, y, width, height);
  const gaps = (data.knowledgeGaps || []).slice(0, 5);
  drawSectionTitle(pdf, "3. 知识缺口说明", "AI 未能可靠回答、需要补充 FAQ 或规则的高频问题。PDF 展示前 5 条，完整明细见 Excel。", x + 7, y + 11, width - 14);
  if (!gaps.length) {
    setText(pdf, PDF.muted);
    pdf.setFontSize(9);
    pdf.text("当前周期暂无知识缺口", x + 7, y + 43);
    return;
  }
  gaps.forEach((item, index) => {
    const rowY = y + 34 + index * 7.2;
    setFill(pdf, index === 0 ? PDF.lightGreen : [246, 249, 247]);
    pdf.roundedRect(x + 7, rowY - 5.5, width - 14, 7.6, 2.3, 2.3, "F");
    setText(pdf, PDF.ink);
    pdf.setFontSize(7.8);
    pdf.text(clipText(item.question, 42), x + 11, rowY - 0.7);
    setText(pdf, PDF.deepGreen);
    pdf.setFontSize(7.8);
    pdf.text(`${item.count} 次`, x + width - 11, rowY - 0.7, { align: "right" });
  });
}

function drawClosureCard(pdf, data, x, y, width, height) {
  drawCard(pdf, x, y, width, height);
  const metrics = data.metrics || {};
  const closure = data.closure || [
    { name: "AI 自助解决", count: metrics.aiResolved || 0 },
    { name: "人工已解决", count: metrics.humanResolved || 0 },
    { name: "处理中", count: metrics.inProgress || 0 }
  ];
  const total = Math.max(closure.reduce((sum, item) => sum + safeNumber(item.count), 0), 1);
  const max = Math.max(...closure.map((item) => safeNumber(item.count)), 1);
  drawSectionTitle(pdf, "4.1 闭环状态", "AI 自助解决=AI 完成闭环；人工已解决=客服关闭工单；处理中=尚未闭环。", x + 7, y + 12, width - 14);
  closure.forEach((item, index) => {
    const rowY = y + 34 + index * 13;
    setText(pdf, PDF.ink);
    pdf.setFontSize(8.8);
    pdf.text(item.name, x + 10, rowY);
    drawBar(pdf, x + 58, rowY - 3.5, width - 128, safeNumber(item.count), max, CLOSURE_COLORS[index % CLOSURE_COLORS.length], 4.4);
    setText(pdf, PDF.ink);
    pdf.setFontSize(8.2);
    pdf.text(`${item.count} 个`, x + width - 63, rowY, { align: "right" });
    setText(pdf, PDF.muted);
    pdf.text(`${percent(item.count, total)}%`, x + width - 49, rowY, { align: "right" });
  });
  drawDonut(pdf, closure, x + width - 25, y + 45, 16, CLOSURE_COLORS, { value: total, label: "会话", size: 13 });
}

function drawRecommendationCard(pdf, item, index, x, y, width, height) {
  drawCard(pdf, x, y, width, height, { fill: index === 0 ? [242, 249, 246] : PDF.white });
  setFill(pdf, index === 0 ? PDF.green : PDF.ink);
  pdf.roundedRect(x + 8, y + 8, 10, 10, 2.2, 2.2, "F");
  setText(pdf, PDF.white);
  pdf.setFontSize(8.5);
  pdf.text(String(index + 1), x + 13, y + 15, { align: "center" });
  setText(pdf, PDF.ink);
  pdf.setFontSize(11);
  pdf.text(item.title, x + 24, y + 14.2);
  setText(pdf, PDF.muted);
  drawTextBlock(pdf, item.text, x + 24, y + 24, width - 34, { fontSize: 9, lineHeight: 4.8, maxLines: 5 });
}

function drawTicketExamples(pdf, raw, x, y, width, height) {
  drawCard(pdf, x, y, width, height);
  drawSectionTitle(pdf, "4.2 人工工单样例", "用于复盘高风险转人工是否有明确处理结论。", x + 7, y + 11, width - 14);
  const tickets = (raw.tickets || []).slice(0, 3);
  if (!tickets.length) {
    setText(pdf, PDF.muted);
    pdf.setFontSize(8.8);
    pdf.text("当前周期暂无人工工单", x + 7, y + 37);
    return;
  }
  tickets.forEach((ticket, index) => {
    const rowY = y + 31 + index * 17;
    setText(pdf, PDF.ink);
    pdf.setFontSize(8.5);
    pdf.text(`${priorityText(ticket.priority)} · ${statusText(ticket.status)} · ${ticket.id}`, x + 7, rowY);
    setText(pdf, PDF.muted);
    drawTextBlock(pdf, clipText(ticket.summary || ticket.handoffReason, 82), x + 7, rowY + 5.5, width - 14, { fontSize: 7.3, lineHeight: 3.5 });
  });
}

function drawHeader(pdf, data, range) {
  const metrics = data.metrics || {};
  const { width } = pageSize(pdf);
  const x = 12;
  const y = 10;
  const cardWidth = width - 24;
  drawPageBackground(pdf);
  drawCard(pdf, x, y, cardWidth, 38, { fill: PDF.ink, stroke: PDF.ink, radius: 6 });
  setText(pdf, [203, 237, 112]);
  pdf.setFontSize(8.5);
  pdf.text("SERVICE INTELLIGENCE", x + 8, y + 11);
  setText(pdf, PDF.white);
  pdf.setFontSize(18);
  pdf.text("言析智能客服运营洞察报告", x + 8, y + 25);
  setText(pdf, [213, 222, 218]);
  pdf.setFontSize(7.5);
  const generatedAt = new Date().toLocaleString("zh-CN", { hour12: false, timeZone: "Asia/Shanghai" });
  pdf.text(`统计周期 ${reportRange(range)}`, x + cardWidth - 8, y + 12, { align: "right" });
  pdf.text(`生成时间 ${generatedAt}`, x + cardWidth - 8, y + 22, { align: "right" });
  pdf.text(`数据已脱敏 · 会话 ${metrics.sessions || 0} 次 · 消息 ${metrics.messages || 0} 条`, x + cardWidth - 8, y + 31, { align: "right" });
}

function drawSubHeader(pdf, title, subtitle, note) {
  const { width } = pageSize(pdf);
  drawPageBackground(pdf);
  setText(pdf, PDF.ink);
  pdf.setFontSize(16);
  pdf.text(title, 12, 19);
  if (subtitle) {
    setText(pdf, PDF.muted);
    pdf.setFontSize(8);
    pdf.text(subtitle, 12, 30);
  }
  let nextY = subtitle ? 39 : 32;
  if (note) {
    setText(pdf, PDF.muted);
    nextY = drawTextBlock(pdf, note, 12, 39, width - 24, { fontSize: 7.8, lineHeight: 3.8, maxLines: 2 }) + 4;
  }
  setDraw(pdf, PDF.line);
  pdf.line(12, nextY, width - 12, nextY);
  return nextY + 10;
}

function addFooters(pdf) {
  const pages = pdf.getNumberOfPages();
  const { width, height } = pageSize(pdf);
  for (let page = 1; page <= pages; page += 1) {
    pdf.setPage(page);
    setDraw(pdf, PDF.line);
    pdf.line(10, height - 11, width - 10, height - 11);
    setText(pdf, PDF.muted);
    pdf.setFontSize(7.4);
    pdf.text("本报告按北京时间统计，数据已脱敏；指标口径与运营洞察页面保持一致。", 10, height - 5);
    pdf.text(`${page} / ${pages}`, width - 10, height - 5, { align: "right" });
  }
}

export async function exportPdf(data, range, raw = {}, options = {}) {
  const metrics = data.metrics || {};
  const pdf = new jsPDF("p", "mm", "a4");
  await installChineseFont(pdf, options.fontBytes);
  pdf.setFont("SimHei", "normal");

  drawHeader(pdf, data, range);

  const metricCards = [
    { label: "区间会话", value: metrics.sessions ?? 0, unit: "次", note: "进入统计周期的服务会话" },
    { label: "AI 自助解决率", value: `${metrics.solveRate ?? 0}%`, unit: "", note: `${metrics.aiResolved || 0} 个会话由 AI 自助闭环`, tone: PDF.green },
    { label: "转人工率", value: `${metrics.handoffRate ?? 0}%`, unit: "", note: `${metrics.handoffs || (raw.tickets || []).length || 0} 个工单进入人工处理` },
    { label: "满意度", value: metrics.satisfaction ?? "--", unit: "/5", note: `${metrics.ratings || 0} 次评价参与计算` }
  ];
  drawSectionTitle(pdf, "1. 核心指标", "当前日期范围内的服务规模、解决效率和用户评价。", 12, 58, 186);
  metricCards.forEach((item, index) => {
    const x = 12 + index % 2 * 95;
    const y = 68 + Math.floor(index / 2) * 33;
    drawMetricCard(pdf, item, x, y, 89, 29);
  });

  drawMetricNotes(pdf, 12, 132, 186);
  drawIntentCard(pdf, data, 12, 144, 186, 68);
  drawKnowledgeCard(pdf, data, 12, 217, 186, 66);

  pdf.addPage();
  const page2StartY = drawSubHeader(
    pdf,
    "4. 闭环状态与人工处理",
    `统计周期 ${reportRange(range)}`,
    "数据口径与页面一致：默认不选日期时统计全部数据；知识缺口 PDF 展示最高频的前 5 条，Excel 保留完整明细。"
  );
  drawClosureCard(pdf, data, 12, page2StartY, 186, 70);
  drawTicketExamples(pdf, raw, 12, page2StartY + 82, 186, 74);

  pdf.addPage();
  const page3StartY = drawSubHeader(pdf, "5. 运营建议", "从知识缺口、意图分布、人工工单和评价中提炼下一步动作");
  const advice = recommendations(data, raw);
  advice.forEach((item, index) => {
    drawRecommendationCard(pdf, item, index, 10, page3StartY + index * 56, 190, 50);
  });

  addFooters(pdf);
  const filename = `言析智能客服_运营洞察报告_${range.from || "全部"}_${range.to || "全部"}.pdf`;
  if (options.save !== false) pdf.save(filename);
  return { pdf, filename };
}
