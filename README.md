# HubSpot Complete — CRM Audit + Demand Gen (Builds 26 + 42)

Fictional B2B SaaS **FieldFlow** (scheduling software for field-service SMBs).
All data is **SIMULATED** and generated with deliberate problems.

| File | What it is |
|---|---|
| `data/companies.csv` | 63 companies (60 + 3 seeded duplicates) |
| `data/contacts.csv` | 318 contacts with trial, activation, pricing-page, demo and webinar signals for lead scoring |
| `data/deals.csv` | 63 deals on the default pipeline |
| `AUDIT_ANSWER_KEY.md` | Every seeded problem (17 types, 138 records). **Don't read it before the audit**: the audit is scored against it |
| `scripts/generate_hubspot_data.mjs` | Seeded generator: `node scripts/generate_hubspot_data.mjs --seed 26 --today 2026-10-15` |
| `scripts/verify_answer_key.mjs` | Re-derives 13 countable issues from the CSVs and checks the key agrees |

`scratch/gen_data.py` is the original July prototype (51 contacts). It's superseded.

## Plan

- **Account:** HubSpot developer test account, a free 90-day trial of Enterprise features. Marketing email only reaches users added to the account.
- **Part A, audit:** import → audit (data quality, lifecycle integrity, pipeline health, duplicates, associations) → severity-rated findings table → score against the answer key → fix the top issues and show before/after.
- **Part B, demand gen:** lead scoring (demographic: seniority, company size, industry; behavioural: trial, activation, pricing views, demo, webinar) with an MQL threshold → 5-email trial-to-paid nurture workflow (enrollment trigger, waits, branch on activation, goal = demo/upgrade, A/B on email 1) → funnel dashboard (lead → MQL → SQL → opportunity → customer).
- **Part C, certifications:** HubSpot Academy Marketing Software, Email Marketing and Demand Generation. Done by Marcus, in parallel.

## Status
- [x] Data generated; answer key verified (13/13 countable issues match)
- [x] Developer test account **FieldFlow Demo (149557707)**: lead scoring, workflows, A/B tests and custom reports all available
- [x] Loaded via API (`scripts/load_to_hubspot.mjs`): 63 companies, 311 contacts, 63 deals; HubSpot blocked 3 invalid emails and 4 duplicates (see the load outcome in the answer key)
- [x] Part A audit run (`scripts/audit_hubspot.mjs`, HubSpot API only): 21 checks → [AUDIT_FINDINGS.md](AUDIT_FINDINGS.md). Scored (`scripts/score_audit.mjs`): **133 of 136 seeded issues found (97.8%)**; 3 misses = industry synonyms (normalisation can't map different words); 8 extra flags, all explained (7 knock-on + 1 genuine unseeded same-name duplicate), 0 unexplained. HubSpot's deal lifecycle sync auto-fixed 1 seeded conflict (CT-0276).
- [x] HubSpot-native evidence: 9 screenshots in `screenshots/` plus [HUBSPOT_NATIVE_VS_AUDIT.md](HUBSPOT_NATIVE_VS_AUDIT.md). Both saved views match the audit exactly (5 past-due deals, the same 5 lifecycle-behind contacts)
- [x] Remediation (`scripts/remediate.mjs`, dry run, then 34/34 actions applied) and re-audit: **141 → 69 flagged records (High 28 → 12, Low 49 → 0)**. [REMEDIATION_RESULTS.md](REMEDIATION_RESULTS.md). The rest are rep, source-system or enrichment decisions, by design
- [x] Part B: lead score (304/304 verified, [SCORING_MODEL.md](SCORING_MODEL.md)); 3 live-tested workflows ([WORKFLOWS.md](WORKFLOWS.md)); 6-email nurture with A/B test, branch and goal, all proven ([NURTURE_PLAN.md](NURTURE_PLAN.md)); revenue dashboard (screenshots 10–15)
- [x] Case study: [CASE_STUDY.md](CASE_STUDY.md) and `case-study-entry.draft.ts`
- [ ] Part C: HubSpot Academy certifications (Marcus)
- [ ] Publish: commit and push the repo, make it public, add the site entry
