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
- [ ] Developer test account created; check that lead scoring, workflows and A/B tests are available
- [ ] Custom properties created, then import
