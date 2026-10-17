// Live test of "Trial nurture — FieldFlow" on the test contact:
// follow hs_email_last_email_name; when Email 4 is recorded, set Demo requested =
// true (the workflow goal) and confirm Email 5 is never sent. Writes data/nurture_run.json.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const TOKEN = (readFileSync("C:/tools/hubspot_fieldflow_token.txt", "utf8").split(/\r?\n/).find((l) => l.startsWith("pat-")) ?? "").trim();
const ID = "892205173960";
const H = { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" };
const PROPS = ["hs_email_last_email_name", "hs_email_last_send_date", "hs_email_delivered", "hs_email_open", "hs_email_click", "ff_demo_requested", "lifecyclestage"];
const read = async () => (await fetch(`https://api.hubapi.com/crm/v3/objects/contacts/${ID}?properties=${PROPS.join(",")}&propertiesWithHistory=hs_email_last_email_name,ff_demo_requested`, { headers: H })).json();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = [];
const note = (m) => { const line = `${new Date().toISOString()} ${m}`; log.push(line); console.log(line); };

note("monitor started");
let flippedAt = null, last = "";
const deadline = Date.now() + 25 * 60000;
while (Date.now() < deadline) {
  const c = await read();
  const name = c.properties?.hs_email_last_email_name ?? "";
  if (name !== last) { note(`last email: "${name}" (delivered count ${c.properties.hs_email_delivered ?? 0})`); last = name; }
  if (!flippedAt && /Email 4/i.test(name)) {
    const r = await fetch(`https://api.hubapi.com/crm/v3/objects/contacts/${ID}`, { method: "PATCH", headers: H, body: JSON.stringify({ properties: { ff_demo_requested: "true" } }) });
    flippedAt = Date.now(); note(`Email 4 recorded → set Demo requested = true (HTTP ${r.status}); now expecting NO Email 5`);
  }
  if (/Email 5/i.test(name)) { note("FAIL: Email 5 was sent after the goal was met"); break; }
  if (flippedAt && Date.now() - flippedAt > 6 * 60000) { note("PASS: 6 min after goal, no Email 5 (Email 5 was due ~3 min after Email 4)"); break; }
  await sleep(20000);
}
const final = await read();
writeFileSync(join(ROOT, "data", "nurture_run.json"), JSON.stringify({ log, emailHistory: final.propertiesWithHistory?.hs_email_last_email_name ?? [], demoHistory: final.propertiesWithHistory?.ff_demo_requested ?? [], final: final.properties }, null, 2));
note("saved data/nurture_run.json");
