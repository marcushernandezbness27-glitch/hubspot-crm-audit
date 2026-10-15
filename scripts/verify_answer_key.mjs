// Independent check: re-derive every countable issue straight from the CSVs and
// compare with AUDIT_ANSWER_KEY.md. If these disagree, the answer key is lying
// and any audit score built on it would be wrong.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const TODAY = Date.parse(process.argv[2] ?? "2026-10-15");
const parse = (f) => {
  const [head, ...rows] = readFileSync(join(ROOT, "data", f), "utf8").trim().split("\n");
  const cols = head.split(",");
  return rows.map((r) => Object.fromEntries(r.split(",").map((v, i) => [cols[i], v])));
};
const companies = parse("companies.csv"), contacts = parse("contacts.csv"), deals = parse("deals.csv");
const OPEN = ["appointmentscheduled", "qualifiedtobuy", "presentationscheduled", "decisionmakerboughtin", "contractsent"];
const won = new Set(deals.filter((d) => d.dealstage === "closedwon").map((d) => d.company_ref));
const open = new Set(deals.filter((d) => OPEN.includes(d.dealstage)).map((d) => d.company_ref));
const day = 86400000;

const derived = {
  "Duplicate companies (same domain, name variant)": companies.length - new Set(companies.map((c) => c.domain)).size,
  "Missing number of employees": companies.filter((c) => !c.numberofemployees).length,
  "Missing email address (contact can't be emailed or deduplicated)": contacts.filter((c) => !c.email).length,
  "Invalid email address (typo / malformed)": contacts.filter((c) => c.email && (/\.con$/.test(c.email) || /@@/.test(c.email))).length,
  "Orphan contacts (no company association; personal email domain)": contacts.filter((c) => !c.company_ref && !/test|asdf|example\.com$/.test(c.email)).length,
  "Junk / test records": contacts.filter((c) => /^(test@test\.com|asdf@asdf\.com|john\.doe@example\.com)$/.test(c.email)).length,
  "Lifecycle stage behind reality (company has a closed-won deal, contact still Lead)": contacts.filter((c) => won.has(c.company_ref) && c.lifecyclestage === "lead").length,
  "Lifecycle stage ahead of reality (marked Customer, company has no won deal)": contacts.filter((c) => c.company_ref && !won.has(c.company_ref) && c.lifecyclestage === "customer").length,
  "Open deals with a close date in the past": deals.filter((d) => OPEN.includes(d.dealstage) && Date.parse(d.closedate) < TODAY).length,
  "Stale open deals (no activity in 45+ days)": deals.filter((d) => OPEN.includes(d.dealstage) && TODAY - Date.parse(d.last_activity_date) > 45 * day).length,
  "Missing deal amount (pipeline value understated)": deals.filter((d) => d.amount === "").length,
  "Closed-won deal with $0 amount": deals.filter((d) => d.dealstage === "closedwon" && d.amount === "0").length,
  "Deals with no company association": deals.filter((d) => !d.company_ref).length,
};

const key = Object.fromEntries(
  [...readFileSync(join(ROOT, "AUDIT_ANSWER_KEY.md"), "utf8").matchAll(/^\| \w+ \| (.+) \| (\d+) \|$/gm)].map((m) => [m[1], Number(m[2])])
);
let bad = 0;
for (const [issue, n] of Object.entries(derived)) {
  const ok = key[issue] === n;
  if (!ok) bad++;
  console.log(`${ok ? "OK  " : "DIFF"} ${String(n).padStart(3)} derived vs ${String(key[issue] ?? "-").padStart(3)} key  ${issue}`);
}
console.log(bad ? `\n${bad} mismatch(es)` : "\nanswer key matches the data");
process.exit(bad ? 1 : 0);
