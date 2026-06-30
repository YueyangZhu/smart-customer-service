const API_BASE = import.meta.env.VITE_API_BASE || "";

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...options.headers }
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.message || "服务暂时不可用，请稍后重试");
  return body;
}

export const api = {
  createSession: () => request("/api/sessions", { method: "POST" }),
  sendMessage: async (payload, onProgress = () => {}, options = {}) => {
    if (options.mode === "agent") {
      onProgress({ phase: "saving", intent: "等待人工", confidence: 1, source: "人工客服", action: "同步到工单", riskLevel: "medium" });
      return request("/api/chat", { method: "POST", body: JSON.stringify(payload) });
    }

    onProgress({ phase: "submitting", intent: "正在接收问题", confidence: null, source: "消息通道", action: "保存用户消息", riskLevel: "" });
    const pending = request("/api/chat", { method: "POST", body: JSON.stringify(payload) });
    onProgress({ phase: "understanding", intent: "正在识别意图", confidence: null, source: "业务规则", action: "分析意图与风险", riskLevel: "" });
    onProgress({ phase: "generating", intent: "正在生成回复", confidence: null, source: "售后服务 API", action: "组织最终回复", riskLevel: "" });
    const result = await pending;
    onProgress({ phase: "saving", intent: "回复已生成", confidence: null, source: "业务系统", action: "保存结果", riskLevel: "" });
    return result;
  },
  getSession: (id) => request(`/api/sessions/${id}`),
  submitRefund: (payload) => request("/api/refunds", { method: "POST", body: JSON.stringify(payload) }),
  submitRating: (payload) => request("/api/ratings", { method: "POST", body: JSON.stringify(payload) }),
  listTickets: () => request("/api/agent/tickets"),
  claimTicket: (id) => request(`/api/agent/tickets/${id}/claim`, { method: "POST" }),
  replyTicket: (id, content) => request(`/api/agent/tickets/${id}/reply`, { method: "POST", body: JSON.stringify({ content }) }),
  closeTicket: (id) => request(`/api/agent/tickets/${id}/close`, { method: "POST" }),
  dashboard: (payload = {}) => request(`/api/dashboard?from=${encodeURIComponent(payload.from || "")}&to=${encodeURIComponent(payload.to || "")}`),
  exportData: (payload = {}) => request(`/api/export?from=${encodeURIComponent(payload.from || "")}&to=${encodeURIComponent(payload.to || "")}`)
};
