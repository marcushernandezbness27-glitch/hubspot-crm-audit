// Remediate audit findings in HubSpot — only where the right answer is knowable
// from data already in the CRM. Anything needing a human or a source system
// (rep decisions, contract amounts, enrichment) is listed, not invented.
//
//   node scripts/remediate.mjs --dry-run   # print the plan, change nothing
//   node scripts/remediate.mjs             # apply (merges are irreversible)
//
// Reads the BEFORE audit (data/audit_findings.json) for which records to touch,
// then re-reads each record from HubSpot before acting on it.

import { readFileSync, writeFileSync, copyFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DRY = process.argv.includes("--dry-run");
const TOKEN = (readFileSync("C:/tools/hubspot_fieldflow_token.txt", "utf8").split(/\r?\n/).find((l) => l.startsWith("pat-")) ?? "").trim();
const API = "https://api.hubapi.com";

// Freeze the BEFORE audit once, so the after-audit can't overwrite it.
const BEFORE = join(ROOT, "data", "audit_findings_before.json");
if (!existsSync(BEFORE)) { copyFileSync(join(ROOT, "data", "audit_findings.json"), BEFORE); copyFileSync(join(ROOT, "AUDIT_FINDINGS.md"), join(ROOT, "AUDIT_FINDINGS_BEFORE.md")); }
const audit = JSON.parse(readFileSync(BEFORE, "utf8"));
const finding = (id) => audit.findings.find((f) => f.id === id)?.records ?? [];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function api(method, path, body) {
  for (let i = 0; i < 6; i++) {
    const res = await fetch(API + path, { method, headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
    if (res.status === 429 || res.status >= 500) { await sleep(1000 * 2 ** i); continue; }
    const text = await res.text();
    return { status: res.status, json: text ? JSON.parse(text) : {} };
  }
  throw new Error(`${method} ${path}: gave up`);
}
const getObj = async (obj, id, props) => (await api("GET", `/crm/v3/objects/${obj}/${id}?properties=${props.join(",")}&associations=companies,deals`)).json;

const plan = []; // { action, fix, target, detail, run: async () => result }
const log = [];
const step = (fix, action, target, detail, run) => plan.push({ fix, action, target, detail, run });
const digits = (p) => (p ?? "").replace(/\D/g, "").replace(/^1(?=\d{10}$)/, "");

// ---- C1 duplicate contacts: merge only with two matching identifiers -------------
// Audit rule found "same name + same mailbox ignoring digits". Before merging we
// also require the SAME phone number; pairs that fail go to human review.
for (const r of finding("C1")) {
  const survivorRef = r.note.match(/duplicate of (\S+)/)?.[1];
  const ids = JSON.parse(readFileSync(join(ROOT, "data", "hubspot_ids.json"), "utf8"));
  const survivorId = ids[survivorRef] ?? survivorRef;
  const [dupe, keep] = [await getObj("contacts", r.id, ["firstname", "lastname", "email", "phone"]), await getObj("contacts", survivorId, ["firstname", "lastname", "email", "phone"])];
  const samePhone = digits(dupe.properties.phone) && digits(dupe.properties.phone) === digits(keep.properties.phone);
  if (samePhone) step("C1", "merge contact", `${r.ref} → ${survivorRef}`, `${dupe.properties.email} into ${keep.properties.email} (same name, mailbox and phone)`,
    () => api("POST", "/crm/v3/objects/contacts/merge", { primaryObjectId: survivorId, objectIdToMerge: r.id }));
  else log.push({ fix: "C1", outcome: "REVIEW", target: `${r.ref} / ${survivorRef}`, why: `same name and mailbox pattern but different phones (${dupe.properties.phone} vs ${keep.properties.phone}). Could be two people; needs a human` });
}

// ---- C4 junk + C5 sample records: delete (restorable from the recycle bin for 90 days)
for (const r of [...finding("C4"), ...finding("C5")]) step(r.ref ? "C4" : "C5", "delete contact", r.ref ?? r.note, r.note, () => api("DELETE", `/crm/v3/objects/contacts/${r.id}`));

// ---- K1 duplicate companies: merge into the record that holds the contacts
for (const r of finding("K1")) {
  const dupe = await getObj("companies", r.id, ["name", "domain"]);
  const s = await api("POST", "/crm/v3/objects/companies/search", { filterGroups: [{ filters: [{ propertyName: "domain", operator: "EQ", value: dupe.properties.domain }] }], properties: ["name"], limit: 10 });
  const keep = s.json.results.find((c) => c.id !== r.id);
  if (keep) step("K1", "merge company", `${r.ref} → ${keep.properties.name}`, dupe.properties.domain, () => api("POST", "/crm/v3/objects/companies/merge", { primaryObjectId: keep.id, objectIdToMerge: r.id }));
}

// ---- C9 lifecycle behind: company has a closed-won deal -> Customer --------------------
for (const r of finding("C9")) step("C9", "set lifecycle", r.ref, `${r.note} → customer`, () => api("PATCH", `/crm/v3/objects/contacts/${r.id}`, { properties: { lifecyclestage: "customer" } }));

// ---- C10 lifecycle ahead: reset to the stage the record's own data supports ----------------
// open deal at company -> opportunity; demo requested -> SQL; trial -> MQL; else lead.
// HubSpot blocks moving lifecycle backwards in one write, so clear it first.
for (const r of finding("C10")) {
  const c = await getObj("contacts", r.id, ["lifecyclestage", "ff_demo_requested", "ff_trial_status"]);
  let hasOpen = false;
  for (const co of c.associations?.companies?.results ?? []) {
    const company = await getObj("companies", co.id, ["hs_num_open_deals"]);
    if (Number(company.properties.hs_num_open_deals) > 0) hasOpen = true;
  }
  const target = hasOpen ? "opportunity" : c.properties.ff_demo_requested === "true" ? "salesqualifiedlead" : c.properties.ff_trial_status !== "None" && c.properties.ff_trial_status ? "marketingqualifiedlead" : "lead";
  step("C10", "reset lifecycle", r.ref, `customer → ${target} (${hasOpen ? "open deal" : c.properties.ff_demo_requested === "true" ? "demo requested" : c.properties.ff_trial_status !== "None" ? `trial ${c.properties.ff_trial_status}` : "no buying signal"})`,
    async () => { await api("PATCH", `/crm/v3/objects/contacts/${r.id}`, { properties: { lifecyclestage: "" } }); return api("PATCH", `/crm/v3/objects/contacts/${r.id}`, { properties: { lifecyclestage: target } }); });
}

// ---- C8 phones: normalise every phone to E.164 (+1XXXXXXXXXX) ----------------------
let after; const phones = [];
do {
  const page = await api("GET", `/crm/v3/objects/contacts?limit=100&properties=phone,ff_import_ref${after ? `&after=${after}` : ""}`);
  for (const c of page.json.results) if (c.properties.phone && digits(c.properties.phone).length === 10 && c.properties.phone !== `+1${digits(c.properties.phone)}`) phones.push(c);
  after = page.json.paging?.next?.after;
} while (after);
for (let i = 0; i < phones.length; i += 100) {
  const batch = phones.slice(i, i + 100);
  step("C8", "normalise phones", `${batch.length} contacts`, `e.g. ${batch[0].properties.phone} → +1${digits(batch[0].properties.phone)}`,
    () => api("POST", "/crm/v3/objects/contacts/batch/update", { inputs: batch.map((c) => ({ id: c.id, properties: { phone: `+1${digits(c.properties.phone)}` } })) }));
}

// ---- K3 vertical: map variants AND synonyms to one value (mapping agreed by a human —
// normalisation alone can't know "Janitorial" means "Cleaning Services").
const VERTICAL_MAP = { hvac: "HVAC", "Heating & Cooling": "HVAC", Healthcare: "Home Healthcare", "home health care": "Home Healthcare", Janitorial: "Cleaning Services", cleaning: "Cleaning Services" };
for (const v of Object.keys(VERTICAL_MAP)) {
  const s = await api("POST", "/crm/v3/objects/companies/search", { filterGroups: [{ filters: [{ propertyName: "ff_vertical", operator: "EQ", value: v }] }], properties: ["name", "ff_vertical"], limit: 100 });
  // HubSpot EQ on text is case-insensitive; only rewrite exact non-canonical spellings.
  for (const co of s.json.results.filter((c) => c.properties.ff_vertical === v))
    step("K3", "map vertical", co.properties.name, `"${v}" → "${VERTICAL_MAP[v]}"`, () => api("PATCH", `/crm/v3/objects/companies/${co.id}`, { properties: { ff_vertical: VERTICAL_MAP[v] } }));
}

// ---- Not auto-fixable: listed with the owner of the decision -----------------------
const NOT_FIXED = [
  ["D1/D2", "Past-due and stale open deals", "Rep decision (re-date, or close-lost). Prevention: a workflow creates a review task 7 days after the close date passes."],
  ["D3/D4", "Missing and $0 deal amounts", "Needs the contract or billing system as the source. Prevention: amount required from 'Presentation scheduled' onward."],
  ["C2/C7/K2", "Missing email, job title, employee count", "Enrichment or asking the contact. Not invented."],
  ["C6/D5/D6", "Orphan contacts, deals with no company or contact", "Needs a sales-ops decision on the right association."],
];

// ---- Print / apply --------------------------------------------------------------
console.log(`${DRY ? "DRY RUN: nothing will change" : "APPLYING"} · ${plan.length} actions\n`);
const byFix = plan.reduce((m, p) => ((m[p.fix] = [...(m[p.fix] ?? []), p]), m), {});
for (const [fix, steps] of Object.entries(byFix)) {
  console.log(`${fix}: ${steps[0].action} ×${steps.length}`);
  for (const s of steps.slice(0, 8)) console.log(`   ${s.target}  ${s.detail ?? ""}`);
  if (steps.length > 8) console.log(`   …${steps.length - 8} more`);
}
for (const l of log) console.log(`${l.fix}: ${l.outcome}  ${l.target}: ${l.why}`);
console.log("\nNot auto-fixed:"); for (const [id, what, why] of NOT_FIXED) console.log(`   ${id.padEnd(9)} ${what}: ${why}`);

if (!DRY) {
  const results = [];
  for (const p of plan) {
    const r = await p.run();
    results.push({ fix: p.fix, action: p.action, target: p.target, status: r.status, ok: r.status < 300, error: r.status >= 300 ? (r.json.message ?? "").slice(0, 200) : undefined });
    if (r.status >= 300) console.log(`  ! ${p.fix} ${p.target}: ${r.status} ${r.json.message ?? ""}`);
  }
  writeFileSync(join(ROOT, "data", "remediation_log.json"), JSON.stringify({ applied_at: new Date().toISOString(), results, review: log, not_fixed: NOT_FIXED }, null, 2));
  console.log(`\napplied ${results.filter((r) => r.ok).length}/${results.length} actions → data/remediation_log.json`);
}
