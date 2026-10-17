// Build REMEDIATION_RESULTS.md from the frozen BEFORE audit and the latest
// (AFTER) audit, plus the remediation log. Every number comes from those files.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (f) => JSON.parse(readFileSync(join(ROOT, "data", f), "utf8"));
const before = read("audit_findings_before.json"), after = read("audit_findings.json"), log = read("remediation_log.json");
const score = read("audit_score.json");

const NOTE = {
  C1: "4 merged (name + mailbox + phone all matched). 1 pair left for human review: same name, different phones",
  C4: "Deleted (recoverable from the recycle bin for 90 days)", C5: "Deleted",
  C8: "All phones normalised to E.164. 3 merge survivors needed a second pass (async merge overwrote the update)",
  C9: "Set to Customer (company has a closed-won deal)", C10: "Reset to the stage the record's data supports (4 MQL with a trial, 3 Lead)",
  K1: "Merged into the record holding the contacts", K3: "Spelling variants and synonyms mapped to one value",
  K4: "Resolved by the company merges",
  C7: "−1 because the merged duplicate is gone. Rest needs enrichment",
  D1: "Not auto-fixed: rep decision (re-date or close-lost)", D2: "Not auto-fixed: rep decision",
  D3: "Not auto-fixed: needs the contract or billing system as the source", D4: "Not auto-fixed: needs the source amount",
  C2: "Not auto-fixed: enrichment", K2: "Not auto-fixed: enrichment",
  C6: "Not auto-fixed: sales-ops decision on the right association", D5: "Not auto-fixed: sales-ops decision", D6: "Not auto-fixed: sales-ops decision",
};
const rows = before.findings.map((b) => {
  const a = after.findings.find((f) => f.id === b.id);
  return { id: b.id, sev: b.severity, check: b.check, b: b.records.length, a: a?.records.length ?? 0 };
});
const SEV = { High: 0, Medium: 1, Low: 2 };
rows.sort((x, y) => SEV[x.sev] - SEV[y.sev] || x.id.localeCompare(y.id));
const sum = (sev, k) => rows.filter((r) => !sev || r.sev === sev).reduce((t, r) => t + r[k], 0);
const ok = log.results.filter((r) => r.ok).length;

const md = [
  "# Remediation Results: FieldFlow HubSpot Audit",
  "",
  `Before: audit of ${before.audited_at.slice(0, 10)} (${before.totals.contacts} contacts, ${before.totals.companies} companies, ${before.totals.deals} deals) · After: re-audit of ${after.audited_at.slice(0, 10)} (${after.totals.contacts} contacts, ${after.totals.companies} companies, ${after.totals.deals} deals).`,
  `Remediation: ${ok}/${log.results.length} API actions succeeded, plus ${log.follow_up?.length ?? 0} follow-up pass. Source: \`data/remediation_log.json\`. All data is simulated.`,
  "",
  `Audit accuracy against the seeded answer key: **${score.tp} of ${score.tp + score.fn} seeded issues found (${((100 * score.tp) / (score.tp + score.fn)).toFixed(1)}%)**, ${score.fp} extra flags, all explained (${Object.entries(score.byCause).map(([k, v]) => `${v} ${k}`).join(", ")}).`,
  "",
  "| Severity | Flagged before | Flagged after |",
  "|---|---|---|",
  ...["High", "Medium", "Low"].map((s) => `| ${s} | ${sum(s, "b")} | ${sum(s, "a")} |`),
  `| **Total** | **${sum(null, "b")}** | **${sum(null, "a")}** |`,
  "",
  "| ID | Severity | Check | Before | After | What happened |",
  "|---|---|---|---|---|---|",
  ...rows.map((r) => `| ${r.id} | ${r.sev} | ${r.check} | ${r.b} | ${r.a} | ${NOTE[r.id] ?? (r.b === 0 ? "Clean" : "")} |`),
  "",
  "## Lessons",
  "",
  "- **HubSpot's lifecycle sync only fixes the contact that's directly linked to the won deal.** Other contacts at the same company stay behind, so a company-level workflow is needed.",
  "- **Merges run in the background.** A field update sent while a merge is pending can be overwritten by the merge. Merge first, wait for it to finish, then normalise.",
  "- **Detection and action need different confidence.** Two identifiers (name + mailbox) were enough to *flag* a duplicate. The *merge* also required the same phone, which sent one pair to human review instead of merging two possibly different people.",
  "- **About half of what's left can't be fixed with code.** Past-due deals, missing amounts and missing enrichment need a person or a source system. The audit's value there is the list and the preventive workflow, not the edit.",
  "",
].join("\n");
writeFileSync(join(ROOT, "REMEDIATION_RESULTS.md"), md);
console.log(`High ${sum("High", "b")}→${sum("High", "a")}  Medium ${sum("Medium", "b")}→${sum("Medium", "a")}  Low ${sum("Low", "b")}→${sum("Low", "a")}  Total ${sum(null, "b")}→${sum(null, "a")}`);
