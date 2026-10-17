// Compare HubSpot's computed fieldflow_lead_score / _threshold on every contact
// with the model in score_model.mjs (same rules, recomputed independently from
// the record's own properties). Writes data/score_verification.json.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const TOKEN = (readFileSync("C:/tools/hubspot_fieldflow_token.txt", "utf8").split(/\r?\n/).find((l) => l.startsWith("pat-")) ?? "").trim();
const get = async (p) => (await fetch("https://api.hubapi.com" + p, { headers: { Authorization: `Bearer ${TOKEN}` } })).json();

const props = ["firstname", "lastname", "email", "lifecyclestage", "ff_import_ref", "ff_seniority_bucket", "ff_demo_requested", "ff_product_activated", "ff_trial_status", "ff_pricing_page_views", "ff_webinar_attended", "fieldflow_lead_score", "fieldflow_lead_score_threshold"];
const contacts = []; let after;
do { const p = await get(`/crm/v3/objects/contacts?limit=100&properties=${props.join(",")}&associations=companies${after ? `&after=${after}` : ""}`); contacts.push(...p.results); after = p.paging?.next?.after; } while (after);
const companies = new Map(); after = undefined;
do { const p = await get(`/crm/v3/objects/companies?limit=100&properties=numberofemployees,ff_vertical${after ? `&after=${after}` : ""}`); for (const c of p.results) companies.set(c.id, c); after = p.paging?.next?.after; } while (after);

const CORE = ["HVAC", "Plumbing", "Electrical"];
const model = (c) => {
  const p = c.properties, k = companies.get(c.associations?.companies?.results?.[0]?.id)?.properties ?? {};
  let s = { "Owner/Executive": 20, Manager: 12, Staff: 3 }[p.ff_seniority_bucket] ?? 0;
  if (k.numberofemployees) { const n = Number(k.numberofemployees); s += n >= 200 ? 8 : n >= 50 ? 15 : n >= 10 ? 10 : 3; }
  if (k.ff_vertical) s += CORE.includes(k.ff_vertical) ? 10 : 5;
  if (/@(gmail|yahoo|outlook|hotmail|icloud|aol)\.com$/i.test(p.email ?? "")) s -= 10;
  if (p.ff_demo_requested === "true") s += 25;
  if (p.ff_product_activated === "true") s += 20;
  s += { Active: 15, Expired: 5 }[p.ff_trial_status] ?? 0;
  const pv = Number(p.ff_pricing_page_views ?? 0); s += pv >= 3 ? 10 : pv >= 1 ? 5 : 0;
  if (p.ff_webinar_attended === "true") s += 5;
  return Math.max(-100, Math.min(100, s)); // HubSpot's fit score limits
};

const rows = contacts.map((c) => ({ ref: c.properties.ff_import_ref, name: `${c.properties.firstname} ${c.properties.lastname}`, stage: c.properties.lifecyclestage,
  expected: model(c), hubspot: c.properties.fieldflow_lead_score === null ? null : Number(c.properties.fieldflow_lead_score), band: c.properties.fieldflow_lead_score_threshold }));
const mismatch = rows.filter((r) => r.hubspot !== r.expected);
const bandOf = (s) => (s >= 60 ? "MQL" : s >= 40 ? "Nurture" : "Not ready");
const prospects = rows.filter((r) => r.stage !== "customer");
const summary = {
  checked: rows.length, exact_match: rows.length - mismatch.length,
  hubspot_bands_all: rows.reduce((m, r) => ((m[r.band ?? "(none)"] = (m[r.band ?? "(none)"] ?? 0) + 1), m), {}),
  model_bands_all: rows.reduce((m, r) => ((m[bandOf(r.expected)] = (m[bandOf(r.expected)] ?? 0) + 1), m), {}),
  mql_prospects: prospects.filter((r) => r.hubspot >= 60).length, mql_customers: rows.filter((r) => r.stage === "customer" && r.hubspot >= 60).length,
  min: Math.min(...rows.map((r) => r.hubspot)), max: Math.max(...rows.map((r) => r.hubspot)),
  avg: +(rows.reduce((a, r) => a + r.hubspot, 0) / rows.length).toFixed(2),
};
writeFileSync(join(ROOT, "data", "score_verification.json"), JSON.stringify({ verified_at: new Date().toISOString(), summary, mismatches: mismatch }, null, 2));
console.log(JSON.stringify(summary, null, 1));
for (const m of mismatch.slice(0, 15)) console.log(`MISMATCH ${m.ref} ${m.name}: hubspot ${m.hubspot} vs model ${m.expected}`);
