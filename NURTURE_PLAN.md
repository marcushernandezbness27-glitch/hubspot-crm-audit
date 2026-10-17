# Trial-to-Paid Nurture: FieldFlow

A 14-day trial nurture that branches on **product activation** (whether the trial user scheduled their first job).
Every contact gets 5 emails. Email 3 differs by branch, so there are 6 email assets in total. FieldFlow is fictional,
and the copy makes **no** invented claims: no customer counts, no quotes, no percentage results.

## Workflow design

| Setting | Production value | Demo value (this account) |
|---|---|---|
| Object | Contact | Contact |
| Enrolment trigger | Trial status = **Active** AND lifecycle stage is not Customer AND Demo requested ≠ Yes | Same, **plus email = the test contact's address** (see the note below) |
| Re-enrolment | Off | Off |
| Goal (exits on success) | Demo requested = Yes **OR** lifecycle stage = Customer | Same |
| Delays | Days, as in the timeline | Minutes, to show the full path in one sitting |

> **Footer address:** the demo uses an obviously non-deliverable placeholder (`1 Demo Way, Demo City, XX 00000`; `XX` is
> not a state and `00000` is not a ZIP code). That's acceptable only because the account can email nothing but the test inbox.
> A production setup must use the sender's real postal address (CAN-SPAM).
>
> **Why the demo trigger is restricted:** developer test accounts only send marketing email to the account's own
> users. Enrolling all 60+ trial contacts would produce dozens of blocked sends. The production trigger is documented
> here. The demo runs it end to end on one real inbox.

### Timeline

```
Day 0   Email 1: Welcome + first step                (A/B test on subject line)
Day 2   Email 2: The 3-minute setup
Day 4   ┌─ Branch: Product activated = Yes?
        ├─ YES → Email 3A: Next level (invite team, recurring jobs)
        └─ NO  → Email 3B: Stuck? Here's the shortcut (+ reply-for-help)
Day 8   Email 4: What changes when scheduling is in one place
Day 12  Email 5: Trial ends in 2 days + book a walkthrough
Exit    Goal met (demo requested / became Customer), or the timeline ends
```

### A/B test (Email 1)

- **A:** `Your FieldFlow trial is live — here's step one`
- **B:** `Schedule your first job in 3 minutes`
- Split 50/50 across 100% of enrollees. HubSpot sends automated A/B emails to everyone, so there's no held-back winner group, and the **winner is chosen manually** on the email's performance page. Decision metric: **click rate** on the setup link, not opens (Apple Mail Privacy Protection inflates opens).
- Only the subject line varies. The body is identical in both versions, so any difference comes from the subject.
- **Honest limit:** with one test inbox, the test is *configured*, not *run*. A real read needs roughly 200+ sends per variant.

---

## Email copy

Personalisation tokens use HubSpot syntax. Set a default for every token (first name → "there").

### Email 1: Welcome + first step (Day 0)
**Subject A:** Your FieldFlow trial is live — here's step one
**Subject B:** Schedule your first job in 3 minutes
**Preview text:** One step gets your team off the whiteboard.

Hi {{ contact.firstname }},

Your FieldFlow trial is ready. Most of the value shows up after one specific step, so here it is:

**Schedule your first job.** Pick a customer, a time, and a technician. That's it. FieldFlow builds the day's route and sends the tech the details.

**Button:** `Schedule my first job →` → link `https://marcushq.buzz/work`

If you'd rather see it done first, reply to this email and I'll walk you through it.

— The FieldFlow team

### Email 2: The 3-minute setup (Day 2)
**Subject:** The 3-minute setup most teams skip
**Preview text:** Add your techs once and dispatch gets faster every day.

Hi {{ contact.firstname }},

Three things make FieldFlow useful from day one:

1. **Add your technicians**, so jobs can be assigned and routed.
2. **Import your customer list** (CSV is fine), so booking takes seconds.
3. **Schedule one real job**, so you can see the tech's view on their phone.

**Button:** `Finish setup →` → link `https://marcushq.buzz/work`

### Email 3A: Next level (Day 4, product activated)
**Subject:** You've scheduled your first job — two things to try next
**Preview text:** Recurring jobs and team invites.

