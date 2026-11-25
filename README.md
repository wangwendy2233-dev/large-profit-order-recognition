# 牛牛大额晒单 OCR

定时识别飞书多维表格「大额晒单挖掘」内容链接中的晒单图，回填：

- 图片文字金额提取
- 盈利金额（图上最大明确盈利数字）
- 币种

表：https://futu.feishu.cn/base/I3hNbrRyYaKOdYs8RjocZ56hnbe?table=tbl6BYuFM3M5eOWD&view=vewjKxVQrh

主路径是 **GitHub Actions 每天 4 轮**（北京时间 00:23、06:23、12:23、18:23，关机也能跑；工作流名 **Scheduled OCR**）。不要用 Cursor Automations 的 Agent 对话当主路径：未配 `FEISHU_*` 时会空转失败。本机 Windows 任务可作备份。

## 环境

云端用飞书应用凭证调开放接口。配置步骤见 [CLOUD.md](./CLOUD.md)。

本机若已登录 `lark-cli`，不配应用凭证也可以直接跑。

```powershell
npm install
node run-hourly.js
```

安装本机每小时任务：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\install-hourly-task.ps1
```

卸载：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\uninstall-hourly-task.ps1
```

日志：`logs/hourly.log`

## 代码仓库

- 云端检出：https://github.com/wangwendy2233-dev/large-profit-order-recognition （`master`）
- GitLab 备份：https://gitlab.futunn.com/wendyjwang/large-profit-order-recognition
