// Load the FieldFlow CSVs into the HubSpot developer test account via the CRM API.
//
//   node scripts/load_to_hubspot.mjs            # load (resumable)
//   node scripts/load_to_hubspot.mjs --dry-run  # validate CSVs + plan, no API writes
//
// Auth: the service key is read from C:\tools\hubspot_fieldflow_token.txt (the
// line starting with "pat-"). It is never logged or written into the repo.
//
// Resumable: every created record's HubSpot ID is stored in data/hubspot_ids.json
// keyed by its CSV ref, so a re-run skips what already exists instead of
// creating duplicates. HubSpot's own rejections (duplicate email, invalid email)
// are recorded in data/load_report.json — those are part of the audit story,
// not loader bugs.

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DATA = join(ROOT, "data");
const DRY = process.argv.includes("--dry-run");
const API = "https://api.hubapi.com";

const TOKEN = DRY ? "" : (readFileSync("C:/tools/hubspot_fieldflow_token.txt", "utf8").split(/\r?\n/).find((l) => l.startsWith("pat-")) ?? "").trim();
if (!DRY && !TOKEN) throw new Error("No line starting with pat- in C:/tools/hubspot_fieldflow_token.txt");

// HubSpot-defined association type IDs, read from this account's
// /crm/v4/associations/*/labels on 2026-10-15.
const ASSOC = { contactToCompanyPrimary: 1, dealToCompanyPrimary: 5, dealToContact: 3 };

// ---- CSV ---------------------------------------------------------------------
const parse = (f) => {
  const [head, ...rows] = readFileSync(join(DATA, f), "utf8").trim().split(/\r?\n/);
  const cols = head.split(",");
  return rows.map((line) => {
    const vals = []; let cur = "", q = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (q) { if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') q = false; else cur += ch; }
      else if (ch === '"') q = true; else if (ch === ",") { vals.push(cur); cur = ""; } else cur += ch;
    }
    vals.push(cur);
    return Object.fromEntries(cols.map((c, i) => [c, vals[i] ?? ""]));
  });
};
const companies = parse("companies.csv"), contacts = parse("contacts.csv"), deals = parse("deals.csv");

// ---- State -------------------------------------------------------------------
const IDS_FILE = join(DATA, "hubspot_ids.json");
const ids = existsSync(IDS_FILE) ? JSON.parse(readFileSync(IDS_FILE, "utf8")) : {};
const saveIds = () => writeFileSync(IDS_FILE, JSON.stringify(ids, null, 2));
const report = { loaded_at: new Date().toISOString(), created: { companies: 0, contacts: 0, deals: 0 }, skipped_existing: 0, rejected: [] };

// ---- HTTP --------------------------------------------------------------------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function api(method, path, body) {
  for (let attempt = 0; attempt < 6; attempt++) {
    const res = await fetch(API + path, {
      method,
      headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.status === 429 || res.status >= 500) { await sleep(1000 * 2 ** attempt); continue; }
    const text = await res.text();
    return { status: res.status, json: text ? JSON.parse(text) : {} };
  }
  throw new Error(`${method} ${path}: gave up after retries`);
}

// ---- Custom properties ---------------------------------------------------------
const opts = (labels) => labels.map((l, i) => ({ label: l, value: l, displayOrder: i }));
const bool = { type: "bool", fieldType: "booleancheckbox", options: [{ label: "Yes", value: "true", displayOrder: 0 }, { label: "No", value: "false", displayOrder: 1 }] };
const PROPS = {
  contacts: [
    { name: "ff_import_ref", label: "FieldFlow import ref", type: "string", fieldType: "text" },
    // Contact createdate is read-only in HubSpot (companies/deals accept it), so
    // the simulated history date lives here for funnel/cohort reporting.
    { name: "ff_original_create_date", label: "Original create date (simulated history)", type: "date", fieldType: "date" },
    { name: "ff_seniority_bucket", label: "Seniority bucket", type: "enumeration", fieldType: "select", options: opts(["Owner/Executive", "Manager", "Staff"]) },
    { name: "ff_lead_source", label: "Lead source", type: "enumeration", fieldType: "select", options: opts(["Organic Search", "Paid Search", "Paid Social", "Referrals", "Direct Traffic", "Email Marketing"]) },
    { name: "ff_trial_status", label: "Trial status", type: "enumeration", fieldType: "select", options: opts(["None", "Active", "Expired"]) },
    { name: "ff_trial_start_date", label: "Trial start date", type: "date", fieldType: "date" },
    { name: "ff_product_activated", label: "Product activated (first job scheduled)", ...bool },
    { name: "ff_pricing_page_views", label: "Pricing page views", type: "number", fieldType: "number" },
    { name: "ff_demo_requested", label: "Demo requested", ...bool },
    { name: "ff_webinar_attended", label: "Webinar attended", ...bool },
  ],
  companies: [
    { name: "ff_import_ref", label: "FieldFlow import ref", type: "string", fieldType: "text" },
    // Deliberately free text: the audit finding is that this should be a picklist.
    { name: "ff_vertical", label: "Vertical (free text)", type: "string", fieldType: "text" },
  ],
  deals: [
    { name: "ff_import_ref", label: "FieldFlow import ref", type: "string", fieldType: "text" },
    // HubSpot's native last-activity date is computed from logged engagements and
    // is read-only, so simulated activity history lives in a custom date.
    { name: "ff_last_activity_date", label: "Last activity date (simulated)", type: "date", fieldType: "date" },
  ],
};