Hi {{ contact.firstname }},

Nice work getting your first job on the board. Two features save the most time next:

- **Recurring jobs**, for maintenance contracts and seasonal checks, so they schedule themselves.
- **Invite your office team**, so whoever answers the phone can book straight into the schedule.

**Button:** `Set up a recurring job →` → link `https://marcushq.buzz/work`

### Email 3B: Stuck? Here's the shortcut (Day 4, not activated)
**Subject:** Haven't scheduled a job yet? Here's the shortcut
**Preview text:** Reply with your next job and we'll set it up with you.

Hi {{ contact.firstname }},

Setting up new software in the middle of a busy week is hard. The quickest way to see if FieldFlow fits:

**Reply with one job you have coming up** (customer, address, time), and we'll help you set it up.

Or do it yourself in one screen:

**Button:** `Schedule my first job →` → link `https://marcushq.buzz/work`

### Email 4: One place for the schedule (Day 8)
**Subject:** What changes when the schedule lives in one place
**Preview text:** Fewer "where's the tech?" calls.

Hi {{ contact.firstname }},

When jobs live in texts, whiteboards and memory, the office spends its day relaying information. With one shared
schedule, the office sees where each tech is, techs see their next job, and customers get a confirmation, without anyone
retyping it.

**Button:** `See today's schedule →` → link `https://marcushq.buzz/work`

### Email 5: Trial ends soon + walkthrough (Day 12)
**Subject:** Your trial ends in 2 days
**Preview text:** Want a 20-minute walkthrough on your own jobs?

Hi {{ contact.firstname }},

Your FieldFlow trial ends in two days. If you're still deciding, the fastest way to decide is a 20-minute walkthrough
using your own jobs and team. No slides.

**Button:** `Book a walkthrough →` → link `https://marcushq.buzz/work`

Booking a walkthrough sets "Demo requested" and moves you out of these emails, so you won't get any more of them.

---

## Measurement

Report on: enrolments, goal conversion rate (demo or Customer), per-email click rate, branch split
(activated vs not), and Email 1 A vs B click rate. Production read: after 30 days, compare the goal conversion of
**activated vs non-activated** contacts. If 3B lifts activation, move its reply-for-help offer to Email 2.

---

## Live run (2026-10-16, compressed demo delays)

Workflow **"Trial nurture — FieldFlow"**. The enrolment check found **1** eligible contact (the test contact) at launch. Demo delays as built: **2 minutes** between every step.

| Check | Result | Evidence |
|---|---|---|
| All emails sent along the path | **Pass:** 5 sent (1, 2, 3B, 4, 5), 0 errors, 22:05:17–22:13:32 EDT | Workflow action log, `data/workflow_history_trial_nurture_run1.csv` |
| Branch on Product activated | **Pass:** "Continuing on the is-equal-to-false branch" → **Email 3B** | Action log step 5, and the inbox (3B received, 3A not) |
| Tracking | Opens recorded on every send, clicks on 5 of 6 sends (genuine test clicks); Email 3A has no sends | Marketing email report |
| A/B split on Email 1 | **Pass:** one send of each variant across the 2 enrolments (A: 1, B: 1) | Marketing email report, `screenshots/12_nurture_email_performance.png` |
| Goal exit (demo requested → unenrol) | **Pass (run 2).** Re-enrolled 22:44 EDT, Email 1 received, Demo requested set to Yes at 22:45:28 (`scripts/goal_test.mjs`). Email 2 was due ~22:46:30 and **never arrived** | Inbox, `data/goal_test.json`, and HubSpot send counts: **Email 2 sent once across 2 enrolments**, so run 2 never reached it (`screenshots/12_nurture_email_performance.png`) |

**Test-harness lesson:** the monitor waited for `hs_email_last_email_name` to show "Email 4" before setting the goal
property. HubSpot updates that property in batches: it stayed empty past Email 1, then jumped from Email 2 straight to
Email 5. Contact email properties work for reporting but not for step timing. Use wall-clock time after enrolment, or
the workflow's action log. Because the goal was never set, Email 5 going out was the **correct** behaviour.
