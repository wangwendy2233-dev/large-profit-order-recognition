# 云端小时任务怎么跑通

Cursor 云端没有本机的 `lark-cli` 登录。脚本用**飞书企业自建应用**调开放接口写多维表格。

## 1. 做一个飞书应用并给表格权限

1. 打开 [飞书开放平台](https://open.feishu.cn/app)，创建企业自建应用（或用已有应用）。
2. 开通并发布权限，至少包括多维表格记录的读和写（如 `bitable:app`、记录读写相关 scope）。
3. 打开绑定表，把该**应用**加成协作者，权限至少「可编辑」。只给个人账号可编辑不够，云端用的是应用身份。
4. 记下 App ID 和 App Secret。不要写进 Git。

## 2. 把密钥交给 Cursor 云端

打开 [Cloud Agents](https://cursor.com/dashboard/cloud-agents)，在 Secrets 里添加（建议类型选 **Runtime Secret**）：

- `FEISHU_APP_ID`
- `FEISHU_APP_SECRET`

范围覆盖仓库 `wangwendy2233-dev/large-profit-order-recognition`。

本机调试可把同样两个变量放进项目根目录 `.env`（已加入 .gitignore）。

## 3. 云端 Automations 指令

每小时必须真正执行，不要只读代码就结束：

```
Checkout this repo on master. Run: npm install && node run-hourly.js
Do not finish as success unless the command exits 0. If it errors about missing FEISHU_APP_ID / FEISHU_APP_SECRET or bitable permission, report the error; do not invent OCR amounts.
```

## 4. 怎么判断修好了

Run History 里单轮应明显长于 1 分钟（有待填记录时）。待填视图对应记录应被填上。
