// HubSpot sample data for Build 26+42 (CRM audit + demand gen).
//
// Fictional B2B SaaS "FieldFlow" (scheduling software for field-service SMBs)
// selling to small businesses. Every record is SIMULATED.
//
// Two jobs in one dataset:
//   Part A (audit)   — deliberate, realistic data-quality problems, each one
//                      logged to AUDIT_ANSWER_KEY.md so the audit's findings can
//                      be scored against what was actually seeded.
//   Part B (demand gen) — demographic + behavioural properties for a lead
//                      scoring model and a trial-to-paid nurture.
//
// Deterministic: same seed => identical files.
// Usage: node generate_hubspot_data.mjs [--seed 26] [--today 2026-10-15]

import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, arr) => (a.startsWith("--") ? [...acc, [a.slice(2), arr[i + 1]]] : acc), [])
);
const SEED = Number(args.seed ?? 26);
const TODAY = Date.parse(args.today ?? "2026-10-15");
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "data");
mkdirSync(OUT, { recursive: true });

// mulberry32 — same seeded PRNG as the Looker build
let s = SEED >>> 0;
const rand = () => {
  s = (s + 0x6d2b79f5) >>> 0;
  let t = s;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const pick = (a) => a[Math.floor(rand() * a.length)];
const int = (lo, hi) => lo + Math.floor(rand() * (hi - lo + 1));
const chance = (p) => rand() < p;
const DAY = 86400000;
const iso = (t) => new Date(t).toISOString().slice(0, 10);
const daysAgo = (n) => TODAY - n * DAY;

const findings = []; // answer key: { area, issue, records[] }
const log = (area, issue, ...records) => {
  let f = findings.find((x) => x.area === area && x.issue === issue);
  if (!f) findings.push((f = { area, issue, records: [] }));
  f.records.push(...records);
};

// ---- Companies ---------------------------------------------------------------
const INDUSTRY_CANON = ["HVAC", "Plumbing", "Electrical", "Landscaping", "Cleaning Services", "Pest Control", "Roofing", "Home Healthcare"];
// Messy variants a real CRM accumulates from forms, imports and reps typing freehand.
const INDUSTRY_MESSY = { HVAC: ["hvac", "Heating & Cooling"], "Home Healthcare": ["Healthcare", "home health care"], "Cleaning Services": ["Janitorial", "cleaning"] };
const PREFIX = ["Northgate", "Coastal", "Summit", "Ironclad", "Bluewave", "Cedarline", "Redstone", "Foothill", "Harborview", "Willow Creek",
  "Brightpath", "Apex", "Metro", "Sunrise", "Lakewood", "Anchor", "Vantage", "Prairie", "Granite", "Silverline", "Oakridge", "Riverbend",
  "Keystone", "Pinecrest", "Clearwater", "Highland", "Evergreen", "Stonebridge", "Maple Leaf", "Trailhead"];
const SUFFIX = { HVAC: "Heating & Air", Plumbing: "Plumbing", Electrical: "Electric", Landscaping: "Landscaping", "Cleaning Services": "Cleaning Co",
  "Pest Control": "Pest Control", Roofing: "Roofing", "Home Healthcare": "Home Care" };
const CITIES = ["Austin, TX", "Denver, CO", "Portland, OR", "Nashville, TN", "Raleigh, NC", "Tampa, FL", "Phoenix, AZ", "Columbus, OH"];

const companies = [];
const usedNames = new Set();
while (companies.length < 60) {
  const industry = pick(INDUSTRY_CANON);
  const name = `${pick(PREFIX)} ${SUFFIX[industry]}`;
  if (usedNames.has(name)) continue;
  usedNames.add(name);
  const [city, state] = pick(CITIES).split(", ");
  companies.push({
    company_ref: `CO-${String(companies.length + 1).padStart(3, "0")}`,
    name,
    domain: name.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "") + ".example.com",
    industry,
    numberofemployees: pick([4, 7, 12, 18, 25, 40, 65, 90, 140, 220]),
    city,
    state,
  });
}
// Industry inconsistency: same industry spelled several ways.
for (const c of companies) {
  if (INDUSTRY_MESSY[c.industry] && chance(0.35)) {
    const v = pick(INDUSTRY_MESSY[c.industry]);
    log("Companies", `Inconsistent industry values (free-text variants instead of one picklist value)`, `${c.company_ref} "${v}" (should be "${c.industry}")`);
    c.industry = v;
  }
}
// Missing employee count (blocks the company-size scoring criterion).
for (const c of companies) if (chance(0.12)) { c.numberofemployees = ""; log("Companies", "Missing number of employees", c.company_ref); }
// Duplicate companies: same domain, near-identical name.
for (const i of [2, 11, 27]) {
  const o = companies[i];
  const dupe = { ...o, company_ref: `CO-D${i}`, name: o.name.replace(/ (\S+)$/, (m) => (m.endsWith("s") ? m.slice(0, -1) : m + " LLC")) };
  companies.push(dupe);
  log("Companies", "Duplicate companies (same domain, name variant)", `${dupe.company_ref} duplicates ${o.company_ref} (${o.domain})`);
}

