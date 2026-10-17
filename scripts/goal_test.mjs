// Goal-exit test for "Trial nurture — FieldFlow", timed by the clock (run 1 showed
// contact email properties update in batches, so they can't time a step).
// Run right after the test contact is re-enrolled:
//   1. ensure Demo requested = false   2. wait 60 s (Email 1 out, Email 2 due at +2 min)
//   3. set Demo requested = true        4. wait 5 min and check Email 2 never arrived
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const TOKEN = (readFileSync("C:/tools/hubspot_fieldflow_token.txt", "utf8").split(/\r?\n/).find((l) => l.startsWith("pat-")) ?? "").trim();
const ID = "892205173960";
const H = { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const props = async () => (await (await fetch(`https://api.hubapi.com/crm/v3/objects/contacts/${ID}?properties=hs_email_delivered,hs_email_last_email_name,ff_demo_requested`, { headers: H })).json()).properties;
const log = [];
const note = (m) => { const l = `${new Date().toISOString()} ${m}`; log.push(l); console.log(l); };

const start = await props();
note(`start: delivered=${start.hs_email_delivered} last="${start.hs_email_last_email_name}" demo=${start.ff_demo_requested}`);
await sleep(60000);
const r = await fetch(`https://api.hubapi.com/crm/v3/objects/contacts/${ID}`, { method: "PATCH", headers: H, body: JSON.stringify({ properties: { ff_demo_requested: "true" } }) });
note(`+60s: set Demo requested = true (HTTP ${r.status})`);
await sleep(5 * 60000);
const end = await props();
const sent = Number(end.hs_email_delivered) - Number(start.hs_email_delivered);
note(`+6m: delivered=${end.hs_email_delivered} (+${sent} since start) last="${end.hs_email_last_email_name}"`);
note(sent <= 1 ? "PASS: only Email 1 went out; the goal unenrolled the contact before Email 2" : `CHECK: ${sent} emails since start; confirm in the action log whether Email 2 was sent`);
writeFileSync(join(ROOT, "data", "goal_test.json"), JSON.stringify({ log, start, end }, null, 2));
