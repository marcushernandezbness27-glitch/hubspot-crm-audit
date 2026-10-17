# HubSpot CRM Audit to Revenue Engine: Audit, Remediation, Lead Scoring, Workflows and Nurture

> Target URL: marcushq.buzz/work/hubspot-crm-audit-demand-gen
> **All data is simulated** (fictional SaaS "FieldFlow"). Everything ran in a real HubSpot developer test account with Enterprise trial features.

**Role:** Sole builder (data design, API audit, remediation, scoring model, workflows, nurture, reporting)
**Stack:** HubSpot (CRM, Lead Scoring, Workflows, Marketing Email, Reports & Dashboards) · HubSpot CRM API (service key) · Node.js

---

## The problem

Most HubSpot portals don't fail all at once. They drift. Duplicates creep in, lifecycle stages stop matching the
deals, the forecast keeps deals that closed months ago, and "MQL" quietly comes to mean "anyone who signed up". By
the time someone builds a nurture or a dashboard on top, it's sitting on a CRM the data can't support.

This build takes one portal through the whole sequence a RevOps engagement follows: **audit what's wrong, fix what
data can fix, stop it recurring, then build demand generation on the cleaned base**, verifying every step against
HubSpot's own records instead of trusting the UI.

## What was built

**Part A: Audit and remediation**
- **A seeded dataset of 63 companies, 318 contacts and 63 deals,** with 17 types of planted problems (138 records). Each one is logged in an answer key, so the audit can be **scored**, not just presented.
- **A Node.js loader** using the HubSpot API. HubSpot itself blocked 7 bad records on the way in: all 3 invalid emails and 4 of the 8 duplicates.
- **A 21-check API audit** (duplicates, lifecycle vs pipeline, past-due and stale deals, missing amounts, orphans, formatting, free-text pick-lists). It reads only from HubSpot, never from the answer key. **It found 133 of 136 seeded problems (97.8%).** All 8 extra flags were explained: 7 knock-on effects of the seeding, and 1 genuine unseeded possible duplicate.
- **A remediation script with a dry run first.** It applied 34 API actions: merges, junk deletion, lifecycle corrections, phone normalisation and vertical mapping. **Flagged records went from 141 to 69** (High severity 28 → 12, Low 49 → 0). Everything left needs a person or a source system, and is listed with an owner.

**Part B: Demand generation**
- **A fit + engagement lead score** (9 criteria groups). All **304 of 304** live HubSpot scores were verified against the model.
- **Three workflows:**
  - **MQL by score**
  - **Customer when company wins:** closes the gap HubSpot's deal sync leaves
  - **Past-due deal review task**

  Each was tested live and confirmed in property history.
- **A 6-email trial-to-paid nurture** with an A/B subject test, a branch on product activation, and a goal exit. All four features were proven by the action log and HubSpot's send counts.
- **A revenue dashboard:** lifecycle distribution, a corrected funnel, score distribution and bands, stage × score band, open pipeline, a past-due KPI and nurture email performance.

## Key decisions

### Score the audit against a seeded answer key
An audit that "finds problems" on data the author planted proves little. Here the problems were seeded and logged
first, the audit read only HubSpot, and a separate script scored it record by record. The score was 133/136. The 3 misses
are industry *synonyms* ("Janitorial" for "Cleaning Services") that spelling normalisation can't catch, and the findings
say so and send them for human review. **The value shown is the method, and the method can be checked.**

### Merges need more evidence than detection
Name plus mailbox pattern was enough to *flag* a duplicate. *Merging*, which can't be undone, also required a matching
phone number. Four seeded pairs passed. One pair ("Jesse Reyes" ×2 at the same company, different phones) went to
human review instead of being merged. HubSpot's own duplicate tool suggested **106** contact pairs, and the data holds
**88 same-name pairs at different companies**. A confident auto-merge on that list would merge strangers.

### The expensive problems aren't in HubSpot's data-quality tools
Compared side by side, HubSpot's native tools caught every junk record, placeholder and duplicate company. They didn't
report lifecycle stages contradicting deals, the past-due forecast, missing deal amounts or mixed phone formats. **5 open
deals worth $54,984 (18.9% of the $291,636 open pipeline) already had close dates in the past.** That needs
business-logic checks, saved views and workflows.