// ---- Contacts ---------------------------------------------------------------
const FIRST = ["Jordan", "Casey", "Morgan", "Taylor", "Riley", "Avery", "Cameron", "Drew", "Reese", "Sawyer", "Alex", "Jamie", "Quinn",
  "Skyler", "Rowan", "Emerson", "Finley", "Hayden", "Kendall", "Peyton", "Dana", "Jesse", "Logan", "Parker", "Robin", "Sam"];
const LAST = ["Nguyen", "Patel", "Garcia", "Kim", "Johnson", "Rossi", "Muller", "Okafor", "Sato", "Weber", "Brooks", "Diaz", "Fischer",
  "Hale", "Iverson", "Jansen", "Kowalski", "Lund", "Mora", "Novak", "Reyes", "Shah", "Torres", "Walsh", "Young", "Abbott"];
const TITLES = [ // [title, seniority bucket used by lead scoring]
  ["Owner", "Owner/Executive"], ["CEO", "Owner/Executive"], ["President", "Owner/Executive"], ["General Manager", "Manager"],
  ["Operations Manager", "Manager"], ["Service Manager", "Manager"], ["Office Manager", "Staff"], ["Dispatcher", "Staff"],
  ["Technician", "Staff"], ["Bookkeeper", "Staff"]];
const SOURCES = ["Organic Search", "Paid Search", "Paid Social", "Referrals", "Direct Traffic", "Email Marketing"];

const contacts = [];
const ownerOfCompany = new Map(); // company_ref -> contact count
let pid = 0;
const phone = (n, style) => {
  const d = String(5550100000 + n);
  return [`${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`, `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`, `+1${d}`, d][style];
};
for (const c of companies.filter((x) => !x.company_ref.startsWith("CO-D"))) {
  const n = int(3, 7);
  for (let k = 0; k < n; k++) {
    pid++;
    const first = pick(FIRST), last = pick(LAST);
    const [jobtitle, seniority] = k === 0 ? pick(TITLES.slice(0, 3)) : pick(TITLES);
    const created = daysAgo(int(5, 190));
    // Trial funnel: ~45% of contacts started a FieldFlow trial.
    const trial = chance(0.45);
    const trialStart = trial ? created + int(0, 10) * DAY : null;
    const activated = trial && chance(0.55); // completed core setup (first job scheduled)
    contacts.push({
      contact_ref: `CT-${String(pid).padStart(4, "0")}`,
      firstname: first,
      lastname: last,
      email: `${first}.${last}${chance(0.15) ? int(1, 99) : ""}@${c.domain}`.toLowerCase(),
      phone: phone(pid, 0),
      jobtitle,
      seniority_bucket: seniority,
      company_ref: c.company_ref,
      company_domain: c.domain,
      lifecyclestage: "lead",
      lead_source: pick(SOURCES),
      createdate: iso(created),
      trial_status: trial ? (TODAY - trialStart > 14 * DAY ? "Expired" : "Active") : "None",
      trial_start_date: trial ? iso(Math.min(trialStart, TODAY)) : "",
      product_activated: trial ? (activated ? "true" : "false") : "",
      pricing_page_views: trial ? int(0, 6) : int(0, 2),
      demo_requested: chance(trial ? 0.25 : 0.06) ? "true" : "false",
      webinar_attended: chance(0.12) ? "true" : "false",
      _created: created,
    });
    ownerOfCompany.set(c.company_ref, (ownerOfCompany.get(c.company_ref) ?? 0) + 1);
  }
}

