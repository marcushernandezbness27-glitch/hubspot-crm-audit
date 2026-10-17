# Workflows: Prevention and Qualification

Built in HubSpot's workflow builder (FieldFlow Demo, 149557707). Each workflow exists because of a specific
audit finding or scoring decision, and each was verified live. All data is simulated.

| # | Workflow | Object | Trigger (one AND group) | Action | Closes |
|---|---|---|---|---|---|
| 1 | **MQL by lead score** | Contact | FieldFlow lead score ≥ 60 **and** lifecycle stage is Subscriber or Lead | Lifecycle → MQL | Scoring: MQL definition |
| 2 | **Customer when company wins** | Contact | Associated company: *Recent deal close date* is known **and** lifecycle stage is Subscriber, Lead, MQL, SQL or Opportunity | Lifecycle → Customer | Audit C9 (stage behind reality) |
| 3 | **Past-due deal review task** | Deal | Deal stage is not Closed Won/Lost **and** close date is more than 7 days ago. Re-enrols on close date change | Create task "Past-due deal: re-date or close-lost", linked to the deal, assigned to a named user | Audit D1 (forecast in the past) |

## Verification

**Workflow 1:** enrolled 0 at launch, as predicted (no Lead or Subscriber scored 60 or more). Live test on contact
"Marcus Test": demo request → score 45 → 70 in 12 s → Lead → **MQL in 28 s**. History source: `AUTOMATION_PLATFORM`.
Details in [SCORING_MODEL.md](SCORING_MODEL.md).

**Workflow 2:** enrolled 0 at launch (the audit had already fixed the 5 contacts that qualified), and Customer
count unchanged at 81. Live test: the open deal *Willow Creek Roofing — Annual plan* was set to Closed Won.
The company has 7 contacts, all Opportunities, and **only one is linked to the deal**:

| Contact | Linked to deal? | Became Customer via | At (UTC) |
|---|---|---|---|
| Jesse Lund | yes | HubSpot `deals-lifecycle-sync` | 00:30:07 |
| Robin Rossi, Emerson Fischer, Emerson Diaz, Kendall Nguyen, Kendall Kowalski, Casey Novak | no | **Workflow 2** (`AUTOMATION_PLATFORM`, 6 enrolments) | 00:30:39–00:30:41 |

Without Workflow 2, the 6 unlinked contacts would have stayed Opportunities: the exact gap the audit found.

**Workflow 3:** enrolled the **5** past-due open deals at launch (the same 5 as audit D1 and the saved view) and
created **5 tasks**, each assigned to a named user. In an account with deal owners, assign to the deal owner,
with a branch that falls back to a sales manager when the owner is unknown.

## Build mistakes caught before go-live (worth knowing)

- **Contact-level vs company-level property.** "Recent deal close date" exists on contacts too, but HubSpot only
  sets it for contacts linked to the won deal, which is the case its sync already covers. Workflow 2 needed the
  *associated company's* property.
- **Separate filter groups are OR, not AND.** The first draft of Workflow 2 put the lifecycle condition in its own
  group. That would have enrolled every pre-Customer contact (~150) and marked them all Customers. Both conditions
  now sit in one group. The guard was the review screen's "contacts meeting criteria" count, which should be 0.
- **Ownerless tasks.** "Existing owner of the deal" with no owners creates tasks nobody sees. Workflow 3 assigns to a
  named user here.
