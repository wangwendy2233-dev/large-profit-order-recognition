/**
 * Process pending OCR view: download share images, OCR, parse max P/L, upsert.
 *   node process-pending.js
 */
const https = require("https");
const fs = require("fs");
const path = require("path");
const { createWorker } = require("tesseract.js");
const { assertReady, listRecords, updateRecord } = require("./feishu-bitable");

const PENDING_VIEW = "vewsLlN2YJ";
const IMG_DIR = path.join(__dirname, "imgs");
const BATCH = Number(process.env.BATCH || 15);
const MAX_IMAGES = 6;

fs.mkdirSync(IMG_DIR, { recursive: true });

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function getBuf(url) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = https.request(
      {
        hostname: u.hostname,
        path: u.pathname + u.search,
        method: "GET",
        headers: {
          "User-Agent": "Mozilla/5.0",
          Accept: "application/json,image/*,*/*",
          Referer: "https://q.futunn.com/",
        },
      },
      (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return getBuf(new URL(res.headers.location, url).toString()).then(resolve, reject);
        }
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => resolve({ status: res.statusCode, buf: Buffer.concat(chunks) }));
      },
    );
    req.on("error", reject);
    req.setTimeout(25000, () => req.destroy(new Error("timeout")));
    req.end();
  });
}

async function getJson(url) {
  const r = await getBuf(url);
  return JSON.parse(r.buf.toString("utf8"));
}

function extractImages(detail) {
  const data = detail && detail.data && detail.data.data;
  const modules = (data && data.moduleData) || [];
  const images = [];
  for (const m of modules) {
    if (m && m.type === 1 && m.display && m.display.url) images.push(m.display.url);
  }
  return { title: (data && data.feedTitle) || "", images: [...new Set(images)] };
}

async function listPending(limit) {
  const page = await listRecords({
    viewId: PENDING_VIEW,
    fieldKeys: ["feedId"],
    pageSize: limit,
  });
  const items = page.items
    .map((row) => ({ record_id: row.record_id, feedId: row.fields.feedId }))
    .filter((row) => row.feedId);
  return { items, has_more: page.has_more };
}

async function upsert(recordId, fields) {
  await updateRecord(recordId, fields);
}

function parseNumber(raw) {
  return Number(String(raw).replace(/,/g, "").replace(/[+\s$]/g, ""));
}

function detectCurrency(text) {
  if (/港元|港幣|港币|\bHKD\b|HK\$/i.test(text)) return "HKD";
  if (/美元|\bUSD\b|(?<![A-Z])US\$/i.test(text)) return "USD";
  if (/人民币|人民幣|\bCNY\b|\bCNH\b|人民币元/.test(text)) return "CNY";
  if (/\bSGD\b|新加坡元/.test(text)) return "SGD";
  if (/\bJPY\b|日元/.test(text)) return "JPY";
  if (/\bAUD\b|澳元/.test(text)) return "AUD";
  if (/\bMYR\b|令吉/.test(text)) return "MYR";
  if (/\bGBP\b|英镑|英鎊/.test(text)) return "GBP";
  if (/\bEUR\b|欧元|歐元/.test(text)) return "EUR";
  if (/\bCAD\b|加元/.test(text)) return "CAD";
  return "";
}

