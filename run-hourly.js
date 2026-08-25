/**
 * One hourly pass: OCR pending rows, then backfill currency.
 *   node run-hourly.js
 */
const { spawn } = require("child_process");
const path = require("path");
const { assertReady } = require("./feishu-bitable");

function run(file) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [file], {
      cwd: __dirname,
      stdio: "inherit",
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(file + " exited " + code));
    });
  });
}

(async () => {
  assertReady();
  await run(path.join(__dirname, "process-pending.js"));
  await run(path.join(__dirname, "fill-currency.js"));
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
