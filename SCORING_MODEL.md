# Lead Scoring Model: FieldFlow

Rules-based **fit + engagement** model for a field-service SaaS selling to small trades businesses.
Designed and calibrated against the 304 live HubSpot records before it was built in HubSpot's Lead Scoring tool.

## Fit: who they are (max 45, min −10)

| Group | Property | Value | Points |
|---|---|---|---|
| **Seniority** | `ff_seniority_bucket (contact)` | Owner/Executive | +20 |
|  |  | Manager | +12 |
|  |  | Staff | +3 |
| **Company size** | `numberofemployees (company)` | 10–49 | +10 |
|  |  | 50–199 | +15 |
|  |  | 200+ | +8 |
|  |  | 1–9 | +3 |
| **Core vertical** | `ff_vertical (company)` | HVAC, Plumbing, Electrical | +10 |
|  |  | Any other trade | +5 |
| **Email domain** | `email (contact)` | Personal domain (gmail/yahoo/outlook…) | -10 |

## Engagement: what they did (max 75)

| Group | Property | Value | Points |
|---|---|---|---|
| **Demo requested** | `ff_demo_requested` | Yes | +25 |
| **Product activated** | `ff_product_activated` | Yes | +20 |
| **Trial** | `ff_trial_status` | Active | +15 |
|  |  | Expired | +5 |
| **Pricing page views** | `ff_pricing_page_views` | 3 or more | +10 |
|  |  | 1–2 | +5 |
| **Webinar** | `ff_webinar_attended` | Yes | +5 |

> In a production account, pricing-page views, webinar attendance and demo requests come from HubSpot's
> native engagement events (page views, form submissions, marketing events). Here they're simulated as
> contact properties, because the records were loaded, not tracked.

## Calibration (223 non-Customer contacts)

| Score | Contacts |
|---|---|
| <20 | 24 |
| 20–39 | 94 |
| 40–59 | 64 |
| 60–79 | 32 |
| 80+ | 9 |

| MQL threshold | MQLs | Share of prospects |
|---|---|---|
| 40 | 105 | 47% |
| 50 | 71 | 32% |
| 60 | 41 | 18% |
| 70 | 24 | 11% |

## Validation caveat

Average score by the contact's company outcome: won **43.1** (n=81), open **44.7** (n=89), none **38.9** (n=134).
The data is simulated, and deal outcomes were generated **independently** of these signals, so this table
can't show predictive power, and isn't presented as if it could. With real data, the model would be tuned by
comparing MQL-to-SQL and MQL-to-won rates by score band over 1–2 quarters.

## Verification in HubSpot (2026-10-15)

- **Test a contact:** 3 of 3 match the model line by line: Parker Sato (CT-0191) 95, Morgan Kim 15, Avery Nguyen 38.
- **Live scores:** all **304 of 304** `fieldflow_lead_score` values match the model exactly (`scripts/verify_scores.mjs`). Range 7–95, average 41.69. **41 non-Customer contacts score 60 or more**, as calibrated (57 including Customers).
- **The draft "Preview distribution" was wrong.** It showed 299 of 304 contacts at 81–100, while record-level tests gave 15 and 38. Validate scores on records, not with the preview chart.
- **The threshold label property lagged.** `fieldflow_lead_score_threshold` still held the default 75/50 bands after they were changed to 60/40. Workflows trigger on the numeric score, which is current and verified.

## What the score says about the current MQL definition

The current MQL rule is "started a trial":

| Current stage | Contacts | Score 60+ | 40–59 | Under 40 |
|---|---|---|---|---|
| MQL | 41 | 13 | 18 | 10 |
| Lead | 51 | 0 | 9 | 42 |
| Subscriber | 23 | 0 | 2 | 21 |

**Only 13 of 41 current MQLs (32%) meet the score threshold, and 10 score under 40.** Moving to score-based MQLs would cut
MQL volume by about two thirds and focus sales on fit plus intent. That's a decision for marketing and sales to agree,
not a silent change. The workflow only **promotes** contacts at 60 or above. Existing MQLs under 60 go to a saved view for review,
because they aren't automatically demoted.

## Live test: MQL workflow (2026-10-16)

Workflow **"MQL by lead score"**: trigger *FieldFlow lead score ≥ 60 AND lifecycle stage is Subscriber or Lead*,
action *set lifecycle stage = MQL*, re-enrolment off. Its enrolment check found 0 contacts at launch, as the stage analysis predicted.

Test contact **Marcus Test** (Owner, HVAC company with 40 employees, active trial, Gmail address), from property history:

| Time (UTC) | Event | Source |
|---|---|---|
| 10-15 14:54:30 | Created as Lead, linked to company | API |
| 10-15 14:54:42 | Score **25**: company points not yet counted | score engine |
| 10-15 15:01:50 | Score **45**: company points added about 7 min later | score engine |
| 10-16 00:02:55 | Demo requested → Yes | API |
| 10-16 00:03:07 | Score **70** (+12 s) | score engine |
| 10-16 00:03:23 | Lead → **MQL** (+28 s end to end) | workflow (`AUTOMATION_PLATFORM`) |

**Gotchas recorded:**
- **Company-property points can lag by several minutes** for a contact that's created and linked in one call (as API and integration creates do). Don't route on the score in the first few minutes after creation.
- **The test contact uses a Gmail address,** so the personal-email penalty applied (−10). The expected score was 45, not the 55 first estimated. The rules behaved exactly as designed.