### Close the gap HubSpot's lifecycle sync leaves
HubSpot promotes the contact **linked to** a won deal to Customer, and nobody else at the company. That's exactly why
the audit found 5 contacts still marked Lead at companies with closed-won deals. The live test: a deal at a 7-contact
company was closed-won. **HubSpot's sync updated the 1 linked contact. Workflow 2 updated the other 6 within about 34 seconds.**

### Show what the score says about the current MQL definition, and don't change it silently
The existing rule was "started a trial = MQL". Under the score, **only 13 of 41 current MQLs (32%) qualify, and 10 score
under 40.** Switching would cut MQL volume by roughly two thirds. That's a sales–marketing decision, so the MQL workflow
only *promotes* contacts at 60 or above, and the 28 contacts below the line get a saved view for review instead of a
silent demotion.

### Don't let a funnel, or an AI summary of it, misreport the data
These records were imported straight into later stages, so HubSpot's in-order funnel collapsed to **305 → 59 → 1 → 0 → 0**,
and **HubSpot's AI summary called it "a significant drop-off" and recommended fixing lead conversion.** The funnel
wasn't fixed by forcing a setting the report doesn't offer. It was replaced on the dashboard with the stage distribution
plus a computed "reached at least this stage" funnel (**282 → 234 → 196 → 180 → 95**), with the reason written on the card.

### Verify on records, not previews
Three HubSpot screens disagreed with the underlying data during the build:
- **The draft scoring "preview distribution"** showed 299 of 304 contacts at 81–100, while record-level tests read 15 and 38.
- **The threshold *label* property** never recalculated after the bands were edited: 0 of 305 matched a day later.
- **Contact email-history properties** update in batches, which made a step-timed test miss its cue.

In each case the fix was to check against records: test-a-contact, a full API comparison of every score, and timing
by the clock plus the workflow action log.

## Result

- **Audit:** 21 checks, **133/136 seeded problems found (97.8%)**, 0 unexplained flags.
- **Remediation:** 34/34 actions applied. **141 → 69 flagged records**, High 28 → 12, Low 49 → 0. HubSpot's own saved views ("Past-due open deals", "Lifecycle behind") return exactly the records the audit flagged.
- **Lead score:** 304/304 scores match the model. 41 non-Customers qualify at 60 or above, as calibrated.
- **Workflows,** all live-tested:
  - Lead → MQL in **28 s** after a demo request
  - 6 non-deal contacts → Customer in about **34 s** after a deal was won
  - **5** past-due review tasks created
- **Nurture,** both runs evidenced by HubSpot's action log and send counts:
  - **Run 1:** all 5 emails sent in order with 0 errors, and the branch chose 3B (not activated)
  - **Run 2:** the goal exit removed the contact before Email 2. Email 2 shows **1 send across 2 enrolments**
  - **A/B test:** one send of each Email 1 variant

## Honest gaps

- **All data is simulated,** and deal outcomes were generated independently of the scoring signals, so the score's predictive power **isn't** demonstrated. The production tuning method (MQL-to-SQL and MQL-to-won rate by score band over 1–2 quarters) is documented instead.
- **"Engagement" signals are contact properties,** not tracked web, form or email events, so the score uses HubSpot's *fit* score type. With live tracking, the right build is a *combined* score: demographics as fit, behaviour as engagement.
- **The nurture ran on one test inbox with compressed (2-minute) delays,** with enrolment restricted to that contact, because developer test accounts only email account users. The A/B test was configured and exercised, not statistically read.
- **The email footer uses a placeholder address** (`1 Demo Way, Demo City, XX 00000`), which is acceptable only because nothing can reach a real recipient. Production requires the sender's real postal address (CAN-SPAM).
- **About half the remaining flags are deliberately unfixed,** because they need a rep decision or a source system (past-due deals, missing amounts, enrichment).
- **HubSpot certifications (Marketing Software, Email Marketing, Demand Generation):** in progress.

---
*Companion files: `AUDIT_FINDINGS_BEFORE.md`, `REMEDIATION_RESULTS.md`, `HUBSPOT_NATIVE_VS_AUDIT.md`, `SCORING_MODEL.md`, `WORKFLOWS.md`, `NURTURE_PLAN.md`, `AUDIT_ANSWER_KEY.md`, `scripts/`, `screenshots/`.*
