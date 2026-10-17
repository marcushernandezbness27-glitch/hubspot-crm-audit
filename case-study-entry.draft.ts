// DRAFT entry for portfolio-site/src/case-studies.ts. Append to CASE_STUDIES when publishing.
// Figures expect files in portfolio-site/public/case-studies/hubspot-crm-audit-demand-gen/.

  {
    slug: "hubspot-crm-audit-demand-gen",
    title: "HubSpot CRM Audit to Revenue Engine: Audit, Remediation, Lead Scoring, Workflows and Nurture",
    service: "tracking-revops",
    role: "Sole builder (data design, API audit, remediation, scoring model, workflows, nurture, reporting)",
    stack: ["HubSpot", "HubSpot CRM API", "Workflows", "Lead Scoring", "Marketing Email", "Node.js"],
    problem: [
      "Most HubSpot portals don't fail all at once. They drift. Duplicates creep in, lifecycle stages stop matching the deals, the forecast keeps deals that closed months ago, and \"MQL\" quietly comes to mean \"anyone who signed up\". By the time someone builds a nurture or dashboard on top, it's sitting on a CRM the data can't support.",
      "This build takes one portal (a fictional SaaS, all data simulated, in a real HubSpot developer test account) through the sequence a RevOps engagement follows: audit what's wrong, fix what data can fix, stop it recurring, then build demand generation on the cleaned base. Every step is verified against HubSpot's own records instead of trusted from the UI.",
    ],
    built: [
      "A seeded dataset of 63 companies, 318 contacts and 63 deals with 17 types of planted problems, logged in an answer key so the audit can be scored, not just presented",
      "A 21-check API audit that reads only from HubSpot: 133 of 136 seeded problems found (97.8%); 8 extra flags, all explained (7 knock-on, 1 genuine)",
      "Remediation with a dry run first: 34 API actions (merges, junk deletion, lifecycle corrections, phone normalisation, vertical mapping), taking flagged records from 141 to 69",
      "A fit + engagement lead score (9 criteria groups), with all 304 of 304 live scores verified against the model",
      "Three live-tested workflows: MQL by score, Customer when company wins (closing the gap HubSpot's deal sync leaves), and a past-due deal review task",
      "A 6-email trial-to-paid nurture with an A/B subject test, a branch on product activation and a goal exit, all proven by the action log and send counts",
      "A revenue dashboard: lifecycle distribution, a corrected funnel, score bands, stage × score band, open pipeline, a past-due KPI and nurture email performance",
    ],
    diagram: `Seeded CSVs ──► Node loader (HubSpot API) ──► HubSpot blocks 3 invalid emails + 4 dupes
      │
      ▼
21-check API audit ──► scored vs answer key (133/136) ──► remediation (dry run → 34 actions)
      │                                                      141 → 69 flagged
      ▼
Lead score (fit+engagement) ──► WF1 MQL ≥60 · WF2 company won → Customer · WF3 past-due task
      │
      ▼
Trial nurture: E1 (A/B) → E2 → branch(activated?) → 3A | 3B → E4 → E5   goal: demo | Customer
      │
      ▼
Revenue dashboard (verified against API counts)`,
    figures: [
      { kind: "image", src: "/case-studies/hubspot-crm-audit-demand-gen/dashboard_top.png", caption: "Revenue dashboard: lifecycle distribution, computed funnel card, lead score distribution" },
      { kind: "image", src: "/case-studies/hubspot-crm-audit-demand-gen/dashboard_bottom.png", caption: "Score bands, stage × score band (28 MQLs below the threshold), open pipeline, past-due KPI ($54,984), nurture email performance" },
      { kind: "image", src: "/case-studies/hubspot-crm-audit-demand-gen/funnel_ai_misread.png", caption: "HubSpot's in-order funnel collapsed to 305 → 59 → 1 → 0 → 0 on imported data, and its AI summary called it a drop-off. Replaced on the dashboard with a computed funnel" },
      { kind: "image", src: "/case-studies/hubspot-crm-audit-demand-gen/manage_duplicates.png", caption: "HubSpot's duplicate tool: the 4 real pairs sit among 106 suggestions, most of them same-name strangers at different companies" },
      { kind: "image", src: "/case-studies/hubspot-crm-audit-demand-gen/view_lifecycle_behind.png", caption: "Saved view returns exactly the 5 contacts the API audit flagged: Lead at a company with a closed-won deal" },
      { kind: "image", src: "/case-studies/hubspot-crm-audit-demand-gen/nurture_email_performance.png", caption: "Nurture evidence: one send of each A/B variant, 3A never sent (branch), Email 2 sent once across 2 enrolments (goal exit)" },
    ],
    decisions: [
      {
        heading: "Score the audit against a seeded answer key",
        body: "An audit that finds problems on data the author planted proves little. Here the problems were seeded and logged first, the audit read only HubSpot, and a separate script scored it record by record: 133/136. The 3 misses are industry synonyms (\"Janitorial\" for \"Cleaning Services\") that spelling normalisation can't catch, so the findings send them for human review.",
      },
      {
        heading: "Merges need more evidence than detection",
        body: "Name plus mailbox pattern was enough to flag a duplicate. Merging, which can't be undone, also required a matching phone. Four pairs merged, and one same-name pair with different phones went to human review. HubSpot's duplicate tool suggested 106 pairs, and the data holds 88 same-name pairs at different companies. A confident auto-merge would merge strangers.",
      },
      {
        heading: "The expensive problems aren't in the data-quality tools",
        body: "HubSpot's native tools caught every junk record, placeholder and duplicate company. They didn't report lifecycle stages contradicting deals, missing amounts or the past-due forecast: 5 open deals worth $54,984, 18.9% of the $291,636 open pipeline, already had past close dates. That needs business-logic checks, saved views and workflows.",
      },
      {
        heading: "Close the gap HubSpot's lifecycle sync leaves",
        body: "HubSpot promotes only the contact linked to a won deal to Customer. In a live test, a deal at a 7-contact company was closed-won: the sync updated the 1 linked contact, and a company-level workflow updated the other 6 within about 34 seconds.",
      },
      {
        heading: "Don't change the MQL definition silently",
        body: "Under the score, only 13 of 41 trial-based MQLs (32%) qualify. Switching would cut MQL volume by about two thirds, which is a sales–marketing decision. The workflow only promotes contacts at 60 or above, and the 28 below the line go to a saved view for review.",
      },
      {
        heading: "Verify on records, not previews",
        body: "Three HubSpot screens disagreed with the data. The draft scoring preview showed 299 of 304 contacts at 81–100. The threshold label property never recalculated after the bands were edited. Email-history properties update in batches. Each was checked against record-level tests, a full API comparison of all scores, and the workflow action log.",
      },
    ],
    result: "Audit: 133/136 seeded problems found (97.8%), 0 unexplained flags. Remediation: 34/34 actions, 141 → 69 flagged records (High 28 → 12, Low 49 → 0); HubSpot's own saved views return exactly the records the audit flagged. Lead score: 304/304 scores match the model. Workflows: Lead → MQL in 28 s; 6 non-deal contacts → Customer in about 34 s; 5 past-due tasks created. Nurture: all 5 emails sent in order with 0 errors, the branch chose 3B, the goal exit removed the contact before Email 2 (1 send across 2 enrolments), and each A/B variant sent once.",
    gaps: [
      "All data is simulated, and deal outcomes were generated independently of the scoring signals, so the score's predictive power isn't demonstrated. The production tuning method (conversion by score band over 1–2 quarters) is documented instead.",
      "Engagement signals are contact properties rather than tracked events, so the score uses HubSpot's fit score type. With live tracking it would be a combined score.",
      "The nurture ran on one test inbox with 2-minute delays, enrolment restricted to that contact (developer test accounts only email account users). The A/B test was exercised, not statistically read.",
      "The demo email footer uses an obviously non-deliverable placeholder address. Production requires the sender's real postal address (CAN-SPAM).",
      "About half the remaining flags are deliberately unfixed: they need a rep decision or a source system.",
      "HubSpot certifications (Marketing Software, Email Marketing, Demand Generation): in progress.",
    ],
    footnote: "Built in a HubSpot developer test account (Enterprise trial features) with simulated data, as portfolio evidence for HubSpot audits, RevOps automation and demand generation.",
    links: [],
  },
