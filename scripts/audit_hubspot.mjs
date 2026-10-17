// CRM audit of the FieldFlow HubSpot account — reads ONLY from the HubSpot API.
// It never opens the generator CSVs or AUDIT_ANSWER_KEY.md; scoring against the
// key is a separate step (score_audit.mjs) so the checks can't be tuned to it.
//
//   node scripts/audit_hubspot.mjs [--today 2026-10-15]
//
// Output: AUDIT_FINDINGS.md (severity-rated table + record links)
//         data/audit_findings.json (every flagged record with HubSpot id + import ref)

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const args = Object.fromEntries(process.argv.slice(2).reduce((a, x, i, arr) => (x.startsWith("--") ? [...a, [x.slice(2), arr[i + 1]]] : a), []));
const TODAY = Date.parse(args.today ?? "2026-10-15");
const DAY = 86400000;
const TOKEN = (readFileSync("C:/tools/hubspot_fieldflow_token.txt", "utf8").split(/\r?\n/).find((l) => l.startsWith("pat-")) ?? "").trim();
const API = "https://api.hubapi.com";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function get(path) {
  for (let i = 0; i < 6; i++) {
    const res = await fetch(API + path, { headers: { Authorization: `Bearer ${TOKEN}` } });
    if (res.status === 429 || res.status >= 500) { await sleep(1000 * 2 ** i); continue; }
    if (!res.ok) throw new Error(`GET ${path}: ${res.status} ${await res.text()}`);
    return res.json();
  }
  throw new Error(`GET ${path}: gave up`);
}
async function all(obj, props, assocs) {
  const out = [];
  let after;
  do {
    const q = new URLSearchParams({ limit: "100", properties: props.join(","), ...(assocs ? { associations: assocs.join(",") } : {}), ...(after ? { after } : {}) });
    const page = await get(`/crm/v3/objects/${obj}?${q}`);
    out.push(...page.results);
    after = page.paging?.next?.after;
  } while (after);
  return out;
}
const assocIds = (rec, to) => (rec.associations?.[to]?.results ?? []).map((r) => r.id);

// ---- Pull everything -------------------------------------------------------------
const account = await get("/account-info/v3/details");
const UI = `https://${account.uiDomain}`;
const link = (typeId, id) => `${UI}/contacts/${account.portalId}/record/${typeId}/${id}`;

const contacts = await all("contacts", ["email", "firstname", "lastname", "phone", "jobtitle", "lifecyclestage", "ff_import_ref", "ff_original_create_date"], ["companies"]);
const companies = await all("companies", ["name", "domain", "numberofemployees", "ff_vertical", "ff_import_ref"], ["contacts", "deals"]);
const deals = await all("deals", ["dealname", "dealstage", "amount", "closedate", "ff_last_activity_date", "ff_import_ref"], ["companies", "contacts"]);
console.log(`pulled ${contacts.length} contacts, ${companies.length} companies, ${deals.length} deals from account ${account.portalId}`);

const findings = [];
const add = (f) => findings.push(f);
const rec = (kind, r, note) => ({ id: r.id, ref: r.properties.ff_import_ref ?? null, url: link({ contact: "0-1", company: "0-2", deal: "0-3" }[kind], r.id), ...(note ? { note } : {}) });
const nameOf = (c) => `${c.properties.firstname ?? ""} ${c.properties.lastname ?? ""}`.trim();

// ---- Contacts ----------------------------------------------------------------
const FREEMAIL = /@(gmail|yahoo|outlook|hotmail|icloud|aol)\.com$/i;
const email = (c) => (c.properties.email ?? "").toLowerCase();

