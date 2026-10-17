# Remediation Results: FieldFlow HubSpot Audit

Before: audit of 2026-10-15 (313 contacts, 63 companies, 63 deals) · After: re-audit of 2026-10-15 (304 contacts, 60 companies, 63 deals).
Remediation: 34/34 API actions succeeded, plus 1 follow-up pass. Source: `data/remediation_log.json`. All data is simulated.

Audit accuracy against the seeded answer key: **133 of 136 seeded issues found (97.8%)**, 8 extra flags, all explained (1 unseeded, 7 knock-on).

| Severity | Flagged before | Flagged after |
|---|---|---|
| High | 28 | 12 |
| Medium | 64 | 57 |
| Low | 49 | 0 |
| **Total** | **141** | **69** |

| ID | Severity | Check | Before | After | What happened |
|---|---|---|---|---|---|
| C1 | High | Duplicate contacts (same mailbox ignoring digits, or same name at same company) | 5 | 1 | 4 merged (name + mailbox + phone all matched). 1 pair left for human review: same name, different phones |
| C10 | High | Lifecycle stage ahead of reality (Customer with no closed-won deal at their company) | 7 | 0 | Reset to the stage the record's data supports (4 MQL with a trial, 3 Lead) |
| C9 | High | Lifecycle stage behind reality (company has a closed-won deal, contact not Customer) | 5 | 0 | Set to Customer (company has a closed-won deal) |
| D1 | High | Open deals with a close date in the past | 5 | 5 | Not auto-fixed: rep decision (re-date or close-lost) |
| D3 | High | Deals missing an amount | 4 | 4 | Not auto-fixed: needs the contract or billing system as the source |
| D4 | High | Closed-won deals with $0 amount | 2 | 2 | Not auto-fixed: needs the source amount |
| C2 | Medium | Missing email address | 4 | 4 | Not auto-fixed: enrichment |
| C3 | Medium | Malformed email address | 0 | 0 | Clean |
| C4 | Medium | Junk / test records | 3 | 0 | Deleted (recoverable from the recycle bin for 90 days) |
| C6 | Medium | Orphan contacts (no company association) | 9 | 9 | Not auto-fixed: sales-ops decision on the right association |
| C7 | Medium | Missing job title | 19 | 18 | −1 because the merged duplicate is gone. Rest needs enrichment |
| D2 | Medium | Stale open deals (no activity in 45+ days) | 6 | 6 | Not auto-fixed: rep decision |
| D5 | Medium | Deals with no company association | 3 | 3 | Not auto-fixed: sales-ops decision |
| D6 | Medium | Deals with no contact association | 5 | 5 | Not auto-fixed: sales-ops decision |
| K1 | Medium | Duplicate companies (same domain) | 3 | 0 | Merged into the record holding the contacts |
| K2 | Medium | Missing number of employees | 12 | 12 | Not auto-fixed: enrichment |
| C5 | Low | HubSpot default sample contacts still present | 2 | 0 | Deleted |
| C8 | Low | Phone numbers not in the dominant format (000-000-0000) | 40 | 0 | All phones normalised to E.164. 3 merge survivors needed a second pass (async merge overwrote the update) |
| D7 | Low | Closed deals with a close date in the future | 0 | 0 | Clean |
| K3 | Low | Vertical stored as free text: spelling variants of the same value | 4 | 0 | Spelling variants and synonyms mapped to one value |
| K4 | Low | Companies with no contacts | 3 | 0 | Resolved by the company merges |

## Lessons

- **HubSpot's lifecycle sync only fixes the contact that's directly linked to the won deal.** Other contacts at the same company stay behind, so a company-level workflow is needed.
- **Merges run in the background.** A field update sent while a merge is pending can be overwritten by the merge. Merge first, wait for it to finish, then normalise.
- **Detection and action need different confidence.** Two identifiers (name + mailbox) were enough to *flag* a duplicate. The *merge* also required the same phone, which sent one pair to human review instead of merging two possibly different people.
- **About half of what's left can't be fixed with code.** Past-due deals, missing amounts and missing enrichment need a person or a source system. The audit's value there is the list and the preventive workflow, not the edit.
