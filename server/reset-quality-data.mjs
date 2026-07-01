`
import { Pool } from "pg";
import { randomUUID } from "node:crypto";
const url = new URL(process.env.DATABASE_URL);
url.searchParams.delete("sslmode");
const pool = new Pool({ connectionString: url.toString(), ssl: { rejectUnauthorized: false } });
const q = (sql, p = []) => pool.query(sql, p);
const id = (p, n) => p + "HQ" + String(n).padStart(3, "0");
const at = (n, m = 0) => new Date(Date.now() - (72 * 60 - n * 11 + m) * 60000).toISOString();
const uid = () => randomUUID();
const orders = [
["OD20260620001","Aurora 降噪耳机",699,"运输中","已到达上海浦东分拨中心，预计明日送达","",true],
["OD20260618008","Luma 阅读灯",239,"退款处理中","","退款审核已通过，预计 1-3 个工作日原路到账",false],
["OD20260612021","Mori 随行杯",129,"已签收","6 月 15 日由本人签收","",true],
["OD20260626016","Nori 香薰机",329,"待出库","仓库已接单，预计 24 小时内出库","",true],
["OD20260628009","Kumo 智能插座",89,"驿站签收","6 月 29 日驿站签收","",true],
["OD20260630022","Sora 旅行箱",499,"派送异常","快递反馈门牌缺失，等待补充信息","",true]
];
const ai = [
["物流查询","OD20260620001","订单到哪里了？","已到达上海浦东分拨中心，预计明日送达。","明天上午能到吗？","上午或下午取决于派送排线，建议保持电话畅通。",5],
["退款进度","OD20260618008","退款进度怎么样？","退款审核已通过，预计 1-3 个工作日原路到账。","周末算工作日吗？","一般不算，银行处理可能顺延。",5],
["退货退款申请","OD20260612021","杯身有划痕，想退货退款。","可以提交售后申请，请保留商品、配件和包装。","需要照片吗？","建议上传划痕照片和包装照片，便于审核。",4],
["商品与政策咨询","","签收后几天内可以无理由退货？","符合条件的商品签收后 7 天内可申请无理由退货。","拆封了还能退吗？","不影响二次销售通常可申请，贴身用品和定制商品除外。",5],
["换货政策","","耳机左耳没有声音，能换新吗？","功能异常可申请换货或维修，请准备订单号和故障说明。","没有视频可以吗？","可以先提交照片和文字说明，必要时再补视频。",5],
["发票咨询","","电子发票多久能收到？","通常申请后 24 小时内发送到订单绑定邮箱。","抬头写错能重开吗？","可以申请重开，需要核实原发票状态。",5],
["物流查询","OD20260626016","怎么还没发货？","订单待出库，仓库已接单，预计 24 小时内出库。","能加急吗？","加急需人工核实仓库排单，超过时限可转人工催发。",4],
["商品与政策咨询","","赠品需要一起寄回吗？","退货退款时通常需要赠品、配件和包装一并寄回。","赠品拆了怎么办？","请如实说明，是否影响退款要结合活动规则判断。",4],
["退款进度","OD20260618008","退款的钱还没到。","当前退款审核已通过，仍在银行处理周期内。","今天第 2 天了。","建议观察到第 3 个工作日，仍未到账再查流水。",4],
["换货政策","","杯子破损了能换货吗？","商品破损可提交售后，请上传破损和外包装照片。","包装扔了怎么办？","可以先提交商品照片和情况说明。",4],
["物流查询","OD20260628009","驿站签收后怎么取？","可凭取件码或手机号后四位到驿站核验取件。","没有短信呢？","先用手机号查询，查不到再转人工核实。",4],
["商品与政策咨询","","贴身用品拆封能退吗？","贴身用品拆封后通常不支持无理由退货。","质量问题呢？","质量问题仍可提交售后审核。",5],
["退货退款申请","OD20260620001","如果明天不到我想退款。","当前仍在运输中，可明天看物流后再决定是否售后。","能先拦截吗？","拦截需要人工核实快递状态。",4],
["发票咨询","","个人发票需要税号吗？","个人抬头通常不需要税号。","能补开发票吗？","可以在订单详情申请补开电子发票。",5],
["换货政策","","配件少了一个，怎么补发？","缺件可提交售后补发，请提供订单和缺失配件说明。","需要开箱视频吗？","有视频更好，没有也可先提交照片。",4],
["退款进度","OD20260618008","退款审核通过后退到哪里？","会原路退回原支付账户。","如果是微信支付呢？","通常退回微信支付账户。",4],
["商品与政策咨询","","定制商品能退吗？","定制商品通常不支持无理由退货。","刻字错了算质量问题吗？","若与下单内容不一致，可提交照片由售后判断责任。",5],
["物流查询","OD20260630022","派送异常怎么处理？","快递反馈门牌缺失，需要补充完整地址。","补完多久重派？","站点确认后会重新安排派送，具体看排线。",3],
["发票咨询","","企业发票要填什么？","需要公司名称、税号，部分公司还需要地址电话和开户信息。","多久能发邮箱？","通常 24 小时内发送。",5],
["商品与政策咨询","","退货运费谁承担？","非质量原因通常用户承担，质量问题一般商家承担。","怎么证明质量问题？","建议提供照片、视频或检测说明。",4]
];
const human = [
["投诉与人工服务","退款金额不对，我要投诉并转人工。","少退了 30 元，我有支付截图。","已接入人工。金额争议需要核对支付流水，请上传截图，我会继续跟进。","high","processing",null,true],
["物流异常","OD20260630022 派送异常，地址哪里有问题？","我门牌号漏填了，可以补吗？","可以，请提供完整门牌号和联系电话，我会备注给配送站。","normal","closed",4,true],
["投诉与人工服务","之前说今天解决，现在还没有消息。","这次必须给我明确时间。","已合并历史记录，今天 18:00 前反馈处理结果。","high","processing",null,true],
["售后材料","没有外包装还能退吗？","商品没用过，但是盒子丢了。","","normal","open",null,false],
["发票异常","发票金额不对，少开了运费。","公司报销要求金额一致。","已核对明细，运费可补开发票，请确认抬头和税号。","normal","closed",5,true],
["投诉与人工服务","赔偿方案太差了，我要重新协商。","只给优惠券我不能接受。","已记录不接受优惠券方案，会升级给专员复核。","high","closed",3,false],
["地址修改","订单刚下，能修改收货地址吗？","新地址是上海浦东新区张江路 88 号。","我先核实是否已出库，未出库会尝试修改。","normal","processing",null,true],
["商务咨询","企业批量采购有没有折扣？","大概 200 件，需要合同和发票。","批量采购会转商务同事跟进，请留下公司名称和手机号。","normal","processing",null,true],
["投诉与人工服务","售后一直踢皮球，我不接受继续等待。","请升级主管处理。","已升级为高优先级，并备注主管介入诉求。","high","processing",null,true],
["物流异常","快递显示签收，但我没有收到。","也没有取件码。","已联系配送站点核实，包裹在驿站暂存，请凭手机号后四位取件。","normal","closed",4,true],
["订单异常","订单号查不到但我已经付款了。","我可以提供支付截图和手机号。","请上传支付截图、支付时间和手机号后四位，我会协助定位订单。","high","processing",null,true],
["退款进度","退款超过三天没到账，请给我流水号。","银行卡没有入账。","已查询到退款流水，银行处理中；明天仍未到账可联系发卡行。","high","closed",4,true],
["补发配件","赠品坏了可以单独补吗？","主商品没问题。","","normal","open",null,false],
["投诉与人工服务","我要投诉物流和客服，两边都没人管。","请一次性给我解决方案。","已建立综合投诉工单，会同时核实物流和客服处理记录。","high","processing",null,true],
["物流异常","快递破损我拒收了。","接下来会自动退款吗？","拒收后仓库会核实退回状态，再给出退款或补发方案。","normal","processing",null,true]
];
const gaps = [
["会员生日礼物怎么领取？","我下个月生日，可以提前领吗？",5],
["线下门店在哪里？","上海浦东附近有没有？",4],
["会员积分什么时候过期？","过期前会提醒吗？",4],
["商品可以刻字吗？","如果刻错了还能退吗？",3],
["怎么买礼品卡？","可以开企业发票吗？",3],
["可以合并两个订单发货吗？","其中一个还没出库。",3],
["优惠券过期了能补发吗？","我昨天才看到。",2],
["可以预约安装服务吗？","我买的是香薰机。",2],
["旧机回收怎么估价？","想买新款顺便回收旧的。",2],
["海外地址能配送吗？","香港地址可以吗？",2],
["直播间赠品什么时候发？","订单里没看到赠品。",3],
["会员等级怎么升级？","差多少成长值可以升下一级？",2],
["可以开发票给第三方公司吗？","付款人不是这家公司。",2],
["售后可以指定快递吗？","我想用顺丰寄回。",2],
["企业采购能走对公付款吗？","需要先开发票吗？",2]
];
async function msg(s, role, text, e, t) {
  await q("insert into messages (id, session_id, role, content, intent, confidence, action, source, risk_level, order_no, need_handoff, handoff_reason, created_at) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)", [uid(), s, role, text, e.intent || null, e.confidence ?? null, e.action || null, e.source || null, e.risk || null, e.orderNo || null, e.needHandoff ?? null, e.reason || null, t]);
}
async function boot(s, n, status, resolved, ticket) {
  await q("insert into sessions (id,user_id,coze_conversation_id,status,resolved,ticket_id,created_at,updated_at) values ($1,$2,'',$3,$4,$5,$6,$6)", [s, "quality_demo_" + String(n).padStart(3,"0"), status, resolved, ticket, at(n)]);
  await msg(s, "assistant", "你好，我是言析售后助手。你可以咨询订单、物流、退换货、退款或发票问题；复杂情况我会交给人工客服。", {intent:"欢迎语", confidence:1, action:"answer", source:"系统预设", risk:"low"}, at(n,1));
}
await q("delete from knowledge_gaps");
await q("delete from refunds");
await q("delete from sessions");
await q("delete from orders");
for (const o of orders) await q("insert into orders (id,product,amount,status,logistics,refund,refundable) values ($1,$2,$3,$4,$5,$6,$7)", o);
let n = 1;
for (const c of ai) {
  const s = id("CS", n);
  await boot(s, n, "closed", true, null);
  await msg(s, "user", c[2], {}, at(n,2));
  await msg(s, "assistant", c[3], {intent:c[0], confidence:.92, action:c[0] === "物流查询" ? "query_order" : c[0] === "退款进度" ? "query_refund" : c[0] === "退货退款申请" ? "show_refund_form" : "search_knowledge", source:c[0] === "物流查询" ? "订单系统" : c[0] === "退款进度" ? "退款系统" : "售后知识库", risk:c[0] === "退款进度" ? "medium" : "low", orderNo:c[1]}, at(n,3));
  await msg(s, "user", c[4], {}, at(n,4));
  await msg(s, "assistant", c[5], {intent:c[0], confidence:.9, action:"answer", source:"售后知识库", risk:"low", orderNo:c[1]}, at(n,5));
  if (c[0] === "退货退款申请" && c[1] === "OD20260612021") await q("insert into refunds (id,session_id,order_no,reason,status,created_at,updated_at) values ($1,$2,$3,$4,'待审核',$5,$5)", [id("RF",n), s, c[1], "商品有划痕，包装完整", at(n,6)]);
  await q("insert into ratings (id,session_id,score,resolved,comment,created_at) values ($1,$2,$3,true,$4,$5)", [id("RT",n), s, c[6], "AI 自助解决：" + c[0], at(n,7)]);
  n++;
}
for (const c of human) {
  const s = id("CS", n), tk = id("TK", n), status = c[5] === "open" ? "waiting_agent" : c[5];
  await boot(s, n, status, c[5] === "closed" ? c[7] : null, tk);
  await msg(s, "user", c[1], {intent:c[0], confidence:.96, action:"create_ticket", source:"风险策略", risk:c[4], needHandoff:true, reason:c[0] + "需要人工处理"}, at(n,2));
  await msg(s, "user", c[2], {intent:"等待人工", confidence:1, action:"wait_agent", source:"人工客服", risk:"medium"}, at(n,3));
  await q("insert into tickets (id,session_id,intent,confidence,summary,handoff_reason,priority,status,agent,claimed_at,closed_at,created_at,updated_at) values ($1,$2,$3,.96,$4,$5,$6,$7,$8,$9,$10,$11,$11)", [tk,s,c[0],"用户问题：" + c[1] + "；追问：" + c[2],c[0] + "需要人工核实",c[4],c[5],c[5] === "open" ? null : "演示客服",c[5] === "open" ? null : at(n,4),c[5] === "closed" ? at(n,7) : null,at(n)]);
  if (c[3]) { await msg(s, "agent", c[3], {intent:"人工回复", source:"人工客服"}, at(n,5)); await q("insert into ticket_replies (id,ticket_id,session_id,content,created_at) values ($1,$2,$3,$4,$5)", [uid(),tk,s,c[3],at(n,5)]); }
  if (c[5] === "closed") await q("insert into ratings (id,session_id,score,resolved,comment,created_at) values ($1,$2,$3,$4,$5,$6)", [id("RT",n),s,c[6],c[7],"人工处理评价：" + c[0],at(n,8)]);
  n++;
}
for (const c of gaps) {
  const s = id("CS", n), tk = id("TK", n), st = n % 3 === 0 ? "processing" : "open";
  await boot(s, n, st === "processing" ? "processing" : "waiting_agent", null, tk);
  await msg(s, "user", c[0], {intent:"未知问题", confidence:.38, action:"create_ticket", source:"知识库未命中", risk:"medium", needHandoff:true, reason:"知识库暂无可靠答案"}, at(n,2));
  await msg(s, "user", c[1], {intent:"等待人工", confidence:1, action:"wait_agent", source:"人工客服", risk:"medium"}, at(n,3));
  await q("insert into tickets (id,session_id,intent,confidence,summary,handoff_reason,priority,status,created_at,updated_at) values ($1,$2,'未知问题',.38,$3,'知识库暂无可靠答案','normal',$4,$5,$5)", [tk,s,"用户问题：" + c[0] + "；追问：" + c[1],st,at(n)]);
  await q("insert into knowledge_gaps (id,question,count,status,created_at,updated_at) values ($1,$2,$3,'open',$4,$4)", ["GAP_HQ" + String(n).padStart(3,"0"),c[0],c[2],at(n)]);
  n++;
}
const r = await q("select (select count(*) from sessions) sessions,(select count(*) from messages) messages,(select count(*) from tickets) tickets,(select count(*) from ticket_replies) replies,(select count(*) from ratings) ratings,(select count(*) from refunds) refunds,(select count(*) from knowledge_gaps) gaps");
console.log(JSON.stringify(r.rows[0]));
await pool.end();
`