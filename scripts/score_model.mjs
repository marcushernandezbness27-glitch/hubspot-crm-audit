// Lead scoring model for FieldFlow — designed here, then built in HubSpot's Lead
// Scoring tool. This script applies the same rules to the live HubSpot records
// to calibrate the MQL threshold before anything is configured in the UI, and
// later to cross-check HubSpot's computed scores.
//
//   node scripts/score_model.mjs   -> prints distribution, writes SCORING_MODEL.md

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const TOKEN = (readFileSync("C:/tools/hubspot_fieldflow_token.txt", "utf8").split(/\r?\n/).find((l) => l.startsWith("pat-")) ?? "").trim();
const get = async (p) => (await fetch("https://api.hubapi.com" + p, { headers: { Authorization: `Bearer ${TOKEN}` } })).json();

// ---- The model (single source of truth for the UI build) -----------------------
export const MODEL = {
  fit: [
    { group: "Seniority", prop: "ff_seniority_bucket (contact)", rules: [["Owner/Executive", 20], ["Manager", 12], ["Staff", 3]] },
    { group: "Company size", prop: "numberofemployees (company)", rules: [["10–49", 10], ["50–199", 15], ["200+", 8], ["1–9", 3]] },
    { group: "Core vertical", prop: "ff_vertical (company)", rules: [["HVAC, Plumbing, Electrical", 10], ["Any other trade", 5]] },
    { group: "Email domain", prop: "email (contact)", rules: [["Personal domain (gmail/yahoo/outlook…)", -10]] },
  ],
  engagement: [
    { group: "Demo requested", prop: "ff_demo_requested", rules: [["Yes", 25]] },
    { group: "Product activated", prop: "ff_product_activated", rules: [["Yes", 20]] },
    { group: "Trial", prop: "ff_trial_status", rules: [["Active", 15], ["Expired", 5]] },
    { group: "Pricing page views", prop: "ff_pricing_page_views", rules: [["3 or more", 10], ["1–2", 5]] },
    { group: "Webinar", prop: "ff_webinar_attended", rules: [["Yes", 5]] },
  ],
};
const CORE = ["HVAC", "Plumbing", "Electrical"];
const FREEMAIL = /@(gmail|yahoo|outlook|hotmail|icloud|aol)\.com$/i;

function score(c, co) {
  const p = c.properties, k = co?.properties ?? {};
  let fit = { "Owner/Executive": 20, Manager: 12, Staff: 3 }[p.ff_seniority_bucket] ?? 0;
  const n = Number(k.numberofemployees);
  if (k.numberofemployees) fit += n >= 200 ? 8 : n >= 50 ? 15 : n >= 10 ? 10 : 3;
  if (k.ff_vertical) fit += CORE.includes(k.ff_vertical) ? 10 : 5;
  if (FREEMAIL.test(p.email ?? "")) fit -= 10;
  let eng = 0;
  if (p.ff_demo_requested === "true") eng += 25;
  if (p.ff_product_activated === "true") eng += 20;
  eng += { Active: 15, Expired: 5 }[p.ff_trial_status] ?? 0;
  const pv = Number(p.ff_pricing_page_views ?? 0);
  eng += pv >= 3 ? 10 : pv >= 1 ? 5 : 0;
  if (p.ff_webinar_attended === "true") eng += 5;
  return { fit, eng, total: fit + eng };
}

// ---- Pull live records ---------------------------------------------------------------
const props = ["email", "lifecyclestage", "ff_seniority_bucket", "ff_demo_requested", "ff_product_activated", "ff_trial_status", "ff_pricing_page_views", "ff_webinar_attended", "ff_import_ref"];
const contacts = []; let after;
do {
  const page = await get(`/crm/v3/objects/contacts?limit=100&properties=${props.join(",")}&associations=companies${after ? `&after=${after}` : ""}`);
  contacts.push(...page.results); after = page.paging?.next?.after;
} while (after);
const companies = new Map(); after = undefined;
do {
  const page = await get(`/crm/v3/objects/companies?limit=100&properties=numberofemployees,ff_vertical,hs_num_open_deals,recent_deal_close_date${after ? `&after=${after}` : ""}`);
  for (const c of page.results) companies.set(c.id, c); after = page.paging?.next?.after;
} while (after);

