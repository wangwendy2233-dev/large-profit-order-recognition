const { assertReady, listRecords, updateRecord, usesAppAuth } = require("./feishu-bitable");

const VIEW = "vewjKxVQrh";

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
  return new Promise((r) => setTimeout(r, ms));
}

(async () => {
  assertReady();
  let pageToken = "";
  let offset = 0;
  let filled = 0;
  while (true) {
    const page = await listRecords({
      viewId: VIEW,
      fieldKeys: ["ocr", "amount", "currency"],
      pageSize: 50,
      pageToken,
      offset,
    });
    for (const rec of page.items) {
      const ocr = rec.fields.ocr;
      const amt = rec.fields.amount;
      const ccy = rec.fields.currency;
      if (amt != null && amt !== "" && !ccy) {
        const inferred = detectCurrency(ocr);
        if (inferred) {
          await updateRecord(rec.record_id, { currency: inferred });
          filled += 1;
          console.log("ccy", rec.record_id, inferred, amt);
          await sleep(700);
        }
      }
    }
    offset += page.items.length;
    console.log("scanned", offset, "has_more", page.has_more);
    if (!page.has_more) break;
    if (usesAppAuth()) {
      if (!page.page_token) throw new Error("list has_more but no page_token");
      pageToken = page.page_token;
    }
  }
  console.log("filled currency", filled);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
