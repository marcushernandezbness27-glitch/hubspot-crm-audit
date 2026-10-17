// Detect seeded problems that HubSpot corrected on its own after load (e.g. the
// deal lifecycle sync promoting a contact to Customer once it was associated
// with a closed-won deal). Reads property history from the API and writes
// data/hubspot_autofixes.json; append_load_outcome.mjs folds it into the key.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const TOKEN = (readFileSync("C:/tools/hubspot_fieldflow_token.txt", "utf8").split(/\r?\n/).find((l) => l.startsWith("pat-")) ?? "").trim();
const ids = JSON.parse(readFileSync(join(ROOT, "data", "hubspot_ids.json"), "utf8"));
const key = readFileSync(join(ROOT, "AUDIT_ANSWER_KEY.md"), "utf8");
const section = key.split("## Contacts: Lifecycle stage behind reality")[1]?.split("\n## ")[0] ?? "";
const seededBehind = [...section.matchAll(/^- (CT-\d+)/gm)].map((m) => m[1]);

const fixes = [];
for (const ref of seededBehind) {
  if (!ids[ref]) continue;
  const res = await fetch(`https://api.hubapi.com/crm/v3/objects/contacts/${ids[ref]}?properties=lifecyclestage&propertiesWithHistory=lifecyclestage`, { headers: { Authorization: `Bearer ${TOKEN}` } });
  const j = await res.json();
  const sync = (j.propertiesWithHistory?.lifecyclestage ?? []).find((h) => h.sourceType === "DEALS" && /lifecycle-sync/.test(h.sourceId ?? ""));
  if (sync && j.properties.lifecyclestage === "customer") fixes.push({ ref, issue: "lifecycle_behind", now: "customer", by: sync.sourceId, at: sync.timestamp });
}
writeFileSync(join(ROOT, "data", "hubspot_autofixes.json"), JSON.stringify(fixes, null, 2));
console.log(`checked ${seededBehind.length} seeded lifecycle-behind contacts; auto-fixed by HubSpot: ${fixes.map((f) => f.ref).join(", ") || "none"}`);
