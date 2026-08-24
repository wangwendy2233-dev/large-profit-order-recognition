# 牛牛大额晒单 OCR

定时识别飞书多维表格「大额晒单挖掘」内容链接中的晒单图，回填：

- 图片文字金额提取
- 盈利金额（图上最大明确盈利数字）
- 币种

表：https://futu.feishu.cn/base/I3hNbrRyYaKOdYs8RjocZ56hnbe?table=tbl6BYuFM3M5eOWD&view=vewjKxVQrh

## 环境

- Node.js
- 已登录的 `lark-cli`（`--as user`）
- Windows 计划任务（每小时跑一轮）

```powershell
npm install
node process-pending.js
```

安装每小时任务：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\install-hourly-task.ps1
```

卸载：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\uninstall-hourly-task.ps1
```

日志：`logs/hourly.log`

电脑休眠时可唤醒执行；完全关机后本机任务不会运行。
