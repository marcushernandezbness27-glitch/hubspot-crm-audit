// Append the "what HubSpot did on load" section to AUDIT_ANSWER_KEY.md, derived
// from data/load_report.json + the CSVs, so the answer key describes what is
// actually in the CRM (not just what the generator seeded). Idempotent.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const KEY = join(ROOT, "AUDIT_ANSWER_KEY.md");
const rep = JSON.parse(readFileSync(join(ROOT, "data", "load_report.json"), "utf8"));
const ids = JSON.parse(readFileSync(join(ROOT, "data", "hubspot_ids.json"), "utf8"));
const csv = (f) => {
  const [h, ...rows] = readFileSync(join(ROOT, "data", f), "utf8").trim().split(/\r?\n/);
  const cols = h.split(",");
  return rows.map((r) => Object.fromEntries(r.split(",").map((v, i) => [cols[i], v])));
};
const contacts = csv("contacts.csv"), deals = csv("deals.csv");
const AUTOFIX = join(ROOT, "data", "hubspot_autofixes.json");
const autofixes = existsSync(AUTOFIX) ? JSON.parse(readFileSync(AUTOFIX, "utf8")) : [];

const blockedInvalid = rep.rejected.filter((r) => r.reason.startsWith("invalid email")).map((r) => r.ref);
const blockedDupes = rep.rejected.filter((r) => r.reason.startsWith("duplicate")).map((r) => r.ref);
const key = readFileSync(KEY, "utf8").split("\n## Load outcome")[0].trimEnd();
const seededDupes = [...key.matchAll(/^- (CT-\d+) duplicates (CT-\d+)/gm)].map((m) => ({ dupe: m[1], of: m[2] }));
const dupesInCrm = seededDupes.filter((d) => !blockedDupes.includes(d.dupe));

// Knock-on effect: deals whose company's first contact was blocked have no contact link.
const firstContactOf = new Map();
for (const p of contacts) if (p.company_ref && !firstContactOf.has(p.company_ref)) firstContactOf.set(p.company_ref, p.contact_ref);
const dealsNoContact = deals.filter((d) => d.company_ref && !ids[firstContactOf.get(d.company_ref)])
  .map((d) => `${d.deal_ref} (primary contact ${firstContactOf.get(d.company_ref)} was blocked at load)`);

const out = `${key}

## Load outcome (what HubSpot itself did, ${rep.loaded_at.slice(0, 10)})

Loaded via \`scripts/load_to_hubspot.mjs\` into developer test account 149557707.
HubSpot's own validation stopped some seeded problems at the door. The audit should
**not** expect to find those in the CRM; it should credit HubSpot for them.

| Outcome | Count | Records |
|---|---|---|
| Invalid emails **blocked** by HubSpot validation (all seeded ones, including \`.example.con\`) | ${blockedInvalid.length} | ${blockedInvalid.join(", ")} |
| Duplicate contacts **blocked** (same email, case-insensitive) | ${blockedDupes.length} | ${blockedDupes.join(", ")} |
| Duplicate contacts that **got through** (variant email), to be found by the audit | ${dupesInCrm.length} | ${dupesInCrm.map((d) => `${d.dupe}→${d.of}`).join(", ")} |
| Deals with **no contact association** (knock-on: the company's primary contact was blocked) | ${dealsNoContact.length} | ${dealsNoContact.join("; ")} |
| HubSpot default **sample contacts** never removed (shipped with the account) | 2 | bh@hubspot.com, emailmaria@hubspot.com |
| Lifecycle conflicts **auto-corrected by HubSpot's deal lifecycle sync** (contact directly associated with the closed-won deal) | ${autofixes.length} | ${autofixes.map((f) => `${f.ref} (→ ${f.now}, ${f.at.slice(0, 16)}Z)`).join(", ") || "none"} |

**Effective audit targets in the CRM:** the seeded table above, minus the 3 invalid emails and
${blockedDupes.length} blocked duplicates, minus ${autofixes.length} lifecycle conflict(s) HubSpot auto-corrected, plus the ${dealsNoContact.length} contact-less deals and 2 sample contacts.
`;
writeFileSync(KEY, out + "\n");
console.log(`blocked invalid ${blockedInvalid.length}, blocked dupes ${blockedDupes.length}, dupes in CRM ${dupesInCrm.length}, deals w/o contact ${dealsNoContact.length}`);
dealsNoContact.forEach((d) => console.log("  " + d));