// ---- Deals ------------------------------------------------------------------
const OPEN = ["appointmentscheduled", "qualifiedtobuy", "presentationscheduled", "decisionmakerboughtin", "contractsent"];
const deals = [];
let did = 0;
for (const c of companies.filter((x) => !x.company_ref.startsWith("CO-D"))) {
  if (!chance(0.7)) continue;
  for (let k = int(1, 2); k > 0; k--) {
    did++;
    const created = daysAgo(int(10, 180));
    const age = (TODAY - created) / DAY;
    const closed = age > 45 && chance(0.6);
    const won = closed && chance(0.45);
    const stage = closed ? (won ? "closedwon" : "closedlost") : pick(OPEN);
    const seats = int(2, 25);
    // Clean baseline: open deals always have a future close date and recent
    // activity, so the only past-due / stale deals are the seeded ones below.
    const closeT = closed ? created + int(15, 60) * DAY : TODAY + int(7, 90) * DAY;
    const lastActivity = closed ? Math.min(TODAY, closeT - int(0, 5) * DAY) : TODAY - int(0, 30) * DAY;
    deals.push({
      deal_ref: `DL-${String(did).padStart(3, "0")}`,
      dealname: `${c.name} — ${pick(["New subscription", "Annual plan", "Seat expansion", "Pro upgrade"])}`,
      company_ref: c.company_ref,
      company_domain: c.domain,
      pipeline: "default",
      dealstage: stage,
      amount: seats * pick([39, 59, 79]) * 12,
      createdate: iso(created),
      closedate: iso(closed ? Math.min(closeT, TODAY) : closeT),
      last_activity_date: iso(Math.max(created, lastActivity)),
    });
  }
}

// Lifecycle stage driven by real deal state (the clean baseline)...
const wonCompanies = new Set(deals.filter((d) => d.dealstage === "closedwon").map((d) => d.company_ref));
const openCompanies = new Set(deals.filter((d) => OPEN.includes(d.dealstage)).map((d) => d.company_ref));
for (const p of contacts) {
  if (wonCompanies.has(p.company_ref)) p.lifecyclestage = "customer";
  else if (openCompanies.has(p.company_ref)) p.lifecyclestage = "opportunity";
  else if (p.demo_requested === "true") p.lifecyclestage = "salesqualifiedlead";
  else if (p.trial_status !== "None") p.lifecyclestage = "marketingqualifiedlead";
  else p.lifecyclestage = pick(["subscriber", "lead", "lead"]);
}

// ---- Seeded contact problems ---------------------------------------------------
// Structural problems (lifecycle, email, orphan, duplicate) never share a
// record, so one seeded issue can't silently undo another. Cosmetic ones
// (phone format, missing title) may overlap — that's realistic and harmless.
const touched = new Set();
const take = (pred, n, exclusive = true) => {
  const picked = contacts.filter((x) => pred(x) && !(exclusive && touched.has(x.contact_ref))).sort(() => rand() - 0.5).slice(0, n);
  if (exclusive) picked.forEach((x) => touched.add(x.contact_ref));
  return picked;
};
// Lifecycle conflicts in both directions.
for (const p of take((x) => wonCompanies.has(x.company_ref), 6)) { p.lifecyclestage = "lead"; log("Contacts", "Lifecycle stage behind reality (company has a closed-won deal, contact still Lead)", p.contact_ref); }
for (const p of take((x) => !wonCompanies.has(x.company_ref) && !openCompanies.has(x.company_ref), 5)) { p.lifecyclestage = "customer"; log("Contacts", "Lifecycle stage ahead of reality (marked Customer, company has no won deal)", p.contact_ref); }
// Inconsistent phone formats.
for (const p of take(() => true, 40, false)) { p.phone = phone(Number(p.contact_ref.slice(3)), int(1, 3)); log("Contacts", "Inconsistent phone number formats", p.contact_ref); }
// Missing / invalid emails.
for (const p of take((x) => x.email, 4)) { p.email = ""; log("Contacts", "Missing email address (contact can't be emailed or deduplicated)", p.contact_ref); }
for (const p of take((x) => x.email, 3)) { p.email = p.email.replace(".example.com", ".example.con").replace("@", chance(0.5) ? "@" : "@@"); log("Contacts", "Invalid email address (typo / malformed)", p.contact_ref); }
// Missing job title (breaks the seniority scoring criterion).
for (const p of take(() => true, 18, false)) { p.jobtitle = ""; p.seniority_bucket = ""; log("Contacts", "Missing job title", p.contact_ref); }
// Orphans: contact on a personal email with no company.
for (const p of take(() => true, 9)) {
  p.email = p.email ? p.email.replace(/@.*/, `@${pick(["gmail.com", "yahoo.com", "outlook.com"])}`) : p.email;
  p.company_ref = ""; p.company_domain = "";
  log("Contacts", "Orphan contacts (no company association; personal email domain)", p.contact_ref);
}
// Duplicate contacts: same person re-entered.
for (const o of take((x) => x.email, 8)) {
  pid++;
  const style = int(0, 2);
  const dupe = { ...o, contact_ref: `CT-${String(pid).padStart(4, "0")}`,
    email: style === 0 ? o.email.toUpperCase() : style === 1 ? o.email.replace(/@/, "1@") : o.email,
    createdate: iso(o._created + int(5, 40) * DAY) }; // keeps the original's lifecycle so the dupe adds no lifecycle conflict
  if (style === 2) dupe.firstname = o.firstname.slice(0, 3); // nickname, same email -> HubSpot would merge on import; logged anyway
  contacts.push(dupe);
  log("Contacts", "Duplicate contacts (same person, variant email or name)", `${dupe.contact_ref} duplicates ${o.contact_ref}${style === 2 ? " (same email — HubSpot dedupes on import; check it did)" : ""}`);
}
// Junk / test records.
for (const [f, l, e] of [["test", "test", "test@test.com"], ["asdf", "asdf", "asdf@asdf.com"], ["John", "Doe", "john.doe@example.com"]]) {
  pid++;
  contacts.push({ ...contacts[0], contact_ref: `CT-${String(pid).padStart(4, "0")}`, firstname: f, lastname: l, email: e, phone: "", jobtitle: "",
    seniority_bucket: "", company_ref: "", company_domain: "", lifecyclestage: "lead", lead_source: "Direct Traffic", trial_status: "None",
    trial_start_date: "", product_activated: "", pricing_page_views: 0, demo_requested: "false", webinar_attended: "false" });
  log("Contacts", "Junk / test records", `CT-${String(pid).padStart(4, "0")} (${e})`);
}

