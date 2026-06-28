# customer-service-api

CloudBase 单入口云函数。通过 action 分发请求，避免个人版 3 秒超时限制。

必需环境变量：

- COZE_BOT_ID
- COZE_API_TOKEN

部署后首先调用 seed，写入 3 条模拟订单。