const scored = contacts.map((c) => {
  const coId = c.associations?.companies?.results?.[0]?.id;
  const co = companies.get(coId);
  const s = score(c, co);
  const outcome = co?.properties.recent_deal_close_date ? "won" : Number(co?.properties.hs_num_open_deals) > 0 ? "open" : "none";
  return { ref: c.properties.ff_import_ref, stage: c.properties.lifecyclestage, outcome, ...s };
});
const prospects = scored.filter((s) => s.stage !== "customer");

// ---- Distribution + threshold options --------------------------------------------------
const pct = (n, d) => `${((100 * n) / d).toFixed(0)}%`;
const buckets = [[-Infinity, 20], [20, 40], [40, 60], [60, 80], [80, Infinity]];
const dist = buckets.map(([lo, hi]) => ({ range: hi === Infinity ? `${lo}+` : lo === -Infinity ? `<${hi}` : `${lo}–${hi - 1}`, n: prospects.filter((s) => s.total >= lo && s.total < hi).length }));
const thresholds = [40, 50, 60, 70].map((t) => {
  const mql = prospects.filter((s) => s.total >= t);
  return { t, mql: mql.length, share: pct(mql.length, prospects.length), withDemo: mql.filter((s) => s.eng >= 25).length };
});
// Honest validation: in this SIMULATED data, won/lost was generated independently
// of these signals, so any lift here is not evidence the model predicts revenue.
const avg = (arr) => (arr.length ? (arr.reduce((a, s) => a + s.total, 0) / arr.length).toFixed(1) : "–");
const byOutcome = ["won", "open", "none"].map((o) => ({ o, n: scored.filter((s) => s.outcome === o).length, avg: avg(scored.filter((s) => s.outcome === o)) }));

console.log(`contacts ${contacts.length}, prospects (not Customer) ${prospects.length}`);
console.log("distribution:", dist.map((d) => `${d.range}: ${d.n}`).join("  "));
for (const t of thresholds) console.log(`threshold ${t.t}: ${t.mql} MQLs (${t.share} of prospects)`);
console.log("avg score by company outcome:", byOutcome.map((b) => `${b.o} ${b.avg} (n=${b.n})`).join("  "));

const table = (rows) => rows.map((g) => g.rules.map(([v, pts], i) => `| ${i === 0 ? `**${g.group}**` : ""} | ${i === 0 ? `\`${g.prop}\`` : ""} | ${v} | ${pts > 0 ? "+" : ""}${pts} |`).join("\n")).join("\n");
writeFileSync(join(ROOT, "SCORING_MODEL.md"), `# Lead Scoring Model: FieldFlow

Rules-based **fit + engagement** model for a field-service SaaS selling to small trades businesses.
Designed and calibrated against the ${contacts.length} live HubSpot records before it was built in HubSpot's Lead Scoring tool.

## Fit: who they are (max 45, min −10)

| Group | Property | Value | Points |
|---|---|---|---|
${table(MODEL.fit)}

## Engagement: what they did (max 75)

| Group | Property | Value | Points |
|---|---|---|---|
${table(MODEL.engagement)}

> In a production account, pricing-page views, webinar attendance and demo requests come from HubSpot's
> native engagement events (page views, form submissions, marketing events). Here they're simulated as
> contact properties, because the records were loaded, not tracked.

## Calibration (${prospects.length} non-Customer contacts)

| Score | Contacts |
|---|---|
${dist.map((d) => `| ${d.range} | ${d.n} |`).join("\n")}

| MQL threshold | MQLs | Share of prospects |
|---|---|---|
${thresholds.map((t) => `| ${t.t} | ${t.mql} | ${t.share} |`).join("\n")}

## Validation caveat

Average score by the contact's company outcome: ${byOutcome.map((b) => `${b.o} **${b.avg}** (n=${b.n})`).join(", ")}.
The data is simulated, and deal outcomes were generated **independently** of these signals, so this table
can't show predictive power, and isn't presented as if it could. With real data, the model would be tuned by
comparing MQL-to-SQL and MQL-to-won rates by score band over 1–2 quarters.
`);