// Duplicates: two rules, merged into clusters.
//   R1 same mailbox once digits are stripped from the local part (jo.kim / jo.kim1)
//   R2 same full name at the same associated company
const parent = new Map(contacts.map((c) => [c.id, c.id]));
const find = (x) => (parent.get(x) === x ? x : (parent.set(x, find(parent.get(x))), parent.get(x)));
const union = (a, b) => parent.set(find(a), find(b));
const byKey = (keyFn) => {
  const m = new Map();
  for (const c of contacts) { const k = keyFn(c); if (!k) continue; if (m.has(k)) union(c.id, m.get(k)); else m.set(k, c.id); }
};
byKey((c) => { const e = email(c); if (!e.includes("@")) return null; const [l, d] = e.split("@"); return `${l.replace(/\d+/g, "")}@${d}`; });
byKey((c) => { const co = assocIds(c, "companies")[0]; return co && nameOf(c) ? `${nameOf(c).toLowerCase()}|${co}` : null; });
const clusters = new Map();
for (const c of contacts) { const r = find(c.id); clusters.set(r, [...(clusters.get(r) ?? []), c]); }
const dupeRecords = [];
for (const group of clusters.values()) {
  if (group.length < 2) continue;
  // Keep the earliest-created record as the survivor; the rest are duplicates.
  // HubSpot returns date properties as "YYYY-MM-DD" strings — parse, don't Number().
  const created = (c) => Date.parse(c.properties.ff_original_create_date ?? "") || Infinity;
  group.sort((a, b) => created(a) - created(b) || Number(a.id) - Number(b.id));
  for (const d of group.slice(1)) dupeRecords.push(rec("contact", d, `duplicate of ${group[0].properties.ff_import_ref ?? group[0].id} (${email(group[0])} / ${email(d)})`));
}
add({ id: "C1", area: "Contacts", check: "Duplicate contacts (same mailbox ignoring digits, or same name at same company)", severity: "High",
  impact: "Same person emailed twice, activity history split across records, inflated contact counts.",
  fix: "Merge into the earliest record (Contacts → Actions → Manage duplicates); add a dedupe rule on form/import.", records: dupeRecords });

add({ id: "C2", area: "Contacts", check: "Missing email address", severity: "Medium",
  impact: "Can't be emailed, enrolled in nurture, or deduplicated by HubSpot.", fix: "Enrich from company website/LinkedIn or archive if unreachable.",
  records: contacts.filter((c) => !email(c) && !/test|asdf/i.test(nameOf(c))).map((c) => rec("contact", c)) });

add({ id: "C3", area: "Contacts", check: "Malformed email address", severity: "Medium",
  impact: "Bounces damage sender reputation.", fix: "Correct or remove; require email validation on forms.",
  records: contacts.filter((c) => email(c) && !/^[^@\s]+@[^@\s]+\.(com|net|org|io|co|us)$/i.test(email(c))).map((c) => rec("contact", c, email(c))) });

const junk = contacts.filter((c) => /^(test|asdf|qwerty|foo|demo)$/i.test(c.properties.firstname ?? "") || /^(test|asdf)@/i.test(email(c)) || /^john\.doe@|^jane\.doe@/i.test(email(c)));
add({ id: "C4", area: "Contacts", check: "Junk / test records", severity: "Medium",
  impact: "Pollutes counts, conversion rates and email lists.", fix: "Delete; block test submissions from production forms.", records: junk.map((c) => rec("contact", c, email(c))) });

const samples = contacts.filter((c) => /@hubspot\.com$/i.test(email(c)));
add({ id: "C5", area: "Contacts", check: "HubSpot default sample contacts still present", severity: "Low",
  impact: "Fake records in every count and list; a sign onboarding cleanup never happened.", fix: "Delete.", records: samples.map((c) => rec("contact", c, email(c))) });

const junkIds = new Set([...junk, ...samples].map((c) => c.id));
add({ id: "C6", area: "Contacts", check: "Orphan contacts (no company association)", severity: "Medium",
  impact: "Excluded from account-level reporting and ABM; usually personal-email sign-ups.", fix: "Associate by asking/enriching company; set an 'unknown company' review queue.",
  records: contacts.filter((c) => !junkIds.has(c.id) && assocIds(c, "companies").length === 0).map((c) => rec("contact", c, email(c) + (FREEMAIL.test(email(c)) ? " (personal domain)" : ""))) });