async function ensureProperties() {
  for (const [obj, list] of Object.entries(PROPS)) {
    const g = await api("POST", `/crm/v3/properties/${obj}/groups`, { name: "fieldflow", label: "FieldFlow" });
    if (g.status >= 300 && g.status !== 409) throw new Error(`group ${obj}: ${g.status} ${JSON.stringify(g.json)}`);
    for (const p of list) {
      const r = await api("POST", `/crm/v3/properties/${obj}`, { ...p, groupName: "fieldflow" });
      if (r.status === 409) continue; // already exists from a previous run
      if (r.status >= 300) throw new Error(`property ${obj}.${p.name}: ${r.status} ${JSON.stringify(r.json)}`);
      console.log(`  + ${obj}.${p.name}`);
    }
  }
}

// ---- Record builders -------------------------------------------------------------
const midnight = (d) => (d ? String(Date.parse(d + "T00:00:00Z")) : undefined); // HubSpot date props: UTC-midnight ms
const clean = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== "" && v !== undefined));

const companyProps = (c) => clean({
  name: c.name, domain: c.domain, numberofemployees: c.numberofemployees, city: c.city, state: c.state,
  ff_vertical: c.industry, ff_import_ref: c.company_ref,
});
const contactProps = (p) => clean({
  firstname: p.firstname, lastname: p.lastname, email: p.email, phone: p.phone, jobtitle: p.jobtitle,
  lifecyclestage: p.lifecyclestage, ff_original_create_date: midnight(p.createdate),
  ff_import_ref: p.contact_ref, ff_seniority_bucket: p.seniority_bucket, ff_lead_source: p.lead_source,
  ff_trial_status: p.trial_status, ff_trial_start_date: midnight(p.trial_start_date), ff_product_activated: p.product_activated,
  ff_pricing_page_views: p.pricing_page_views, ff_demo_requested: p.demo_requested, ff_webinar_attended: p.webinar_attended,
});
const dealProps = (d) => clean({
  dealname: d.dealname, pipeline: d.pipeline, dealstage: d.dealstage, amount: d.amount,
  createdate: midnight(d.createdate), closedate: midnight(d.closedate),
  ff_last_activity_date: midnight(d.last_activity_date), ff_import_ref: d.deal_ref,
});
const assoc = (id, typeId) => ({ to: { id }, types: [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: typeId }] });

async function create(obj, ref, properties, associations = []) {
  if (ids[ref]) { report.skipped_existing++; return ids[ref]; }
  const r = await api("POST", `/crm/v3/objects/${obj}`, { properties, associations });
  if (r.status === 201 || r.status === 200) {
    ids[ref] = r.json.id; report.created[obj]++; saveIds();
    return r.json.id;
  }
  const msg = r.json.message ?? JSON.stringify(r.json);
  const reason = r.status === 409 ? "duplicate (HubSpot: contact with this email already exists)"
    : /email/i.test(msg) ? "invalid email (rejected by HubSpot validation)" : `HTTP ${r.status}`;
  report.rejected.push({ object: obj, ref, reason, detail: msg.slice(0, 240) });
  console.log(`  ! ${ref}: ${reason}`);
  return null;
}

// ---- Run --------------------------------------------------------------------
console.log(`CSV: ${companies.length} companies, ${contacts.length} contacts, ${deals.length} deals${DRY ? " (dry run)" : ""}`);
const firstContactOf = new Map(); // company_ref -> first contact_ref (deal contact association)
for (const p of contacts) if (p.company_ref && !firstContactOf.has(p.company_ref)) firstContactOf.set(p.company_ref, p.contact_ref);
if (DRY) {
  const bad = deals.filter((d) => d.company_ref && !companies.some((c) => c.company_ref === d.company_ref));
  console.log(`deals pointing at unknown companies: ${bad.length}; companies with a primary contact: ${firstContactOf.size}`);
  process.exit(0);
}

console.log("properties…");
await ensureProperties();

console.log("companies…");
for (const c of companies) await create("companies", c.company_ref, companyProps(c));

console.log("contacts…");
for (const p of contacts) {
  const companyId = p.company_ref ? ids[p.company_ref] : null;
  await create("contacts", p.contact_ref, contactProps(p), companyId ? [assoc(companyId, ASSOC.contactToCompanyPrimary)] : []);
}

console.log("deals…");
for (const d of deals) {
  const a = [];
  if (d.company_ref && ids[d.company_ref]) a.push(assoc(ids[d.company_ref], ASSOC.dealToCompanyPrimary));
  const contactId = d.company_ref ? ids[firstContactOf.get(d.company_ref)] : null;
  if (contactId) a.push(assoc(contactId, ASSOC.dealToContact));
  await create("deals", d.deal_ref, dealProps(d), a);
}

// Deals created before their contacts existed (e.g. a first run that failed on
// contacts) have no contact link. PUT on the default association is
// idempotent, so this pass is safe on every run.
console.log("deal ↔ contact links…");
let linked = 0;
for (const d of deals) {
  const dealId = ids[d.deal_ref], contactId = d.company_ref ? ids[firstContactOf.get(d.company_ref)] : null;
  if (!dealId || !contactId) continue;
  const r = await api("PUT", `/crm/v4/objects/deals/${dealId}/associations/default/contacts/${contactId}`);
  if (r.status >= 300) report.rejected.push({ object: "association", ref: d.deal_ref, reason: `deal→contact HTTP ${r.status}`, detail: JSON.stringify(r.json).slice(0, 240) });
  else linked++;
}
report.deal_contact_links = linked;

writeFileSync(join(DATA, "load_report.json"), JSON.stringify(report, null, 2));
console.log(`\ncreated: ${JSON.stringify(report.created)}  skipped (already loaded): ${report.skipped_existing}  rejected by HubSpot: ${report.rejected.length}`);
for (const r of report.rejected) console.log(`  ${r.ref}  ${r.reason}`);
