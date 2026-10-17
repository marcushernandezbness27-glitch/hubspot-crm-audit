# HubSpot's Built-in Data Quality Tools vs the Audit Script

Same account (FieldFlow Demo, 149557707), same data, checked 2026-10-15. Screenshots are in `screenshots/`.

| Problem in the CRM | HubSpot native tool | What it caught | Audit script |
|---|---|---|---|
| Junk / test records (3) | Formatting Issues | **All 3.** asdf/test flagged for names; john.doe@example.com and test@test.com flagged as "likely temporary or invalid" | All 3 (C4) |
| HubSpot sample contacts (2) | Formatting Issues | **Both** ("includes common placeholder text") | Both (C5) |
| Duplicate companies (3) | Manage Duplicates, Companies | **All 3, nothing else** (94% similarity) | All 3 (K1) |
| Duplicate contacts (4 seeded + 1 genuine) | Manage Duplicates, Contacts | **The 4 seeded pairs** at 94%, inside **106 suggestions**. The loaded data has 93 same-full-name pairs, 88 of them at different companies (e.g. "Emerson Diaz" at two different roofing firms), and those make up most of the list | 4 + 1 (C1). The rule requires same mailbox ignoring digits, **or** same name at the same company |
| Inconsistent phone formats (40) | none | Not flagged. HubSpot *displays* `+1555…` as `+1 (555) …` but doesn't report mixed formats | 40 (C8) |
| Lifecycle stage contradicts deals (5 + 5 + 2) | none | Not a data-quality category. The deal lifecycle sync fixed **1** (the contact directly on the won deal) | 12 (C9, C10) |
| Past-due / stale open deals (5 / 6) | none | Needs a saved view per check | 5 / 6 (D1, D2) |
| Missing / $0 deal amounts (4 / 2) | none | Needs a saved view | 4 / 2 (D3, D4) |
| Orphan contacts, contact-less deals, missing employees/titles | Property Insights shows **fill rates only** | No record list | C6, D5, D6, K2, C7 |

## Takeaways for a client audit

1. **HubSpot's tools are good at record hygiene:** junk, placeholders, duplicate companies.
2. **HubSpot's contact duplicate model is high-recall, low-precision.** On a list with common names it buries the real duplicates among same-name strangers. Use a custom duplicate rule (Manage Duplicates → Add new rule), for example *same email domain + same name*, before bulk-merging, or the merge queue becomes the risk.
3. **The expensive problems aren't in Data Quality at all.** Lifecycle stages that contradict deals, past-due forecast, and missing deal amounts are business-logic checks. They need saved views, or a scripted audit, plus workflows to stop them recurring.