function parseProfit(text) {
  const compact = text.replace(/[|]/g, " ");
  const currency = detectCurrency(compact);
  const candidates = [];

  const labeledRe =
    /(今日證券盈虧金額|今日证券盈亏金额|證券持倉總盈虧|证券持仓总盈亏|Today'?s Total Securities P\/L|持仓盈亏(?!比例)|持倉盈虧(?!比例)|累[計计]盈[虧亏]|月收益|8月收益)[^\d+\-]{0,24}([+\-]?\s*\$?\s*\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?)/gi;
  let m;
  while ((m = labeledRe.exec(compact))) {
    const value = parseNumber(m[2]);
    if (Number.isFinite(value)) candidates.push({ value, score: 100 });
  }

  const amountCcyRe =
    /([+\-]?)\s*(\d{1,3}(?:,\d{3})+(?:\.\d{2})?)\s*(港元|美元|人民币|人民幣|HKD|USD|CNY)/gi;
  while ((m = amountCcyRe.exec(compact))) {
    const around = compact.slice(Math.max(0, m.index - 18), m.index);
    if (/比例|收益率|換手|换手|市盈/.test(around)) continue;
    const value = parseNumber(m[1] + m[2]);
    if (Number.isFinite(value) && Math.abs(value) >= 100) {
      candidates.push({ value, score: 90, currencyHint: m[3] });
    }
  }

  const signedLargeRe = /([+\-])\s*\$?\s*(\d{1,3}(?:,\d{3}){1,}(?:\.\d{2})?)/g;
  while ((m = signedLargeRe.exec(compact))) {
    const around = compact.slice(Math.max(0, m.index - 22), m.index + m[0].length + 8);
    if (/比例|%|成交额|成交額|市值|成交量/.test(around)) continue;
    const value = parseNumber(m[1] + m[2]);
    if (Number.isFinite(value) && Math.abs(value) >= 1000) {
      candidates.push({ value, score: 60 });
    }
  }

  const profits = candidates.filter((c) => c.value > 0);
  if (!profits.length) {
    return { amount: null, currency };
  }
  profits.sort((a, b) => b.score - a.score || b.value - a.value);
  const bestSameScore = profits.filter((c) => c.score === profits[0].score);
  const maxVal = Math.max(...bestSameScore.map((c) => c.value));
  let ccy = currency;
  const hint = bestSameScore.find((c) => c.currencyHint);
  if (hint) {
    const map = { 港元: "HKD", 美元: "USD", 人民币: "CNY", 人民幣: "CNY", HKD: "HKD", USD: "USD", CNY: "CNY" };
    ccy = map[hint.currencyHint] || ccy;
  }
  return { amount: Math.round(maxVal), currency: ccy };
}

function listPendingAllPage() {
  return listPending(BATCH);
}

async function processOne(worker, rec) {
  const ocrParts = [];
  let error = "";
  try {
    const detail = await getJson("https://q.futunn.com/v2/api/feed/detail?feedId=" + rec.feedId);
    const extracted = extractImages(detail);
    if (extracted.title) ocrParts.push("标题:" + extracted.title);
    const images = extracted.images.slice(0, MAX_IMAGES);
    if (!images.length) {
      return { text: "[无晒单图]", amount: null, currency: "" };
    }
    for (let i = 0; i < images.length; i++) {
      const dest = path.join(IMG_DIR, rec.feedId + "_" + i + ".jpg");
      if (!fs.existsSync(dest) || fs.statSync(dest).size < 800) {
        const img = await getBuf(images[i]);
        fs.writeFileSync(dest, img.buf);
      }
      if (fs.statSync(dest).size < 800) continue;
      const { data } = await worker.recognize(dest);
      const t = (data.text || "").trim();
      if (t) ocrParts.push((images.length > 1 ? "图" + (i + 1) + " " : "") + t);
    }
  } catch (e) {
    error = String(e.message || e).slice(0, 120);
  }
  const text = ocrParts.join("\n").trim() || (error ? "[识别失败] " + error : "[无晒单图]");
  const parsed = parseProfit(text);
  return { text: text.slice(0, 19000), amount: parsed.amount, currency: parsed.currency };
}

(async () => {
  assertReady();
  const worker = await createWorker("chi_sim+eng");
  let processed = 0;
  try {
    while (true) {
      const page = await listPendingAllPage();
      if (!page.items.length) {
        console.log("pending empty, done. processed", processed);
        break;
      }
      console.log("pending batch", page.items.length, "has_more", page.has_more);
      for (const rec of page.items) {
        const result = await processOne(worker, rec);
        const fields = { ocr: result.text };
        if (result.amount != null) fields.amount = result.amount;
        if (result.currency) fields.currency = result.currency;
        await upsert(rec.record_id, fields);
        processed += 1;
        console.log(
          processed,
          rec.feedId,
          result.currency || "-",
          result.amount ?? "-",
          result.text.slice(0, 60).replace(/\s+/g, " "),
        );
        await sleep(700);
      }
      if (!page.has_more && page.items.length < BATCH) {
        // one more loop to confirm empty
      }
    }
  } finally {
    await worker.terminate();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
