/**
 * Feishu Bitable access for OCR jobs.
 * Prefers app credentials (works in Cursor cloud). Falls back to lark-cli --as user locally.
 */
const https = require("https");
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const BASE = "I3hNbrRyYaKOdYs8RjocZ56hnbe";
const TABLE = "tbl6BYuFM3M5eOWD";

const FIELD = {
  feedId: { id: "flduHDNEtQ", name: "Feed id", aliases: ["Feed Id"] },
  ocr: { id: "fldsdHgXlB", name: "图片文字金额提取" },
  amount: { id: "fldeFFQGVq", name: "盈利金额" },
  currency: { id: "fld9r4341E", name: "币种" },
};

function loadDotEnv() {
  const file = path.join(__dirname, ".env");
  if (!fs.existsSync(file)) return;
  for (const raw of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 1) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}

loadDotEnv();

function appId() {
  return process.env.FEISHU_APP_ID || process.env.LARK_APP_ID || "";
}

function appSecret() {
  return process.env.FEISHU_APP_SECRET || process.env.LARK_APP_SECRET || "";
}

function hasAppCreds() {
  return Boolean(appId() && appSecret());
}

function hasLarkCli() {
  const r = spawnSync("lark-cli --version", {
    encoding: "utf8",
    shell: true,
    windowsHide: true,
    timeout: 8000,
  });
  return r.status === 0;
}

function requestJson({ hostname, urlPath, method, headers, body }) {
  return new Promise((resolve, reject) => {
    const payload = body == null ? null : Buffer.from(JSON.stringify(body), "utf8");
    const req = https.request(
      {
        hostname,
        path: urlPath,
        method,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          ...(payload ? { "Content-Length": String(payload.length) } : {}),
          ...headers,
        },
      },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          let json;
          try {
            json = JSON.parse(text);
          } catch {
            reject(new Error("bad json " + res.statusCode + " " + text.slice(0, 240)));
            return;
          }
          resolve({ status: res.statusCode, json });
        });
      },
    );
    req.on("error", reject);
    req.setTimeout(30000, () => req.destroy(new Error("timeout")));
    if (payload) req.write(payload);
    req.end();
  });
}

let cachedToken = { value: "", exp: 0 };

async function tenantToken() {
  const now = Date.now();
  if (cachedToken.value && now < cachedToken.exp) return cachedToken.value;
  const { json } = await requestJson({
    hostname: "open.feishu.cn",
    urlPath: "/open-apis/auth/v3/tenant_access_token/internal",
    method: "POST",
    body: { app_id: appId(), app_secret: appSecret() },
  });
  if (!json || json.code !== 0 || !json.tenant_access_token) {
    throw new Error("feishu tenant token failed: " + JSON.stringify(json).slice(0, 400));
  }
  cachedToken = {
    value: json.tenant_access_token,
    exp: now + Math.max(60, (json.expire || 7200) - 120) * 1000,
  };
  return cachedToken.value;
}

async function openApi({ method, urlPath, body }) {
  const token = await tenantToken();
  const { json } = await requestJson({
    hostname: "open.feishu.cn",
    urlPath,
    method,
    headers: { Authorization: "Bearer " + token },
    body,
  });
  if (!json || json.code !== 0) {
    throw new Error("feishu api " + urlPath + " " + JSON.stringify(json).slice(0, 500));
  }
  return json.data;
}

function unwrap(value) {
  if (value == null || value === "") return null;
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    const parts = value
      .map((x) => (x && typeof x === "object" && typeof x.text === "string" ? x.text : unwrap(x)))
      .filter((x) => x != null && x !== "");
    return parts.length ? parts.join("") : null;
  }
  if (typeof value === "object") {
    if (typeof value.text === "string") return value.text;
    if (typeof value.value === "number") return value.value;
  }
  return value;
}

function fieldValue(fields, spec) {
  if (!fields) return null;
  const keys = [spec.id, spec.name].concat(spec.aliases || []);
  for (const k of keys) {
    if (fields[k] != null && fields[k] !== "") return unwrap(fields[k]);
  }
  return null;
}

