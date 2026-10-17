// Score AUDIT_FINDINGS (data/audit_findings.json) against AUDIT_ANSWER_KEY.md,
// record by record via ff_import_ref. Expected sets account for the load
// outcome (records HubSpot blocked can't be in the CRM). Every miss and every
// extra is listed with a reason to investigate — nothing is silently dropped.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const key = readFileSync(join(ROOT, "AUDIT_ANSWER_KEY.md"), "utf8");
const audit = JSON.parse(readFileSync(join(ROOT, "data", "audit_findings.json"), "utf8"));
const load = JSON.parse(readFileSync(join(ROOT, "data", "load_report.json"), "utf8"));
const blocked = new Set(load.rejected.map((r) => r.ref));

// Seeded sections: "## <Area>: <Issue>" followed by "- <REF> ..." lines.
const seeded = {};
for (const m of key.split("\n## ").slice(1)) {
  const [title, ...lines] = m.split("\n");
  if (title.startsWith("Load outcome")) continue;
  seeded[title.replace(/^\w+: /, "")] = lines.filter((l) => l.startsWith("- ")).map((l) => l.slice(2).split(/[ "(]/)[0]);
}
const loadRow = (label) => (key.match(new RegExp(`\\| ${label}[^|]*\\| \\d+ \\| ([^|]*)\\|`)) ?? [, ""])[1];

const MAP = { // audit check -> expected refs present in the CRM
  C1: seeded["Duplicate contacts (same person, variant email or name)"].filter((r) => !blocked.has(r)),
  C2: seeded["Missing email address (contact can't be emailed or deduplicated)"],
  C3: seeded["Invalid email address (typo / malformed)"].filter((r) => !blocked.has(r)),
  C4: seeded["Junk / test records"],
  C5: ["(sample)", "(sample)"],
  C6: seeded["Orphan contacts (no company association; personal email domain)"],
  C7: seeded["Missing job title"],
  C8: seeded["Inconsistent phone number formats"],
  C9: seeded["Lifecycle stage behind reality (company has a closed-won deal, contact still Lead)"],
  C10: seeded["Lifecycle stage ahead of reality (marked Customer, company has no won deal)"],
  K1: seeded["Duplicate companies (same domain, name variant)"],
  K2: seeded["Missing number of employees"],
  K3: seeded["Inconsistent industry values (free-text variants instead of one picklist value)"],
  K4: [],
  D1: seeded["Open deals with a close date in the past"],
  D2: seeded["Stale open deals (no activity in 45+ days)"],
  D3: seeded["Missing deal amount (pipeline value understated)"],
  D4: seeded["Closed-won deal with $0 amount"],
  D5: seeded["Deals with no company association"],
  D6: [...seeded["Deals with no company association"], ...[...loadRow("Deals with \\*\\*no contact association\\*\\*").matchAll(/DL-\d+/g)].map((m) => m[0])],
  D7: [],
};

// Records HubSpot blocked at load or corrected itself can't be in the CRM as
// seeded, so they leave every expected set.
const autofixed = new Set(JSON.parse(readFileSync(join(ROOT, "data", "hubspot_autofixes.json"), "utf8")).map((f) => f.ref));
for (const k of Object.keys(MAP)) MAP[k] = MAP[k].filter((r) => !blocked.has(r) && !autofixed.has(r));

// Extras are classified, never silently accepted: each must match a known
// knock-on rule or it is reported as UNEXPLAINED.
const dupeOf = Object.fromEntries([...key.matchAll(/^- (CT-\d+) duplicates (CT-\d+)/gm)].map((m) => [m[1], m[2]]));
const orphans = new Set(seeded["Orphan contacts (no company association; personal email domain)"]);
const dupeCompanies = new Set(seeded["Duplicate companies (same domain, name variant)"]);
const classify = (id, ref, note) => {
  if (dupeOf[ref] && ["C7", "C8"].includes(id)) return `knock-on: duplicate record inherited the original ${dupeOf[ref]}'s value`;
  if (id === "C10" && orphans.has(ref)) return "knock-on: a Customer whose company link was removed (orphan seeding)";
  if (id === "K4" && dupeCompanies.has(ref)) return "knock-on: duplicate company shell holds no contacts";
  if (id === "C1" && /duplicate of/.test(note ?? "")) return "unseeded: same full name at the same company (genuine possible duplicate)";
  return "UNEXPLAINED";
};

const rows = [];
let tp = 0, fn = 0, fp = 0;
for (const f of audit.findings) {
  const expected = MAP[f.id] ?? [];
  const found = f.records.map((r) => r.ref ?? `(sample)`);
  const exp = [...expected], got = [...found];
  const hits = [];
  for (const g of found) { const i = exp.indexOf(g); if (i >= 0) { hits.push(g); exp.splice(i, 1); got.splice(got.indexOf(g), 1); } }
  tp += hits.length; fn += exp.length; fp += got.length;
  const extras = got.map((ref) => { const note = f.records.find((r) => (r.ref ?? "(sample)") === ref)?.note; return { ref, why: classify(f.id, ref, note) }; });
  rows.push({ id: f.id, check: f.check, expected: expected.length, found: found.length, hits: hits.length, missed: exp, extras });
}

console.log(rows.map((r) => `${r.id.padEnd(4)} expected ${String(r.expected).padStart(3)}  found ${String(r.found).padStart(3)}  hit ${String(r.hits).padStart(3)}${r.missed.length ? `  MISSED ${r.missed.join(",")}` : ""}${r.extras.length ? `\n       extras: ${r.extras.map((e) => `${e.ref} (${e.why})`).join("; ")}` : ""}`).join("\n"));
const unexplained = rows.flatMap((r) => r.extras.filter((e) => e.why === "UNEXPLAINED").map((e) => `${r.id}:${e.ref}`));
const byCause = rows.flatMap((r) => r.extras).reduce((m, e) => ((m[e.why.split(":")[0]] = (m[e.why.split(":")[0]] ?? 0) + 1), m), {});
console.log(`\nseeded issues present in CRM: ${tp + fn}  found: ${tp} (${((100 * tp) / (tp + fn)).toFixed(1)}%)  missed: ${fn}`);
console.log(`extra flags: ${fp}  by cause: ${JSON.stringify(byCause)}  unexplained: ${unexplained.length ? unexplained.join(", ") : "none"}`);
writeFileSync(join(ROOT, "data", "audit_score.json"), JSON.stringify({ tp, fn, fp, byCause, unexplained, rows }, null, 2));