add({ id: "C7", area: "Contacts", check: "Missing job title", severity: "Medium",
  impact: "Seniority can't be scored; persona segmentation breaks.", fix: "Make job title required on demo/trial forms; enrich existing.",
  records: contacts.filter((c) => !junkIds.has(c.id) && !c.properties.jobtitle).map((c) => rec("contact", c)) });

const phoneFmt = (p) => (/^\d{3}-\d{3}-\d{4}$/.test(p) ? "000-000-0000" : /^\(\d{3}\) \d{3}-\d{4}$/.test(p) ? "(000) 000-0000" : /^\+1\d{10}$/.test(p) ? "+10000000000" : /^\d{10}$/.test(p) ? "0000000000" : "other");
const fmtCounts = contacts.reduce((m, c) => (c.properties.phone ? m.set(phoneFmt(c.properties.phone), (m.get(phoneFmt(c.properties.phone)) ?? 0) + 1) : m), new Map());
const dominant = [...fmtCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
add({ id: "C8", area: "Contacts", check: `Phone numbers not in the dominant format (${dominant})`, severity: "Low",
  impact: "Breaks click-to-call / SMS integrations and duplicate matching on phone.", fix: "Normalise to E.164 (+1XXXXXXXXXX) in one bulk update; enforce on forms.",
  records: contacts.filter((c) => c.properties.phone && phoneFmt(c.properties.phone) !== dominant).map((c) => rec("contact", c, c.properties.phone)),
  detail: Object.fromEntries(fmtCounts) });

// Lifecycle vs pipeline reality
const companyDeals = new Map(companies.map((co) => [co.id, assocIds(co, "deals")]));
const dealById = new Map(deals.map((d) => [d.id, d]));
const companyHasWon = (coId) => (companyDeals.get(coId) ?? []).some((id) => dealById.get(id)?.properties.dealstage === "closedwon");
const PRE_CUSTOMER = ["subscriber", "lead", "marketingqualifiedlead", "salesqualifiedlead", "opportunity"];
add({ id: "C9", area: "Contacts", check: "Lifecycle stage behind reality (company has a closed-won deal, contact not Customer)", severity: "High",
  impact: "Customers keep getting prospect nurture; funnel and customer counts are understated.", fix: "Workflow: when an associated deal is closed-won, set all company contacts to Customer.",
  records: contacts.filter((c) => assocIds(c, "companies").some(companyHasWon) && PRE_CUSTOMER.includes(c.properties.lifecyclestage)).map((c) => rec("contact", c, c.properties.lifecyclestage)) });
add({ id: "C10", area: "Contacts", check: "Lifecycle stage ahead of reality (Customer with no closed-won deal at their company)", severity: "High",
  impact: "Customer counts and revenue attribution are overstated; prospects excluded from nurture.", fix: "Review each; reset to the stage their deals support. Restrict manual edits of lifecycle stage.",
  records: contacts.filter((c) => c.properties.lifecyclestage === "customer" && !assocIds(c, "companies").some(companyHasWon)).map((c) => rec("contact", c)) });

// ---- Companies -----------------------------------------------------------------
const byDomain = new Map();
for (const co of companies) { const d = (co.properties.domain ?? "").toLowerCase(); if (d) byDomain.set(d, [...(byDomain.get(d) ?? []), co]); }
const coDupes = [];
for (const group of byDomain.values()) {
  if (group.length < 2) continue;
  group.sort((a, b) => assocIds(b, "contacts").length - assocIds(a, "contacts").length || Number(a.id) - Number(b.id)); // survivor = most contacts
  for (const d of group.slice(1)) coDupes.push(rec("company", d, `duplicate of "${group[0].properties.name}" (${group[0].properties.domain})`));
}
add({ id: "K1", area: "Companies", check: "Duplicate companies (same domain)", severity: "Medium",
  impact: "Contacts/deals split across two records; account reporting double-counts.", fix: "Merge into the record holding the contacts; enable the company-domain dedupe setting.", records: coDupes });

add({ id: "K2", area: "Companies", check: "Missing number of employees", severity: "Medium",
  impact: "Company-size criterion in lead scoring can't fire; segmentation by size breaks.", fix: "Enrich (HubSpot Insights / Breeze Intelligence) or require on trial sign-up.",
  records: companies.filter((co) => !co.properties.numberofemployees).map((co) => rec("company", co, co.properties.name)) });

// Free-text vertical: group values that normalise to the same token.
const norm = (v) => v.toLowerCase().replace(/&/g, "and").replace(/[^a-z]/g, "");
const vertGroups = new Map();
for (const co of companies) { const v = co.properties.ff_vertical; if (v) vertGroups.set(norm(v), [...(vertGroups.get(norm(v)) ?? []), co]); }
const vertVariants = [];
for (const group of vertGroups.values()) {
  const spellings = new Map();
  for (const co of group) spellings.set(co.properties.ff_vertical, (spellings.get(co.properties.ff_vertical) ?? 0) + 1);
  if (spellings.size < 2) continue;
  const canon = [...spellings.entries()].sort((a, b) => b[1] - a[1])[0][0];
  for (const co of group) if (co.properties.ff_vertical !== canon) vertVariants.push(rec("company", co, `"${co.properties.ff_vertical}" → "${canon}"`));
}
const distinctVerticals = [...new Set(companies.map((co) => co.properties.ff_vertical).filter(Boolean))].sort();
add({ id: "K3", area: "Companies", check: "Vertical stored as free text: spelling variants of the same value", severity: "Low",
  impact: "Reports split one industry into several rows; industry-based scoring/segmentation misses records.", fix: "Convert to a dropdown property with a fixed list; bulk-map existing values.",
  records: vertVariants, detail: { distinct_values: distinctVerticals,
    note: "Normalisation only catches spelling variants. Synonyms (e.g. a different word for the same trade) need a human mapping review of the distinct values list." } });

const coNoContacts = companies.filter((co) => assocIds(co, "contacts").length === 0);
add({ id: "K4", area: "Companies", check: "Companies with no contacts", severity: "Low",
  impact: "Usually leftover duplicates or bad imports; clutter account lists.", fix: "Merge if duplicate, otherwise review/delete.", records: coNoContacts.map((co) => rec("company", co, co.properties.name)) });

// ---- Deals ---------------------------------------------------------------------
const OPEN = ["appointmentscheduled", "qualifiedtobuy", "presentationscheduled", "decisionmakerboughtin", "contractsent"];
const isOpen = (d) => OPEN.includes(d.properties.dealstage);
const t = (v) => (v ? Date.parse(v) || Number(v) : NaN);
add({ id: "D1", area: "Deals", check: "Open deals with a close date in the past", severity: "High",
  impact: "Forecast counts revenue in months that already ended; pipeline looks healthier than it is.", fix: "Rep review: re-date or close-lost; add a weekly 'past due' task workflow.",
  records: deals.filter((d) => isOpen(d) && t(d.properties.closedate) < TODAY).map((d) => rec("deal", d, d.properties.closedate?.slice(0, 10))) });
add({ id: "D2", area: "Deals", check: "Stale open deals (no activity in 45+ days)", severity: "Medium",
  impact: "Dead deals inflate pipeline value and win-rate denominators.", fix: "Stale-deal workflow: task at 30 days, auto close-lost review at 60.",
  records: deals.filter((d) => isOpen(d) && TODAY - t(d.properties.ff_last_activity_date) > 45 * DAY).map((d) => rec("deal", d, `last activity ${new Date(t(d.properties.ff_last_activity_date)).toISOString().slice(0, 10)}`)) });
add({ id: "D3", area: "Deals", check: "Deals missing an amount", severity: "High",
  impact: "Pipeline and revenue totals understated; weighted forecast wrong.", fix: "Make amount required from 'Presentation scheduled' onward.",
  records: deals.filter((d) => d.properties.amount === null || d.properties.amount === "" || d.properties.amount === undefined).map((d) => rec("deal", d)) });
add({ id: "D4", area: "Deals", check: "Closed-won deals with $0 amount", severity: "High",
  impact: "Won revenue understated; average deal size and ROAS wrong.", fix: "Correct from contract/billing; block closed-won with $0 via required-field rule.",
  records: deals.filter((d) => d.properties.dealstage === "closedwon" && Number(d.properties.amount) === 0 && d.properties.amount !== null && d.properties.amount !== "").map((d) => rec("deal", d)) });
add({ id: "D5", area: "Deals", check: "Deals with no company association", severity: "Medium",
  impact: "Revenue can't be attributed to an account; company-level reporting incomplete.", fix: "Associate to the buying company; require company on deal create.",
  records: deals.filter((d) => assocIds(d, "companies").length === 0).map((d) => rec("deal", d, d.properties.dealname)) });
add({ id: "D6", area: "Deals", check: "Deals with no contact association", severity: "Medium",
  impact: "No buyer to follow up with; contact-level attribution and lifecycle sync fail.", fix: "Associate the primary buyer; require a contact on deal create.",
  records: deals.filter((d) => assocIds(d, "contacts").length === 0).map((d) => rec("deal", d, d.properties.dealname)) });
add({ id: "D7", area: "Deals", check: "Closed deals with a close date in the future", severity: "Low",
  impact: "Closed revenue lands in the wrong period.", fix: "Set close date to the actual close.",
  records: deals.filter((d) => !isOpen(d) && t(d.properties.closedate) > TODAY).map((d) => rec("deal", d)) });

// ---- Write -----------------------------------------------------------------------
const SEV = { High: 0, Medium: 1, Low: 2 };
findings.sort((a, b) => SEV[a.severity] - SEV[b.severity] || a.id.localeCompare(b.id));
writeFileSync(join(ROOT, "data", "audit_findings.json"), JSON.stringify({ audited_at: new Date().toISOString(), as_of: new Date(TODAY).toISOString().slice(0, 10), account: account.portalId,
  totals: { contacts: contacts.length, companies: companies.length, deals: deals.length }, findings }, null, 2));

const flagged = findings.filter((f) => f.records.length);
const md = [
  "# CRM Audit Findings: FieldFlow (HubSpot)",
  "",
  `Account ${account.portalId} · audited ${new Date().toISOString().slice(0, 10)} (as of ${new Date(TODAY).toISOString().slice(0, 10)}) · ${contacts.length} contacts, ${companies.length} companies, ${deals.length} deals`,
  "Generated by `scripts/audit_hubspot.mjs` from the HubSpot API only. All data is simulated.",
  "",
  `**${flagged.length} of ${findings.length} checks flagged records · ${flagged.reduce((a, f) => a + f.records.length, 0)} flagged records in total**`,
  "",
  "| ID | Severity | Area | Check | Records | Impact | Recommended fix |",
  "|---|---|---|---|---|---|---|",
  ...findings.map((f) => `| ${f.id} | ${f.severity} | ${f.area} | ${f.check} | ${f.records.length} | ${f.impact} | ${f.fix} |`),
  "",
  "## Detail",
  "",
  ...findings.filter((f) => f.records.length || f.detail).flatMap((f) => [
    `### ${f.id}: ${f.check} (${f.records.length})`,
    "",
    ...(f.detail ? ["```", JSON.stringify(f.detail, null, 2), "```", ""] : []),
    ...f.records.slice(0, 40).map((r) => `- [${r.ref ?? r.id}](${r.url})${r.note ? `: ${r.note}` : ""}`),
    ...(f.records.length > 40 ? [`- …and ${f.records.length - 40} more (see data/audit_findings.json)`] : []),
    "",
  ]),
].join("\n");
writeFileSync(join(ROOT, "AUDIT_FINDINGS.md"), md);

for (const f of findings) console.log(`${f.id.padEnd(4)} ${f.severity.padEnd(6)} ${String(f.records.length).padStart(3)}  ${f.check}`);