function larkCli(args) {
  const quoted = args.map((a) => `"${String(a).replace(/"/g, '\\"')}"`).join(" ");
  const r = spawnSync("lark-cli " + quoted, {
    encoding: "utf8",
    shell: true,
    cwd: __dirname,
    windowsHide: true,
    maxBuffer: 20 * 1024 * 1024,
  });
  const text = (r.stdout || "").trim();
  if (!text) throw new Error((r.stderr || "empty lark").slice(0, 400));
  const parsed = JSON.parse(text);
  if (parsed.ok === false) throw new Error(JSON.stringify(parsed.error || parsed).slice(0, 500));
  return parsed;
}

function useApp() {
  return hasAppCreds();
}

function assertReady() {
  if (hasAppCreds()) {
    console.log("feishu auth: app (open api)");
    return;
  }
  if (hasLarkCli()) {
    console.log("feishu auth: lark-cli --as user");
    return;
  }
  throw new Error(
    "No Feishu credentials. For GitHub Actions, add repository secrets FEISHU_APP_ID and FEISHU_APP_SECRET, and invite that Feishu app to the Bitable with edit access. Locally you can instead login with lark-cli, or put the same keys in a .env file.",
  );
}

async function listRecords({ viewId, fieldKeys, pageSize, pageToken, offset }) {
  if (useApp()) {
    const names = fieldKeys.map((k) => FIELD[k].name);
    const qs = new URLSearchParams({ page_size: String(pageSize || 20) });
    if (pageToken) qs.set("page_token", pageToken);
    const data = await openApi({
      method: "POST",
      urlPath: `/open-apis/bitable/v1/apps/${BASE}/tables/${TABLE}/records/search?${qs.toString()}`,
      body: { view_id: viewId, field_names: names },
    });
    const items = (data.items || []).map((row) => {
      const fields = row.fields || {};
      const out = { record_id: row.record_id, fields: {} };
      for (const k of fieldKeys) out.fields[k] = fieldValue(fields, FIELD[k]);
      return out;
    });
    return { items, has_more: Boolean(data.has_more), page_token: data.page_token || "" };
  }

  const args = [
    "base",
    "+record-list",
    "--as",
    "user",
    "--base-token",
    BASE,
    "--table-id",
    TABLE,
    "--view-id",
    viewId,
    "--format",
    "json",
    "--limit",
    String(pageSize || 20),
  ];
  if (offset) {
    args.push("--offset", String(offset));
  }
  for (const k of fieldKeys) {
    args.push("--field-id", FIELD[k].id);
  }
  const parsed = larkCli(args);
  const payload = parsed.data;
  const items = [];
  for (let i = 0; i < payload.record_id_list.length; i++) {
    const row = payload.data[i] || [];
    const fields = {};
    fieldKeys.forEach((k, idx) => {
      fields[k] = row[idx] == null || row[idx] === "" ? null : row[idx];
    });
    items.push({ record_id: payload.record_id_list[i], fields });
  }
  return { items, has_more: Boolean(payload.has_more), page_token: "" };
}

async function updateRecord(recordId, patch) {
  const fields = {};
  for (const [key, value] of Object.entries(patch)) {
    if (value == null || value === "") continue;
    const spec = FIELD[key];
    if (!spec) continue;
    fields[spec.name] = value;
  }
  if (!Object.keys(fields).length) return;

  if (useApp()) {
    await openApi({
      method: "PUT",
      urlPath: `/open-apis/bitable/v1/apps/${BASE}/tables/${TABLE}/records/${recordId}`,
      body: { fields },
    });
    return;
  }

  const byId = {};
  for (const [key, value] of Object.entries(patch)) {
    if (value == null || value === "") continue;
    const spec = FIELD[key];
    if (spec) byId[spec.id] = value;
  }
  const file = path.join(__dirname, "_patch.json");
  fs.writeFileSync(file, JSON.stringify(byId), "utf8");
  larkCli([
    "base",
    "+record-upsert",
    "--as",
    "user",
    "--base-token",
    BASE,
    "--table-id",
    TABLE,
    "--record-id",
    recordId,
    "--json",
    "@./_patch.json",
  ]);
}

module.exports = {
  BASE,
  TABLE,
  FIELD,
  assertReady,
  usesAppAuth: hasAppCreds,
  listRecords,
  updateRecord,
};