// ---- Seeded deal problems -------------------------------------------------------
const takeD = (pred, n) => deals.filter(pred).sort(() => rand() - 0.5).slice(0, n);
for (const d of takeD((x) => OPEN.includes(x.dealstage), 5)) { d.closedate = iso(daysAgo(int(10, 60))); log("Deals", "Open deals with a close date in the past", d.deal_ref); }
for (const d of takeD((x) => OPEN.includes(x.dealstage), 6)) { d.last_activity_date = iso(daysAgo(int(50, 120))); log("Deals", "Stale open deals (no activity in 45+ days)", d.deal_ref); }
for (const d of takeD((x) => x.dealstage === "closedwon", 2)) { d.amount = 0; log("Deals", "Closed-won deal with $0 amount", d.deal_ref); }
for (const d of takeD((x) => x.amount !== 0, 4)) { d.amount = ""; log("Deals", "Missing deal amount (pipeline value understated)", d.deal_ref); }
// Only closed-lost deals: unlinking them can't change any company's won/open status (lifecycle baseline).
for (const d of takeD((x) => x.dealstage === "closedlost", 3)) { log("Deals", "Deals with no company association", `${d.deal_ref} (was ${d.company_ref})`); d.company_ref = ""; d.company_domain = ""; }

// ---- Write ------------------------------------------------------------------
const csv = (rows) => {
  const cols = Object.keys(rows[0]).filter((k) => !k.startsWith("_"));
  const esc = (v) => (/[",\n]/.test(String(v ?? "")) ? `"${String(v).replace(/"/g, '""')}"` : String(v ?? ""));
  return [cols.join(","), ...rows.map((r) => cols.map((c) => esc(r[c])).join(","))].join("\n") + "\n";
};
writeFileSync(join(OUT, "companies.csv"), csv(companies));
writeFileSync(join(OUT, "contacts.csv"), csv(contacts));
writeFileSync(join(OUT, "deals.csv"), csv(deals));

const key = [
  "# Audit Answer Key — SEEDED issues (do not import)",
  "",
  `Generated by \`scripts/generate_hubspot_data.mjs --seed ${SEED} --today ${iso(TODAY)}\`.`,
  "These problems were planted deliberately. The audit is scored against this list:",
  "found / missed / false positives go in the case study.",
  "",
  `Totals: ${companies.length} companies, ${contacts.length} contacts, ${deals.length} deals.`,
  "",
  "| Area | Issue | Count |",
  "|---|---|---|",
  ...findings.map((f) => `| ${f.area} | ${f.issue} | ${f.records.length} |`),
  "",
  ...findings.flatMap((f) => [`## ${f.area}: ${f.issue}`, "", ...f.records.map((r) => `- ${r}`), ""]),
].join("\n");
writeFileSync(join(ROOT, "AUDIT_ANSWER_KEY.md"), key);

console.log(`companies ${companies.length}  contacts ${contacts.length}  deals ${deals.length}`);
console.log(`trials ${contacts.filter((c) => c.trial_status !== "None").length}  activated ${contacts.filter((c) => c.product_activated === "true").length}  demo requests ${contacts.filter((c) => c.demo_requested === "true").length}`);
console.log(`deal stages: ${Object.entries(deals.reduce((a, d) => ((a[d.dealstage] = (a[d.dealstage] ?? 0) + 1), a), {})).map(([k, v]) => `${k}=${v}`).join(" ")}`);
console.log(`seeded issue types ${findings.length}, records ${findings.reduce((a, f) => a + f.records.length, 0)}`);
