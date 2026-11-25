# 云端小时任务怎么跑通

主路径是 **GitHub Actions 每天 4 轮直接跑脚本**（北京时间 00:23、06:23、12:23、18:23）。不要依赖 Cursor Automations 的 Agent 对话：那种方式常标 Succeeded，但云端没有 `FEISHU_*` 时 `node run-hourly.js` 会直接失败，表格填不上。

Cursor 云端没有本机的 `lark-cli` 登录。脚本用**飞书企业自建应用**调开放接口写多维表格。

## 1. 做一个飞书应用并给表格权限

1. 打开 [飞书开放平台](https://open.feishu.cn/app)，创建企业自建应用（或用已有应用，例如 cursor辅助机）。
2. 开通并发布权限，至少包括多维表格记录的读和写。
3. 打开绑定表，把该**应用**加成协作者，权限至少「可编辑」。只给个人账号可编辑不够，云端用的是应用身份。
4. 记下 App ID 和 App Secret。不要写进 Git。

## 2. 把密钥交给 GitHub Actions

打开仓库 [Settings → Secrets and variables → Actions](https://github.com/wangwendy2233-dev/large-profit-order-recognition/settings/secrets/actions)，添加：

- `FEISHU_APP_ID`
- `FEISHU_APP_SECRET`

值与飞书「凭证与基础信息」里的 App ID / App Secret 相同。不要发到聊天里。

（可选）若要让 Cursor Cloud Agent / Automation 也能直接跑脚本，把同样两个名字加到 [Cloud Agents → Secrets](https://cursor.com/dashboard/cloud-agents)，类型用 Runtime Secret；已在跑的 Agent 不会自动拿到新密钥，需要新开一轮。

## 3. 打开并试跑工作流

若 Actions 里工作流显示 Disabled，先点 **Enable workflow**，再 **Run workflow**。本仓库的旧 **Hourly OCR** 曾被手动关掉；合并后请使用 **Scheduled OCR**（`.github/workflows/scheduled-ocr.yml`）。

1. 打开 [Actions](https://github.com/wangwendy2233-dev/large-profit-order-recognition/actions)。
2. 左侧点 **Scheduled OCR**。
3. 点 **Run workflow**（选 `master`）立刻试一轮（可清空待填 backlog）。
4. 成功时日志里应出现 `feishu auth: app (open api)`，有待填时会打印 `pending batch`。
5. 定时为北京时间每天 4 次：**00:23、06:23、12:23、18:23**（GitHub cron 用 UTC：`23 16/22/4/10 * * *`）。分钟用 23 以躲开整点高峰。新 schedule 前几小时仍可能漏跑，以 Actions 列表里出现 **Scheduled** 为准。

若 Actions 是灰的，先在 Settings → Actions → General 里允许该仓库运行 workflows。

## 4. 关掉 Cursor 那个空转任务

打开 [Automations](https://cursor.com/automations) → **牛牛大额晒单 OCR 每六小时**，若未给 Cloud Agents 配 `FEISHU_*`，请把开关打成 **Inactive**。它仍会「成功」起 Agent，但写不了表，还会占额度。

本机调试可把同样两个变量放进项目根目录 `.env`（已加入 .gitignore），或继续用 `lark-cli`。

## 5. 怎么判断修好了

- GitHub Actions 里 Scheduled OCR 最新一轮是绿色，时长通常超过 1 分钟（有待填时）。
- 待填视图对应记录被填上。
