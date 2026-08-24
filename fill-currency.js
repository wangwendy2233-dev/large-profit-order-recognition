const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const BASE = "I3hNbrRyYaKOdYs8RjocZ56hnbe";
const TABLE = "tbl6BYuFM3M5eOWD";
const VIEW = "vewjKxVQrh";

function lark(args) {
  const quoted = args.map((a) => `"${String(a).replace(/"/g, '\\"')}"`).join(" ");
  const r = spawnSync("lark-cli " + quoted, {
    encoding: "utf8",
    shell: true,
    cwd: __dirname,
    windowsHide: true,
    maxBuffer: 20 * 1024 * 1024,
  });
  const text = (r.stdout || "").trim();
  if (!text) throw new Error((r.stderr || "empty").slice(0, 400));
  const parsed = JSON.parse(text);
  if (parsed.ok === false) throw new Error(JSON.stringify(parsed.error || parsed).slice(0, 400));
  return parsed;
}

function detectCurrency(text) {
  const t = String(text || "");
  if (/港元|港幣|港币|\bHKD\b|HK\$/.test(t)) return "HKD";
  if (/美元|\bUSD\b|US\$/.test(t)) return "USD";
  if (/人民币|人民幣|\bCNY\b/.test(t)) return "CNY";
  if (/\bCALL\b|\bPUT\b|美股|NASDAQ/.test(t)) return "USD";
  if (/恒指|港股/.test(t)) return "HKD";
  if (/A股/.test(t)) return "CNY";
  if (/\bSGD\b/.test(t)) return "SGD";
  if (/\bJPY\b|日元/.test(t)) return "JPY";
  return "";
}

function sleep(ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) {}
}

let offset = 0;
let filled = 0;
while (true) {
  const parsed = lark([
    "base",
    "+record-list",
    "--as",
    "user",
    "--base-token",
    BASE,
    "--table-id",
    TABLE,
    "--view-id",
    VIEW,
    "--format",
    "json",
    "--offset",
    String(offset),
    "--limit",
    "50",
    "--field-id",
    "fldsdHgXlB",
    "--field-id",
    "fldeFFQGVq",
    "--field-id",
    "fld9r4341E",
  ]);
  const p = parsed.data;
  for (let i = 0; i < p.record_id_list.length; i++) {
    const ocr = p.data[i][0];
    const amt = p.data[i][1];
    const ccy = p.data[i][2];
    if (amt != null && amt !== "" && !ccy) {
      const inferred = detectCurrency(ocr);
      if (inferred) {
        const file = path.join(__dirname, "_patch.json");
        fs.writeFileSync(file, JSON.stringify({ fld9r4341E: inferred }));
        lark([
          "base",
          "+record-upsert",
          "--as",
          "user",
          "--base-token",
          BASE,
          "--table-id",
          TABLE,
          "--record-id",
          p.record_id_list[i],
          "--json",
          "@./_patch.json",
        ]);
        filled += 1;
        console.log("ccy", p.record_id_list[i], inferred, amt);
        sleep(700);
      }
    }
  }
  offset += p.record_id_list.length;
  console.log("scanned", offset, "has_more", p.has_more);
  if (!p.has_more) break;
}
console.log("filled currency", filled);
