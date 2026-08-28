# 云端小时任务怎么跑通

主路径是 **GitHub Actions 每小时直接跑脚本**。不再走 Cursor Automations 里的 Agent 对话：那种方式会标 Succeeded，但经常不执行 `node run-hourly.js`，表格也就填不上。

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

## 3. 打开并试跑工作流

1. 打开 [Actions](https://github.com/wangwendy2233-dev/large-profit-order-recognition/actions)。
2. 左侧点 **Hourly OCR**。
3. 点 **Run workflow**（选 `master`）立刻试一轮。
4. 成功时日志里应出现 `feishu auth: app (open api)`，有待填时会打印 `pending batch`。
5. 定时为每小时一次（GitHub 用 UTC，可能比整点晚几分钟）。

若 Actions 是灰的，先在 Settings → Actions → General 里允许该仓库运行 workflows。

## 4. 关掉 Cursor 那个空转任务

打开 [Automations](https://cursor.com/automations) → **牛牛大额晒单 OCR 每小时**，把开关打成 **Inactive**。它每小时仍会「成功」约 1 分钟，但不写表，还会占额度。

本机调试可把同样两个变量放进项目根目录 `.env`（已加入 .gitignore），或继续用 `lark-cli`。

## 5. 怎么判断修好了

- GitHub Actions 里 Hourly OCR 最新一轮是绿色，时长通常超过 1 分钟（有待填时）。
- 待填视图对应记录被填上。
